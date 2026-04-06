import { EventEmitter } from "node:events";
import { logger } from "../utils/logger.js";
import { MessageBus } from "./MessageBus.js";
import { EscalationManager } from "./EscalationManager.js";
import { AgentManager } from "../agents/AgentManager.js";
import type { AgentMessage, EscalationRequest } from "./types.js";
import type { AgentConfig, AgentState } from "../agents/types.js";

const SCOPE = "Orchestrator";

export interface OrchestratorEvents {
  agentThought: [string, string];
  agentStatusChange: [string, string];
  messageRouted: [AgentMessage];
  escalation: [EscalationRequest];
  escalationResolved: [EscalationRequest];
  error: [string, Error];
}

export class Orchestrator extends EventEmitter<OrchestratorEvents> {
  readonly messageBus: MessageBus;
  readonly escalationManager: EscalationManager;
  readonly agentManager: AgentManager;
  private workingDirectory: string;

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
    this.bindAgentEvents(agentName, agent);

    try {
      const response = await agent.startConversation(userMessage);
      return this.stripHivemindMessages(response);
    } catch (err) {
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
      return;
    }

    const targetConfig = this.agentManager.getConfig(message.to);
    if (!targetConfig) {
      logger.error(SCOPE, `Cannot route message: unknown agent ${message.to}`);
      return;
    }

    this.messageBus.routeExistingMessage(message);
    this.emit("messageRouted", message);

    const prompt = this.formatIncomingMessage(message);
    try {
      const response = await this.agentManager.invokeAgent(message.to, prompt);
      logger.debug(SCOPE, `Agent ${message.to} responded: ${response.slice(0, 200)}`);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error(SCOPE, `Failed to deliver message to ${message.to}`, error);
      this.emit("error", message.to, error);
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

  shutdown(): void {
    logger.info(SCOPE, "Shutting down orchestrator");
    this.agentManager.stopAll();
    this.messageBus.clear();
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private bindAgentEvents(name: string, agent: any): void {
    agent.on("thought", (thought: string) => {
      this.emit("agentThought", name, thought);
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

  private stripHivemindMessages(output: string): string {
    return output.replace(/\[HIVEMIND:MESSAGE\][\s\S]*?\[\/HIVEMIND:MESSAGE\]/g, "").trim();
  }
}
