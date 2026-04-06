import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { logger } from "../utils/logger.js";
import type { AgentConfig, AgentModel, AgentStatus } from "./types.js";
import type { AgentMessage } from "../orchestrator/types.js";

const SCOPE = "AgentProcess";

const HIVEMIND_MSG_START = "[HIVEMIND:MESSAGE]";
const HIVEMIND_MSG_END = "[/HIVEMIND:MESSAGE]";

export interface AgentProcessEvents {
  message: [AgentMessage];
  thought: [string];
  chunk: [string];
  statusChange: [AgentStatus];
  error: [Error];
  exit: [number | null];
}

export class AgentProcess extends EventEmitter<AgentProcessEvents> {
  readonly config: AgentConfig;
  private process: ChildProcess | null = null;
  private outputBuffer = "";
  private fullText = "";
  private status: AgentStatus = "idle";
  private workingDirectory: string;
  private modelOverride?: AgentModel;
  sharedMemory: string = "";

  constructor(config: AgentConfig, workingDirectory: string) {
    super();
    this.config = config;
    this.workingDirectory = workingDirectory;
  }

  setModelOverride(model: AgentModel): void {
    this.modelOverride = model;
  }

  getActiveModel(): AgentModel {
    return this.modelOverride ?? this.config.model;
  }

  getStatus(): AgentStatus {
    return this.status;
  }

  isRunning(): boolean {
    return this.process !== null && this.process.exitCode === null;
  }

  start(initialPrompt: string): void {
    if (this.isRunning()) {
      logger.warn(SCOPE, `Agent ${this.config.name} is already running`);
      return;
    }

    const activeModel = this.getActiveModel();
    logger.info(SCOPE, `Starting agent ${this.config.name} with model ${activeModel}${this.modelOverride ? ` (override from ${this.config.model})` : ""}`);

    this.fullText = "";
    this.outputBuffer = "";

    this.process = spawn("claude", this.buildArgs(initialPrompt), {
      cwd: this.workingDirectory,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });

    this.setStatus("working");
    this.bindProcessEvents();
  }

  sendMessage(input: string): void {
    if (!this.isRunning() || !this.process?.stdin) {
      logger.warn(SCOPE, `Cannot send message to ${this.config.name}: process not running`);
      return;
    }
    this.process.stdin.write(input + "\n");
  }

  async startConversation(prompt: string): Promise<string> {
    return new Promise((resolve, reject) => {
      if (this.isRunning()) {
        reject(new Error(`Agent ${this.config.name} is already running`));
        return;
      }
      this.fullText = "";
      this.outputBuffer = "";

      this.process = spawn("claude", this.buildArgs(prompt), {
        cwd: this.workingDirectory,
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env },
      });
      this.setStatus("working");

      this.process.stdout?.on("data", (chunk: Buffer) => {
        this.processOutput(chunk.toString());
      });
      this.process.stderr?.on("data", (chunk: Buffer) => {
        logger.debug(SCOPE, `[${this.config.name} stderr] ${chunk.toString().trim()}`);
      });
      this.process.on("close", (code) => {
        this.setStatus("idle");
        this.process = null;
        if (code === 0) {
          resolve(this.stripHivemindMessages(this.fullText));
        } else {
          reject(new Error(`Agent ${this.config.name} exited with code ${code}`));
        }
      });
      this.process.on("error", (err) => {
        this.setStatus("error");
        this.process = null;
        reject(err);
      });
    });
  }

  private stripHivemindMessages(text: string): string {
    return text.replace(/\[HIVEMIND:MESSAGE\][\s\S]*?\[\/HIVEMIND:MESSAGE\]/g, "").trim();
  }

  stop(): void {
    if (!this.process) return;
    logger.info(SCOPE, `Stopping agent ${this.config.name}`);
    this.process.kill("SIGTERM");

    const killTimeout = setTimeout(() => {
      if (this.process && this.process.exitCode === null) {
        logger.warn(SCOPE, `Force killing agent ${this.config.name}`);
        this.process.kill("SIGKILL");
      }
    }, 5000);

    this.process.on("exit", () => {
      clearTimeout(killTimeout);
      this.process = null;
      this.setStatus("idle");
    });
  }

  private buildSystemPrompt(): string {
    let hivemindInstructions = [
      `You are ${this.config.displayName} in the Hivemind system.`,
      `Your role: ${this.config.description}`,
      "",
      "## Inter-Agent Communication",
      "To send messages to other agents, wrap them in this format:",
      `${HIVEMIND_MSG_START}{"from":"${this.config.name}","to":"<recipient>","type":"<type>","priority":"normal","subject":"<subject>","body":"<body>","requiresResponse":true}${HIVEMIND_MSG_END}`,
      "",
      "Message types: task_assignment, task_update, task_complete, review_request, review_result, escalation, question, decision, status_update, feedback",
      "",
      `Your authority level is ${this.config.authorityLevel}/5.`,
      this.config.reportsTo ? `You report to: ${this.config.reportsTo}` : "You report directly to the Board/Owner.",
      this.config.directReports.length > 0
        ? `Your direct reports: ${this.config.directReports.join(", ")}`
        : "You have no direct reports.",
      "",
      "## Your Personality & Instructions",
    ].join("\n");

    if (this.sharedMemory) {
      hivemindInstructions += "\n\n## Company Wiki (Shared Knowledge)\n" + this.sharedMemory;
    }

    return `${hivemindInstructions}\n\n${this.config.systemPrompt}`;
  }

  private buildArgs(prompt: string): string[] {
    const model = this.resolveModelFlag();
    return [
      "-p",
      "--output-format", "stream-json",
      "--model", model,
      "--system-prompt", this.buildSystemPrompt(),
      "--dangerously-skip-permissions",
      prompt,
    ];
  }

  private resolveModelFlag(): string {
    const model = this.modelOverride ?? this.config.model;
    const modelMap: Record<string, string> = {
      opus: "claude-opus-4-6",
      sonnet: "claude-sonnet-4-6",
      haiku: "claude-haiku-4-5-20251001",
    };
    return modelMap[model] ?? "claude-sonnet-4-6";
  }

  private bindProcessEvents(): void {
    if (!this.process) return;

    this.process.stdout?.on("data", (chunk: Buffer) => {
      this.processOutput(chunk.toString());
    });

    this.process.stderr?.on("data", (chunk: Buffer) => {
      logger.debug(SCOPE, `[${this.config.name} stderr] ${chunk.toString().trim()}`);
    });

    this.process.on("close", (code) => {
      this.setStatus("idle");
      this.process = null;
      this.emit("exit", code);
    });

    this.process.on("error", (err) => {
      this.setStatus("error");
      this.emit("error", err);
    });
  }

  private processOutput(text: string): void {
    this.outputBuffer += text;
    let newlineIdx = this.outputBuffer.indexOf("\n");
    while (newlineIdx !== -1) {
      const line = this.outputBuffer.slice(0, newlineIdx).trim();
      this.outputBuffer = this.outputBuffer.slice(newlineIdx + 1);
      if (line) this.processStreamLine(line);
      newlineIdx = this.outputBuffer.indexOf("\n");
    }
  }

  private processStreamLine(line: string): void {
    try {
      const obj = JSON.parse(line) as Record<string, unknown>;
      const textDelta = this.extractTextDelta(obj);
      if (textDelta) {
        this.fullText += textDelta;
        this.emit("chunk", textDelta);
        this.checkForHivemindMessages();
      }
    } catch {
      // Non-JSON line fallback
      this.fullText += line;
      this.emit("thought", line);
    }
  }

  private extractTextDelta(obj: Record<string, unknown>): string | null {
    // Handle various stream-json message formats
    if (obj.type === "assistant" || obj.type === "result") {
      const content = obj.content;
      if (typeof content === "string") return content;
      if (Array.isArray(content)) {
        const texts: string[] = [];
        for (const block of content) {
          if (typeof block === "string") texts.push(block);
          else if (block && typeof block === "object" && "text" in block) {
            const b = block as Record<string, unknown>;
            if (typeof b.text === "string") texts.push(b.text);
          }
        }
        if (texts.length > 0) return texts.join("");
      }
    }
    if (obj.type === "content_block_delta") {
      const delta = obj.delta as Record<string, unknown> | undefined;
      if (delta && typeof delta.text === "string") return delta.text;
    }
    if (typeof obj.text === "string" && obj.text) return obj.text;
    return null;
  }

  private checkForHivemindMessages(): void {
    let startIdx = this.fullText.indexOf(HIVEMIND_MSG_START);
    while (startIdx !== -1) {
      const endIdx = this.fullText.indexOf(HIVEMIND_MSG_END, startIdx);
      if (endIdx === -1) break;
      const jsonStr = this.fullText.slice(startIdx + HIVEMIND_MSG_START.length, endIdx);
      try {
        const parsed = JSON.parse(jsonStr) as AgentMessage;
        parsed.from = this.config.name;
        this.emit("message", parsed);
      } catch (err) {
        logger.error(SCOPE, `Failed to parse agent message from ${this.config.name}: ${jsonStr}`, err);
      }
      this.fullText = this.fullText.slice(0, startIdx) + this.fullText.slice(endIdx + HIVEMIND_MSG_END.length);
      startIdx = this.fullText.indexOf(HIVEMIND_MSG_START);
    }
  }

  private setStatus(newStatus: AgentStatus): void {
    if (this.status !== newStatus) {
      this.status = newStatus;
      this.emit("statusChange", newStatus);
    }
  }
}
