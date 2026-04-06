# Tier 1 Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Hivemind feel alive with streaming agent responses, a company-wide conversation feed, and git auto-commits from agent work.

**Architecture:** AgentProcess switches from `--print` to `-p --output-format stream-json` for real-time streaming. Chunks flow through Orchestrator → WebSocket → GUI. A CompanyFeed component shows all inter-agent messages. Git helpers auto-commit after each agent invocation and record commits in ticket timelines.

**Tech Stack:** TypeScript, child_process (spawn/execSync), WebSocket (ws), React, Zustand, marked

---

## File Map

### Server — New files
- `packages/server/src/utils/git.ts` — Git helpers (isGitRepo, getStatus, stageAndCommit, getDiff)

### Server — Modified files
- `packages/server/src/agents/AgentProcess.ts` — Stream-json output parsing, new `chunk` event
- `packages/server/src/orchestrator/Orchestrator.ts` — New `agentChunk`/`agentCommit` events, git commit handling
- `packages/server/src/routes/ws.ts` — Broadcast `agent:chunk` and `agent:commit`
- `packages/server/src/tickets/types.ts` — Add `commit` event type
- `packages/server/src/tickets/TicketManager.ts` — Add `addCommit()` method

### Web — New files
- `packages/web/src/components/chat/CompanyFeed.tsx` — Inter-agent message feed
- `packages/web/src/components/chat/StreamingMessage.tsx` — Live-rendering streaming text

### Web — Modified files
- `packages/web/src/stores/appStore.ts` — Streaming text, feed messages, chat mode
- `packages/web/src/hooks/useWebSocket.ts` — Handle chunk, commit, feed events
- `packages/web/src/components/chat/ChatPanel.tsx` — DIRECT/FEED toggle, streaming display
- `packages/web/src/components/floor/AgentNode.tsx` — Pass streaming text to thought bubble
- `packages/web/src/components/tickets/TicketTimeline.tsx` — Render commit events

---

### Task 1: Streaming — AgentProcess stream-json parsing

**Files:**
- Modify: `packages/server/src/agents/AgentProcess.ts`

The biggest change in the whole plan. Switch from `--print` (buffers everything) to `-p --output-format stream-json` (streams newline-delimited JSON). Each stdout line is a JSON object. We parse text deltas and emit `chunk` events, while still accumulating full text and detecting HIVEMIND:MESSAGE tags.

- [ ] **Step 1: Add `chunk` event to AgentProcessEvents**

In `packages/server/src/agents/AgentProcess.ts`, add to the `AgentProcessEvents` interface:

```typescript
export interface AgentProcessEvents {
  message: [AgentMessage];
  thought: [string];
  chunk: [string];
  statusChange: [AgentStatus];
  error: [Error];
  exit: [number | null];
}
```

- [ ] **Step 2: Update `buildArgs` to use stream-json**

Replace the `buildArgs` method:

```typescript
  private buildArgs(prompt: string): string[] {
    const model = this.resolveModelFlag();
    return [
      "-p",
      "--model", model,
      "--output-format", "stream-json",
      "--system-prompt", this.buildSystemPrompt(),
      "--dangerously-skip-permissions",
      prompt,
    ];
  }
```

- [ ] **Step 3: Rewrite `processOutput` for stream-json format**

The stream-json format outputs one JSON object per line. We care about objects where the `type` is a content message. The text content is in various places depending on the message structure. We extract text, emit chunks, and still detect HIVEMIND:MESSAGE tags in the accumulated text.

Replace the entire `processOutput` method:

```typescript
  private processOutput(text: string): void {
    this.outputBuffer += text;

    // Process complete lines
    let newlineIdx = this.outputBuffer.indexOf("\n");
    while (newlineIdx !== -1) {
      const line = this.outputBuffer.slice(0, newlineIdx).trim();
      this.outputBuffer = this.outputBuffer.slice(newlineIdx + 1);

      if (line) {
        this.processStreamLine(line);
      }

      newlineIdx = this.outputBuffer.indexOf("\n");
    }
  }

  private processStreamLine(line: string): void {
    try {
      const obj = JSON.parse(line) as Record<string, unknown>;

      // Extract text content from stream-json messages
      const textDelta = this.extractTextDelta(obj);
      if (textDelta) {
        this.fullText += textDelta;
        this.emit("chunk", textDelta);

        // Check accumulated text for HIVEMIND:MESSAGE tags
        this.checkForHivemindMessages();
      }
    } catch {
      // Non-JSON line — treat as raw text (fallback)
      this.fullText += line;
      this.emit("thought", line);
    }
  }

  private extractTextDelta(obj: Record<string, unknown>): string | null {
    // Claude stream-json format: look for text in content blocks
    // The format may include result messages with content arrays
    if (obj.type === "assistant" || obj.type === "result") {
      const content = obj.content;
      if (typeof content === "string") return content;
      if (Array.isArray(content)) {
        const texts: string[] = [];
        for (const block of content) {
          if (typeof block === "string") texts.push(block);
          else if (block && typeof block === "object" && "text" in block && typeof (block as Record<string, unknown>).text === "string") {
            texts.push((block as Record<string, unknown>).text as string);
          }
        }
        if (texts.length > 0) return texts.join("");
      }
    }

    // Content block delta
    if (obj.type === "content_block_delta") {
      const delta = obj.delta as Record<string, unknown> | undefined;
      if (delta && typeof delta.text === "string") return delta.text;
    }

    // Message delta with text
    if (typeof obj.text === "string" && obj.text) return obj.text;

    return null;
  }

  private checkForHivemindMessages(): void {
    const HIVEMIND_MSG_START = "[HIVEMIND:MESSAGE]";
    const HIVEMIND_MSG_END = "[/HIVEMIND:MESSAGE]";

    let startIdx = this.fullText.indexOf(HIVEMIND_MSG_START);
    while (startIdx !== -1) {
      const endIdx = this.fullText.indexOf(HIVEMIND_MSG_END, startIdx);
      if (endIdx === -1) break;

      const jsonStr = this.fullText.slice(
        startIdx + HIVEMIND_MSG_START.length,
        endIdx
      );

      try {
        const parsed = JSON.parse(jsonStr) as AgentMessage;
        this.emit("message", parsed);
      } catch (err) {
        logger.error(SCOPE, `Failed to parse agent message from ${this.config.name}: ${jsonStr}`, err);
      }

      // Remove the processed message from fullText
      this.fullText = this.fullText.slice(0, startIdx) + this.fullText.slice(endIdx + HIVEMIND_MSG_END.length);
      startIdx = this.fullText.indexOf(HIVEMIND_MSG_START);
    }
  }
```

- [ ] **Step 4: Add `fullText` property and update `startConversation`**

Add a new instance property after `outputBuffer`:

```typescript
  private fullText = "";
```

Update `startConversation` to use `fullText` instead of the local `output` variable. Replace the method:

```typescript
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
```

Also update the `start()` method's stdout handler similarly — replace `this.processOutput(chunk.toString())` (it already calls processOutput, so this works).

Remove the old `processOutput` constants at the top of the class (`HIVEMIND_MSG_START`, `HIVEMIND_MSG_END` at lines 9-10) — they're now in `checkForHivemindMessages` as local consts, or you can keep them as class-level. Actually, keep the top-level consts and reference them in `checkForHivemindMessages` instead of redefining.

- [ ] **Step 5: Verify it compiles**

Run: `pnpm --filter @hivemind/server typecheck`
Expected: Clean pass

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/agents/AgentProcess.ts
git commit -m "feat(streaming): switch AgentProcess to stream-json output with chunk events"
```

---

### Task 2: Streaming — Orchestrator + WebSocket

**Files:**
- Modify: `packages/server/src/orchestrator/Orchestrator.ts`
- Modify: `packages/server/src/routes/ws.ts`

- [ ] **Step 1: Add `agentChunk` event to Orchestrator**

In `OrchestratorEvents` interface, add:

```typescript
  agentChunk: [string, string];
```

In `bindAgentEvents()`, add after the existing `thought` binding:

```typescript
    agent.on("chunk", (delta: string) => {
      this.emit("agentChunk", name, delta);
    });
```

- [ ] **Step 2: Broadcast chunks via WebSocket**

In `packages/server/src/routes/ws.ts`, add after the `agentStatusChange` broadcast:

```typescript
  orchestrator.on("agentChunk", (agentName, delta) => {
    broadcast("agent:chunk", { agent: agentName, delta });
  });
```

- [ ] **Step 3: Verify and commit**

Run: `pnpm --filter @hivemind/server typecheck`

```bash
git add packages/server/src/orchestrator/Orchestrator.ts packages/server/src/routes/ws.ts
git commit -m "feat(streaming): broadcast agent chunks via WebSocket"
```

---

### Task 3: Git Helpers

**Files:**
- Create: `packages/server/src/utils/git.ts`

- [ ] **Step 1: Create the git utility module**

```typescript
// packages/server/src/utils/git.ts

import { execSync } from "node:child_process";
import { logger } from "./logger.js";

const SCOPE = "Git";

export function isGitRepo(cwd: string): boolean {
  try {
    execSync("git rev-parse --git-dir", { cwd, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

export function getStatus(cwd: string): string[] {
  try {
    const output = execSync("git status --porcelain", { cwd, encoding: "utf-8" });
    return output
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.slice(3));
  } catch {
    return [];
  }
}

export function stageAndCommit(
  cwd: string,
  message: string,
  authorName: string
): { sha: string; files: string[] } | null {
  try {
    const files = getStatus(cwd);
    if (files.length === 0) return null;

    execSync("git add -A", { cwd, stdio: "pipe" });
    execSync(
      `git commit --no-gpg-sign --author="${authorName} <agent@hivemind>" -m "${message.replace(/"/g, '\\"')}"`,
      { cwd, stdio: "pipe" }
    );

    const sha = execSync("git rev-parse --short HEAD", { cwd, encoding: "utf-8" }).trim();
    logger.info(SCOPE, `Committed ${sha}: ${message} (${files.length} files)`);
    return { sha, files };
  } catch (err) {
    logger.debug(SCOPE, `Commit skipped: ${err instanceof Error ? err.message : "unknown error"}`);
    return null;
  }
}

export function getDiff(cwd: string, sha: string): string {
  try {
    return execSync(`git show --stat ${sha}`, { cwd, encoding: "utf-8" });
  } catch {
    return "";
  }
}
```

- [ ] **Step 2: Verify and commit**

Run: `pnpm --filter @hivemind/server typecheck`

```bash
git add packages/server/src/utils/git.ts
git commit -m "feat(git): add git helper utilities for auto-commit"
```

---

### Task 4: Git Integration — Orchestrator + Ticket Events

**Files:**
- Modify: `packages/server/src/orchestrator/Orchestrator.ts`
- Modify: `packages/server/src/tickets/types.ts`
- Modify: `packages/server/src/tickets/TicketManager.ts`

- [ ] **Step 1: Add `commit` to ticket event types**

In `packages/server/src/tickets/types.ts`, add `"commit"` to the `TicketEventType` union:

```typescript
export type TicketEventType =
  | "created"
  | "assigned"
  | "status_change"
  | "comment"
  | "review_submitted"
  | "qa_result"
  | "escalated"
  | "closed"
  | "commit";
```

Add `commit` field to `TicketEventData`:

```typescript
export interface TicketEventData {
  fromStatus?: TicketStatus;
  toStatus?: TicketStatus;
  fromAgent?: string;
  toAgent?: string;
  comment?: string;
  reviewResult?: "approved" | "changes_requested";
  qaResult?: "passed" | "failed";
  reason?: string;
  commit?: { sha: string; files: string[]; message: string };
}
```

- [ ] **Step 2: Add `addCommit` to TicketManager**

In `packages/server/src/tickets/TicketManager.ts`, add this method after `updatePriority`:

```typescript
  async addCommit(ticketId: string, actor: string, sha: string, files: string[], commitMessage: string): Promise<TicketEvent | null> {
    const ticket = this.ticketIndex.get(ticketId);
    if (!ticket) return null;

    ticket.updatedAt = new Date().toISOString();

    const event = this.buildEvent(ticketId, "commit", actor, {
      commit: { sha, files, message: commitMessage },
    });
    ticket.events.push(event);
    await this.save();

    this.emit("ticket:event", { ticketId, event });
    return event;
  }
```

- [ ] **Step 3: Add `agentCommit` event and `handleAgentCommit` to Orchestrator**

In `packages/server/src/orchestrator/Orchestrator.ts`, add the import:

```typescript
import { isGitRepo, getStatus, stageAndCommit } from "../utils/git.js";
```

Add to `OrchestratorEvents`:

```typescript
  agentCommit: [string, { sha: string; files: string[]; message: string; ticketId?: string }];
```

Add this method after `setSharedMemory`:

```typescript
  private async handleAgentCommit(agentName: string, subject: string, ticketId?: string): Promise<void> {
    if (!isGitRepo(this.workingDirectory)) return;
    
    const files = getStatus(this.workingDirectory);
    if (files.length === 0) return;

    const config = this.agentManager.getConfig(agentName);
    const displayName = config?.displayName ?? agentName;

    const ticket = ticketId ? this.ticketManager?.getById(ticketId) : undefined;
    const prefix = ticket ? `[HM-${ticket.number}] ` : "";
    const commitMessage = `${prefix}${displayName}: ${subject}`;

    const result = stageAndCommit(this.workingDirectory, commitMessage, displayName);
    if (!result) return;

    logger.info(SCOPE, `Agent ${agentName} committed: ${result.sha} (${result.files.length} files)`);
    this.emit("agentCommit", agentName, { sha: result.sha, files: result.files, message: commitMessage, ticketId });

    if (ticketId && this.ticketManager) {
      await this.ticketManager.addCommit(ticketId, agentName, result.sha, result.files, commitMessage);
    }
  }
```

Now call `handleAgentCommit` after agent conversations complete. In `sendUserMessage`, after the `agent.startConversation()` line and before the return, add:

```typescript
      await this.handleAgentCommit(agentName, userMessage.slice(0, 80));
```

In `routeMessage`, after `agent.startConversation(prompt)` resolves (inside the try, after the `logger.debug` line), add:

```typescript
      const msgTicketId = (message.context?.ticketId as string) ?? this.findTicketIdFromThread(message) ?? undefined;
      await this.handleAgentCommit(message.to, message.subject, msgTicketId);
```

- [ ] **Step 4: Broadcast commits via WebSocket**

In `packages/server/src/routes/ws.ts`, add after the `agentChunk` broadcast:

```typescript
  orchestrator.on("agentCommit", (agentName, commitData) => {
    broadcast("agent:commit", { agent: agentName, ...commitData });
  });
```

- [ ] **Step 5: Verify and commit**

Run: `pnpm --filter @hivemind/server typecheck`

```bash
git add packages/server/src/orchestrator/Orchestrator.ts packages/server/src/tickets/types.ts packages/server/src/tickets/TicketManager.ts packages/server/src/routes/ws.ts
git commit -m "feat(git): auto-commit agent work and record in ticket timeline"
```

---

### Task 5: Web — Store + WebSocket for streaming, feed, commits

**Files:**
- Modify: `packages/web/src/stores/appStore.ts`
- Modify: `packages/web/src/hooks/useWebSocket.ts`
- Modify: `packages/web/src/types/index.ts`

- [ ] **Step 1: Update web ticket types**

In `packages/web/src/types/index.ts`, update the `TicketEventType` to include `"commit"`:

```typescript
export type TicketEventType =
  | "created" | "assigned" | "status_change" | "comment"
  | "review_submitted" | "qa_result" | "escalated" | "closed"
  | "commit";
```

Update `TicketEventData` to include:

```typescript
  commit?: { sha: string; files: string[]; message: string };
```

- [ ] **Step 2: Add streaming, feed, and chat mode to store**

In `packages/web/src/stores/appStore.ts`, add to the `AppState` interface (after the `isThinking` block):

```typescript
  // Streaming
  streamingText: Map<string, string>;
  appendStreamingText: (agent: string, delta: string) => void;
  clearStreamingText: (agent: string) => void;

  // Company feed
  feedMessages: AgentMessage[];
  addFeedMessage: (message: AgentMessage) => void;
  chatMode: "direct" | "feed";
  setChatMode: (mode: "direct" | "feed") => void;
```

Add implementations (after `setIsThinking`):

```typescript
  streamingText: new Map(),
  appendStreamingText: (agent, delta) =>
    set((state) => {
      const newMap = new Map(state.streamingText);
      const existing = newMap.get(agent) ?? "";
      newMap.set(agent, existing + delta);
      return { streamingText: newMap };
    }),
  clearStreamingText: (agent) =>
    set((state) => {
      const newMap = new Map(state.streamingText);
      newMap.delete(agent);
      return { streamingText: newMap };
    }),

  feedMessages: [],
  addFeedMessage: (message) =>
    set((state) => ({
      feedMessages: [...state.feedMessages.slice(-200), message],
    })),
  chatMode: "direct",
  setChatMode: (mode) => set({ chatMode: mode }),
```

Note: `feedMessages` is capped at 200 entries to prevent unbounded growth.

- [ ] **Step 3: Handle new WebSocket events**

In `packages/web/src/hooks/useWebSocket.ts`, add to the destructured store methods:

```typescript
    appendStreamingText,
    clearStreamingText,
    addFeedMessage,
```

Add these cases to the `handleMessage` switch:

After the `message:routed` case (which already exists), add the `addFeedMessage` call inside it:

```typescript
      case "message:routed": {
        const msg = payload as AgentMessage;
        addConnection({ from: msg.from, to: msg.to, type: msg.type });
        addFeedMessage(msg);
        setTimeout(() => {
          useAppStore.getState().removeConnection(msg.from, msg.to);
        }, 3000);
        break;
      }
```

Add the `agent:chunk` case after the `agent:status` case:

```typescript
      case "agent:chunk": {
        const { agent, delta } = payload as { agent: string; delta: string };
        appendStreamingText(agent, delta);
        break;
      }
```

Update the `message:response` case to clear streaming text:

```typescript
      case "message:response": {
        const { agent, response } = payload as { agent: string; response: string };
        setIsThinking(false);
        clearStreamingText(agent);
        addChatMessage({
          id: crypto.randomUUID(),
          role: "agent",
          agent,
          content: response,
          timestamp: new Date().toISOString(),
        });
        break;
      }
```

Add `agent:commit` case (creates a synthetic feed message):

```typescript
      case "agent:commit": {
        const { agent, sha, files, message: commitMsg } = payload as { agent: string; sha: string; files: string[]; message: string };
        addFeedMessage({
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          from: agent,
          to: "broadcast",
          type: "status_update",
          priority: "normal",
          subject: `Committed ${sha}`,
          body: `${commitMsg}\n\nFiles: ${files.join(", ")}`,
          requiresResponse: false,
        });
        break;
      }
```

- [ ] **Step 4: Verify and commit**

Run: `pnpm --filter @hivemind/web typecheck`

```bash
git add packages/web/src/stores/appStore.ts packages/web/src/hooks/useWebSocket.ts packages/web/src/types/index.ts
git commit -m "feat: add streaming text, feed messages, and commit events to web store"
```

---

### Task 6: StreamingMessage Component

**Files:**
- Create: `packages/web/src/components/chat/StreamingMessage.tsx`

A component that renders streaming markdown text with a blinking cursor.

- [ ] **Step 1: Create the component**

```typescript
// packages/web/src/components/chat/StreamingMessage.tsx

import { useMemo } from "react";
import { marked } from "marked";

interface Props {
  agentName: string;
  text: string;
}

export function StreamingMessage({ agentName, text }: Props) {
  const html = useMemo(() => {
    if (!text) return "";
    return marked.parse(text, { async: false }) as string;
  }, [text]);

  return (
    <div className="flex justify-start px-4 py-1.5">
      <div className="max-w-[85%] rounded-2xl bg-gray-800 px-4 py-2.5 text-sm leading-relaxed text-gray-200">
        <div className="mb-1 text-xs font-medium text-gray-400">
          {agentName}
        </div>
        {text ? (
          <div className="chat-markdown" dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <div className="flex items-center gap-1">
            <span className="typing-dot" />
            <span className="typing-dot" />
            <span className="typing-dot" />
          </div>
        )}
        <span
          className="inline-block w-1.5 h-4 bg-indigo-400 ml-0.5 align-text-bottom"
          style={{ animation: "pulse-slow 1s ease-in-out infinite" }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify and commit**

Run: `pnpm --filter @hivemind/web typecheck`

```bash
git add packages/web/src/components/chat/StreamingMessage.tsx
git commit -m "feat(streaming): add StreamingMessage component with live markdown rendering"
```

---

### Task 7: CompanyFeed Component

**Files:**
- Create: `packages/web/src/components/chat/CompanyFeed.tsx`

- [ ] **Step 1: Create the company feed**

```typescript
// packages/web/src/components/chat/CompanyFeed.tsx

import { useRef, useEffect, useState } from "react";
import { marked } from "marked";
import { useAppStore } from "../../stores/appStore.js";
import type { AgentMessage } from "../../types/index.js";

const TYPE_BADGES: Record<string, { label: string; color: string }> = {
  task_assignment: { label: "ASSIGN", color: "#3B82F6" },
  task_update: { label: "UPDATE", color: "#6b7280" },
  task_complete: { label: "DONE", color: "#22C55E" },
  review_request: { label: "REVIEW", color: "#F59E0B" },
  review_result: { label: "REVIEWED", color: "#F59E0B" },
  escalation: { label: "ESCALATION", color: "#EF4444" },
  question: { label: "QUESTION", color: "#A78BFA" },
  decision: { label: "DECISION", color: "#A78BFA" },
  status_update: { label: "STATUS", color: "#6b7280" },
  feedback: { label: "FEEDBACK", color: "#6b7280" },
};

function FeedEntry({ message }: { message: AgentMessage }) {
  const [expanded, setExpanded] = useState(false);
  const agentConfigs = useAppStore((s) => s.agentConfigs);

  const sender = agentConfigs.find((a) => a.name === message.from);
  const receiver = agentConfigs.find((a) => a.name === message.to);
  const badge = TYPE_BADGES[message.type] ?? { label: message.type, color: "#6b7280" };

  const isCommit = message.subject.startsWith("Committed ");
  const bodyPreview = message.body.length > 120 ? message.body.slice(0, 117) + "..." : message.body;

  return (
    <div
      style={{
        padding: "8px 12px",
        borderBottom: "1px solid #1a1a2e",
        fontFamily: "ui-monospace, monospace",
        fontSize: 12,
      }}
    >
      {/* Header: sender → receiver + badge */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span
          style={{ width: 8, height: 8, borderRadius: "50%", background: sender?.color ?? "#6b7280", display: "inline-block", flexShrink: 0 }}
        />
        <span style={{ color: sender?.color ?? "#d1d5db", fontWeight: 600 }}>
          {sender?.displayName ?? message.from}
        </span>
        <span style={{ color: "#4b5563" }}>→</span>
        <span style={{ color: receiver?.color ?? "#d1d5db" }}>
          {receiver?.displayName ?? message.to}
        </span>
        <span
          style={{
            fontSize: 9,
            padding: "1px 5px",
            color: isCommit ? "#000" : badge.color,
            background: isCommit ? "#22C55E" : "transparent",
            border: isCommit ? "none" : `1px solid ${badge.color}`,
            fontWeight: 700,
            letterSpacing: "0.05em",
          }}
        >
          {isCommit ? "COMMIT" : badge.label}
        </span>
        <span style={{ marginLeft: "auto", fontSize: 10, color: "#4b5563" }}>
          {new Date(message.timestamp).toLocaleTimeString()}
        </span>
      </div>

      {/* Subject */}
      <div style={{ marginTop: 4, color: "#e5e7eb", fontWeight: 600 }}>
        {message.subject}
      </div>

      {/* Body preview / expanded */}
      {message.body && (
        <div style={{ marginTop: 4 }}>
          {expanded ? (
            <div
              className="chat-markdown"
              style={{ color: "#9ca3af", fontSize: 11 }}
              dangerouslySetInnerHTML={{ __html: marked.parse(message.body, { async: false }) as string }}
            />
          ) : (
            <div
              style={{ color: "#6b7280", fontSize: 11, cursor: message.body.length > 120 ? "pointer" : "default" }}
              onClick={() => message.body.length > 120 && setExpanded(true)}
            >
              {bodyPreview}
              {message.body.length > 120 && (
                <span style={{ color: "#4F46E5", marginLeft: 4 }}>show more</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function CompanyFeed() {
  const feedMessages = useAppStore((s) => s.feedMessages);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [feedMessages.length]);

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: "#0a0a1a" }}>
      {feedMessages.length === 0 && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          height: "100%", color: "#4b5563", fontFamily: "ui-monospace, monospace", fontSize: 12,
          textAlign: "center", padding: "0 20px",
        }}>
          Agent conversations will appear here in real-time
        </div>
      )}

      {feedMessages.map((msg, i) => (
        <FeedEntry key={msg.id ?? i} message={msg} />
      ))}

      <div ref={endRef} />
    </div>
  );
}
```

- [ ] **Step 2: Verify and commit**

Run: `pnpm --filter @hivemind/web typecheck`

```bash
git add packages/web/src/components/chat/CompanyFeed.tsx
git commit -m "feat(feed): add CompanyFeed component for inter-agent message visibility"
```

---

### Task 8: Update ChatPanel with DIRECT/FEED toggle + streaming

**Files:**
- Modify: `packages/web/src/components/chat/ChatPanel.tsx`

- [ ] **Step 1: Rewrite ChatPanel with toggle and streaming support**

Replace the entire contents of `packages/web/src/components/chat/ChatPanel.tsx`:

```typescript
import { useState, useRef, useEffect } from "react";
import { useAppStore } from "../../stores/appStore.js";
import { ChatMessage } from "./ChatMessage.js";
import { StreamingMessage } from "./StreamingMessage.js";
import { CompanyFeed } from "./CompanyFeed.js";
import { EscalationBanner } from "./EscalationBanner.js";

interface Props {
  sendMessage: (agent: string, message: string) => void;
}

export function ChatPanel({ sendMessage }: Props) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const chatTarget = useAppStore((s) => s.chatTarget);
  const chatHistories = useAppStore((s) => s.chatHistories);
  const addChatMessage = useAppStore((s) => s.addChatMessage);
  const agentConfigs = useAppStore((s) => s.agentConfigs);
  const isThinking = useAppStore((s) => s.isThinking);
  const setIsThinking = useAppStore((s) => s.setIsThinking);
  const streamingText = useAppStore((s) => s.streamingText);
  const chatMode = useAppStore((s) => s.chatMode);
  const setChatMode = useAppStore((s) => s.setChatMode);

  const chatMessages = chatHistories.get(chatTarget) ?? [];
  const targetConfig = agentConfigs.find((c) => c.name === chatTarget);
  const currentStream = streamingText.get(chatTarget) ?? "";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, isThinking, currentStream]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed) return;

    addChatMessage({
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
      timestamp: new Date().toISOString(),
    });

    setIsThinking(true);
    sendMessage(chatTarget, trimmed);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const resolveEscalation = (_id: string, _resolution: string) => {};

  const isDirect = chatMode === "direct";

  return (
    <aside className="flex w-96 flex-col border-l border-gray-800 bg-gray-900">
      {/* Header with mode toggle */}
      <div className="border-b border-gray-800">
        {/* Toggle bar */}
        <div style={{ display: "flex", borderBottom: "1px solid #1f2937" }}>
          {(["direct", "feed"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setChatMode(mode)}
              style={{
                flex: 1,
                padding: "6px 0",
                fontFamily: "ui-monospace, monospace",
                fontSize: 10,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                cursor: "pointer",
                border: "none",
                borderBottom: chatMode === mode ? "2px solid #6366F1" : "2px solid transparent",
                background: chatMode === mode ? "#111827" : "transparent",
                color: chatMode === mode ? "#e5e7eb" : "#4b5563",
              }}
            >
              {mode}
            </button>
          ))}
        </div>

        {/* Agent info (direct mode only) */}
        {isDirect && (
          <div className="flex items-center gap-3 px-4 py-2">
            {targetConfig && (
              <div
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: targetConfig.color }}
              />
            )}
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-semibold text-gray-100">
                {targetConfig?.displayName ?? chatTarget}
              </h2>
              <p className="text-xs text-gray-500 truncate">
                {isThinking ? "Thinking..." : (targetConfig?.description?.slice(0, 50) ?? "Agent")}
              </p>
            </div>
            {isThinking && (
              <div className="flex items-center gap-0.5">
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Escalation banners (always visible) */}
      <EscalationBanner resolveEscalation={resolveEscalation} />

      {/* Content area */}
      {isDirect ? (
        <>
          {/* Direct messages */}
          <div className="flex-1 overflow-y-auto py-3">
            {chatMessages.length === 0 && !isThinking && (
              <div className="flex h-full items-center justify-center px-4 text-center text-sm text-gray-600">
                Send a message to {targetConfig?.displayName ?? "the agent"} to get started.
                <br />
                Click any agent on The Floor to switch.
              </div>
            )}
            {chatMessages.map((msg) => (
              <ChatMessage key={msg.id} message={msg} />
            ))}

            {/* Streaming or thinking indicator */}
            {isThinking && (
              <StreamingMessage
                agentName={targetConfig?.displayName ?? chatTarget}
                text={currentStream}
              />
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-gray-800 p-3">
            <div className="flex gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Message ${targetConfig?.displayName ?? chatTarget}...`}
                className="flex-1 resize-none rounded-lg bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 outline-none focus:ring-1 focus:ring-indigo-500"
                rows={2}
                disabled={isThinking}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isThinking}
                className="self-end rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isThinking ? "..." : "Send"}
              </button>
            </div>
          </div>
        </>
      ) : (
        /* Feed mode — read-only */
        <CompanyFeed />
      )}
    </aside>
  );
}
```

- [ ] **Step 2: Verify and commit**

Run: `pnpm --filter @hivemind/web typecheck`

```bash
git add packages/web/src/components/chat/ChatPanel.tsx
git commit -m "feat: update ChatPanel with DIRECT/FEED toggle and streaming text display"
```

---

### Task 9: ThoughtBubble streaming + TicketTimeline commits

**Files:**
- Modify: `packages/web/src/components/floor/AgentNode.tsx`
- Modify: `packages/web/src/components/tickets/TicketTimeline.tsx`

- [ ] **Step 1: Pass streaming text to ThoughtBubble**

In `packages/web/src/components/floor/AgentNode.tsx`, add the streamingText read from the store:

```typescript
  const streamingText = useAppStore((s) => s.streamingText);
```

Update the ThoughtBubble section near the bottom of the component. Replace:

```typescript
      {/* Thought bubble */}
      {state.currentThought && isActive && (
        <ThoughtBubble text={state.currentThought} />
      )}
```

With:

```typescript
      {/* Thought bubble — show streaming text if available, else current thought */}
      {isActive && (streamingText.get(config.name) || state.currentThought) && (
        <ThoughtBubble
          text={streamingText.get(config.name)?.slice(-80) ?? state.currentThought ?? ""}
        />
      )}
```

- [ ] **Step 2: Render commit events in TicketTimeline**

In `packages/web/src/components/tickets/TicketTimeline.tsx`, update the `eventDescription` function to handle `commit`:

Add this case before the `default`:

```typescript
    case "commit":
      return `committed ${event.data.commit?.files.length ?? 0} files`;
```

Update `badgeForEvent` to handle commits:

Add before the `return null`:

```typescript
  if (event.type === "commit") {
    return { label: "COMMIT", color: "#4ade80" };
  }
```

In the JSX rendering, add after the comment body block (after the closing `}}`), a commit detail block:

```typescript
              {/* Commit details */}
              {event.type === "commit" && event.data.commit && (
                <div
                  style={{
                    marginTop: 4,
                    padding: "6px 8px",
                    background: "#0a0a1a",
                    border: "1px solid #1a1a2e",
                    fontFamily: "ui-monospace, monospace",
                    fontSize: 11,
                  }}
                >
                  <div style={{ color: "#a5b4fc", marginBottom: 2 }}>
                    {event.data.commit.sha} — {event.data.commit.message}
                  </div>
                  <div style={{ color: "#6b7280" }}>
                    {event.data.commit.files.map((f, i) => (
                      <div key={i}>  {f}</div>
                    ))}
                  </div>
                </div>
              )}
```

- [ ] **Step 3: Verify and commit**

Run: `pnpm --filter @hivemind/web typecheck`

```bash
git add packages/web/src/components/floor/AgentNode.tsx packages/web/src/components/tickets/TicketTimeline.tsx
git commit -m "feat: show streaming text in thought bubbles and commit events in ticket timeline"
```

---

### Task 10: Final Verification

- [ ] **Step 1: Full monorepo typecheck**

Run: `pnpm typecheck`
Expected: Clean pass for both server and web

- [ ] **Step 2: Restart server and verify**

```bash
pkill -f "tsx watch src/index.ts" 2>/dev/null; sleep 1
pnpm --filter @hivemind/server dev &
sleep 3
curl -s http://localhost:3100/health
```

- [ ] **Step 3: Commit everything**

```bash
git add -A
git commit -m "feat: Tier 1 complete — streaming responses, company feed, git integration"
```
