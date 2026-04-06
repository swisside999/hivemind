import { create } from "zustand";
import type {
  AgentConfig,
  AgentState,
  ChatMessage,
  EscalationRequest,
  ProjectSummary,
  AgentMessage,
  Ticket,
  TicketEvent,
} from "../types/index.js";

interface ActiveConnection {
  from: string;
  to: string;
  type: string;
}

export type MoodType = "neutral" | "happy" | "focused" | "tipsy" | "drunk" | "annoyed" | "praised";

export interface AgentMood {
  type: MoodType;
  beers: number;
  praises: number;
  pokes: number;
  lastInteraction: string;
}

export interface Reaction {
  id: string;
  agentName: string;
  emoji: string;
  x: number;
  y: number;
  createdAt: number;
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

  // Chat (per-agent persistence)
  chatTarget: string;
  chatHistories: Map<string, ChatMessage[]>;
  setChatTarget: (agent: string) => void;
  addChatMessage: (message: ChatMessage) => void;
  clearChat: () => void;

  // Agent moods (Tamagotchi)
  agentMoods: Map<string, AgentMood>;
  giveBeer: (agent: string) => void;
  praiseAgent: (agent: string) => void;
  pokeAgent: (agent: string) => void;

  // Floating reactions
  reactions: Reaction[];
  addReaction: (reaction: Reaction) => void;
  removeReaction: (id: string) => void;

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

  // Tickets
  activeView: "floor" | "tickets";
  tickets: Ticket[];
  selectedTicket: string | null;
  showTicketDetail: boolean;
  showNewTicket: boolean;
  setActiveView: (view: "floor" | "tickets") => void;
  setTickets: (tickets: Ticket[]) => void;
  addTicket: (ticket: Ticket) => void;
  updateTicket: (ticketId: string, changes: Partial<Ticket>) => void;
  addTicketEvent: (ticketId: string, event: TicketEvent) => void;
  setSelectedTicket: (id: string | null) => void;
  setShowTicketDetail: (show: boolean) => void;
  setShowNewTicket: (show: boolean) => void;
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
  chatHistories: new Map(),
  setChatTarget: (agent) => set({ chatTarget: agent }),
  addChatMessage: (message) =>
    set((state) => {
      const histories = new Map(state.chatHistories);
      const existing = histories.get(state.chatTarget) ?? [];
      histories.set(state.chatTarget, [...existing, message]);
      return { chatHistories: histories };
    }),
  clearChat: () =>
    set((state) => {
      const histories = new Map(state.chatHistories);
      histories.delete(state.chatTarget);
      return { chatHistories: histories };
    }),

  agentMoods: new Map(),
  giveBeer: (agent) =>
    set((state) => {
      const moods = new Map(state.agentMoods);
      const mood = moods.get(agent) ?? { type: "neutral" as MoodType, beers: 0, praises: 0, pokes: 0, lastInteraction: "" };
      mood.beers += 1;
      mood.lastInteraction = new Date().toISOString();
      mood.type = mood.beers >= 5 ? "drunk" : mood.beers >= 2 ? "tipsy" : "happy";
      moods.set(agent, { ...mood });
      return { agentMoods: moods };
    }),
  praiseAgent: (agent) =>
    set((state) => {
      const moods = new Map(state.agentMoods);
      const mood = moods.get(agent) ?? { type: "neutral" as MoodType, beers: 0, praises: 0, pokes: 0, lastInteraction: "" };
      mood.praises += 1;
      mood.lastInteraction = new Date().toISOString();
      mood.type = "praised";
      moods.set(agent, { ...mood });
      return { agentMoods: moods };
    }),
  pokeAgent: (agent) =>
    set((state) => {
      const moods = new Map(state.agentMoods);
      const mood = moods.get(agent) ?? { type: "neutral" as MoodType, beers: 0, praises: 0, pokes: 0, lastInteraction: "" };
      mood.pokes += 1;
      mood.lastInteraction = new Date().toISOString();
      mood.type = "annoyed";
      moods.set(agent, { ...mood });
      return { agentMoods: moods };
    }),

  reactions: [],
  addReaction: (reaction) =>
    set((state) => ({ reactions: [...state.reactions, reaction] })),
  removeReaction: (id) =>
    set((state) => ({ reactions: state.reactions.filter((r) => r.id !== id) })),

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

  activeView: "floor",
  tickets: [],
  selectedTicket: null,
  showTicketDetail: false,
  showNewTicket: false,
  setActiveView: (view) => set({ activeView: view }),
  setTickets: (tickets) => set({ tickets }),
  addTicket: (ticket) =>
    set((state) => ({ tickets: [...state.tickets, ticket] })),
  updateTicket: (ticketId, changes) =>
    set((state) => ({
      tickets: state.tickets.map((t) =>
        t.id === ticketId ? { ...t, ...changes, updatedAt: new Date().toISOString() } : t
      ),
    })),
  addTicketEvent: (ticketId, event) =>
    set((state) => ({
      tickets: state.tickets.map((t) =>
        t.id === ticketId ? { ...t, events: [...t.events, event] } : t
      ),
    })),
  setSelectedTicket: (id) => set({ selectedTicket: id }),
  setShowTicketDetail: (show) => set({ showTicketDetail: show }),
  setShowNewTicket: (show) => set({ showNewTicket: show }),
}));
