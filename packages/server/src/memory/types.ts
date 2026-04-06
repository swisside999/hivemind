export interface AgentMemory {
  agentName: string;
  memory: string;
  currentTask: string;
  decisions: string;
}

export interface MemoryUpdate {
  agentName: string;
  field: "memory" | "currentTask" | "decisions";
  content: string;
  append?: boolean;
}
