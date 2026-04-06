# Contributing to Hivemind

Thanks for your interest in contributing to Hivemind! Whether you're fixing a bug, adding a feature, or creating a new agent definition, this guide will help you get started.

## Development Setup

### Prerequisites

- **Node.js** >= 20
- **pnpm** (`npm install -g pnpm`)
- **Claude Code CLI** installed and authenticated ([docs](https://docs.anthropic.com/en/docs/claude-code))

### Getting Started

```bash
git clone https://github.com/swisside999/hivemind.git
cd hivemind
pnpm install
```

### Running Locally

```bash
# Terminal 1: Start the server (auto-reloads on changes)
pnpm dev

# Terminal 2: Start the web GUI
pnpm dev:web
```

Server runs on `http://localhost:3100`, GUI on `http://localhost:5173`.

### Creating a Test Project

```bash
curl -X POST http://localhost:3100/api/projects \
  -H 'Content-Type: application/json' \
  -d '{"name":"test-project","displayName":"Test Project","workingDirectory":"/tmp/hivemind-test"}'
```

Then restart the server to load the project's agents.

## Code Standards

### TypeScript

- **Strict mode** everywhere. No `any` types unless commented why.
- **ESM modules** with `.js` extensions in imports (even for `.ts` files).
- Functions under **30 lines**. Files under **300 lines**. Extract when exceeded.
- **Early returns** over nested conditionals.
- **Meaningful names** — no `data`, `temp`, `result`.
- **Error handling** everywhere — no swallowed errors, no bare catches.

### Style

- No linter configured yet — follow existing patterns in the codebase.
- Use inline styles with the RPG pixel-art aesthetic for GUI components (see `CLAUDE.md` Visual Style Guide).
- Monospace fonts, dark theme backgrounds (`#0a0a1a`, `#0f0f23`, `#1a1a2e`).

### Commits

- Use conventional commit format: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`
- Keep commits focused — one logical change per commit.

## Pull Request Workflow

1. **Fork** the repository and create a branch from `main`.
2. **Make your changes** following the code standards above.
3. **Run `pnpm typecheck`** — it must pass with zero errors.
4. **Run `pnpm build`** — both packages must build successfully.
5. **Open a PR** against `main` with:
   - A clear title describing the change.
   - A description of what and why (not just how).
   - Screenshots for GUI changes.
6. A maintainer will review your PR. Address feedback, then we merge.

## Types of Contributions

### Bug Fixes

Found a bug? [Open an issue](https://github.com/swisside999/hivemind/issues/new?template=bug_report.md) first, then submit a PR referencing it.

### New Features

For significant features, [open a feature request](https://github.com/swisside999/hivemind/issues/new?template=feature_request.md) first to discuss the approach before investing time in implementation.

### Agent Definitions

One of the easiest ways to contribute is creating new agent role definitions. See the [agent definition template](https://github.com/swisside999/hivemind/issues/new?template=agent_definition.md) for the format.

Agent `.md` files live in `packages/server/templates/default-company/` and follow this structure:

```yaml
---
name: agent-slug
display_name: "Display Name"
description: "What this agent does and when it should be activated"
role: custom
color: "#hexcolor"
icon_props: []
reports_to: parent-slug
direct_reports: []
authority_level: 1-5
can_escalate_to_user: false
model: sonnet
---

System prompt body (personality, instructions, behavior).
```

### Documentation

Improvements to README, CLAUDE.md, or inline code documentation are always welcome.

## Project Structure

```
hivemind/
├── packages/
│   ├── server/          # Express + WebSocket, orchestrator, agents
│   │   ├── src/
│   │   │   ├── agents/        # Agent process management
│   │   │   ├── orchestrator/  # Message routing, escalation
│   │   │   ├── projects/      # Project lifecycle
│   │   │   ├── memory/        # Agent memory system
│   │   │   ├── tickets/       # Kanban ticket system
│   │   │   ├── routes/        # API + WebSocket handlers
│   │   │   └── cli/           # CLI commands
│   │   └── templates/         # Default agent definitions
│   └── web/             # React + Vite GUI
│       └── src/
│           ├── components/    # Floor, Chat, Tickets, Wiki, etc.
│           ├── hooks/         # WebSocket, agents, project
│           ├── stores/        # Zustand global state
│           └── types/         # Shared TypeScript types
└── projects/            # User projects (gitignored)
```

## Adding a New Feature (Checklist)

1. Define types in `packages/server/src/<module>/types.ts`
2. Build server-side logic/manager
3. Wire into Orchestrator if it needs message handling
4. Add API endpoints in `routes/api.ts`
5. Add WebSocket events in `routes/ws.ts`
6. Mirror types in `packages/web/src/types/index.ts`
7. Add store state in `stores/appStore.ts`
8. Handle WebSocket events in `hooks/useWebSocket.ts`
9. Build the React component(s)

## Questions?

Open a [discussion](https://github.com/swisside999/hivemind/discussions) or reach out via issues. We're happy to help!
