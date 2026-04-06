export type AgentRole =
  | "ceo" | "cto" | "cpo" | "coo"
  | "senior-dev" | "junior-dev" | "code-reviewer"
  | "designer" | "design-reviewer" | "devops" | "qa" | "custom";

export type AgentModel = "sonnet" | "opus" | "haiku";
export type AgentStatus = "idle" | "working" | "waiting" | "error";

export type MessageType =
  | "task_assignment" | "task_update" | "task_complete"
  | "review_request" | "review_result" | "escalation"
  | "question" | "decision" | "status_update" | "feedback";

export type MessagePriority = "low" | "normal" | "high" | "critical";

export interface AgentConfig {
  name: string;
  displayName: string;
  description: string;
  role: AgentRole;
  color: string;
  iconProps: string[];
  reportsTo: string | null;
  directReports: string[];
  authorityLevel: number;
  canEscalateToUser: boolean;
  model: AgentModel;
  systemPrompt: string;
}

export interface AgentState {
  name: string;
  status: AgentStatus;
  currentTask: string | null;
  currentThought: string | null;
  lastActivity: string;
}

export interface AgentWithState extends AgentConfig {
  state: AgentState;
}

export interface AgentMessage {
  id: string;
  timestamp: string;
  from: string;
  to: string;
  type: MessageType;
  priority: MessagePriority;
  subject: string;
  body: string;
  context?: Record<string, unknown>;
  requiresResponse: boolean;
  parentMessageId?: string;
}

export interface EscalationRequest {
  id: string;
  from: string;
  message: AgentMessage;
  options: EscalationOption[];
  resolvedAt?: string;
  resolution?: string;
}

export interface EscalationOption {
  label: string;
  value: string;
  description?: string;
}

export interface ProjectSummary {
  name: string;
  displayName: string;
  createdAt: string;
  agentCount: number;
  activeAgents: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "agent" | "system";
  agent?: string;
  content: string;
  timestamp: string;
}

export interface WsEvent {
  type: string;
  payload: unknown;
}

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
