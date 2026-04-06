export type MessageType =
  | "task_assignment"
  | "task_update"
  | "task_complete"
  | "review_request"
  | "review_result"
  | "escalation"
  | "question"
  | "decision"
  | "status_update"
  | "feedback";

export type MessagePriority = "low" | "normal" | "high" | "critical";

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
