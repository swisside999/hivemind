import { create } from "zustand";
import type {
  AgentConfig,
  AgentState,
  ChatMessage,
  EscalationRequest,
  ProjectSummary,
  AgentMessage,
} from "../types/index.js";

interface ActiveConnection {
  from: string;
  to: string;
  type: string;
}

interface AppState {
  // Projects
  projects: ProjectSummary[];
  activeProject: string | null;
  setProjects: (projects: ProjectSummary[]) => void;
  setActiveProject: (name: string | null) => void;

  // Agents
  agentConfigs: AgentConfig[];
  agentStates: Map<string, AgentState>;
  setAgentConfigs: (configs: AgentConfig[]) => void;
  updateAgentState: (name: string, update: Partial<AgentState>) => void;

  // Chat
  chatTarget: string;
  chatMessages: ChatMessage[];
  setChatTarget: (agent: string) => void;
  addChatMessage: (message: ChatMessage) => void;
  clearChat: () => void;

  // Escalations
  escalations: EscalationRequest[];
  addEscalation: (escalation: EscalationRequest) => void;
  removeEscalation: (id: string) => void;

  // Connections (active agent-to-agent communication lines)
  connections: ActiveConnection[];
  addConnection: (conn: ActiveConnection) => void;
  removeConnection: (from: string, to: string) => void;
  clearConnections: () => void;

  // UI state
  selectedAgent: string | null;
  showAgentDetail: boolean;
  showNewProject: boolean;
  sidebarOpen: boolean;
  setSelectedAgent: (name: string | null) => void;
  setShowAgentDetail: (show: boolean) => void;
  setShowNewProject: (show: boolean) => void;
  setSidebarOpen: (open: boolean) => void;

  // WebSocket
  connected: boolean;
  setConnected: (connected: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  projects: [],
  activeProject: null,
  setProjects: (projects) => set({ projects }),
  setActiveProject: (name) => set({ activeProject: name }),

  agentConfigs: [],
  agentStates: new Map(),
  setAgentConfigs: (configs) => set({ agentConfigs: configs }),
  updateAgentState: (name, update) =>
    set((state) => {
      const newStates = new Map(state.agentStates);
      const existing = newStates.get(name) ?? {
        name,
        status: "idle" as const,
        currentTask: null,
        currentThought: null,
        lastActivity: new Date().toISOString(),
      };
      newStates.set(name, { ...existing, ...update });
      return { agentStates: newStates };
    }),

  chatTarget: "ceo",
  chatMessages: [],
  setChatTarget: (agent) => set({ chatTarget: agent, chatMessages: [] }),
  addChatMessage: (message) =>
    set((state) => ({ chatMessages: [...state.chatMessages, message] })),
  clearChat: () => set({ chatMessages: [] }),

  escalations: [],
  addEscalation: (escalation) =>
    set((state) => ({ escalations: [...state.escalations, escalation] })),
  removeEscalation: (id) =>
    set((state) => ({
      escalations: state.escalations.filter((e) => e.id !== id),
    })),

  connections: [],
  addConnection: (conn) =>
    set((state) => ({ connections: [...state.connections, conn] })),
  removeConnection: (from, to) =>
    set((state) => ({
      connections: state.connections.filter(
        (c) => !(c.from === from && c.to === to)
      ),
    })),
  clearConnections: () => set({ connections: [] }),

  selectedAgent: null,
  showAgentDetail: false,
  showNewProject: false,
  sidebarOpen: true,
  setSelectedAgent: (name) => set({ selectedAgent: name }),
  setShowAgentDetail: (show) => set({ showAgentDetail: show }),
  setShowNewProject: (show) => set({ showNewProject: show }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  connected: false,
  setConnected: (connected) => set({ connected }),
}));
