import { EventEmitter } from "node:events";
import { logger } from "../utils/logger.js";
import { MessageBus } from "./MessageBus.js";
import { EscalationManager } from "./EscalationManager.js";
import { AgentManager } from "../agents/AgentManager.js";
import { AgentProcess } from "../agents/AgentProcess.js";
import type { AgentMessage, EscalationRequest } from "./types.js";
import type { AgentConfig, AgentState } from "../agents/types.js";
import { TicketManager } from "../tickets/TicketManager.js";
import type { Ticket } from "../tickets/types.js";
import { isGitRepo, getStatus, stageAndCommit } from "../utils/git.js";
import { analyzeTaskComplexity, complexityToModel } from "../utils/taskComplexity.js";
import { getRuntimeSettings } from "../routes/api.js";
import type { AgentModel } from "../agents/types.js";

const SCOPE = "Orchestrator";

export interface ModelSelectionInfo {
  agent: string;
  complexity: string;
  selectedModel: string;
  defaultModel: string;
}

export interface AgentMetricsEntry {
  invocations: number;
  totalResponseTimeMs: number;
  successCount: number;
  errorCount: number;
  lastInvoked: string;
  messagesRouted: number;
}

export interface AgentMetricsOutput extends Omit<AgentMetricsEntry, "totalResponseTimeMs"> {
  avgResponseTimeMs: number;
}

export interface OrchestratorEvents {
  agentThought: [string, string];
  agentChunk: [string, string];
  agentStatusChange: [string, string];
  agentCommit: [string, { sha: string; files: string[]; message: string; ticketId?: string }];
  modelSelection: [ModelSelectionInfo];
  messageRouted: [AgentMessage];
  escalation: [EscalationRequest];
  escalationResolved: [EscalationRequest];
  metricsUpdate: [Record<string, AgentMetricsOutput>];
  error: [string, Error];
}

export class Orchestrator extends EventEmitter<OrchestratorEvents> {
  readonly messageBus: MessageBus;
  readonly escalationManager: EscalationManager;
  agentManager: AgentManager;
  private workingDirectory: string;
  ticketManager: TicketManager | null = null;
  sharedMemoryContent: string = "";
  private usageStats = new Map<string, { invocations: number; lastInvoked: string }>();
  private agentMetrics = new Map<string, AgentMetricsEntry>();
  private boundAgents = new Set<string>();
  private commitLock: Promise<void> = Promise.resolve();
  private ticketManagerConnected = false;
  private ticketRoutedHandler: ((message: AgentMessage) => void) | null = null;

  constructor(workingDirectory: string) {
    super();
    this.workingDirectory = workingDirectory;
    this.messageBus = new MessageBus();
    this.escalationManager = new EscalationManager();
    this.agentManager = new AgentManager(workingDirectory);
    this.bindEvents();
  }

  async initialize(agentDir: string): Promise<void> {
    await this.agentManager.loadAgents(agentDir);
    logger.info(SCOPE, `Orchestrator initialized with ${this.agentManager.getAllConfigs().length} agents`);
  }

  async sendUserMessage(agentName: string, userMessage: string): Promise<string> {
    logger.info(SCOPE, `User message to ${agentName}: ${userMessage.slice(0, 100)}...`);

    const config = this.agentManager.getConfig(agentName);
    if (!config) {
      throw new Error(`Agent not found: ${agentName}`);
    }

    const agent = this.agentManager.getOrCreateAgent(agentName);
    if (this.sharedMemoryContent) {
      agent.sharedMemory = this.sharedMemoryContent;
    }

    const modelForTask = this.selectModelForTask(agentName, userMessage, config);
    agent.setModelOverride(modelForTask);

    this.bindAgentEvents(agentName, agent);
    this.trackUsage(agentName);

    const startTime = Date.now();
    try {
      const response = await agent.startConversation(userMessage);
      this.recordMetricsSuccess(agentName, Date.now() - startTime);
      await this.handleAgentCommit(agentName, userMessage.slice(0, 72));
      return this.stripHivemindMessages(response);
    } catch (err) {
      this.recordMetricsError(agentName, Date.now() - startTime);
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error(SCOPE, `Agent ${agentName} failed`, error);
      this.emit("error", agentName, error);
      throw error;
    }
  }

  async routeMessage(message: AgentMessage): Promise<void> {
    logger.info(SCOPE, `Routing: ${message.from} → ${message.to} [${message.type}]: ${message.subject}`);

    if (message.to === "user" || message.type === "escalation") {
      this.handleEscalation(message);
      return;
    }

    if (message.to === "broadcast") {
      this.messageBus.routeExistingMessage(message);
      this.emit("messageRouted", message);
      this.incrementMessagesRouted(message.from);
      return;
    }

    const targetConfig = this.agentManager.getConfig(message.to);
    if (!targetConfig) {
      logger.error(SCOPE, `Cannot route message: unknown agent ${message.to}`);
      return;
    }

    this.messageBus.routeExistingMessage(message);
    this.emit("messageRouted", message);
    this.incrementMessagesRouted(message.to);

    const prompt = this.formatIncomingMessage(message);
    const agent = this.agentManager.createAgent(message.to);
    if (this.sharedMemoryContent) {
      agent.sharedMemory = this.sharedMemoryContent;
    }

    const routeModel = this.selectModelForTask(message.to, message.body, targetConfig);
    agent.setModelOverride(routeModel);

    this.trackUsage(message.to);
    this.bindAgentEvents(message.to, agent);

    const routeStartTime = Date.now();
    try {
      const response = await agent.startConversation(prompt);
      this.recordMetricsSuccess(message.to, Date.now() - routeStartTime);
      logger.debug(SCOPE, `Agent ${message.to} responded: ${response.slice(0, 200)}`);
      const ticketId = message.context?.ticketId as string | undefined;
      await this.handleAgentCommit(message.to, message.subject.slice(0, 72), ticketId);
    } catch (err) {
      this.recordMetricsError(message.to, Date.now() - routeStartTime);
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error(SCOPE, `Failed to deliver message to ${message.to}`, error);
      this.emit("error", message.to, error);
    } finally {
      this.agentManager.removeAgent(message.to);
    }
  }

  resolveEscalation(escalationId: string, resolution: string): EscalationRequest | null {
    const escalation = this.escalationManager.resolve(escalationId, resolution);
    if (escalation) {
      this.emit("escalationResolved", escalation);

      this.messageBus.send({
        from: "user",
        to: escalation.from,
        type: "feedback",
        subject: `Resolution: ${escalation.message.subject}`,
        body: resolution,
        parentMessageId: escalation.message.id,
      });
    }
    return escalation;
  }

  getState(): { agents: AgentState[]; pendingEscalations: EscalationRequest[] } {
    return {
      agents: this.agentManager.getAgentStates(),
      pendingEscalations: this.escalationManager.getPending(),
    };
  }

  connectTicketManager(ticketManager: TicketManager): void {
    this.ticketManager = ticketManager;
    if (!this.ticketManagerConnected) {
      this.ticketManagerConnected = true;
      this.ticketRoutedHandler = (message) => {
        this.handleTicketFromMessage(message);
      };
      this.on("messageRouted", this.ticketRoutedHandler);
    }
    logger.info(SCOPE, "TicketManager connected");
  }

  setSharedMemory(content: string): void {
    this.sharedMemoryContent = content;
  }

  getUsageStats(): Record<string, { invocations: number; lastInvoked: string }> {
    return Object.fromEntries(this.usageStats);
  }

  getMetrics(): Record<string, AgentMetricsOutput> {
    const output: Record<string, AgentMetricsOutput> = {};
    for (const [agent, entry] of this.agentMetrics) {
      const totalCalls = entry.successCount + entry.errorCount;
      output[agent] = {
        invocations: entry.invocations,
        avgResponseTimeMs: totalCalls > 0 ? Math.round(entry.totalResponseTimeMs / totalCalls) : 0,
        successCount: entry.successCount,
        errorCount: entry.errorCount,
        lastInvoked: entry.lastInvoked,
        messagesRouted: entry.messagesRouted,
      };
    }
    return output;
  }

  shutdown(): void {
    logger.info(SCOPE, "Shutting down orchestrator");
    this.agentManager.stopAll();
    this.messageBus.clear();
    this.boundAgents.clear();
  }

  reset(): void {
    this.shutdown();
    if (this.ticketRoutedHandler) {
      this.off("messageRouted", this.ticketRoutedHandler);
      this.ticketRoutedHandler = null;
    }
    this.ticketManager = null;
    this.ticketManagerConnected = false;
    this.sharedMemoryContent = "";
    this.usageStats.clear();
    this.agentMetrics.clear();
    this.commitLock = Promise.resolve();
    this.escalationManager.clearAll();
    logger.info(SCOPE, "Orchestrator reset for project switch");
  }

  updateWorkingDirectory(workingDirectory: string): void {
    this.workingDirectory = workingDirectory;
    this.agentManager = new AgentManager(workingDirectory);
  }

  private trackUsage(agentName: string): void {
    const existing = this.usageStats.get(agentName) ?? { invocations: 0, lastInvoked: "" };
    existing.invocations += 1;
    existing.lastInvoked = new Date().toISOString();
    this.usageStats.set(agentName, existing);
  }

  private getOrCreateMetrics(agentName: string): AgentMetricsEntry {
    const existing = this.agentMetrics.get(agentName);
    if (existing) return existing;
    const fresh: AgentMetricsEntry = {
      invocations: 0,
      totalResponseTimeMs: 0,
      successCount: 0,
      errorCount: 0,
      lastInvoked: "",
      messagesRouted: 0,
    };
    this.agentMetrics.set(agentName, fresh);
    return fresh;
  }

  private recordMetricsSuccess(agentName: string, responseTimeMs: number): void {
    const metrics = this.getOrCreateMetrics(agentName);
    metrics.invocations += 1;
    metrics.totalResponseTimeMs += responseTimeMs;
    metrics.successCount += 1;
    metrics.lastInvoked = new Date().toISOString();
    this.emitMetricsUpdate();
  }

  private recordMetricsError(agentName: string, responseTimeMs: number): void {
    const metrics = this.getOrCreateMetrics(agentName);
    metrics.invocations += 1;
    metrics.totalResponseTimeMs += responseTimeMs;
    metrics.errorCount += 1;
    metrics.lastInvoked = new Date().toISOString();
    this.emitMetricsUpdate();
  }

  private incrementMessagesRouted(agentName: string): void {
    const metrics = this.getOrCreateMetrics(agentName);
    metrics.messagesRouted += 1;
  }

  private emitMetricsUpdate(): void {
    this.emit("metricsUpdate", this.getMetrics());
  }

  private handleTicketFromMessage(message: AgentMessage): void {
    if (!this.ticketManager) return;
    const tm = this.ticketManager;

    const ticketId = this.findTicketIdFromThread(message);

    switch (message.type) {
      case "task_assignment": {
        const parentTicketId = ticketId ?? (message.context?.ticketId as string | undefined) ?? null;
        tm.create({
          title: message.subject,
          description: message.body,
          priority: message.priority as Ticket["priority"],
          createdBy: message.from,
          assignedTo: message.to !== "broadcast" ? message.to : null,
          parentTicketId: parentTicketId ?? null,
        });
        break;
      }
      case "task_update": {
        if (ticketId) {
          const ticket = tm.getById(ticketId);
          if (ticket && ticket.status === "assigned") {
            tm.updateStatus(ticketId, "in_progress", message.from);
          }
          tm.addComment(ticketId, message.from, message.body);
        }
        break;
      }
      case "review_request": {
        if (ticketId) {
          tm.updateStatus(ticketId, "in_review", message.from);
        }
        break;
      }
      case "review_result": {
        if (ticketId) {
          const bodyLower = message.body.toLowerCase();
          const result: "approved" | "changes_requested" =
            bodyLower.includes("approved") || bodyLower.includes("lgtm")
              ? "approved"
              : "changes_requested";
          tm.addReview(ticketId, message.from, result);
        }
        break;
      }
      case "task_complete": {
        if (ticketId) {
          const ticket = tm.getById(ticketId);
          if (ticket?.status === "qa") {
            tm.addQaResult(ticketId, message.from, "passed");
          } else {
            tm.updateStatus(ticketId, "qa", message.from);
          }
        }
        break;
      }
      case "escalation": {
        if (ticketId) {
          tm.addComment(ticketId, message.from, `Escalation: ${message.body}`);
        }
        break;
      }
      default:
        break;
    }
  }

  private findTicketIdFromThread(message: AgentMessage): string | null {
    const contextTicketId = message.context?.ticketId;
    if (typeof contextTicketId === "string") return contextTicketId;

    if (!message.parentMessageId) return null;

    const log = this.messageBus.getLog();
    let currentId: string | undefined = message.parentMessageId;

    while (currentId) {
      const parent = log.find((m) => m.id === currentId);
      if (!parent) break;

      const parentTicketId = parent.context?.ticketId;
      if (typeof parentTicketId === "string") return parentTicketId;

      currentId = parent.parentMessageId;
    }

    return null;
  }

  private bindEvents(): void {
    this.messageBus.on("message:routed", (message) => {
      this.emit("messageRouted", message);
    });

    this.escalationManager.on("escalation", (escalation) => {
      this.emit("escalation", escalation);
    });

    this.escalationManager.on("resolved", (escalation) => {
      this.emit("escalationResolved", escalation);
    });
  }

  private bindAgentEvents(name: string, agent: AgentProcess): void {
    if (this.boundAgents.has(name)) return;
    this.boundAgents.add(name);

    agent.on("thought", (thought: string) => {
      this.emit("agentThought", name, thought);
    });

    agent.on("chunk", (delta: string) => {
      this.emit("agentChunk", name, delta);
    });

    agent.on("statusChange", (status: string) => {
      this.emit("agentStatusChange", name, status);
    });

    agent.on("message", (message: AgentMessage) => {
      this.routeMessage(message).catch((err) => {
        logger.error(SCOPE, `Failed to route message from ${name}`, err);
      });
    });
  }

  private handleEscalation(message: AgentMessage): void {
    const config = this.agentManager.getConfig(message.from);
    if (config && !config.canEscalateToUser) {
      logger.warn(SCOPE, `Agent ${message.from} cannot escalate to user — routing to superior`);
      if (config.reportsTo) {
        message.to = config.reportsTo;
        this.routeMessage(message).catch((err) => {
          logger.error(SCOPE, `Failed to reroute escalation to ${config.reportsTo}`, err);
        });
        return;
      }
    }

    this.escalationManager.createEscalation(message);
  }

  private formatIncomingMessage(message: AgentMessage): string {
    return [
      `[Incoming message from ${message.from}]`,
      `Type: ${message.type}`,
      `Priority: ${message.priority}`,
      `Subject: ${message.subject}`,
      "",
      message.body,
      "",
      message.context ? `Context: ${JSON.stringify(message.context)}` : "",
      message.requiresResponse ? "This message requires your response." : "",
    ].filter(Boolean).join("\n");
  }

  private async handleAgentCommit(agentName: string, subject: string, ticketId?: string): Promise<void> {
    const doCommit = async (): Promise<void> => {
      const settings = getRuntimeSettings();
      if (!settings.autoCommit) return;
      if (!isGitRepo(this.workingDirectory)) return;
      const changed = getStatus(this.workingDirectory);
      if (changed.length === 0) return;
      const result = stageAndCommit(this.workingDirectory, subject, agentName);
      if (!result) return;
      const commitData = { ...result, message: subject, ticketId };
      this.emit("agentCommit", agentName, commitData);
      if (ticketId && this.ticketManager) {
        await this.ticketManager.addCommit(ticketId, agentName, result.sha, result.files, subject);
      }
    };
    this.commitLock = this.commitLock.then(doCommit).catch((err) => {
      logger.error(SCOPE, `Commit failed for ${agentName}`, err);
    });
    await this.commitLock;
  }

  private selectModelForTask(agentName: string, message: string, config: AgentConfig): AgentModel {
    const settings = getRuntimeSettings();
    const baseModel = settings.defaultModel ?? config.model;
    if (!settings.intelligentModelSelection) {
      return baseModel as AgentModel;
    }

    const complexity = analyzeTaskComplexity(message, {
      role: config.role,
      authorityLevel: config.authorityLevel,
    });
    const selectedModel = complexityToModel(complexity, baseModel) as AgentModel;

    logger.info(SCOPE, `Model selection for ${agentName}: ${complexity} complexity -> ${selectedModel} (default: ${config.model})`);

    this.emit("modelSelection", {
      agent: agentName,
      complexity,
      selectedModel,
      defaultModel: config.model,
    });

    return selectedModel;
  }

  private stripHivemindMessages(output: string): string {
    return output.replace(/\[HIVEMIND:MESSAGE\][\s\S]*?\[\/HIVEMIND:MESSAGE\]/g, "").trim();
  }
}
