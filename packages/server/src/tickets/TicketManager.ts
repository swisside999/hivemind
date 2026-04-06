import { EventEmitter } from "node:events";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { v4 as uuid } from "uuid";
import { logger } from "../utils/logger.js";
import type { Ticket, TicketEvent, TicketEventData, TicketStatus, TicketStore } from "./types.js";

const SCOPE = "TicketManager";

export interface TicketManagerEvents {
  "ticket:created": [Ticket];
  "ticket:updated": [{ ticketId: string; changes: Partial<Ticket> }];
  "ticket:event": [{ ticketId: string; event: TicketEvent }];
}

export class TicketManager extends EventEmitter<TicketManagerEvents> {
  private storePath: string;
  private store: TicketStore = { nextNumber: 1, tickets: [] };
  private index = new Map<string, Ticket>();

  constructor(hivemindDir: string) {
    super();
    this.storePath = resolve(hivemindDir, "tickets.json");
  }

  async load(): Promise<void> {
    if (!existsSync(this.storePath)) {
      logger.info(SCOPE, "No tickets.json found, starting fresh");
      this.store = { nextNumber: 1, tickets: [] };
      this.rebuildIndex();
      return;
    }

    try {
      const raw = await readFile(this.storePath, "utf-8");
      this.store = JSON.parse(raw) as TicketStore;
      this.rebuildIndex();
      logger.info(SCOPE, `Loaded ${this.store.tickets.length} tickets`);
    } catch (err) {
      logger.error(SCOPE, "Failed to load tickets.json", err);
      this.store = { nextNumber: 1, tickets: [] };
      this.rebuildIndex();
    }
  }

  getAll(): Ticket[] {
    return this.store.tickets;
  }

  getById(id: string): Ticket | undefined {
    return this.index.get(id);
  }

  getByNumber(number: number): Ticket | undefined {
    return this.store.tickets.find((t) => t.number === number);
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

  create(params: {
    title: string;
    description?: string;
    priority?: Ticket["priority"];
    createdBy: string;
    assignedTo?: string | null;
    parentTicketId?: string | null;
    tags?: string[];
  }): Ticket {
    const now = new Date().toISOString();
    const id = uuid();

    const createdEvent: TicketEvent = {
      id: uuid(),
      ticketId: id,
      type: "created",
      actor: params.createdBy,
      timestamp: now,
      data: {},
    };

    const ticket: Ticket = {
      id,
      number: this.store.nextNumber++,
      title: params.title,
      description: params.description ?? "",
      status: params.assignedTo ? "assigned" : "backlog",
      priority: params.priority ?? "normal",
      createdBy: params.createdBy,
      assignedTo: params.assignedTo ?? null,
      reviewedBy: null,
      testedBy: null,
      parentTicketId: params.parentTicketId ?? null,
      tags: params.tags ?? [],
      events: [createdEvent],
      createdAt: now,
      updatedAt: now,
      closedAt: null,
    };

    this.store.tickets.push(ticket);
    this.index.set(ticket.id, ticket);

    logger.info(SCOPE, `Created ticket #${ticket.number}: ${ticket.title}`);
    this.persist().catch((err) => logger.error(SCOPE, "Failed to persist", err));
    this.emit("ticket:created", ticket);
    return ticket;
  }

  updateStatus(ticketId: string, newStatus: TicketStatus, actor: string): Ticket | null {
    const ticket = this.index.get(ticketId);
    if (!ticket) {
      logger.warn(SCOPE, `Ticket not found: ${ticketId}`);
      return null;
    }

    const fromStatus = ticket.status;
    ticket.status = newStatus;
    ticket.updatedAt = new Date().toISOString();

    if (newStatus === "done" || newStatus === "failed") {
      ticket.closedAt = ticket.updatedAt;
    }

    const event = this.addEvent(ticket, "status_change", actor, {
      fromStatus,
      toStatus: newStatus,
    });

    this.persist().catch((err) => logger.error(SCOPE, "Failed to persist", err));
    this.emit("ticket:updated", { ticketId, changes: { status: newStatus } });
    this.emit("ticket:event", { ticketId, event });
    return ticket;
  }

  assign(ticketId: string, agentName: string, actor: string): Ticket | null {
    const ticket = this.index.get(ticketId);
    if (!ticket) {
      logger.warn(SCOPE, `Ticket not found: ${ticketId}`);
      return null;
    }

    const fromAgent = ticket.assignedTo ?? undefined;
    ticket.assignedTo = agentName;
    ticket.status = "assigned";
    ticket.updatedAt = new Date().toISOString();

    const event = this.addEvent(ticket, "assigned", actor, {
      fromAgent,
      toAgent: agentName,
    });

    this.persist().catch((err) => logger.error(SCOPE, "Failed to persist", err));
    this.emit("ticket:updated", { ticketId, changes: { assignedTo: agentName, status: "assigned" } });
    this.emit("ticket:event", { ticketId, event });
    return ticket;
  }

  addReview(ticketId: string, reviewer: string, result: "approved" | "changes_requested"): Ticket | null {
    const ticket = this.index.get(ticketId);
    if (!ticket) {
      logger.warn(SCOPE, `Ticket not found: ${ticketId}`);
      return null;
    }

    ticket.reviewedBy = reviewer;
    const newStatus: TicketStatus = result === "approved" ? "qa" : "in_progress";
    const fromStatus = ticket.status;
    ticket.status = newStatus;
    ticket.updatedAt = new Date().toISOString();

    const event = this.addEvent(ticket, "review_submitted", reviewer, {
      reviewResult: result,
      fromStatus,
      toStatus: newStatus,
    });

    this.persist().catch((err) => logger.error(SCOPE, "Failed to persist", err));
    this.emit("ticket:updated", { ticketId, changes: { reviewedBy: reviewer, status: newStatus } });
    this.emit("ticket:event", { ticketId, event });
    return ticket;
  }

  addQaResult(ticketId: string, tester: string, result: "passed" | "failed", reason?: string): Ticket | null {
    const ticket = this.index.get(ticketId);
    if (!ticket) {
      logger.warn(SCOPE, `Ticket not found: ${ticketId}`);
      return null;
    }

    ticket.testedBy = tester;
    const newStatus: TicketStatus = result === "passed" ? "done" : "failed";
    const fromStatus = ticket.status;
    ticket.status = newStatus;
    ticket.updatedAt = new Date().toISOString();

    if (newStatus === "done" || newStatus === "failed") {
      ticket.closedAt = ticket.updatedAt;
    }

    const event = this.addEvent(ticket, "qa_result", tester, {
      qaResult: result,
      fromStatus,
      toStatus: newStatus,
      reason,
    });

    this.persist().catch((err) => logger.error(SCOPE, "Failed to persist", err));
    this.emit("ticket:updated", { ticketId, changes: { testedBy: tester, status: newStatus } });
    this.emit("ticket:event", { ticketId, event });
    return ticket;
  }

  addComment(ticketId: string, actor: string, comment: string): Ticket | null {
    const ticket = this.index.get(ticketId);
    if (!ticket) {
      logger.warn(SCOPE, `Ticket not found: ${ticketId}`);
      return null;
    }

    ticket.updatedAt = new Date().toISOString();
    const event = this.addEvent(ticket, "comment", actor, { comment });

    this.persist().catch((err) => logger.error(SCOPE, "Failed to persist", err));
    this.emit("ticket:updated", { ticketId, changes: { updatedAt: ticket.updatedAt } });
    this.emit("ticket:event", { ticketId, event });
    return ticket;
  }

  async addCommit(ticketId: string, actor: string, sha: string, files: string[], commitMessage: string): Promise<TicketEvent | null> {
    const ticket = this.index.get(ticketId);
    if (!ticket) return null;
    ticket.updatedAt = new Date().toISOString();
    const event = this.addEvent(ticket, "commit", actor, { commit: { sha, files, message: commitMessage } });
    await this.persist();
    this.emit("ticket:event", { ticketId, event });
    return event;
  }

  updatePriority(ticketId: string, priority: Ticket["priority"], actor: string): Ticket | null {
    const ticket = this.index.get(ticketId);
    if (!ticket) {
      logger.warn(SCOPE, `Ticket not found: ${ticketId}`);
      return null;
    }

    ticket.priority = priority;
    ticket.updatedAt = new Date().toISOString();

    const event = this.addEvent(ticket, "comment", actor, {
      comment: `Priority changed to ${priority}`,
    });

    this.persist().catch((err) => logger.error(SCOPE, "Failed to persist", err));
    this.emit("ticket:updated", { ticketId, changes: { priority } });
    this.emit("ticket:event", { ticketId, event });
    return ticket;
  }

  private addEvent(ticket: Ticket, type: TicketEvent["type"], actor: string, data: TicketEventData): TicketEvent {
    const event: TicketEvent = {
      id: uuid(),
      ticketId: ticket.id,
      type,
      actor,
      timestamp: new Date().toISOString(),
      data,
    };
    ticket.events.push(event);
    return event;
  }

  private rebuildIndex(): void {
    this.index.clear();
    for (const ticket of this.store.tickets) {
      this.index.set(ticket.id, ticket);
    }
  }

  private async persist(): Promise<void> {
    const dir = this.storePath.replace(/\/tickets\.json$/, "");
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    await writeFile(this.storePath, JSON.stringify(this.store, null, 2), "utf-8");
  }
}
