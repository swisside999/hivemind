import { useMemo } from "react";
import { useAppStore } from "../stores/appStore.js";
import type { AgentConfig, AgentState } from "../types/index.js";

export interface AgentNode {
  config: AgentConfig;
  state: AgentState;
  x: number;
  y: number;
}

const DEFAULT_STATE: AgentState = {
  name: "",
  status: "idle",
  currentTask: null,
  currentThought: null,
  lastActivity: new Date().toISOString(),
};

/** Builds the positioned agent nodes for the FloorView org chart layout */
export function useAgentNodes(): AgentNode[] {
  const configs = useAppStore((s) => s.agentConfigs);
  const states = useAppStore((s) => s.agentStates);

  return useMemo(() => {
    if (configs.length === 0) return [];

    const byName = new Map(configs.map((c) => [c.name, c]));
    const positioned: AgentNode[] = [];

    // Tier 0: CEO (top center)
    // Tier 1: C-suite
    // Tier 2: Individual contributors

    const tiers: AgentConfig[][] = [[], [], []];

    for (const config of configs) {
      if (config.reportsTo === null) {
        tiers[0].push(config);
      } else if (byName.get(config.reportsTo)?.reportsTo === null) {
        tiers[1].push(config);
      } else {
        tiers[2].push(config);
      }
    }

    const CANVAS_W = 1000;
    const TIER_Y = [80, 250, 420];

    for (let tier = 0; tier < tiers.length; tier++) {
      const agents = tiers[tier];
      const spacing = CANVAS_W / (agents.length + 1);
      for (let i = 0; i < agents.length; i++) {
        const config = agents[i];
        positioned.push({
          config,
          state: states.get(config.name) ?? { ...DEFAULT_STATE, name: config.name },
          x: spacing * (i + 1),
          y: TIER_Y[tier],
        });
      }
    }

    return positioned;
  }, [configs, states]);
}

export function useAgentConfig(name: string): AgentConfig | undefined {
  return useAppStore((s) => s.agentConfigs.find((c) => c.name === name));
}
