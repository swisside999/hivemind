# CLAUDE.md — Hivemind Development Guide

## What is Hivemind?

Hivemind is an open-source developer tool that orchestrates multiple Claude Code CLI sessions as a **virtual software company**. Each agent has a defined role (CEO, CTO, developers, reviewers, QA), a personality, persistent memory, and authority level. The user interacts as the Board/Owner — speaking to the CEO, who delegates through a corporate hierarchy. Agents communicate, make decisions, escalate when needed, and produce reviewed work.

**The experience:** A pixel-art RPG game world ("The Floor") where you watch your company work in real-time. Agents are 8-bit characters with Tamagotchi-style interactions. Work flows through a Kanban ticket board. A company wiki provides shared knowledge. Everything streams live via WebSocket.

**The vision:** Hivemind is NOT a downgrade from Claude Code — it's a **visual and UX layer on top of it**. Every Claude Code capability (skills, tools, file editing) should work through Hivemind, but with the added power of multi-agent orchestration, delegation, review workflows, and a satisfying GUI.

## Key Documents

| Document | Purpose |
|----------|---------|
| `hivemind-prompt.md` | Original project spec — the founding vision. Read this first for full context. |
| `progress.md` | Live progress tracker with completed phases and roadmap. **Update this after every milestone.** |
| `docs/superpowers/specs/*.md` | Design specs for major features (ticket system, tier 1 improvements) |
| `docs/superpowers/plans/*.md` | Implementation plans (step-by-step task breakdowns) |
| `README.md` | Public-facing documentation (API, WebSocket events, CLI usage) |

## Tech Stack

- **Monorepo:** pnpm workspaces — `packages/server` + `packages/web`
- **Server:** Node.js, TypeScript strict, Express, WebSocket (ws), file-based storage (JSON)
- **Web:** React 19, TypeScript strict, Vite, Tailwind CSS v4, Zustand
- **Agents:** Each agent spawns `claude -p --output-format stream-json` as a subprocess
- **Visual style:** Pixel-art RPG / 8-bit game aesthetic. Dark theme (#0a0a1a). Monospace fonts. RPG-style borders.

## Architecture Overview

```
User → Chat Panel → WebSocket → Orchestrator → AgentProcess (claude CLI)
                                      ↓
                              MessageBus (inter-agent)
                                      ↓
                              TicketManager (auto-creates tickets)
                                      ↓
                              Git (auto-commits agent work)
```

**Server core:**
- `Orchestrator` — the brain. Routes messages, manages agent lifecycle, handles escalations, tracks tickets, auto-commits
- `AgentProcess` — wraps a single `claude` CLI subprocess. Parses stream-json output, detects `[HIVEMIND:MESSAGE]` tags for inter-agent communication
- `MessageBus` — typed EventEmitter for agent-to-agent messages
- `TicketManager` — CRUD + auto-creation from agent messages, persists to `tickets.json`
- `MemoryManager` — per-agent memory files + shared company wiki

**Web core:**
- `FloorView` — SVG canvas with pixel-art agents in org-chart layout
- `ChatPanel` — DIRECT (per-agent chat) / FEED (company-wide conversation stream)
- `TicketBoard` — Kanban columns (Backlog → In Progress → Review → QA → Done)
- `WikiPanel` — Shared company knowledge base (markdown editor)
- `appStore` (Zustand) — all global state, WebSocket-synced

## Running the Project

```bash
pnpm install                          # Install dependencies
pnpm dev                              # Start server (tsx watch, port 3100)
pnpm dev:web                          # Start GUI (Vite, port 5173)
pnpm typecheck                        # TypeScript strict check both packages
```

The server must be running before the web GUI. On first run, create a project:
```bash
curl -X POST http://localhost:3100/api/projects \
  -H 'Content-Type: application/json' \
  -d '{"name":"my-project","displayName":"My Project","workingDirectory":"/path/to/target"}'
```

Then restart the server to load the project's agents.

## Code Conventions

- **TypeScript strict mode** everywhere. No `any` types unless commented why.
- **Functions under 30 lines. Files under 300 lines.** Extract when exceeded.
- **ESM modules** — all imports use `.js` extensions (even for `.ts` files)
- **Meaningful names.** No `data`, `temp`, `result`.
- **Early returns** over nested conditionals.
- **Error handling everywhere** — no swallowed errors, no bare catches.
- **Minimal dependencies** — justify every `npm install`.
- **Self-review all code** against senior-code-reviewer standards before considering it done.

## Visual Style Guide

The GUI uses a consistent pixel-art RPG aesthetic:
- **Backgrounds:** `#0a0a1a` (darkest), `#0f0f23` (cards), `#1a1a2e` (elevated)
- **Borders:** Pixel-style inset: top/left `#3a3a5e`, bottom/right `#12122a`, base `#2a2a4e`
- **Font:** `ui-monospace, SFMono-Regular, monospace` everywhere
- **Agent colors:** CEO=#FF6B35, CTO=#4ECDC4, CPO=#A78BFA, COO=#F59E0B, etc. (see agent .md files)
- **Animations:** CSS keyframes for bouncing, wobbling, pulsing, dash-flow
- **Components:** RPG game menu style for context menus, modals, ticket cards

## Agent Definition Format

Every agent is a `.md` file with YAML frontmatter + system prompt body:

```yaml
---
name: agent-slug
display_name: "Human Name"
role: ceo|cto|cpo|coo|senior-dev|junior-dev|code-reviewer|designer|design-reviewer|devops|qa|custom
color: "#hex"
reports_to: parent-slug | null
direct_reports: ["child-slug"]
authority_level: 1-5
can_escalate_to_user: true|false
model: sonnet|opus|haiku
---
System prompt body (markdown)
```

Templates live in `packages/server/templates/default-company/`. Each project copies these into `projects/<name>/.hivemind/agents/<agent>/agent.md`.

## Inter-Agent Communication Protocol

Agents communicate by emitting structured messages wrapped in tags:
```
[HIVEMIND:MESSAGE]{"from":"ceo","to":"cto","type":"task_assignment",...}[/HIVEMIND:MESSAGE]
```

Message types: `task_assignment`, `task_update`, `task_complete`, `review_request`, `review_result`, `escalation`, `question`, `decision`, `status_update`, `feedback`

The Orchestrator intercepts these from agent stdout, routes them to the target agent (spawning a new claude CLI subprocess), and broadcasts to the GUI via WebSocket.

## Key Patterns

**Adding a new feature:**
1. Define types in `packages/server/src/<module>/types.ts` (or extend existing)
2. Build the server-side manager/logic
3. Wire into Orchestrator if it needs message handling
4. Add API endpoints in `routes/api.ts`
5. Add WebSocket events in `routes/ws.ts`
6. Mirror types in `packages/web/src/types/index.ts`
7. Add store state in `stores/appStore.ts`
8. Handle WebSocket events in `hooks/useWebSocket.ts`
9. Build the React component(s)

**Adding a new agent role:**
1. Create a `.md` file in `packages/server/templates/default-company/`
2. Add the role to `AgentRole` type in both server and web
3. Add pixel art sprite in `PixelAgent.tsx`
4. Add color to the agent color palette

## Competitive Landscape & Inspiration

Hivemind exists in a fast-growing space. Key projects to watch and learn from:

| Project | Stars | What it does | What Hivemind should adopt |
|---------|-------|-------------|---------------------------|
| [ClawTeam](https://github.com/HKUDS/ClawTeam) | 4.5k | Agent swarm intelligence (Python). Leader/worker hierarchy, git worktree isolation per agent, ZeroMQ P2P messaging. 4.5k stars in 3 weeks. | Git-worktree-per-agent isolation model. TOML team templates for pre-defined structures. Inbox/outbox messaging pattern. Autonomous self-organization. |
| [VoltAgent](https://github.com/VoltAgent/voltagent) | 7.3k | TypeScript AI agent platform with VoltOps observability console. Zod-typed tools, MCP support, workflow engine with suspend/resume. | Built-in observability (LLM call traces, agent behavior monitoring). Declarative workflow chains. `npm create` scaffolding CLI. MCP docs server for dev acquisition. |
| [awesome-design-md](https://github.com/VoltAgent/awesome-design-md) | 20k+ | 58 DESIGN.md files capturing visual systems of popular sites. Viral — 20k stars in under a week. | Structured markdown is the best way to give agents domain knowledge. DESIGN.md convention is a template for HIVEMIND.md/TEAM.md team config files. |
| [Gather.town](https://gather.town) | N/A | Virtual 2D office with proximity-based interaction. Tile-map aesthetic with avatars. | Spatial metaphor for agent workspace. Proximity-based awareness. 2D tile-map layout inspiration for The Floor. |

### Claude Code Plugin Ecosystem

**buildwithclaude.com** hosts 497+ extensions: 53 Plugins, 124 Skills, 117 Subagents, 175 Commands, 28 Hooks. Install via `/plugin marketplace add`. Categories span dev tools, design, blockchain, data/AI, infrastructure. Hivemind should be packaged as a distributable plugin/skill on this marketplace.

### Hivemind's Differentiator

It's the only tool that combines a **visual RPG-style company metaphor** with real Claude Code CLI power. It's not another agent framework — it's a *company simulator* where AI agents have roles, personalities, and accountability. The visual UX (pixel-art floor, Tamagotchi interactions, Kanban tickets) makes multi-agent orchestration accessible and fun.

## Roadmap Summary

See `progress.md` for the full tracker. Next priorities:

1. **Skills system** — Agents should invoke superpowers skills, DESIGN.md patterns, and custom skills. Skill usage should be visually shown on The Floor.
2. **Intelligent model selection** — Auto-pick opus/sonnet/haiku based on task complexity to be economic with usage.
3. **Session usage awareness** — Display Claude API limits, auto-resume work on reset.
4. **Open source launch** — Brand identity, community prep, GitHub Actions, Docker, npm publish.
5. **Hackathon submission** — Target Anthropic's Build with Claude or similar AI hackathons.

## Open Source Preparation Checklist

- [x] CONTRIBUTING.md with PR workflow, code style, testing requirements
- [x] Issue templates (bug report, feature request, agent definition)
- [x] Code of Conduct (Contributor Covenant)
- [x] GitHub Actions: typecheck + build on PR (Node 20 + 22 matrix)
- [x] Docker Compose + Dockerfile for one-command dev setup
- [x] `.env.example` with documented config options
- [x] Architecture diagram in README
- [ ] Demo GIF/video showing the full workflow
- [ ] npm package with `npx hivemind-ai init` quick start
- [x] LICENSE already MIT

## Brand Identity Brief

For generating visual assets (logo, social cards), here's the brand essence:

**Name:** Hivemind
**Tagline:** "Your AI company, visualized."
**Personality:** Playful but powerful. Retro pixel-art meets serious AI engineering.
**Colors:** Deep space (#0a0a1a) as primary dark, Indigo (#6366F1) as primary accent, warm agent colors for personality.
**Logo direction:** A pixel-art beehive or brain made of connected nodes, incorporating the hex/honeycomb pattern. Should work as a favicon (16x16) and a full logo.
**Tone:** Developer-first, fun, open source community vibes. Not corporate. Think indie game studio meets Y Combinator.

## Session Notes for AI Assistants

When resuming work on this project:
1. Read this file first, then `progress.md` for current state
2. The original vision is in `hivemind-prompt.md` — it's the founding document
3. Always run `pnpm typecheck` before committing
4. Update `progress.md` after completing any milestone
5. The server must be restarted to pick up new projects (tsx watch handles code changes)
6. The project at `projects/self-improve/` points at the repo root — agents edit Hivemind's own code
7. Safari has SVG event handling quirks — use native DOM listeners for right-click, not React synthetic events on SVG elements
8. All GUI components use inline styles with the RPG pixel-art aesthetic (see Visual Style Guide above)
9. Agent processes use `claude -p --output-format stream-json --dangerously-skip-permissions`
10. The `--dangerously-skip-permissions` flag is required for autonomous agent operation
