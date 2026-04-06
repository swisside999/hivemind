import { useEffect, useRef, useCallback } from "react";
import { useAppStore } from "../stores/appStore.js";
import type { AgentConfig, AgentState, AgentMessage, EscalationRequest, Ticket, TicketEvent } from "../types/index.js";

const WS_URL = import.meta.env.DEV
  ? `ws://${window.location.hostname}:3100`
  : `ws://${window.location.host}`;

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const reconnectDelay = useRef(3000);

  const {
    setConnected,
    setAgentConfigs,
    updateAgentState,
    addEscalation,
    removeEscalation,
    addConnection,
    addChatMessage,
    setIsThinking,
    setTickets,
    addTicket,
    updateTicket,
    addTicketEvent,
    setSharedMemory,
    setUsageStats,
    appendStreamingText,
    clearStreamingText,
    addFeedMessage,
  } = useAppStore();

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      reconnectDelay.current = 3000;
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as { type: string; payload: unknown };
        handleMessage(data.type, data.payload);
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      setConnected(false);
      reconnectTimer.current = setTimeout(connect, reconnectDelay.current);
      reconnectDelay.current = Math.min(reconnectDelay.current * 2, 60000);
    };

    ws.onerror = () => {
      ws.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMessage = useCallback((type: string, payload: unknown) => {
    switch (type) {
      case "agents:configs": {
        setAgentConfigs(payload as AgentConfig[]);
        break;
      }
      case "state:full": {
        const state = payload as { agents: AgentState[]; pendingEscalations: EscalationRequest[] };
        for (const agent of state.agents) {
          updateAgentState(agent.name, agent);
        }
        for (const esc of state.pendingEscalations) {
          addEscalation(esc);
        }
        break;
      }
      case "agent:thought": {
        const { agent, thought } = payload as { agent: string; thought: string };
        updateAgentState(agent, { currentThought: thought, lastActivity: new Date().toISOString() });
        break;
      }
      case "agent:status": {
        const { agent, status } = payload as { agent: string; status: AgentState["status"] };
        updateAgentState(agent, { status, lastActivity: new Date().toISOString() });
        break;
      }
      case "agent:chunk": {
        const { agent, delta } = payload as { agent: string; delta: string };
        appendStreamingText(agent, delta);
        break;
      }
      case "message:routed": {
        const msg = payload as AgentMessage;
        addConnection({ from: msg.from, to: msg.to, type: msg.type });
        addFeedMessage(msg);
        setTimeout(() => {
          useAppStore.getState().removeConnection(msg.from, msg.to);
        }, 3000);
        break;
      }
      case "message:response": {
        const { agent, response } = payload as { agent: string; response: string };
        setIsThinking(false);
        clearStreamingText(agent);
        addChatMessage({
          id: crypto.randomUUID(),
          role: "agent",
          agent,
          content: response,
          timestamp: new Date().toISOString(),
        });
        break;
      }
      case "agent:commit": {
        const { agent, sha, files, message: commitMsg } = payload as { agent: string; sha: string; files: string[]; message: string };
        addFeedMessage({
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          from: agent,
          to: "broadcast",
          type: "status_update",
          priority: "normal",
          subject: `Committed ${sha}`,
          body: `${commitMsg}\n\nFiles: ${files.join(", ")}`,
          requiresResponse: false,
        });
        break;
      }
      case "escalation:new": {
        addEscalation(payload as EscalationRequest);
        break;
      }
      case "escalation:resolved": {
        const esc = payload as EscalationRequest;
        removeEscalation(esc.id);
        break;
      }
      case "agent:error": {
        const { agent, error } = payload as { agent: string; error: string };
        setIsThinking(false);
        updateAgentState(agent, { status: "error", currentThought: `Error: ${error}` });
        break;
      }
      case "tickets:all": {
        setTickets(payload as Ticket[]);
        break;
      }
      case "ticket:created": {
        addTicket(payload as Ticket);
        break;
      }
      case "ticket:updated": {
        const { ticketId, changes } = payload as { ticketId: string; changes: Partial<Ticket> };
        updateTicket(ticketId, changes);
        break;
      }
      case "ticket:event": {
        const { ticketId, event } = payload as { ticketId: string; event: TicketEvent };
        addTicketEvent(ticketId, event);
        break;
      }
      case "usage:stats": {
        setUsageStats(payload as Record<string, { invocations: number; lastInvoked: string }>);
        break;
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendMessage = useCallback((agent: string, message: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "message:send",
        payload: { agent, message },
      }));
    }
  }, []);

  const resolveEscalation = useCallback((id: string, resolution: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "escalation:resolve",
        payload: { id, resolution },
      }));
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { sendMessage, resolveEscalation };
}
