import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { logger } from "../utils/logger.js";
import type { AgentConfig, AgentModel, AgentRole, AgentStatus } from "./types.js";
import type { AgentMessage } from "../orchestrator/types.js";

const SCOPE = "AgentProcess";

const HIVEMIND_MSG_START = "[HIVEMIND:MESSAGE]";
const HIVEMIND_MSG_END = "[/HIVEMIND:MESSAGE]";

// Per-role tool whitelist passed to `claude --tools`.
// `""` = no built-in tools (pure delegation via HIVEMIND messages).
// `null` = omit the flag entirely (default = all tools).
// Verified against claude 2.1.92: `--tools ""` truly disables built-in tools;
// `--allowed-tools ""` does NOT (it's treated as "no restriction").
const TOOLS_BY_ROLE: Record<AgentRole, string | null> = {
  ceo: "",
  cto: "",
  cpo: "",
  coo: "",
  "senior-dev": "Read,Grep,Glob,Edit,Write,Bash,WebFetch,WebSearch",
  "junior-dev": "Read,Grep,Glob,Edit,Write,Bash",
  designer: "Read,Grep,Glob,Edit,Write,WebFetch,WebSearch",
  devops: "Read,Grep,Glob,Edit,Write,Bash",
  // Code reviewers need Bash to actually run typecheck/tests when verifying
  // claims, but no Edit/Write — review only.
  "code-reviewer": "Read,Grep,Glob,Bash",
  "design-reviewer": "Read,Grep,Glob",
  qa: "Read,Grep,Glob,Bash",
  // Custom role defaults to read-only — safer than granting unrestricted
  // tools to user-defined agents. Operators can widen this in future via a
  // per-agent config field.
  custom: "Read,Grep,Glob",
};

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
  // When set, the next claude spawn passes --resume to continue this conversation.
  // Captured from the first stream-json system init message; cleared on resume failure.
  private currentSessionId: string | null = null;
  private stderrBuffer = "";
  // System-generated reminders (e.g. routing rejections) queued to inject into
  // this agent's NEXT turn. Cleared after each delivery. Used by the
  // orchestrator to teach an agent it sent an illegal HIVEMIND message.
  private pendingFeedback: string[] = [];
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

  getCurrentSessionId(): string | null {
    return this.currentSessionId;
  }

  resetSession(): void {
    this.currentSessionId = null;
  }

  /**
   * Queue a system reminder (e.g. routing rejection feedback) to be prepended
   * to this agent's next prompt. Used by the orchestrator's hierarchy
   * enforcement to deliver feedback that would otherwise be lost — claude -p
   * cannot accept input mid-stream, so we wait until the next turn.
   */
  appendFeedback(reminder: string): void {
    this.pendingFeedback.push(reminder);
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
      this.stderrBuffer = "";

      const wasResuming = this.currentSessionId !== null;
      const finalPrompt = this.consumePendingFeedback(prompt);
      this.process = spawn("claude", this.buildArgs(finalPrompt), {
        cwd: this.workingDirectory,
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env },
      });
      this.setStatus("working");

      this.process.stdout?.on("data", (chunk: Buffer) => {
        this.processOutput(chunk.toString());
      });
      this.process.stderr?.on("data", (chunk: Buffer) => {
        this.appendStderr(chunk.toString());
      });
      this.process.on("close", (code) => {
        this.setStatus("idle");
        this.process = null;
        if (code === 0) {
          resolve(this.stripHivemindMessages(this.fullText));
          return;
        }
        // If a resume failed (e.g. session expired), drop the session ID so the
        // next call starts fresh. Don't auto-retry — surface the error so the
        // caller can decide.
        if (wasResuming && this.looksLikeResumeFailure(code)) {
          logger.warn(SCOPE, `Agent ${this.config.name} resume failed (exit ${code}); clearing session ${this.currentSessionId}`);
          this.currentSessionId = null;
        }
        reject(new Error(`Agent ${this.config.name} exited with code ${code}`));
      });
      this.process.on("error", (err) => {
        this.setStatus("error");
        this.process = null;
        reject(err);
      });
    });
  }

  private looksLikeResumeFailure(exitCode: number | null): boolean {
    if (exitCode === 0) return false;
    const stderr = this.stderrBuffer.toLowerCase();
    return stderr.includes("session") && (stderr.includes("not found") || stderr.includes("expired") || stderr.includes("invalid"));
  }

  private consumePendingFeedback(prompt: string): string {
    if (this.pendingFeedback.length === 0) return prompt;
    const reminders = this.pendingFeedback
      .map((r, i) => `${i + 1}. ${r}`)
      .join("\n");
    this.pendingFeedback = [];
    return [
      "[SYSTEM REMINDER — read carefully before responding]",
      "Since your previous turn, the orchestrator delivered the following feedback to you:",
      "",
      reminders,
      "",
      "[End system reminder. The user's actual message follows below.]",
      "",
      prompt,
    ].join("\n");
  }

  private appendStderr(text: string): void {
    this.stderrBuffer += text;
    // Cap stderr buffer to avoid unbounded growth on chatty CLI sessions.
    // Keep the most recent half — that's what looksLikeResumeFailure cares about.
    if (this.stderrBuffer.length > 16384) {
      this.stderrBuffer = this.stderrBuffer.slice(-8192);
    }
    logger.debug(SCOPE, `[${this.config.name} stderr] ${text.trim()}`);
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
    const args = [
      "-p",
      "--output-format", "stream-json",
      "--verbose",
      "--model", model,
      "--system-prompt", this.buildSystemPrompt(),
      "--dangerously-skip-permissions",
    ];

    // Per-role tool restriction. Pure-delegation roles (CEO/CTO/CPO/COO)
    // get an empty whitelist so they cannot Read/Edit/Bash — they must
    // delegate via HIVEMIND messages.
    const toolList = TOOLS_BY_ROLE[this.config.role];
    if (toolList !== null) {
      args.push("--tools", toolList);
    }

    // Resume conversation when this AgentProcess instance has a captured
    // session id (set by processStreamLine on the first system init).
    // Verified: --resume preserves prior turns; --system-prompt must still be
    // re-passed because the CLI does not retain it across resumed sessions.
    if (this.currentSessionId) {
      args.push("--resume", this.currentSessionId);
    }

    args.push(prompt);
    return args;
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
      this.appendStderr(chunk.toString());
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
      this.captureSessionId(obj);
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

  private captureSessionId(obj: Record<string, unknown>): void {
    // Only capture from the system init event, and only if we don't already
    // have one. This pins the session id for the lifetime of the AgentProcess
    // instance so subsequent turns resume the same conversation.
    if (this.currentSessionId !== null) return;
    if (obj.type !== "system" || obj.subtype !== "init") return;
    const sid = obj.session_id;
    if (typeof sid === "string" && sid.length > 0) {
      this.currentSessionId = sid;
      logger.debug(SCOPE, `Captured session id for ${this.config.name}: ${sid}`);
    }
  }

  private extractTextDelta(obj: Record<string, unknown>): string | null {
    // Handle stream-json "assistant" format (verbose):
    // { type: "assistant", message: { content: [{type:"text", text:"..."}] } }
    if (obj.type === "assistant") {
      const message = obj.message as Record<string, unknown> | undefined;
      const content = message?.content ?? obj.content;
      const extracted = this.extractTextFromContent(content);
      if (extracted) return extracted;
    }
    // Skip "result" type — it duplicates the final assistant message text.
    if (obj.type === "content_block_delta") {
      const delta = obj.delta as Record<string, unknown> | undefined;
      if (delta && typeof delta.text === "string") return delta.text;
    }
    if (typeof obj.text === "string" && obj.text) return obj.text;
    return null;
  }

  private extractTextFromContent(content: unknown): string | null {
    if (typeof content === "string") return content;
    if (!Array.isArray(content)) return null;
    const texts: string[] = [];
    for (const block of content) {
      if (typeof block === "string") texts.push(block);
      else if (block && typeof block === "object" && "text" in block) {
        const b = block as Record<string, unknown>;
        if (typeof b.text === "string") texts.push(b.text);
      }
    }
    return texts.length > 0 ? texts.join("") : null;
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
