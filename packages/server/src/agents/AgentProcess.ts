import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { logger } from "../utils/logger.js";
import type { AgentConfig, AgentStatus } from "./types.js";
import type { AgentMessage } from "../orchestrator/types.js";

const SCOPE = "AgentProcess";

const HIVEMIND_MSG_START = "[HIVEMIND:MESSAGE]";
const HIVEMIND_MSG_END = "[/HIVEMIND:MESSAGE]";

export interface AgentProcessEvents {
  message: [AgentMessage];
  thought: [string];
  statusChange: [AgentStatus];
  error: [Error];
  exit: [number | null];
}

export class AgentProcess extends EventEmitter<AgentProcessEvents> {
  readonly config: AgentConfig;
  private process: ChildProcess | null = null;
  private outputBuffer = "";
  private status: AgentStatus = "idle";
  private workingDirectory: string;
  sharedMemory: string = "";

  constructor(config: AgentConfig, workingDirectory: string) {
    super();
    this.config = config;
    this.workingDirectory = workingDirectory;
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

    logger.info(SCOPE, `Starting agent ${this.config.name} with model ${this.config.model}`);

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

      let output = "";

      this.process = spawn("claude", this.buildArgs(prompt), {
        cwd: this.workingDirectory,
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env },
      });

      this.setStatus("working");

      this.process.stdout?.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        output += text;
        this.processOutput(text);
      });

      this.process.stderr?.on("data", (chunk: Buffer) => {
        logger.debug(SCOPE, `[${this.config.name} stderr] ${chunk.toString().trim()}`);
      });

      this.process.on("close", (code) => {
        this.setStatus("idle");
        this.process = null;
        if (code === 0) {
          resolve(output);
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
      "--print",
      "--model", model,
      "--system-prompt", this.buildSystemPrompt(),
      "--dangerously-skip-permissions",
      prompt,
    ];
  }

  private resolveModelFlag(): string {
    const modelMap: Record<string, string> = {
      opus: "claude-opus-4-6",
      sonnet: "claude-sonnet-4-6",
      haiku: "claude-haiku-4-5-20251001",
    };
    return modelMap[this.config.model] ?? "claude-sonnet-4-6";
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

    let startIdx = this.outputBuffer.indexOf(HIVEMIND_MSG_START);
    while (startIdx !== -1) {
      const endIdx = this.outputBuffer.indexOf(HIVEMIND_MSG_END, startIdx);
      if (endIdx === -1) break;

      const jsonStr = this.outputBuffer.slice(
        startIdx + HIVEMIND_MSG_START.length,
        endIdx
      );

      const beforeMessage = this.outputBuffer.slice(0, startIdx).trim();
      if (beforeMessage) {
        this.emit("thought", beforeMessage);
      }

      try {
        const parsed = JSON.parse(jsonStr) as AgentMessage;
        this.emit("message", parsed);
      } catch (err) {
        logger.error(SCOPE, `Failed to parse agent message from ${this.config.name}: ${jsonStr}`, err);
      }

      this.outputBuffer = this.outputBuffer.slice(endIdx + HIVEMIND_MSG_END.length);
      startIdx = this.outputBuffer.indexOf(HIVEMIND_MSG_START);
    }

    const remainingTrimmed = this.outputBuffer.trim();
    if (remainingTrimmed && !remainingTrimmed.includes(HIVEMIND_MSG_START)) {
      this.emit("thought", remainingTrimmed);
      this.outputBuffer = "";
    }
  }

  private setStatus(newStatus: AgentStatus): void {
    if (this.status !== newStatus) {
      this.status = newStatus;
      this.emit("statusChange", newStatus);
    }
  }
}
