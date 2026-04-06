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
