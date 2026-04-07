import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "node:http";
import type { Orchestrator } from "../orchestrator/Orchestrator.js";
import type { TicketManager } from "../tickets/TicketManager.js";
import type { ProjectManager } from "../projects/ProjectManager.js";
import type { MemoryManager } from "../memory/MemoryManager.js";
import { logger } from "../utils/logger.js";
import { getRuntimeSettings } from "./api.js";

const SCOPE = "WebSocket";

interface WsDeps {
  orchestrator: Orchestrator;
  projectManager: ProjectManager;
  memoryManager: MemoryManager | null;
  ticketManager: TicketManager | null;
}

export interface WsManager {
  wss: WebSocketServer;
  broadcastFullState: () => void;
  rebindOrchestrator: (orchestrator: Orchestrator) => void;
  rebindTicketManager: (ticketManager: TicketManager | null) => void;
}

export function createWebSocketServer(server: Server, deps: WsDeps): WsManager {
  const wss = new WebSocketServer({
    server,
    verifyClient: ({ origin }: { origin?: string }) => {
      if (!origin) return true; // Allow non-browser clients
      return origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:");
    },
  });

  function broadcast(type: string, payload: unknown): void {
    const message = JSON.stringify({ type, payload });
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  function sendFullState(ws: WebSocket): void {
    const state = deps.orchestrator.getState();
    ws.send(JSON.stringify({ type: "state:full", payload: state }));

    const configs = deps.orchestrator.agentManager.getAllConfigs();
    ws.send(JSON.stringify({ type: "agents:configs", payload: configs }));

    if (deps.ticketManager) {
      ws.send(JSON.stringify({ type: "tickets:all", payload: deps.ticketManager.getAll() }));
    } else {
      ws.send(JSON.stringify({ type: "tickets:all", payload: [] }));
    }

    ws.send(JSON.stringify({ type: "usage:stats", payload: deps.orchestrator.getUsageStats() }));
    ws.send(JSON.stringify({ type: "metrics:all", payload: deps.orchestrator.getMetrics() }));
    ws.send(JSON.stringify({ type: "settings:current", payload: getRuntimeSettings() }));

    const activeProject = deps.projectManager.getActiveProject();
    ws.send(JSON.stringify({ type: "project:active", payload: { name: activeProject } }));
  }

  function broadcastFullState(): void {
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        sendFullState(client);
      }
    }
  }

  function bindOrchestratorEvents(orchestrator: Orchestrator): void {
    orchestrator.on("agentThought", (agentName, thought) => {
      broadcast("agent:thought", { agent: agentName, thought });
    });

    orchestrator.on("agentStatusChange", (agentName, status) => {
      broadcast("agent:status", { agent: agentName, status });
    });

    orchestrator.on("agentChunk", (agentName, delta) => {
      broadcast("agent:chunk", { agent: agentName, delta });
    });

    orchestrator.on("agentCommit", (agentName, commitData) => {
      broadcast("agent:commit", { agent: agentName, ...commitData });
    });

    orchestrator.on("modelSelection", (info) => {
      broadcast("agent:model", info);
    });

    orchestrator.on("messageRouted", (message) => {
      broadcast("message:routed", message);
    });

    orchestrator.on("escalation", (escalation) => {
      broadcast("escalation:new", escalation);
    });

    orchestrator.on("escalationResolved", (escalation) => {
      broadcast("escalation:resolved", escalation);
    });

    orchestrator.on("error", (agentName, error) => {
      broadcast("agent:error", { agent: agentName, error: error.message });
    });

    orchestrator.on("metricsUpdate", (metrics) => {
      broadcast("metrics:update", metrics);
    });
  }

  let currentTicketManager: TicketManager | null = null;

  function bindTicketManagerEvents(ticketManager: TicketManager): void {
    if (currentTicketManager && currentTicketManager !== ticketManager) {
      currentTicketManager.removeAllListeners("ticket:created");
      currentTicketManager.removeAllListeners("ticket:updated");
      currentTicketManager.removeAllListeners("ticket:event");
    }
    currentTicketManager = ticketManager;

    ticketManager.on("ticket:created", (ticket) => {
      broadcast("ticket:created", ticket);
    });

    ticketManager.on("ticket:updated", (data) => {
      broadcast("ticket:updated", data);
    });

    ticketManager.on("ticket:event", (data) => {
      broadcast("ticket:event", data);
    });
  }

  // Initial bindings
  bindOrchestratorEvents(deps.orchestrator);
  if (deps.ticketManager) {
    bindTicketManagerEvents(deps.ticketManager);
  }

  wss.on("connection", (ws) => {
    logger.info(SCOPE, "Client connected");

    sendFullState(ws);

    ws.on("message", async (data) => {
      try {
        const parsed = JSON.parse(data.toString()) as { type: string; payload: unknown };

        if (parsed.type === "message:send") {
          const { agent, message } = parsed.payload as { agent: string; message: string };
          const response = await deps.orchestrator.sendUserMessage(agent, message);
          ws.send(JSON.stringify({ type: "message:response", payload: { agent, response } }));
        } else if (parsed.type === "escalation:resolve") {
          const { id, resolution } = parsed.payload as { id: string; resolution: string };
          deps.orchestrator.resolveEscalation(id, resolution);
        }
      } catch (err) {
        logger.error(SCOPE, "Failed to handle WS message", err);
        ws.send(JSON.stringify({ type: "error", payload: { error: "Invalid message" } }));
      }
    });

    ws.on("close", () => {
      logger.info(SCOPE, "Client disconnected");
    });
  });

  logger.info(SCOPE, "WebSocket server attached to HTTP server");

  return {
    wss,
    broadcastFullState,
    rebindOrchestrator(orchestrator: Orchestrator) {
      bindOrchestratorEvents(orchestrator);
    },
    rebindTicketManager(ticketManager: TicketManager | null) {
      if (ticketManager) {
        bindTicketManagerEvents(ticketManager);
      } else if (currentTicketManager) {
        currentTicketManager.removeAllListeners("ticket:created");
        currentTicketManager.removeAllListeners("ticket:updated");
        currentTicketManager.removeAllListeners("ticket:event");
        currentTicketManager = null;
      }
    },
  };
}
