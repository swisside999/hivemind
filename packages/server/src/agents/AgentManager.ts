import { resolve } from "node:path";
import { logger } from "../utils/logger.js";
import { AgentProcess } from "./AgentProcess.js";
import { loadAllAgentDefinitions } from "./AgentDefinition.js";
import type { AgentConfig, AgentState } from "./types.js";

const SCOPE = "AgentManager";

export class AgentManager {
  private agents = new Map<string, AgentProcess>();
  private configs = new Map<string, AgentConfig>();
  private workingDirectory: string;

  constructor(workingDirectory: string) {
    this.workingDirectory = workingDirectory;
  }

  async loadAgents(agentDir: string): Promise<void> {
    const definitions = await loadAllAgentDefinitions(agentDir);
    for (const config of definitions) {
      this.configs.set(config.name, config);
    }
    logger.info(SCOPE, `Loaded ${definitions.length} agent configs`);
  }

  getConfig(name: string): AgentConfig | undefined {
    return this.configs.get(name);
  }

  getAllConfigs(): AgentConfig[] {
    return Array.from(this.configs.values());
  }

  getAgent(name: string): AgentProcess | undefined {
    return this.agents.get(name);
  }

  getOrCreateAgent(name: string): AgentProcess {
    const existing = this.agents.get(name);
    if (existing) return existing;

    const config = this.configs.get(name);
    if (!config) {
      throw new Error(`No agent config found for: ${name}`);
    }

    const agent = new AgentProcess(config, this.workingDirectory);
    this.agents.set(name, agent);
    logger.info(SCOPE, `Created agent process: ${name}`);
    return agent;
  }

  createAgent(name: string): AgentProcess {
    const config = this.configs.get(name);
    if (!config) {
      throw new Error(`No agent config found for: ${name}`);
    }
    const agent = new AgentProcess(config, this.workingDirectory);
    this.agents.set(name, agent);
    return agent;
  }

  removeAgent(name: string): void {
    const agent = this.agents.get(name);
    if (agent) {
      agent.stop();
    }
    this.agents.delete(name);
  }

  stopAgent(name: string): void {
    const agent = this.agents.get(name);
    if (agent) {
      agent.stop();
      this.agents.delete(name);
      logger.info(SCOPE, `Stopped agent: ${name}`);
    }
  }

  stopAll(): void {
    for (const [name, agent] of this.agents) {
      agent.stop();
      logger.info(SCOPE, `Stopped agent: ${name}`);
    }
    this.agents.clear();
  }

  getAgentStates(): AgentState[] {
    return this.getAllConfigs().map((config) => {
      const agent = this.agents.get(config.name);
      return {
        name: config.name,
        status: agent?.getStatus() ?? "idle",
        currentTask: null,
        currentThought: null,
        lastActivity: new Date().toISOString(),
      };
    });
  }
}
