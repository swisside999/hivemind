export type AgentRole =
  | "ceo"
  | "cto"
  | "cpo"
  | "coo"
  | "senior-dev"
  | "junior-dev"
  | "code-reviewer"
  | "designer"
  | "design-reviewer"
  | "devops"
  | "qa"
  | "custom";

export type AgentModel = "sonnet" | "opus" | "haiku";

export type AgentStatus = "idle" | "working" | "waiting" | "error";

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
