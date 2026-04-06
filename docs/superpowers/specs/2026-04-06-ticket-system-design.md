# Hivemind Ticket System — Design Spec

## Overview

A lightweight Jira-like ticketing system that tracks work flowing through the Hivemind agent hierarchy. Tickets are automatically created from agent communication (CEO delegates → ticket appears) and flow through statuses as agents work, review, and test. The GUI provides a Kanban board view and a per-ticket activity timeline showing the full audit trail of which agent did what.

## Data Model

### Ticket

```typescript
interface Ticket {
  id: string;                        // UUID
  number: number;                    // Auto-incrementing (HM-1, HM-2, ...)
  title: string;
  description: string;
  status: TicketStatus;
  priority: "low" | "normal" | "high" | "critical";
  createdBy: string;                 // Agent slug or "user"
  assignedTo: string | null;         // Agent slug
  reviewedBy: string | null;         // Agent slug (code-reviewer or design-reviewer)
  testedBy: string | null;           // Agent slug (qa)
  parentTicketId: string | null;     // For subtasks
  tags: string[];
  events: TicketEvent[];             // Full audit trail
  createdAt: string;                 // ISO 8601
  updatedAt: string;
  closedAt: string | null;
}

type TicketStatus = "backlog" | "assigned" | "in_progress" | "in_review" | "qa" | "done" | "failed";
```

### TicketEvent

```typescript
interface TicketEvent {
  id: string;                        // UUID
  ticketId: string;
  type: TicketEventType;
  actor: string;                     // Agent slug or "user"
  timestamp: string;                 // ISO 8601
  data: {
    fromStatus?: TicketStatus;
    toStatus?: TicketStatus;
    fromAgent?: string;
    toAgent?: string;
    comment?: string;
    reviewResult?: "approved" | "changes_requested";
    qaResult?: "passed" | "failed";
    reason?: string;
  };
}

type TicketEventType =
  | "created"
  | "assigned"
  | "status_change"
  | "comment"
  | "review_submitted"
  | "qa_result"
  | "escalated"
  | "closed";
```

## Server: TicketManager

New module at `packages/server/src/tickets/`.

### TicketManager class

Responsibilities:
- CRUD operations on tickets
- Auto-incrementing ticket numbers (per project)
- Event log appending
- Persistence to `projects/<name>/.hivemind/tickets.json`
- Emits events for WebSocket broadcasting

### Orchestrator Integration

TicketManager hooks into the Orchestrator's `messageRouted` event. Message-to-ticket mapping:

| Agent Message Type | Ticket Action |
|---|---|
| User sends message to CEO | Create ticket (status: `backlog`, createdBy: "user") |
| `task_assignment` from C-suite to IC | Create subtask (status: `assigned`, parentTicketId from context) |
| `task_update` | Add comment event, set status to `in_progress` if still `assigned` |
| `review_request` | Set status to `in_review`, set reviewedBy |
| `review_result` (approved) | Add review event, set status to `qa` |
| `review_result` (changes_requested) | Add review event, set status back to `in_progress` |
| QA `task_complete` (pass) | Add QA event, set status to `done`, set closedAt |
| QA `task_complete` (fail) | Add QA event, set status to `failed` |
| `escalation` | Add escalation event to the relevant ticket |

Ticket ID linkage: When the Orchestrator creates a ticket from a user message, it attaches the `ticketId` to the message context. Subsequent messages in the thread carry the `ticketId` forward via `parentMessageId` chain lookups, so the TicketManager can associate follow-up messages with the correct ticket.

### Storage

File-based: `projects/<name>/.hivemind/tickets.json`

```json
{
  "nextNumber": 4,
  "tickets": [
    { "id": "...", "number": 1, "title": "...", ... }
  ]
}
```

Loaded into memory on project load. Written back on every mutation. Acceptable for the expected ticket volume (tens to low hundreds per project).

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/tickets` | List all tickets. Query params: `?status=in_progress&assignedTo=cto` |
| POST | `/api/tickets` | Create ticket manually (user-initiated) |
| GET | `/api/tickets/:id` | Get ticket with full event timeline |
| PATCH | `/api/tickets/:id` | Update status, assignment, priority |
| POST | `/api/tickets/:id/comment` | Add a user comment event |

## WebSocket Events

| Event | Direction | Payload |
|---|---|---|
| `ticket:created` | Server → Client | Full Ticket object |
| `ticket:updated` | Server → Client | `{ ticketId, changes }` |
| `ticket:event` | Server → Client | `{ ticketId, event: TicketEvent }` |

## GUI Components

### Tab Bar

A tab bar above the main content area:

```
[ THE FLOOR ]  [ TICKETS ]
```

Switches between FloorView and TicketBoard. Both remain mounted (not destroyed on switch) to preserve state.

### TicketBoard (Kanban)

Five columns: `BACKLOG` | `IN PROGRESS` | `REVIEW` | `QA` | `DONE`

- Styled with the pixel-art RPG aesthetic (dark backgrounds, pixel borders, monospace text)
- Column headers show count of tickets
- Failed tickets appear in a special section at the bottom of the DONE column with red glow

### TicketCard

Each card shows:
- Ticket number in monospace (`HM-3`)
- Title (truncated to one line)
- Priority: colored pixel dot (green=low, blue=normal, amber=high, red=critical)
- Assignee: tiny pixel avatar of the assigned agent
- Subtask indicator: `[2/4]` showing completed/total children
- Failed tickets: red border + skull pixel icon

### TicketDetail (Modal)

Opened by clicking a ticket card. Contains:
- Header: ticket number, title, status badge, priority badge
- Agent row: assignee, reviewer, QA (pixel avatars with role labels)
- Description (markdown-rendered or plain text)
- Activity Timeline: chronological TicketEvent feed
- User action buttons: Add Comment, Change Priority, Reassign, Close

### TicketTimeline

RPG quest-log styled event feed. Each entry:
- Agent pixel avatar (small, 2x scale)
- Event description in monospace: "CODE REVIEWER approved changes"
- Timestamp
- For comments: indented text block
- For reviews: APPROVED (green) or CHANGES REQUESTED (amber) badge
- For QA: PASSED (green) or FAILED (red) badge

### NewTicketModal

Simple form: title, description, priority dropdown, assign-to dropdown (defaults to CEO). Creates ticket and sends it as a message to the assigned agent.

## Hooks & Store

### useTickets hook

- Fetches tickets on mount
- Subscribes to WebSocket ticket events
- Provides: `tickets`, `createTicket()`, `updateTicket()`, `addComment()`

### Store additions

```typescript
// Added to AppState
tickets: Ticket[];
activeView: "floor" | "tickets";
selectedTicket: string | null;
showTicketDetail: boolean;
setActiveView: (view) => void;
setTickets: (tickets) => void;
addTicket: (ticket) => void;
updateTicket: (ticketId, changes) => void;
addTicketEvent: (ticketId, event) => void;
```

## What We're NOT Building

- No sprints, story points, or velocity tracking
- No epics or multi-level hierarchy beyond parent/subtask
- No drag-and-drop reordering on the board
- No custom status columns or workflows
- No ticket templates
- No due dates or SLAs
- No search or filtering beyond basic status/assignee query params

## Visual Style

All ticket UI matches the existing RPG pixel-art aesthetic:
- Dark backgrounds (`#0a0a1a`, `#1a1a2e`)
- Pixel-style borders (2px solid, lighter top-left / darker bottom-right)
- Monospace font throughout
- Agent pixel avatars at small scale on cards
- Status badges use the agent color palette
- Animations: cards slide between columns on status change
