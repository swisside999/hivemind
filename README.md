# Hivemind

Orchestrate multiple Claude Code CLI sessions as a virtual software company. Each agent has a defined role, personality, persistent memory, and authority level. You speak to the CEO, who delegates work through a corporate hierarchy of autonomous agents.

## Prerequisites

- Node.js >= 20
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated
- pnpm (`npm install -g pnpm`)

## Quick Start

```bash
# Clone and install
git clone https://github.com/your-org/hivemind.git
cd hivemind
pnpm install

# Create your first project
pnpm dev    # starts the server
# In another terminal:
curl -X POST http://localhost:3100/api/projects \
  -H 'Content-Type: application/json' \
  -d '{"name": "my-app", "displayName": "My App"}'
```

## Architecture

```
hivemind/
├── packages/
│   ├── server/     # Express + WebSocket server, orchestrator, agent management
│   └── web/        # React + Vite GUI
└── projects/       # User projects (gitignored)
```

### Agent Hierarchy

```
USER (Board/Owner)
  └── CEO (authority: 5)
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

### How It Works

1. You send a message to the CEO agent
2. CEO breaks the request into tasks and delegates to C-suite
3. C-suite delegates to individual contributors
4. Agents communicate via a typed message bus
5. Code Reviewer and Design Reviewer gate all output
6. Results flow back up the chain to you
7. The GUI shows all of this in real-time on "The Floor"

## Development

```bash
# Start server (watches for changes)
pnpm dev

# Start web GUI (separate terminal)
pnpm dev:web

# Type-check everything
pnpm typecheck

# Build for production
pnpm build
```

## CLI Usage

```bash
# Create a new project
hivemind init my-project

# Start the server
hivemind start

# Start headless (no GUI)
hivemind start --headless

# Talk to the CEO
hivemind ask "Build a REST API for user authentication"

# List agents
hivemind agents

# View agent status
hivemind agent ceo --status

# List projects
hivemind projects
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/projects` | List all projects |
| POST | `/api/projects` | Create a project |
| GET | `/api/projects/:name` | Get project details |
| DELETE | `/api/projects/:name` | Delete a project |
| GET | `/api/agents` | List agents with state |
| GET | `/api/agents/:name` | Get agent details |
| POST | `/api/messages` | Send message to an agent |
| GET | `/api/messages` | Get message log |
| GET | `/api/escalations` | Get pending escalations |
| POST | `/api/escalations/:id/resolve` | Resolve an escalation |
| GET | `/api/state` | Get full system state |
| GET | `/health` | Health check |

## WebSocket Events

Connect to `ws://localhost:3100` for real-time updates:

| Event | Direction | Description |
|-------|-----------|-------------|
| `state:full` | Server → Client | Full state on connect |
| `agents:configs` | Server → Client | All agent configurations |
| `agent:thought` | Server → Client | Agent's current activity |
| `agent:status` | Server → Client | Agent status change |
| `message:routed` | Server → Client | Inter-agent message sent |
| `escalation:new` | Server → Client | New escalation for user |
| `escalation:resolved` | Server → Client | Escalation resolved |
| `message:send` | Client → Server | Send message to agent |
| `escalation:resolve` | Client → Server | Resolve an escalation |

## Customizing Agents

Each agent is a `.md` file with YAML frontmatter:

```yaml
---
name: my-agent
display_name: "My Agent"
description: "What this agent does"
role: custom
color: "#FF6B35"
reports_to: ceo
direct_reports: []
authority_level: 3
can_escalate_to_user: false
model: sonnet
---

Your system prompt here. Define personality, instructions, and behavior.
```

Agent files live in `projects/<name>/.hivemind/agents/<agent-name>/agent.md`.

## License

MIT
