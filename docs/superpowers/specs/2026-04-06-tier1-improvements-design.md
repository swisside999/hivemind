# Tier 1 Improvements — Design Spec

## Overview

Three transformative features that make Hivemind feel alive: streaming agent responses (real-time text), agent-to-agent conversation visibility (company feed), and git integration (auto-commit with diffs in ticket timeline).

---

## Feature 1: Streaming Agent Responses

### Problem

Agents use `claude --print` which buffers the entire response. Users wait 30-60s staring at bouncing dots, then get a wall of text.

### Solution

Switch to `--output-format stream-json` which outputs newline-delimited JSON as tokens generate. Forward each chunk via WebSocket immediately.

### Server Changes

**AgentProcess.ts:**
- `buildArgs()` — replace `--print` with `-p` (still non-interactive) and add `--output-format stream-json`
- `startConversation()` — parse each line of stdout as JSON. The stream-json format outputs objects with a `type` field. Text content arrives in `assistant` type messages with content blocks containing text deltas. Emit a new `chunk` event `[string]` for each text delta as it arrives. Continue accumulating full text. Resolve promise with complete text on process close.
- New event type in `AgentProcessEvents`: `chunk: [string]`
- `processOutput()` — adapt to handle stream-json format. Each line is a JSON object. Parse the text deltas out and emit `chunk`. Still detect HIVEMIND:MESSAGE tags in the accumulated text for inter-agent routing.

**Orchestrator.ts:**
- New event in `OrchestratorEvents`: `agentChunk: [string, string]` — (agentName, textDelta)
- `bindAgentEvents()` — bind the `chunk` event: `agent.on("chunk", (delta) => this.emit("agentChunk", name, delta))`

**ws.ts:**
- Broadcast `agentChunk` as `agent:chunk`: `{ agent, delta }`

### Web Changes

**Store (appStore.ts):**
- New field: `streamingText: Map<string, string>` — accumulated streaming text per agent
- `appendStreamingText(agent: string, delta: string)` — appends delta to the map entry
- `clearStreamingText(agent: string)` — removes the entry

**useWebSocket.ts:**
- Handle `agent:chunk`: call `appendStreamingText(agent, delta)`, ensure `isThinking` is true
- Handle `message:response`: call `clearStreamingText(agent)` before adding the final message, set `isThinking` false

**ChatPanel.tsx:**
- While `isThinking`, check `streamingText` for the current chatTarget
- If streaming text exists, render it (with markdown) instead of the bouncing dots
- Text appears word-by-word as chunks arrive
- When response completes, the streaming preview is replaced by the final rendered message in chat history

**ThoughtBubble.tsx (on The Floor):**
- When an agent is working and streaming text exists for that agent, show a truncated version of the latest streaming text (last ~60 chars) instead of the static "Working..." text
- Updates live as chunks arrive

---

## Feature 2: Agent-to-Agent Conversation Feed

### Problem

Inter-agent communication is invisible. When the CEO delegates to the CTO who assigns a dev, the user only sees brief connection lines that disappear after 3 seconds.

### Solution

The right panel gains a toggle: **DIRECT** (existing per-agent chat) and **FEED** (live company-wide conversation stream). The feed shows every inter-agent message in real-time.

### Server Changes

None. The `message:routed` WebSocket event already broadcasts every inter-agent message with full content.

### Web Changes

**Store (appStore.ts):**
- New field: `feedMessages: AgentMessage[]` — append-only log of all routed messages
- `addFeedMessage(message: AgentMessage)` — pushes to the array
- New field: `chatMode: "direct" | "feed"` — toggle state for the right panel
- `setChatMode(mode: "direct" | "feed")`

**useWebSocket.ts:**
- On `message:routed`, in addition to existing connection line logic, call `addFeedMessage(message)`

**New component: CompanyFeed.tsx** (`packages/web/src/components/chat/CompanyFeed.tsx`):
- Chronological list of all `feedMessages`
- Each entry renders:
  - Sender color dot + display name → recipient display name
  - Message type badge, color-coded:
    - `task_assignment`: blue
    - `review_request` / `review_result`: amber
    - `task_complete`: green
    - `escalation`: red
    - `question` / `decision`: purple
    - `status_update` / `feedback` / `task_update`: gray
  - Subject line (bold)
  - Body preview: first ~100 chars, click to expand full body (rendered as markdown)
  - Timestamp
- Auto-scrolls to bottom on new messages
- Read-only — no input area
- RPG pixel-art styling matching the existing chat

**ChatPanel.tsx updates:**
- Header gets two toggle buttons: **DIRECT** | **FEED**
- DIRECT: shows existing per-agent chat with input area
- FEED: shows CompanyFeed component, input area hidden
- Toggle state stored in `chatMode`

---

## Feature 3: Git Integration

### Problem

Agents edit files but there's no record of what changed. Ticket timelines show status changes but not actual code changes.

### Solution

After each agent invocation, detect file changes, auto-commit with the agent's name, and record the commit in the ticket timeline.

### Server Changes

**New file: `packages/server/src/utils/git.ts`**

Lightweight git helpers using `child_process.execSync`:

```typescript
isGitRepo(cwd: string): boolean
// Returns true if cwd is inside a git repository

getStatus(cwd: string): string[]
// Returns list of modified/added/deleted file paths via `git status --porcelain`

stageAndCommit(cwd: string, message: string, authorName: string): { sha: string; files: string[] } | null
// Stages all changes, commits with --author="authorName <agent@hivemind>" --no-gpg-sign
// Returns commit SHA and file list, or null if nothing to commit

getDiff(cwd: string, sha: string): string
// Returns the diff for a specific commit via `git show --stat SHA`
```

All functions are synchronous (execSync) since they run after agent completion, not during. All failures are caught and return null/empty — never throws.

**Orchestrator.ts:**
- New event: `agentCommit: [string, { sha: string; files: string[]; message: string; ticketId?: string }]`
- After `agent.startConversation()` resolves in both `sendUserMessage()` and `routeMessage()`, call `handleAgentCommit(agentName, message, ticketId?)`
- `handleAgentCommit()`:
  1. Check `isGitRepo(this.workingDirectory)` — if false, skip
  2. Check `getStatus()` — if no changes, skip
  3. Build commit message: `[HM-{number}] {agentDisplayName}: {messageSubject}` (or without ticket prefix if no ticket)
  4. Call `stageAndCommit()`
  5. If successful, emit `agentCommit` event
  6. If a ticket is linked, add a "commit" event to the ticket timeline

**TicketManager / types:**
- Add `"commit"` to `TicketEventType` union
- Add to `TicketEventData`: `commit?: { sha: string; files: string[]; message: string }`
- New method `addCommit(ticketId, actor, sha, files, message)` — creates a commit event

**ws.ts:**
- Broadcast `agentCommit` as `agent:commit`: `{ agent, sha, files, message, ticketId }`

### Web Changes

**useWebSocket.ts:**
- Handle `agent:commit`: add to feedMessages as a synthetic AgentMessage (type `status_update`, body describing the commit)

**CompanyFeed.tsx:**
- Render commit events distinctly: green "COMMIT" badge, file list, abbreviated SHA

**TicketTimeline.tsx:**
- Render `commit` event type: show SHA (monospace), file count, expandable file list
- Styled as a dark code block matching the RPG aesthetic

**Store:**
- No new state needed — commits flow through existing feedMessages and ticket event systems

### Safety

- Only commits if `isGitRepo()` returns true
- Uses `--no-gpg-sign` to avoid hanging on GPG prompts
- If commit fails, silently skips — no error propagation
- Never force-pushes or modifies existing commits
- Uses `--author` flag so agent commits are attributed correctly in git log

---

## What We're NOT Building

- No streaming for inter-agent messages (only for user-facing chat responses)
- No git push (commits stay local)
- No diff viewer in the GUI (just file list + SHA — user can `git show` locally)
- No branch management (all commits on current branch)
- No feed filtering or search
- No feed persistence (clears on page refresh — messages exist in server MessageBus)
