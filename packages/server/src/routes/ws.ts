import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "node:http";
import type { Orchestrator } from "../orchestrator/Orchestrator.js";
import type { TicketManager } from "../tickets/TicketManager.js";
import { logger } from "../utils/logger.js";
import { getRuntimeSettings } from "./api.js";

const SCOPE = "WebSocket";

interface WsMessage {
  type: string;
  payload: unknown;
}

export function createWebSocketServer(server: Server, orchestrator: Orchestrator, ticketManager?: TicketManager | null): WebSocketServer {
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

  if (ticketManager) {
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

  wss.on("connection", (ws) => {
    logger.info(SCOPE, "Client connected");

    const state = orchestrator.getState();
    ws.send(JSON.stringify({ type: "state:full", payload: state }));

    const configs = orchestrator.agentManager.getAllConfigs();
    ws.send(JSON.stringify({ type: "agents:configs", payload: configs }));

    if (ticketManager) {
      ws.send(JSON.stringify({ type: "tickets:all", payload: ticketManager.getAll() }));
    }

    ws.send(JSON.stringify({ type: "usage:stats", payload: orchestrator.getUsageStats() }));

    ws.send(JSON.stringify({ type: "settings:current", payload: getRuntimeSettings() }));

    ws.on("message", async (data) => {
      try {
        const parsed = JSON.parse(data.toString()) as WsMessage;

        if (parsed.type === "message:send") {
          const { agent, message } = parsed.payload as { agent: string; message: string };
          const response = await orchestrator.sendUserMessage(agent, message);
          ws.send(JSON.stringify({ type: "message:response", payload: { agent, response } }));
        } else if (parsed.type === "escalation:resolve") {
          const { id, resolution } = parsed.payload as { id: string; resolution: string };
          orchestrator.resolveEscalation(id, resolution);
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
  return wss;
}
