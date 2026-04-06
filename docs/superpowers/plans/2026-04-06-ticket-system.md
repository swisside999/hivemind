# Hivemind Ticket System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Kanban-style ticket board that auto-creates tickets from agent communication and shows the full audit trail of which agent did what.

**Architecture:** TicketManager (server) hooks into Orchestrator's messageRouted events to auto-create/update tickets from agent messages. Tickets persist to a JSON file per project. GUI adds a tabbed view (Floor | Tickets) with a Kanban board + ticket detail modal. Real-time sync via WebSocket.

**Tech Stack:** TypeScript, Express, WebSocket (ws), React, Zustand, TailwindCSS

---

## File Map

### Server — New files
- `packages/server/src/tickets/types.ts` — Ticket, TicketEvent, TicketStatus types
- `packages/server/src/tickets/TicketManager.ts` — CRUD, event log, persistence, auto-creation from messages

### Server — Modified files
- `packages/server/src/orchestrator/Orchestrator.ts` — Expose TicketManager, new events
- `packages/server/src/routes/api.ts` — Ticket REST endpoints
- `packages/server/src/routes/ws.ts` — Ticket WebSocket events + initial state broadcast
- `packages/server/src/index.ts` — Wire TicketManager into startup

### Web — New files
- `packages/web/src/components/tickets/TicketBoard.tsx` — Kanban columns
- `packages/web/src/components/tickets/TicketCard.tsx` — Individual card
- `packages/web/src/components/tickets/TicketDetail.tsx` — Modal with timeline + actions
- `packages/web/src/components/tickets/TicketTimeline.tsx` — Event feed
- `packages/web/src/components/tickets/NewTicketModal.tsx` — Quick-create form
- `packages/web/src/hooks/useTickets.ts` — Fetch + WebSocket sync

### Web — Modified files
- `packages/web/src/types/index.ts` — Ticket types (mirroring server)
- `packages/web/src/stores/appStore.ts` — Ticket state + activeView
- `packages/web/src/hooks/useWebSocket.ts` — Handle ticket:* events
- `packages/web/src/App.tsx` — Tab bar, mount TicketBoard
- `packages/web/src/components/layout/Header.tsx` — Tab switcher

---

### Task 1: Server Ticket Types

**Files:**
- Create: `packages/server/src/tickets/types.ts`

- [ ] **Step 1: Create the ticket type definitions**

```typescript
// packages/server/src/tickets/types.ts

export type TicketStatus = "backlog" | "assigned" | "in_progress" | "in_review" | "qa" | "done" | "failed";

export type TicketEventType =
  | "created"
  | "assigned"
  | "status_change"
  | "comment"
  | "review_submitted"
  | "qa_result"
  | "escalated"
  | "closed";

export interface TicketEventData {
  fromStatus?: TicketStatus;
  toStatus?: TicketStatus;
  fromAgent?: string;
  toAgent?: string;
  comment?: string;
  reviewResult?: "approved" | "changes_requested";
  qaResult?: "passed" | "failed";
  reason?: string;
}

export interface TicketEvent {
  id: string;
  ticketId: string;
  type: TicketEventType;
  actor: string;
  timestamp: string;
  data: TicketEventData;
}

export interface Ticket {
  id: string;
  number: number;
  title: string;
  description: string;
  status: TicketStatus;
  priority: "low" | "normal" | "high" | "critical";
  createdBy: string;
  assignedTo: string | null;
  reviewedBy: string | null;
  testedBy: string | null;
  parentTicketId: string | null;
  tags: string[];
  events: TicketEvent[];
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

export interface TicketStore {
  nextNumber: number;
  tickets: Ticket[];
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm --filter @hivemind/server typecheck`
Expected: Clean pass

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/tickets/types.ts
git commit -m "feat(tickets): add ticket and event type definitions"
```

---

### Task 2: TicketManager — Core CRUD + Persistence

**Files:**
- Create: `packages/server/src/tickets/TicketManager.ts`

- [ ] **Step 1: Create TicketManager with CRUD, persistence, and event emission**

```typescript
// packages/server/src/tickets/TicketManager.ts

import { EventEmitter } from "node:events";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { existsSync } from "node:fs";
import { v4 as uuid } from "uuid";
import { logger } from "../utils/logger.js";
import type { Ticket, TicketEvent, TicketEventData, TicketEventType, TicketStatus, TicketStore } from "./types.js";

const SCOPE = "TicketManager";

export interface TicketManagerEvents {
  "ticket:created": [Ticket];
  "ticket:updated": [{ ticketId: string; changes: Partial<Ticket> }];
  "ticket:event": [{ ticketId: string; event: TicketEvent }];
}

export class TicketManager extends EventEmitter<TicketManagerEvents> {
  private store: TicketStore = { nextNumber: 1, tickets: [] };
  private filePath: string;
  private ticketIndex = new Map<string, Ticket>();

  constructor(projectHivemindDir: string) {
    super();
    this.filePath = resolve(projectHivemindDir, "tickets.json");
  }

  async load(): Promise<void> {
    if (!existsSync(this.filePath)) {
      this.store = { nextNumber: 1, tickets: [] };
    } else {
      const raw = await readFile(this.filePath, "utf-8");
      this.store = JSON.parse(raw) as TicketStore;
    }
    this.rebuildIndex();
    logger.info(SCOPE, `Loaded ${this.store.tickets.length} tickets`);
  }

  getAll(): Ticket[] {
    return this.store.tickets;
  }

  getById(id: string): Ticket | undefined {
    return this.ticketIndex.get(id);
  }

  getByNumber(num: number): Ticket | undefined {
    return this.store.tickets.find((t) => t.number === num);
  }

  getFiltered(status?: TicketStatus, assignedTo?: string): Ticket[] {
    return this.store.tickets.filter((t) => {
      if (status && t.status !== status) return false;
      if (assignedTo && t.assignedTo !== assignedTo) return false;
      return true;
    });
  }

  getChildren(parentId: string): Ticket[] {
    return this.store.tickets.filter((t) => t.parentTicketId === parentId);
  }

  async create(params: {
    title: string;
    description: string;
    priority?: Ticket["priority"];
    createdBy: string;
    assignedTo?: string | null;
    parentTicketId?: string | null;
    tags?: string[];
  }): Promise<Ticket> {
    const now = new Date().toISOString();
    const ticket: Ticket = {
      id: uuid(),
      number: this.store.nextNumber++,
      title: params.title,
      description: params.description,
      status: params.assignedTo ? "assigned" : "backlog",
      priority: params.priority ?? "normal",
      createdBy: params.createdBy,
      assignedTo: params.assignedTo ?? null,
      reviewedBy: null,
      testedBy: null,
      parentTicketId: params.parentTicketId ?? null,
      tags: params.tags ?? [],
      events: [],
      createdAt: now,
      updatedAt: now,
      closedAt: null,
    };

    const createEvent = this.buildEvent(ticket.id, "created", params.createdBy, {
      toStatus: ticket.status,
      toAgent: params.assignedTo ?? undefined,
    });
    ticket.events.push(createEvent);

    this.store.tickets.push(ticket);
    this.ticketIndex.set(ticket.id, ticket);
    await this.save();

    logger.info(SCOPE, `Created ticket HM-${ticket.number}: ${ticket.title}`);
    this.emit("ticket:created", ticket);
    return ticket;
  }

  async updateStatus(ticketId: string, newStatus: TicketStatus, actor: string): Promise<Ticket | null> {
    const ticket = this.ticketIndex.get(ticketId);
    if (!ticket) return null;

    const oldStatus = ticket.status;
    if (oldStatus === newStatus) return ticket;

    ticket.status = newStatus;
    ticket.updatedAt = new Date().toISOString();
    if (newStatus === "done" || newStatus === "failed") {
      ticket.closedAt = ticket.updatedAt;
    }

    const event = this.buildEvent(ticketId, "status_change", actor, {
      fromStatus: oldStatus,
      toStatus: newStatus,
    });
    ticket.events.push(event);
    await this.save();

    this.emit("ticket:updated", { ticketId, changes: { status: newStatus } });
    this.emit("ticket:event", { ticketId, event });
    return ticket;
  }

  async assign(ticketId: string, agentName: string, actor: string): Promise<Ticket | null> {
    const ticket = this.ticketIndex.get(ticketId);
    if (!ticket) return null;

    const oldAgent = ticket.assignedTo;
    ticket.assignedTo = agentName;
    ticket.updatedAt = new Date().toISOString();
    if (ticket.status === "backlog") {
      ticket.status = "assigned";
    }

    const event = this.buildEvent(ticketId, "assigned", actor, {
      fromAgent: oldAgent ?? undefined,
      toAgent: agentName,
    });
    ticket.events.push(event);
    await this.save();

    this.emit("ticket:updated", { ticketId, changes: { assignedTo: agentName, status: ticket.status } });
    this.emit("ticket:event", { ticketId, event });
    return ticket;
  }

  async addReview(ticketId: string, reviewer: string, result: "approved" | "changes_requested"): Promise<Ticket | null> {
    const ticket = this.ticketIndex.get(ticketId);
    if (!ticket) return null;

    ticket.reviewedBy = reviewer;
    ticket.updatedAt = new Date().toISOString();

    const newStatus: TicketStatus = result === "approved" ? "qa" : "in_progress";
    const oldStatus = ticket.status;
    ticket.status = newStatus;

    const event = this.buildEvent(ticketId, "review_submitted", reviewer, {
      reviewResult: result,
      fromStatus: oldStatus,
      toStatus: newStatus,
    });
    ticket.events.push(event);
    await this.save();

    this.emit("ticket:updated", { ticketId, changes: { reviewedBy: reviewer, status: newStatus } });
    this.emit("ticket:event", { ticketId, event });
    return ticket;
  }

  async addQaResult(ticketId: string, tester: string, result: "passed" | "failed", reason?: string): Promise<Ticket | null> {
    const ticket = this.ticketIndex.get(ticketId);
    if (!ticket) return null;

    ticket.testedBy = tester;
    ticket.updatedAt = new Date().toISOString();

    const newStatus: TicketStatus = result === "passed" ? "done" : "failed";
    const oldStatus = ticket.status;
    ticket.status = newStatus;
    if (newStatus === "done" || newStatus === "failed") {
      ticket.closedAt = ticket.updatedAt;
    }

    const event = this.buildEvent(ticketId, "qa_result", tester, {
      qaResult: result,
      reason,
      fromStatus: oldStatus,
      toStatus: newStatus,
    });
    ticket.events.push(event);
    await this.save();

    this.emit("ticket:updated", { ticketId, changes: { testedBy: tester, status: newStatus } });
    this.emit("ticket:event", { ticketId, event });
    return ticket;
  }

  async addComment(ticketId: string, actor: string, comment: string): Promise<TicketEvent | null> {
    const ticket = this.ticketIndex.get(ticketId);
    if (!ticket) return null;

    ticket.updatedAt = new Date().toISOString();

    const event = this.buildEvent(ticketId, "comment", actor, { comment });
    ticket.events.push(event);
    await this.save();

    this.emit("ticket:event", { ticketId, event });
    return event;
  }

  async updatePriority(ticketId: string, priority: Ticket["priority"], actor: string): Promise<Ticket | null> {
    const ticket = this.ticketIndex.get(ticketId);
    if (!ticket) return null;

    ticket.priority = priority;
    ticket.updatedAt = new Date().toISOString();

    const event = this.buildEvent(ticketId, "comment", actor, {
      comment: `Priority changed to ${priority}`,
    });
    ticket.events.push(event);
    await this.save();

    this.emit("ticket:updated", { ticketId, changes: { priority } });
    this.emit("ticket:event", { ticketId, event });
    return ticket;
  }

  private buildEvent(ticketId: string, type: TicketEventType, actor: string, data: TicketEventData): TicketEvent {
    return {
      id: uuid(),
      ticketId,
      type,
      actor,
      timestamp: new Date().toISOString(),
      data,
    };
  }

  private rebuildIndex(): void {
    this.ticketIndex.clear();
    for (const ticket of this.store.tickets) {
      this.ticketIndex.set(ticket.id, ticket);
    }
  }

  private async save(): Promise<void> {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    await writeFile(this.filePath, JSON.stringify(this.store, null, 2));
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm --filter @hivemind/server typecheck`
Expected: Clean pass

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/tickets/
git commit -m "feat(tickets): add TicketManager with CRUD, events, and persistence"
```

---

### Task 3: Wire TicketManager into Orchestrator

**Files:**
- Modify: `packages/server/src/orchestrator/Orchestrator.ts`

The Orchestrator gains a `ticketManager` property and a `connectTicketManager()` method that hooks `messageRouted` events to auto-create/update tickets. This is called from `index.ts` after the Orchestrator and TicketManager are both initialized.

- [ ] **Step 1: Add TicketManager integration to Orchestrator**

Add these imports at the top of `packages/server/src/orchestrator/Orchestrator.ts`:

```typescript
import { TicketManager } from "../tickets/TicketManager.js";
import type { TicketStatus } from "../tickets/types.js";
```

Add a new public property after the existing ones (line ~24):

```typescript
  ticketManager: TicketManager | null = null;
```

Add this new public method after `shutdown()` (after line ~130):

```typescript
  connectTicketManager(ticketManager: TicketManager): void {
    this.ticketManager = ticketManager;
    this.on("messageRouted", (message) => {
      this.handleTicketFromMessage(message).catch((err) => {
        logger.error(SCOPE, "Failed to process ticket from message", err);
      });
    });
    logger.info(SCOPE, "TicketManager connected");
  }

  private async handleTicketFromMessage(message: AgentMessage): Promise<void> {
    if (!this.ticketManager) return;

    const ticketId = (message.context?.ticketId as string) ?? this.findTicketIdFromThread(message);

    switch (message.type) {
      case "task_assignment": {
        const ticket = await this.ticketManager.create({
          title: message.subject,
          description: message.body,
          priority: message.priority,
          createdBy: message.from,
          assignedTo: message.to,
          parentTicketId: ticketId ?? null,
          tags: [],
        });
        if (message.context) {
          message.context.ticketId = ticket.id;
        }
        break;
      }
      case "task_update": {
        if (ticketId) {
          const ticket = this.ticketManager.getById(ticketId);
          if (ticket && ticket.status === "assigned") {
            await this.ticketManager.updateStatus(ticketId, "in_progress", message.from);
          }
          await this.ticketManager.addComment(ticketId, message.from, message.body);
        }
        break;
      }
      case "review_request": {
        if (ticketId) {
          await this.ticketManager.updateStatus(ticketId, "in_review", message.from);
          await this.ticketManager.assign(ticketId, message.to, message.from);
        }
        break;
      }
      case "review_result": {
        if (ticketId) {
          const approved = message.body.toLowerCase().includes("approved")
            || message.body.toLowerCase().includes("lgtm");
          await this.ticketManager.addReview(
            ticketId,
            message.from,
            approved ? "approved" : "changes_requested"
          );
        }
        break;
      }
      case "task_complete": {
        if (ticketId) {
          const ticket = this.ticketManager.getById(ticketId);
          if (ticket?.status === "qa") {
            const passed = !message.body.toLowerCase().includes("fail");
            await this.ticketManager.addQaResult(ticketId, message.from, passed ? "passed" : "failed", message.body);
          } else if (ticket) {
            await this.ticketManager.updateStatus(ticketId, "qa", message.from);
          }
        }
        break;
      }
      case "escalation": {
        if (ticketId) {
          await this.ticketManager.addComment(ticketId, message.from, `Escalation: ${message.body}`);
        }
        break;
      }
    }
  }

  private findTicketIdFromThread(message: AgentMessage): string | undefined {
    if (!message.parentMessageId) return undefined;
    const parentMsg = this.messageBus.getLog().find((m) => m.id === message.parentMessageId);
    if (!parentMsg) return undefined;
    return (parentMsg.context?.ticketId as string) ?? this.findTicketIdFromThread(parentMsg);
  }
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm --filter @hivemind/server typecheck`
Expected: Clean pass

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/orchestrator/Orchestrator.ts
git commit -m "feat(tickets): wire TicketManager into Orchestrator message routing"
```

---

### Task 4: Ticket API Endpoints

**Files:**
- Modify: `packages/server/src/routes/api.ts`

- [ ] **Step 1: Add ticket routes to the API router**

Add this import at the top of `packages/server/src/routes/api.ts`:

```typescript
import type { TicketManager } from "../tickets/TicketManager.js";
```

Update the `ApiDeps` interface:

```typescript
interface ApiDeps {
  orchestrator: Orchestrator;
  projectManager: ProjectManager;
  memoryManager: MemoryManager | null;
  ticketManager: TicketManager | null;
}
```

Add after the `// --- State ---` section (before `return router;`):

```typescript
  // --- Tickets ---

  router.get("/tickets", (_req: Request, res: Response) => {
    if (!deps.ticketManager) {
      res.json({ tickets: [] });
      return;
    }
    const status = _req.query.status as string | undefined;
    const assignedTo = _req.query.assignedTo as string | undefined;
    const tickets = (status || assignedTo)
      ? deps.ticketManager.getFiltered(status as any, assignedTo)
      : deps.ticketManager.getAll();
    res.json({ tickets });
  });

  router.post("/tickets", async (req: Request, res: Response) => {
    if (!deps.ticketManager) {
      res.status(503).json({ error: "No project loaded" });
      return;
    }
    const { title, description, priority, assignedTo } = req.body as {
      title?: string; description?: string; priority?: string; assignedTo?: string;
    };
    if (!title) {
      res.status(400).json({ error: "title is required" });
      return;
    }
    try {
      const ticket = await deps.ticketManager.create({
        title,
        description: description ?? "",
        priority: (priority as any) ?? "normal",
        createdBy: "user",
        assignedTo: assignedTo ?? "ceo",
      });
      res.status(201).json({ ticket });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create ticket";
      res.status(400).json({ error: msg });
    }
  });

  router.get("/tickets/:id", (req: Request, res: Response) => {
    if (!deps.ticketManager) {
      res.status(503).json({ error: "No project loaded" });
      return;
    }
    const ticket = deps.ticketManager.getById(param(req, "id"));
    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }
    const children = deps.ticketManager.getChildren(ticket.id);
    res.json({ ticket, children });
  });

  router.patch("/tickets/:id", async (req: Request, res: Response) => {
    if (!deps.ticketManager) {
      res.status(503).json({ error: "No project loaded" });
      return;
    }
    const { status, assignedTo, priority } = req.body as {
      status?: string; assignedTo?: string; priority?: string;
    };
    const ticketId = param(req, "id");
    try {
      if (status) {
        await deps.ticketManager.updateStatus(ticketId, status as any, "user");
      }
      if (assignedTo) {
        await deps.ticketManager.assign(ticketId, assignedTo, "user");
      }
      if (priority) {
        await deps.ticketManager.updatePriority(ticketId, priority as any, "user");
      }
      const ticket = deps.ticketManager.getById(ticketId);
      res.json({ ticket });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update ticket";
      res.status(400).json({ error: msg });
    }
  });

  router.post("/tickets/:id/comment", async (req: Request, res: Response) => {
    if (!deps.ticketManager) {
      res.status(503).json({ error: "No project loaded" });
      return;
    }
    const { comment } = req.body as { comment?: string };
    if (!comment) {
      res.status(400).json({ error: "comment is required" });
      return;
    }
    const event = await deps.ticketManager.addComment(param(req, "id"), "user", comment);
    if (!event) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }
    res.json({ event });
  });
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm --filter @hivemind/server typecheck`
Expected: Clean pass

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/routes/api.ts
git commit -m "feat(tickets): add REST endpoints for tickets"
```

---

### Task 5: WebSocket Ticket Events + Server Startup Wiring

**Files:**
- Modify: `packages/server/src/routes/ws.ts`
- Modify: `packages/server/src/index.ts`

- [ ] **Step 1: Add ticket events to WebSocket server**

In `packages/server/src/routes/ws.ts`, add this import:

```typescript
import type { TicketManager } from "../tickets/TicketManager.js";
```

Change the function signature:

```typescript
export function createWebSocketServer(server: Server, orchestrator: Orchestrator, ticketManager?: TicketManager | null): WebSocketServer {
```

Add these event bindings after the existing orchestrator event bindings (after the `orchestrator.on("error", ...)` block, before `wss.on("connection", ...)`):

```typescript
  if (ticketManager) {
    ticketManager.on("ticket:created", (ticket) => {
      broadcast("ticket:created", ticket);
    });

    ticketManager.on("ticket:updated", (update) => {
      broadcast("ticket:updated", update);
    });

    ticketManager.on("ticket:event", (update) => {
      broadcast("ticket:event", update);
    });
  }
```

Inside the `wss.on("connection", ...)` handler, after the `agents:configs` send (after line ~56), add:

```typescript
    if (ticketManager) {
      const tickets = ticketManager.getAll();
      ws.send(JSON.stringify({ type: "tickets:all", payload: tickets }));
    }
```

- [ ] **Step 2: Wire TicketManager into server startup**

In `packages/server/src/index.ts`, add the import:

```typescript
import { TicketManager } from "./tickets/TicketManager.js";
```

After `memoryManager = new MemoryManager(agentDir);` (around line 31), add:

```typescript
    // TicketManager loads from the .hivemind directory
    const ticketManager = new TicketManager(resolve(projectManager.getProjectDir(projects[0].name), ".hivemind"));
    await ticketManager.load();
```

But we also need `ticketManager` visible outside the `if` block. Refactor the variable declaration. Before the `if (projects.length > 0)` block, add:

```typescript
  let ticketManager: TicketManager | null = null;
```

Then inside the `if` block, replace the new line with:

```typescript
    ticketManager = new TicketManager(resolve(projectManager.getProjectDir(projects[0].name), ".hivemind"));
    await ticketManager.load();
```

After `await orchestrator.initialize(agentDir);` (around line 40), add:

```typescript
    if (ticketManager) {
      orchestrator.connectTicketManager(ticketManager);
    }
```

Update the `createApiRouter` call to include `ticketManager`:

```typescript
  app.use("/api", createApiRouter({ orchestrator, projectManager, memoryManager, ticketManager }));
```

Update the `createWebSocketServer` call:

```typescript
  createWebSocketServer(server, orchestrator, ticketManager);
```

Add the `resolve` import at the top if not already present:

```typescript
import { resolve } from "node:path";
```

- [ ] **Step 3: Verify it compiles**

Run: `pnpm --filter @hivemind/server typecheck`
Expected: Clean pass

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/routes/ws.ts packages/server/src/index.ts
git commit -m "feat(tickets): wire TicketManager into WebSocket and server startup"
```

---

### Task 6: Web — Ticket Types + Store

**Files:**
- Modify: `packages/web/src/types/index.ts`
- Modify: `packages/web/src/stores/appStore.ts`

- [ ] **Step 1: Add ticket types to the web package**

Append to `packages/web/src/types/index.ts`:

```typescript
// --- Tickets ---

export type TicketStatus = "backlog" | "assigned" | "in_progress" | "in_review" | "qa" | "done" | "failed";

export type TicketEventType =
  | "created" | "assigned" | "status_change" | "comment"
  | "review_submitted" | "qa_result" | "escalated" | "closed";

export interface TicketEventData {
  fromStatus?: TicketStatus;
  toStatus?: TicketStatus;
  fromAgent?: string;
  toAgent?: string;
  comment?: string;
  reviewResult?: "approved" | "changes_requested";
  qaResult?: "passed" | "failed";
  reason?: string;
}

export interface TicketEvent {
  id: string;
  ticketId: string;
  type: TicketEventType;
  actor: string;
  timestamp: string;
  data: TicketEventData;
}

export interface Ticket {
  id: string;
  number: number;
  title: string;
  description: string;
  status: TicketStatus;
  priority: "low" | "normal" | "high" | "critical";
  createdBy: string;
  assignedTo: string | null;
  reviewedBy: string | null;
  testedBy: string | null;
  parentTicketId: string | null;
  tags: string[];
  events: TicketEvent[];
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}
```

- [ ] **Step 2: Add ticket state to the Zustand store**

In `packages/web/src/stores/appStore.ts`, add the import:

```typescript
import type { Ticket, TicketEvent } from "../types/index.js";
```

Add to the `AppState` interface (after the `connected` property):

```typescript
  // Tickets
  activeView: "floor" | "tickets";
  tickets: Ticket[];
  selectedTicket: string | null;
  showTicketDetail: boolean;
  showNewTicket: boolean;
  setActiveView: (view: "floor" | "tickets") => void;
  setTickets: (tickets: Ticket[]) => void;
  addTicket: (ticket: Ticket) => void;
  updateTicket: (ticketId: string, changes: Partial<Ticket>) => void;
  addTicketEvent: (ticketId: string, event: TicketEvent) => void;
  setSelectedTicket: (id: string | null) => void;
  setShowTicketDetail: (show: boolean) => void;
  setShowNewTicket: (show: boolean) => void;
```

Add the implementations at the end of the `create` call (before the closing `})`):

```typescript
  activeView: "floor",
  tickets: [],
  selectedTicket: null,
  showTicketDetail: false,
  showNewTicket: false,
  setActiveView: (view) => set({ activeView: view }),
  setTickets: (tickets) => set({ tickets }),
  addTicket: (ticket) =>
    set((state) => ({ tickets: [...state.tickets, ticket] })),
  updateTicket: (ticketId, changes) =>
    set((state) => ({
      tickets: state.tickets.map((t) =>
        t.id === ticketId ? { ...t, ...changes, updatedAt: new Date().toISOString() } : t
      ),
    })),
  addTicketEvent: (ticketId, event) =>
    set((state) => ({
      tickets: state.tickets.map((t) =>
        t.id === ticketId ? { ...t, events: [...t.events, event] } : t
      ),
    })),
  setSelectedTicket: (id) => set({ selectedTicket: id }),
  setShowTicketDetail: (show) => set({ showTicketDetail: show }),
  setShowNewTicket: (show) => set({ showNewTicket: show }),
```

- [ ] **Step 3: Verify it compiles**

Run: `pnpm --filter @hivemind/web typecheck`
Expected: Clean pass

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/types/index.ts packages/web/src/stores/appStore.ts
git commit -m "feat(tickets): add ticket types and store state to web package"
```

---

### Task 7: WebSocket Ticket Event Handling

**Files:**
- Modify: `packages/web/src/hooks/useWebSocket.ts`

- [ ] **Step 1: Handle ticket WebSocket events**

In `packages/web/src/hooks/useWebSocket.ts`, add to the destructured store methods:

```typescript
  const {
    setConnected,
    setAgentConfigs,
    updateAgentState,
    addEscalation,
    removeEscalation,
    addConnection,
    addChatMessage,
    chatTarget,
    setTickets,
    addTicket,
    updateTicket,
    addTicketEvent,
  } = useAppStore();
```

Add the `Ticket` and `TicketEvent` types to the import:

```typescript
import type { AgentConfig, AgentState, AgentMessage, EscalationRequest, Ticket, TicketEvent } from "../types/index.js";
```

Add these cases to the `handleMessage` switch statement (after the `agent:error` case):

```typescript
      case "tickets:all": {
        setTickets(payload as Ticket[]);
        break;
      }
      case "ticket:created": {
        addTicket(payload as Ticket);
        break;
      }
      case "ticket:updated": {
        const { ticketId, changes } = payload as { ticketId: string; changes: Partial<Ticket> };
        updateTicket(ticketId, changes);
        break;
      }
      case "ticket:event": {
        const { ticketId, event } = payload as { ticketId: string; event: TicketEvent };
        addTicketEvent(ticketId, event);
        break;
      }
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm --filter @hivemind/web typecheck`
Expected: Clean pass

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/hooks/useWebSocket.ts
git commit -m "feat(tickets): handle ticket WebSocket events in the GUI"
```

---

### Task 8: TicketCard Component

**Files:**
- Create: `packages/web/src/components/tickets/TicketCard.tsx`

- [ ] **Step 1: Create the TicketCard component**

```typescript
// packages/web/src/components/tickets/TicketCard.tsx

import { useAppStore } from "../../stores/appStore.js";
import type { Ticket } from "../../types/index.js";

const PRIORITY_COLORS: Record<string, string> = {
  low: "#22C55E",
  normal: "#3B82F6",
  high: "#F59E0B",
  critical: "#EF4444",
};

const STATUS_LABELS: Record<string, string> = {
  backlog: "BACKLOG",
  assigned: "ASSIGNED",
  in_progress: "IN PROGRESS",
  in_review: "REVIEW",
  qa: "QA",
  done: "DONE",
  failed: "FAILED",
};

interface Props {
  ticket: Ticket;
}

export function TicketCard({ ticket }: Props) {
  const setSelectedTicket = useAppStore((s) => s.setSelectedTicket);
  const setShowTicketDetail = useAppStore((s) => s.setShowTicketDetail);
  const agentConfigs = useAppStore((s) => s.agentConfigs);
  const tickets = useAppStore((s) => s.tickets);

  const assignee = agentConfigs.find((a) => a.name === ticket.assignedTo);
  const children = tickets.filter((t) => t.parentTicketId === ticket.id);
  const childrenDone = children.filter((t) => t.status === "done").length;
  const isFailed = ticket.status === "failed";

  const handleClick = () => {
    setSelectedTicket(ticket.id);
    setShowTicketDetail(true);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="w-full text-left"
      style={{
        background: "#1a1a2e",
        border: `2px solid ${isFailed ? "#991B1B" : "#2a2a4e"}`,
        borderTopColor: isFailed ? "#DC2626" : "#3a3a5e",
        borderLeftColor: isFailed ? "#DC2626" : "#3a3a5e",
        borderBottomColor: isFailed ? "#7F1D1D" : "#12122a",
        borderRightColor: isFailed ? "#7F1D1D" : "#12122a",
        boxShadow: isFailed
          ? "0 0 8px rgba(239,68,68,0.3), 3px 3px 0 rgba(0,0,0,0.4)"
          : "3px 3px 0 rgba(0,0,0,0.4)",
        padding: "8px 10px",
        fontFamily: "ui-monospace, monospace",
        fontSize: 12,
        color: "#d1d5db",
        cursor: "pointer",
        display: "block",
        marginBottom: 6,
      }}
    >
      {/* Top row: number + priority */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <span style={{ color: "#6b7280" }}>HM-{ticket.number}</span>
        <span
          style={{
            width: 8,
            height: 8,
            background: PRIORITY_COLORS[ticket.priority] ?? PRIORITY_COLORS.normal,
            display: "inline-block",
            flexShrink: 0,
          }}
          title={ticket.priority}
        />
        {isFailed && <span title="Failed">💀</span>}
      </div>

      {/* Title */}
      <div
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          color: isFailed ? "#FCA5A5" : "#e5e7eb",
          fontWeight: 600,
        }}
      >
        {ticket.title}
      </div>

      {/* Bottom row: assignee + subtasks */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6 }}>
        {assignee ? (
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: assignee.color,
                display: "inline-block",
              }}
            />
            <span style={{ fontSize: 10, color: "#9ca3af" }}>{assignee.displayName}</span>
          </div>
        ) : (
          <span style={{ fontSize: 10, color: "#4b5563" }}>Unassigned</span>
        )}

        {children.length > 0 && (
          <span style={{ fontSize: 10, color: "#6b7280" }}>
            [{childrenDone}/{children.length}]
          </span>
        )}
      </div>
    </button>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm --filter @hivemind/web typecheck`
Expected: Clean pass

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/tickets/TicketCard.tsx
git commit -m "feat(tickets): add TicketCard component with pixel-art styling"
```

---

### Task 9: TicketTimeline Component

**Files:**
- Create: `packages/web/src/components/tickets/TicketTimeline.tsx`

- [ ] **Step 1: Create the timeline event feed**

```typescript
// packages/web/src/components/tickets/TicketTimeline.tsx

import { useAppStore } from "../../stores/appStore.js";
import type { TicketEvent } from "../../types/index.js";

interface Props {
  events: TicketEvent[];
}

function eventDescription(event: TicketEvent, agentName: string): string {
  switch (event.type) {
    case "created":
      return `created this ticket${event.data.toAgent ? ` and assigned to ${event.data.toAgent}` : ""}`;
    case "assigned":
      return `assigned to ${event.data.toAgent ?? "unknown"}${event.data.fromAgent ? ` (from ${event.data.fromAgent})` : ""}`;
    case "status_change":
      return `moved from ${event.data.fromStatus?.toUpperCase() ?? "?"} to ${event.data.toStatus?.toUpperCase() ?? "?"}`;
    case "comment":
      return "";
    case "review_submitted":
      return event.data.reviewResult === "approved" ? "approved the changes" : "requested changes";
    case "qa_result":
      return event.data.qaResult === "passed" ? "QA passed" : "QA failed";
    case "escalated":
      return "escalated this ticket";
    case "closed":
      return "closed this ticket";
    default:
      return event.type;
  }
}

function badgeForEvent(event: TicketEvent): { text: string; color: string } | null {
  if (event.type === "review_submitted") {
    return event.data.reviewResult === "approved"
      ? { text: "APPROVED", color: "#22C55E" }
      : { text: "CHANGES REQUESTED", color: "#F59E0B" };
  }
  if (event.type === "qa_result") {
    return event.data.qaResult === "passed"
      ? { text: "PASSED", color: "#22C55E" }
      : { text: "FAILED", color: "#EF4444" };
  }
  return null;
}

export function TicketTimeline({ events }: Props) {
  const agentConfigs = useAppStore((s) => s.agentConfigs);

  const getAgent = (slug: string) => agentConfigs.find((a) => a.name === slug);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {events.map((event) => {
        const agent = getAgent(event.actor);
        const desc = eventDescription(event, event.actor);
        const badge = badgeForEvent(event);
        const displayName = event.actor === "user" ? "You" : (agent?.displayName ?? event.actor);
        const color = event.actor === "user" ? "#6366F1" : (agent?.color ?? "#6b7280");

        return (
          <div
            key={event.id}
            style={{
              display: "flex",
              gap: 10,
              padding: "8px 0",
              borderBottom: "1px solid #1a1a2e",
              fontFamily: "ui-monospace, monospace",
              fontSize: 12,
            }}
          >
            {/* Agent avatar dot */}
            <div style={{ flexShrink: 0, paddingTop: 2 }}>
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  background: color,
                }}
              />
            </div>

            {/* Content */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <span style={{ color: "#e5e7eb", fontWeight: 600 }}>{displayName}</span>
                {desc && <span style={{ color: "#9ca3af" }}>{desc}</span>}
                {badge && (
                  <span
                    style={{
                      padding: "1px 6px",
                      fontSize: 10,
                      fontWeight: 700,
                      color: "#000",
                      background: badge.color,
                    }}
                  >
                    {badge.text}
                  </span>
                )}
              </div>

              {/* Comment body */}
              {event.type === "comment" && event.data.comment && (
                <div
                  style={{
                    marginTop: 4,
                    padding: "6px 8px",
                    background: "#12122a",
                    border: "1px solid #2a2a4e",
                    color: "#d1d5db",
                    whiteSpace: "pre-wrap",
                    fontSize: 11,
                  }}
                >
                  {event.data.comment}
                </div>
              )}

              {/* QA reason */}
              {event.type === "qa_result" && event.data.reason && (
                <div style={{ marginTop: 4, color: "#9ca3af", fontSize: 11 }}>
                  {event.data.reason}
                </div>
              )}

              {/* Timestamp */}
              <div style={{ marginTop: 2, color: "#4b5563", fontSize: 10 }}>
                {new Date(event.timestamp).toLocaleString()}
              </div>
            </div>
          </div>
        );
      })}

      {events.length === 0 && (
        <div style={{ color: "#4b5563", textAlign: "center", padding: 20, fontFamily: "ui-monospace, monospace", fontSize: 12 }}>
          No activity yet
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm --filter @hivemind/web typecheck`
Expected: Clean pass

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/tickets/TicketTimeline.tsx
git commit -m "feat(tickets): add TicketTimeline component with quest-log styling"
```

---

### Task 10: TicketDetail Modal

**Files:**
- Create: `packages/web/src/components/tickets/TicketDetail.tsx`

- [ ] **Step 1: Create the ticket detail modal**

```typescript
// packages/web/src/components/tickets/TicketDetail.tsx

import { useState } from "react";
import { useAppStore } from "../../stores/appStore.js";
import { TicketTimeline } from "./TicketTimeline.js";
import type { Ticket } from "../../types/index.js";

const STATUS_COLORS: Record<string, string> = {
  backlog: "#6b7280",
  assigned: "#8B5CF6",
  in_progress: "#3B82F6",
  in_review: "#F59E0B",
  qa: "#EC4899",
  done: "#22C55E",
  failed: "#EF4444",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "#22C55E",
  normal: "#3B82F6",
  high: "#F59E0B",
  critical: "#EF4444",
};

export function TicketDetail() {
  const selectedTicket = useAppStore((s) => s.selectedTicket);
  const tickets = useAppStore((s) => s.tickets);
  const agentConfigs = useAppStore((s) => s.agentConfigs);
  const setShowTicketDetail = useAppStore((s) => s.setShowTicketDetail);
  const [comment, setComment] = useState("");
  const [posting, setPosting] = useState(false);

  const ticket = tickets.find((t) => t.id === selectedTicket);
  if (!ticket) return null;

  const close = () => setShowTicketDetail(false);

  const assignee = agentConfigs.find((a) => a.name === ticket.assignedTo);
  const reviewer = agentConfigs.find((a) => a.name === ticket.reviewedBy);
  const tester = agentConfigs.find((a) => a.name === ticket.testedBy);
  const children = tickets.filter((t) => t.parentTicketId === ticket.id);

  const handleComment = async () => {
    if (!comment.trim()) return;
    setPosting(true);
    try {
      await fetch(`/api/tickets/${ticket.id}/comment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: comment.trim() }),
      });
      setComment("");
    } finally {
      setPosting(false);
    }
  };

  const rpgBorder = {
    border: "2px solid #2a2a4e",
    borderTopColor: "#3a3a5e",
    borderLeftColor: "#3a3a5e",
    borderBottomColor: "#12122a",
    borderRightColor: "#12122a",
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)" }}
      onClick={close}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 600,
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          background: "#0f0f23",
          ...rpgBorder,
          boxShadow: "6px 6px 0 rgba(0,0,0,0.5)",
          fontFamily: "ui-monospace, monospace",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #2a2a4e", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: "#6b7280", fontSize: 12 }}>HM-{ticket.number}</span>
          <span
            style={{
              padding: "2px 8px",
              fontSize: 10,
              fontWeight: 700,
              color: "#000",
              background: STATUS_COLORS[ticket.status] ?? "#6b7280",
            }}
          >
            {ticket.status.toUpperCase().replace("_", " ")}
          </span>
          <span
            style={{
              width: 8,
              height: 8,
              background: PRIORITY_COLORS[ticket.priority],
              display: "inline-block",
            }}
            title={ticket.priority}
          />
          <div style={{ flex: 1 }} />
          <button onClick={close} style={{ color: "#6b7280", background: "none", border: "none", cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>

        {/* Title */}
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #1a1a2e" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#e5e7eb" }}>{ticket.title}</h2>
          {ticket.description && (
            <p style={{ margin: "8px 0 0", fontSize: 12, color: "#9ca3af", whiteSpace: "pre-wrap" }}>{ticket.description}</p>
          )}
        </div>

        {/* Agent row */}
        <div style={{ padding: "10px 16px", borderBottom: "1px solid #1a1a2e", display: "flex", gap: 16, fontSize: 11 }}>
          <AgentBadge label="Assignee" agent={assignee} />
          <AgentBadge label="Reviewer" agent={reviewer} />
          <AgentBadge label="QA" agent={tester} />
        </div>

        {/* Subtasks */}
        {children.length > 0 && (
          <div style={{ padding: "8px 16px", borderBottom: "1px solid #1a1a2e", fontSize: 11, color: "#9ca3af" }}>
            Subtasks: {children.filter((c) => c.status === "done").length}/{children.length} done
            {children.map((c) => (
              <div key={c.id} style={{ marginTop: 4, display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ width: 6, height: 6, background: STATUS_COLORS[c.status], display: "inline-block" }} />
                <span style={{ color: "#6b7280" }}>HM-{c.number}</span>
                <span style={{ color: "#d1d5db" }}>{c.title}</span>
              </div>
            ))}
          </div>
        )}

        {/* Timeline */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 16px" }}>
          <div style={{ padding: "10px 0 4px", fontSize: 10, color: "#4b5563", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Activity Log
          </div>
          <TicketTimeline events={ticket.events} />
        </div>

        {/* Comment input */}
        <div style={{ padding: "10px 16px", borderTop: "1px solid #2a2a4e", display: "flex", gap: 8 }}>
          <input
            type="text"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleComment()}
            placeholder="Add a comment..."
            style={{
              flex: 1,
              background: "#1a1a2e",
              border: "1px solid #2a2a4e",
              padding: "6px 10px",
              color: "#d1d5db",
              fontFamily: "inherit",
              fontSize: 12,
              outline: "none",
            }}
          />
          <button
            onClick={handleComment}
            disabled={!comment.trim() || posting}
            style={{
              background: "#4F46E5",
              border: "none",
              padding: "6px 14px",
              color: "white",
              fontFamily: "inherit",
              fontSize: 12,
              cursor: comment.trim() ? "pointer" : "not-allowed",
              opacity: comment.trim() && !posting ? 1 : 0.4,
            }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

function AgentBadge({ label, agent }: { label: string; agent?: { displayName: string; color: string } }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <span style={{ color: "#4b5563" }}>{label}:</span>
      {agent ? (
        <>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: agent.color, display: "inline-block" }} />
          <span style={{ color: "#d1d5db" }}>{agent.displayName}</span>
        </>
      ) : (
        <span style={{ color: "#374151" }}>—</span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm --filter @hivemind/web typecheck`
Expected: Clean pass

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/tickets/TicketDetail.tsx
git commit -m "feat(tickets): add TicketDetail modal with timeline and actions"
```

---

### Task 11: TicketBoard (Kanban) + NewTicketModal

**Files:**
- Create: `packages/web/src/components/tickets/TicketBoard.tsx`
- Create: `packages/web/src/components/tickets/NewTicketModal.tsx`

- [ ] **Step 1: Create the Kanban board**

```typescript
// packages/web/src/components/tickets/TicketBoard.tsx

import { useAppStore } from "../../stores/appStore.js";
import { TicketCard } from "./TicketCard.js";
import type { TicketStatus } from "../../types/index.js";

interface Column {
  status: TicketStatus | TicketStatus[];
  label: string;
  color: string;
}

const COLUMNS: Column[] = [
  { status: ["backlog", "assigned"], label: "BACKLOG", color: "#6b7280" },
  { status: "in_progress", label: "IN PROGRESS", color: "#3B82F6" },
  { status: "in_review", label: "REVIEW", color: "#F59E0B" },
  { status: "qa", label: "QA", color: "#EC4899" },
  { status: ["done", "failed"], label: "DONE", color: "#22C55E" },
];

export function TicketBoard() {
  const tickets = useAppStore((s) => s.tickets);
  const setShowNewTicket = useAppStore((s) => s.setShowNewTicket);

  const rpgBorder = {
    border: "2px solid #2a2a4e",
    borderTopColor: "#3a3a5e",
    borderLeftColor: "#3a3a5e",
    borderBottomColor: "#12122a",
    borderRightColor: "#12122a",
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#0a0a1a", fontFamily: "ui-monospace, monospace" }}>
      {/* Board header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid #1a1a2e" }}>
        <span style={{ fontSize: 10, color: "#4b5563", textTransform: "uppercase", letterSpacing: "0.1em" }}>
          {tickets.length} ticket{tickets.length !== 1 ? "s" : ""}
        </span>
        <button
          onClick={() => setShowNewTicket(true)}
          style={{
            background: "#4F46E5",
            border: "none",
            padding: "5px 12px",
            color: "white",
            fontFamily: "inherit",
            fontSize: 11,
            cursor: "pointer",
          }}
        >
          + NEW TICKET
        </button>
      </div>

      {/* Columns */}
      <div style={{ flex: 1, display: "flex", gap: 0, overflow: "hidden", padding: "12px" }}>
        {COLUMNS.map((col) => {
          const statuses = Array.isArray(col.status) ? col.status : [col.status];
          const colTickets = tickets
            .filter((t) => statuses.includes(t.status))
            .filter((t) => t.parentTicketId === null);

          // In DONE column, show done first, failed at bottom
          const sorted = col.label === "DONE"
            ? [...colTickets].sort((a, b) => {
                if (a.status === "failed" && b.status !== "failed") return 1;
                if (a.status !== "failed" && b.status === "failed") return -1;
                return 0;
              })
            : colTickets;

          return (
            <div
              key={col.label}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                minWidth: 0,
                margin: "0 4px",
              }}
            >
              {/* Column header */}
              <div
                style={{
                  padding: "6px 10px",
                  marginBottom: 8,
                  ...rpgBorder,
                  background: "#0f0f23",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 10,
                  fontWeight: 700,
                  color: col.color,
                  letterSpacing: "0.05em",
                }}
              >
                <span style={{ width: 6, height: 6, background: col.color, display: "inline-block" }} />
                {col.label}
                <span style={{ marginLeft: "auto", color: "#4b5563", fontWeight: 400 }}>
                  {sorted.length}
                </span>
              </div>

              {/* Cards */}
              <div style={{ flex: 1, overflowY: "auto" }}>
                {sorted.map((ticket) => (
                  <TicketCard key={ticket.id} ticket={ticket} />
                ))}

                {sorted.length === 0 && (
                  <div style={{ padding: 12, textAlign: "center", color: "#2a2a4e", fontSize: 10 }}>
                    Empty
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the NewTicketModal**

```typescript
// packages/web/src/components/tickets/NewTicketModal.tsx

import { useState } from "react";
import { useAppStore } from "../../stores/appStore.js";

export function NewTicketModal() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("normal");
  const [assignedTo, setAssignedTo] = useState("ceo");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const setShowNewTicket = useAppStore((s) => s.setShowNewTicket);
  const agentConfigs = useAppStore((s) => s.agentConfigs);

  const close = () => setShowNewTicket(false);

  const handleCreate = async () => {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), description: description.trim(), priority, assignedTo }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to create ticket");
      }
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create ticket");
    } finally {
      setCreating(false);
    }
  };

  const rpgBorder = {
    border: "2px solid #2a2a4e",
    borderTopColor: "#3a3a5e",
    borderLeftColor: "#3a3a5e",
    borderBottomColor: "#12122a",
    borderRightColor: "#12122a",
  };

  const inputStyle = {
    width: "100%",
    background: "#1a1a2e",
    border: "1px solid #2a2a4e",
    padding: "6px 10px",
    color: "#d1d5db",
    fontFamily: "ui-monospace, monospace",
    fontSize: 12,
    outline: "none",
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)" }}
      onClick={close}
    >
      <div
        style={{ width: "100%", maxWidth: 440, background: "#0f0f23", ...rpgBorder, boxShadow: "6px 6px 0 rgba(0,0,0,0.5)", fontFamily: "ui-monospace, monospace" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #2a2a4e", fontSize: 14, fontWeight: 700, color: "#e5e7eb" }}>
          NEW TICKET
        </div>

        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={{ display: "block", fontSize: 10, color: "#6b7280", marginBottom: 4, textTransform: "uppercase" }}>Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              placeholder="What needs to be done?"
              style={inputStyle}
              autoFocus
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: 10, color: "#6b7280", marginBottom: 4, textTransform: "uppercase" }}>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Details..."
              rows={3}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </div>

          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: 10, color: "#6b7280", marginBottom: 4, textTransform: "uppercase" }}>Priority</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value)} style={inputStyle}>
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: 10, color: "#6b7280", marginBottom: 4, textTransform: "uppercase" }}>Assign To</label>
              <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} style={inputStyle}>
                {agentConfigs.map((a) => (
                  <option key={a.name} value={a.name}>{a.displayName}</option>
                ))}
              </select>
            </div>
          </div>

          {error && <div style={{ fontSize: 11, color: "#EF4444" }}>{error}</div>}
        </div>

        <div style={{ padding: "10px 16px", borderTop: "1px solid #2a2a4e", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={close} style={{ background: "#1a1a2e", border: "1px solid #2a2a4e", padding: "6px 14px", color: "#9ca3af", fontFamily: "inherit", fontSize: 12, cursor: "pointer" }}>
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={creating}
            style={{ background: "#4F46E5", border: "none", padding: "6px 14px", color: "white", fontFamily: "inherit", fontSize: 12, cursor: "pointer", opacity: creating ? 0.5 : 1 }}
          >
            {creating ? "Creating..." : "Create Ticket"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify it compiles**

Run: `pnpm --filter @hivemind/web typecheck`
Expected: Clean pass

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/tickets/
git commit -m "feat(tickets): add TicketBoard (Kanban) and NewTicketModal"
```

---

### Task 12: Tab Bar + App Integration

**Files:**
- Modify: `packages/web/src/components/layout/Header.tsx`
- Modify: `packages/web/src/App.tsx`

- [ ] **Step 1: Add tab switcher to Header**

In `packages/web/src/components/layout/Header.tsx`, add after the project name `<span>` (around line 30), before the closing `</div>` of the left section:

```typescript
        {/* Tab switcher */}
        <div style={{ display: "flex", gap: 0, marginLeft: 16 }}>
          {(["floor", "tickets"] as const).map((view) => (
            <button
              key={view}
              onClick={() => setActiveView(view)}
              style={{
                background: activeView === view ? "#1a1a2e" : "transparent",
                border: activeView === view ? "1px solid #2a2a4e" : "1px solid transparent",
                borderBottom: activeView === view ? "1px solid #1a1a2e" : "1px solid #2a2a4e",
                padding: "4px 12px",
                fontFamily: "ui-monospace, monospace",
                fontSize: 11,
                color: activeView === view ? "#e5e7eb" : "#6b7280",
                cursor: "pointer",
                letterSpacing: "0.05em",
              }}
            >
              {view === "floor" ? "THE FLOOR" : "TICKETS"}
            </button>
          ))}
        </div>
```

Add these to the store destructuring in Header:

```typescript
  const activeView = useAppStore((s) => s.activeView);
  const setActiveView = useAppStore((s) => s.setActiveView);
```

- [ ] **Step 2: Update App.tsx to switch between FloorView and TicketBoard**

Replace the `<main>` section in `packages/web/src/App.tsx`. Add the new imports at the top:

```typescript
import { TicketBoard } from "./components/tickets/TicketBoard.js";
import { TicketDetail } from "./components/tickets/TicketDetail.js";
import { NewTicketModal } from "./components/tickets/NewTicketModal.js";
```

Add to the store reads:

```typescript
  const activeView = useAppStore((s) => s.activeView);
  const showTicketDetail = useAppStore((s) => s.showTicketDetail);
  const showNewTicket = useAppStore((s) => s.showNewTicket);
```

Replace the `<main>` block:

```typescript
          <main className="flex-1 overflow-auto">
            {activeView === "floor" ? <FloorView /> : <TicketBoard />}
          </main>
```

Add the ticket modals alongside the existing ones (after `{showNewProject && <NewProjectModal />}`):

```typescript
      {showTicketDetail && <TicketDetail />}
      {showNewTicket && <NewTicketModal />}
```

- [ ] **Step 3: Verify it compiles**

Run: `pnpm typecheck`
Expected: Clean pass for both packages

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/layout/Header.tsx packages/web/src/App.tsx
git commit -m "feat(tickets): add tab bar and wire ticket views into App"
```

---

### Task 13: Final Typecheck + Screenshot Verification

- [ ] **Step 1: Full monorepo typecheck**

Run: `pnpm typecheck`
Expected: Clean pass for both server and web

- [ ] **Step 2: Restart the server**

```bash
pkill -f "tsx watch src/index.ts" 2>/dev/null; sleep 1
pnpm --filter @hivemind/server dev &
sleep 3
curl -s http://localhost:3100/api/tickets | head -20
```

Expected: `{"tickets":[]}` (empty until agents create tickets)

- [ ] **Step 3: Create a test ticket via API**

```bash
curl -s -X POST http://localhost:3100/api/tickets \
  -H 'Content-Type: application/json' \
  -d '{"title":"Improve FloorView zoom and pan","description":"Add drag-to-pan and scroll-to-zoom to The Floor canvas","priority":"high","assignedTo":"ceo"}' | python3 -m json.tool
```

Expected: Ticket created with `HM-1`, status `assigned`

- [ ] **Step 4: Take a screenshot of the Tickets tab**

Verify the Kanban board renders with the test ticket in the BACKLOG column.

- [ ] **Step 5: Commit everything**

```bash
git add -A
git commit -m "feat(tickets): complete ticket system — Kanban board, detail modal, auto-creation from agent messages"
```
