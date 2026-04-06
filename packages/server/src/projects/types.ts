export interface ProjectConfig {
  name: string;
  displayName: string;
  createdAt: string;
  workingDirectory: string;
  agents: string[];
}

export interface ProjectSummary {
  name: string;
  displayName: string;
  createdAt: string;
  agentCount: number;
  activeAgents: number;
}
