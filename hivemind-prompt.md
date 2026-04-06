# Hivemind — Claude Code Bootstrap Prompt

## What You Are Building

Hivemind is an open-source developer tool that orchestrates multiple Claude Code CLI sessions as a virtual software company. Each agent has a defined role, personality, persistent memory, and authority level. The user interacts as the **Board/Owner** — they speak to the CEO agent, who delegates work through a corporate hierarchy of autonomous agents. Agents communicate with each other, make decisions within their authority, escalate when needed, and produce reviewed, quality work output.

Hivemind ships with a default set of customisable agents. Each project the user creates acts as a **new company** with fresh agents and isolated memory/context.

This tool must feel like you are the owner of a company with real employees and teams.

---

## Tech Stack

- **Monorepo** — single repo, two packages: `packages/server` and `packages/web`
- **Server** — Node.js with TypeScript, Express, WebSocket (ws) for real-time agent updates to the GUI
- **Web** — React + TypeScript + Vite, TailwindCSS for styling
- **Agent execution** — each agent spawns a `claude` CLI subprocess. Use `child_process.spawn` with stdin/stdout streaming. Agents communicate via the server's internal message bus (in-memory event emitter), NOT over network.
- **Storage** — file-based. Each project is a directory. Agent memory = markdown files. No database.
- **Package manager** — pnpm with workspaces

Keep dependencies minimal. No ORMs, no heavy frameworks. Lightweight and fast.

---

## Project Structure

```
hivemind/
├── package.json                    # pnpm workspace root
├── pnpm-workspace.yaml
├── progress.md                     # project tracking (see conventions below)
├── README.md
├── LICENSE                         # MIT
├── packages/
│   ├── server/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts                    # entry — starts Express + WS server
│   │   │   ├── config.ts                   # ports, paths, defaults
│   │   │   ├── orchestrator/
│   │   │   │   ├── Orchestrator.ts         # core brain — routes messages, manages agent lifecycle
│   │   │   │   ├── MessageBus.ts           # typed event emitter for inter-agent comms
│   │   │   │   ├── EscalationManager.ts    # handles decision escalation up the chain → user
│   │   │   │   └── types.ts               # Message, AgentStatus, EscalationRequest types
│   │   │   ├── agents/
│   │   │   │   ├── AgentManager.ts         # CRUD for agent instances, spawns/kills CLI sessions
│   │   │   │   ├── AgentProcess.ts         # wraps a single claude CLI subprocess
│   │   │   │   ├── AgentDefinition.ts      # parses .md agent definition files (frontmatter + prompt)
│   │   │   │   └── types.ts               # AgentRole, AgentConfig, AgentState
│   │   │   ├── projects/
│   │   │   │   ├── ProjectManager.ts       # create/list/switch/delete projects (each = a company)
│   │   │   │   └── types.ts
│   │   │   ├── memory/
│   │   │   │   ├── MemoryManager.ts        # read/write/prune agent memory .md files
│   │   │   │   └── types.ts
│   │   │   ├── routes/
│   │   │   │   ├── api.ts                  # REST endpoints: projects, agents, messages, escalations
│   │   │   │   └── ws.ts                   # WebSocket handler: real-time agent state + thought streams
│   │   │   └── utils/
│   │   │       ├── logger.ts
│   │   │       └── claudeCli.ts            # helper to detect and validate claude CLI installation
│   │   └── templates/
│   │       └── default-company/            # the default agent .md files (copied into new projects)
│   │           ├── ceo.md
│   │           ├── cto.md
│   │           ├── cpo.md
│   │           ├── coo.md
│   │           ├── senior-developer.md
│   │           ├── junior-developer.md
│   │           ├── code-reviewer.md
│   │           ├── designer.md
│   │           ├── design-reviewer.md
│   │           ├── devops.md
│   │           └── qa.md
│   └── web/
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── index.html
│       ├── src/
│       │   ├── main.tsx
│       │   ├── App.tsx
│       │   ├── hooks/
│       │   │   ├── useWebSocket.ts         # WS connection to server, real-time state
│       │   │   ├── useAgents.ts            # agent state management
│       │   │   └── useProject.ts           # project context
│       │   ├── components/
│       │   │   ├── layout/
│       │   │   │   ├── Sidebar.tsx          # project switcher, settings
│       │   │   │   └── Header.tsx
│       │   │   ├── floor/                   # "The Floor" — main visual workspace
│       │   │   │   ├── FloorView.tsx        # the main canvas showing all agents
│       │   │   │   ├── AgentNode.tsx        # individual agent visual (logo + color + props)
│       │   │   │   ├── ThoughtBubble.tsx    # shows what an agent is currently doing
│       │   │   │   ├── ConnectionLine.tsx   # visual line when agents communicate
│       │   │   │   └── AgentTooltip.tsx     # hover/click details
│       │   │   ├── chat/
│       │   │   │   ├── ChatPanel.tsx        # right panel — talk to CEO (or click-to-talk to any agent)
│       │   │   │   ├── ChatMessage.tsx
│       │   │   │   └── EscalationBanner.tsx # "Agent X needs your input" alert
│       │   │   ├── agents/
│       │   │   │   ├── AgentDetailModal.tsx # click an agent → see full status, memory, current task
│       │   │   │   └── AgentEditor.tsx      # edit agent .md files directly in the GUI
│       │   │   └── projects/
│       │   │       ├── ProjectList.tsx
│       │   │       └── NewProjectModal.tsx
│       │   ├── stores/
│       │   │   └── appStore.ts             # zustand store for global UI state
│       │   ├── types/
│       │   │   └── index.ts                # shared types mirroring server types
│       │   └── styles/
│       │       └── globals.css
│       └── public/
│           └── agents/                      # SVG agent avatars (claude logo variants)
│               ├── ceo.svg
│               ├── cto.svg
│               └── ... (one per default role)
└── projects/                                # user's projects live here (gitignored)
    └── .gitkeep
```

---

## Agent Definition Format

Every agent is a `.md` file with YAML frontmatter + a system prompt body. This is the exact format Hivemind uses — the same format the user's own agents follow. Here is the schema:

```yaml
---
name: agent-slug                    # kebab-case unique identifier
display_name: "CEO"                 # human-readable name shown in GUI
description: "..."                  # when this agent should be activated / what it does
role: ceo                           # enum: ceo, cto, cpo, coo, senior-dev, junior-dev, code-reviewer, designer, design-reviewer, devops, qa, custom
color: "#FF6B35"                    # hex color for GUI avatar
icon_props: []                      # optional: visual props for the avatar (e.g., ["crown", "briefcase"])
reports_to: null                    # agent slug of direct superior (null = reports to user/board)
direct_reports: ["cto", "cpo", "coo"]  # agent slugs of subordinates
authority_level: 5                  # 1-5 scale. 5 = can make most decisions alone. 1 = must escalate everything.
can_escalate_to_user: true          # whether this agent can directly ping the user
model: sonnet                       # claude model preference: sonnet | opus | haiku
---

[System prompt body in markdown — personality, instructions, review criteria, etc.]
```

### Agent Hierarchy & Authority

```
USER (Board/Owner)
  └── CEO (authority: 5, escalates to user)
       ├── CTO (authority: 4)
       │    ├── Senior Developer (authority: 3)
       │    ├── Junior Developer (authority: 2)
       │    └── Code Reviewer (authority: 3)
       ├── CPO (authority: 4)
       │    ├── Designer (authority: 3)
       │    └── Design Reviewer (authority: 3)
       └── COO (authority: 4)
            ├── DevOps (authority: 3)
            └── QA (authority: 3)
```

Authority determines what an agent can decide alone vs. must escalate:
- **Level 5 (CEO):** Can approve architecture, delegate any task, make trade-offs. Escalates to user only for: scope changes, ambiguous requirements, budget/resource questions, conflicting priorities.
- **Level 4 (C-suite):** Can make decisions within their domain. Escalates to CEO for cross-domain decisions or disagreements.
- **Level 3 (Senior):** Can make implementation decisions. Escalates for architectural changes or when blocked.
- **Level 2 (Junior):** Executes assigned tasks. Escalates frequently — this is expected and encouraged.

---

## Inter-Agent Communication Protocol

All agent communication goes through the MessageBus. Messages are typed:

```typescript
interface AgentMessage {
  id: string;                          // uuid
  timestamp: string;                   // ISO 8601
  from: string;                        // agent slug
  to: string;                          // agent slug or "user" or "broadcast"
  type: "task_assignment" | "task_update" | "task_complete" | "review_request" | "review_result" | "escalation" | "question" | "decision" | "status_update" | "feedback";
  priority: "low" | "normal" | "high" | "critical";
  subject: string;                     // short summary
  body: string;                        // full message content
  context?: Record<string, unknown>;   // attached data (file paths, code snippets, etc.)
  requires_response: boolean;
  parent_message_id?: string;          // for threading
}
```

The Orchestrator:
1. Receives all messages from agents' stdout streams.
2. Routes them to the correct recipient agent's stdin.
3. Broadcasts state changes via WebSocket to the GUI.
4. Intercepts escalation messages and routes them to the GUI as user prompts.

Agents prefix their inter-agent messages with a structured format so the orchestrator can parse them out of the Claude Code output stream:

```
[HIVEMIND:MESSAGE]{json}[/HIVEMIND:MESSAGE]
```

Regular Claude Code output (file edits, shell commands, thinking) is captured separately and shown in the agent's thought bubble.

---

## Memory System

Each agent in a project gets a memory directory:

```
projects/<project-name>/
├── .hivemind/
│   ├── config.json                  # project-level config
│   ├── message-log.jsonl            # append-only log of all inter-agent messages
│   └── agents/
│       ├── ceo/
│       │   ├── agent.md             # the agent definition (editable by user)
│       │   ├── memory.md            # working memory — the agent loads this into context
│       │   ├── current-task.md      # what the agent is currently working on
│       │   └── decisions.md         # log of decisions made (for accountability)
│       ├── cto/
│       │   ├── agent.md
│       │   ├── memory.md
│       │   ├── current-task.md
│       │   └── decisions.md
│       └── ... (one dir per agent)
└── [actual project source code files]
```

Memory rules:
- `memory.md` is loaded into the agent's system prompt on every invocation. Keep it under 200 lines — agents must self-prune.
- `current-task.md` is the agent's current assignment. Cleared when task is complete.
- `decisions.md` is append-only. Records what decisions the agent made and why. This is for the user's benefit.
- Agents are instructed to update their own memory files using Claude Code's file editing tools.

---

## GUI Design Specification

### The Floor (Main View)

The primary view is called **"The Floor"** — a visual canvas showing all agents as nodes.

Each agent node:
- Is a **circular avatar** using a Claude Code–inspired logo silhouette, filled with the agent's `color`.
- Has **icon props** rendered as small accessories (e.g., CEO has a crown, Code Reviewer has a magnifying glass, Designer has a paintbrush).
- Shows the agent's `display_name` below.
- Has a **status indicator**: 🟢 idle, 🔵 working, 🟡 waiting (for input or another agent), 🔴 blocked/error.
- When working, shows a **thought bubble** above — a small floating card with a truncated view of what the agent is currently doing (e.g., "Reviewing auth.ts for SQL injection..." or "Designing the landing page layout...").

**Connection lines** appear between agents when they're communicating — animated dashed lines with a small directional arrow and a label showing the message type.

**Layout**: the hierarchy is visually represented. CEO at the top center. C-suite below. Their reports below them. Use a tree/org-chart layout but with some organic spacing so it feels alive, not rigid. Agents subtly pulse when active.

### Chat Panel (Right Side)

A slide-out panel on the right. By default, you're talking to the CEO. But clicking any agent on The Floor switches the chat to that agent directly (with a clear indicator of who you're talking to).

The chat shows:
- Your messages.
- The agent's responses.
- System events like "[CEO delegated 'Implement auth flow' to CTO]" as subtle inline cards.
- **Escalation banners** at the top when an agent needs your input — with the full context and quick-action buttons (Approve / Reject / Discuss).

### Agent Detail Modal

Clicking and holding (or double-clicking) an agent opens a detail modal:
- Current task and status.
- Recent activity feed (last 20 messages sent/received).
- Memory file preview (with an "Edit" button that opens the AgentEditor).
- Decision log.

### Agent Editor

A simple markdown editor (use a textarea with monospace font, or integrate a lightweight md editor) that lets the user directly edit any agent's `.md` definition file. Changes take effect on the agent's next invocation.

### Sidebar

- **Project switcher**: dropdown or list of projects. "New Project" button.
- **Company overview**: quick stats — how many agents active, tasks in progress, pending escalations.
- **Settings**: global config (default model, claude CLI path, etc.).

### Color Palette for Default Agents

```
CEO:              #FF6B35 (warm orange — leadership)
CTO:              #4ECDC4 (teal — technical)
CPO:              #A78BFA (purple — creative)
COO:              #F59E0B (amber — operations)
Senior Developer: #3B82F6 (blue)
Junior Developer: #60A5FA (light blue)
Code Reviewer:    #10B981 (green — matches Damian's existing reviewer)
Designer:         #EC4899 (pink)
Design Reviewer:  #F472B6 (light pink)
DevOps:           #6366F1 (indigo)
QA:               #EF4444 (red — finds problems)
```

---

## Default Agent Prompts (Summaries)

Write full `.md` agent definition files for each. Here are the personality/instruction briefs:

**CEO** — Strategic thinker, delegation expert. Receives user requests, breaks them into tasks, assigns to appropriate C-suite. Tracks progress. Makes trade-off decisions. Only escalates to user for scope/requirement ambiguity. Personality: confident, concise, decisive. Keeps the big picture.

**CTO** — Technical authority. Receives technical tasks from CEO, decomposes into developer assignments. Makes architectural decisions. Reviews technical proposals from devs. Personality: pragmatic, detail-oriented, hates over-engineering.

**CPO** — Product and design authority. Owns UX/UI decisions. Assigns design tasks. Ensures consistency and user-centered thinking. Personality: empathetic, opinionated about UX, quality-focused.

**COO** — Operational excellence. Owns CI/CD, testing strategy, deployment, infrastructure concerns. Assigns to DevOps and QA. Personality: systematic, reliability-obsessed, process-oriented.

**Senior Developer** — Experienced implementer. Handles complex features, refactors, and mentors Junior Dev. Can make implementation decisions but escalates architectural ones. Personality: skilled, efficient, takes pride in clean code.

**Junior Developer** — Eager executor. Handles simpler tasks, boilerplate, tests. Asks questions when uncertain (escalates to Senior Dev or CTO). Personality: enthusiastic, learning-oriented, thorough.

**Code Reviewer** — Based on the attached `senior-code-reviewer.md` format. Adapted into the Hivemind agent definition schema. Uncompromising quality gatekeeper. Reviews ALL code before it's considered done.

**Designer** — Creates UI/UX designs, proposes component structures, color schemes, layout decisions. Outputs design specs as markdown. Personality: creative, detail-oriented, user-obsessed.

**Design Reviewer** — Reviews design decisions for consistency, accessibility, usability. The design equivalent of the code reviewer. Personality: critical eye, standards-focused.

**DevOps** — Handles build configs, CI/CD setup, Docker, environment configs. Personality: automation-first, reliability-focused.

**QA** — Writes and runs tests. Validates features against requirements. Reports bugs back to developers. Personality: methodical, skeptical, thorough.

---

## Workflow Example

User says to CEO: "Build a landing page for Hivemind with a hero section, features grid, and a GitHub CTA."

1. **CEO** breaks this into tasks:
   - Design task → assigns to CPO
   - Implementation task → assigns to CTO (pending design)
   - QA plan → assigns to COO

2. **CPO** assigns Designer to create a design spec. Designer produces a markdown design doc with layout, colors, component breakdown.

3. **Design Reviewer** reviews the spec. Approves or requests changes.

4. **CPO** sends approved design to **CEO**, who forwards to **CTO**.

5. **CTO** assigns **Senior Developer** to implement the landing page. Junior Dev gets assigned to write the tests.

6. **Senior Developer** writes the code using Claude Code (actual file creation in the project).

7. **Code Reviewer** automatically reviews the output. Flags issues. Developer fixes them.

8. **QA** runs the test suite, validates against the design spec and requirements.

9. **COO** confirms everything passes. Reports up to **CEO**.

10. **CEO** reports to user: "Landing page is complete. Here's what was built, reviewed, and tested." Includes links to the files and a summary of decisions made.

Throughout this flow, the GUI shows agents lighting up, thought bubbles appearing, connection lines animating between agents, and the user can watch the whole company work in real-time.

---

## CLI Usage

Hivemind must also be usable from the command line:

```bash
# Install
npm install -g hivemind-ai

# Create a new project (new company)
hivemind init my-project

# Start the server + GUI
hivemind start

# Start in headless mode (no GUI, CLI only)
hivemind start --headless

# Talk to the CEO from CLI
hivemind ask "Build a REST API for user authentication"

# List agents
hivemind agents

# View an agent's status
hivemind agent ceo --status

# Edit an agent definition
hivemind agent code-reviewer --edit  # opens in $EDITOR

# List projects
hivemind projects
```

---

## Conventions (USE THESE FOR BUILDING HIVEMIND, AND ENFORCE THEM IN THE TOOL)

### 1. Progress Tracking

Maintain `progress.md` at the root. Structure:

```markdown
# Hivemind — Progress

## Current Phase
[What phase of development we're in]

## Plan
- [ ] Task 1
- [ ] Task 2
  - [ ] Subtask 2a
  - [ ] Subtask 2b
- [x] Completed task

## Completed
- [x] What was done and when

## TODOs / Future Attention
- Thing that needs revisiting
- Known limitation to address later
```

Update this file after every significant milestone.

### 2. Code Review

ALL code written during development must be reviewed. Use the senior-code-reviewer standards. Since we are building Hivemind, run your own code review pass on every file before considering it done. Apply the same severity levels (🔴 CRITICAL, 🟠 MAJOR, 🟡 MINOR, 💡 SUGGESTION).

### 3. Code Quality

- TypeScript strict mode everywhere.
- No `any` types unless absolutely unavoidable (and commented why).
- Minimal dependencies — justify every `npm install`.
- Functions under 30 lines. Files under 300 lines. Extract when exceeded.
- Meaningful names. No `data`, `temp`, `result`, `item` unless in tight lambdas.
- Error handling everywhere — no swallowed errors, no bare catches.
- Early returns over nested conditionals.

---

## Implementation Order

Build in this order. Update progress.md as you go.

### Phase 1: Foundation
1. Initialize the monorepo with pnpm workspaces.
2. Set up TypeScript configs for both packages.
3. Build the agent definition parser (reads .md frontmatter + body).
4. Build the AgentProcess class (spawns claude CLI, manages stdin/stdout, parses HIVEMIND:MESSAGE tags).
5. Build the MessageBus (typed event emitter).
6. Build the Orchestrator (routes messages between agents).
7. Write all 11 default agent .md files.

### Phase 2: Project Management
8. Build ProjectManager (init, list, switch, delete projects).
9. Build MemoryManager (read/write agent memory files).
10. Build the Express REST API.
11. Build the WebSocket server for real-time state.

### Phase 3: GUI
12. Scaffold the React app with Vite.
13. Build the FloorView canvas with agent nodes.
14. Build the ThoughtBubble and ConnectionLine components.
15. Build the ChatPanel.
16. Build the EscalationBanner system.
17. Build the AgentDetailModal and AgentEditor.
18. Build the Sidebar with project switcher.
19. Wire up WebSocket for real-time updates.

### Phase 4: Integration & Polish
20. End-to-end test: user talks to CEO, CEO delegates, agents work, code reviewer reviews, result returned.
21. CLI commands (init, start, ask, agents, projects).
22. Error handling, edge cases, reconnection logic.
23. README.md with setup instructions, screenshots placeholder, usage guide.
24. Review ALL code against senior-code-reviewer standards.

---

## First Steps

Start with Phase 1, step 1. Initialize the monorepo. Set up the workspace. Then proceed step by step. After each major file or module, do a self-review pass.

Begin.
