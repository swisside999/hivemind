import { useRef, useEffect, useState, useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { useAppStore } from "../../stores/appStore.js";
import type { AgentMessage, MessageType } from "../../types/index.js";

function typeBadge(type: MessageType, subject: string): { label: string; color: string } {
  // Special commit badge
  if (subject.startsWith("Committed ")) {
    return { label: "COMMIT", color: "#4ade80" };
  }
  switch (type) {
    case "task_assignment":
      return { label: "TASK", color: "#3b82f6" };
    case "review_request":
    case "review_result":
      return { label: "REVIEW", color: "#f59e0b" };
    case "task_complete":
      return { label: "DONE", color: "#4ade80" };
    case "escalation":
      return { label: "ESCALATION", color: "#ef4444" };
    case "question":
      return { label: "QUESTION", color: "#a78bfa" };
    case "decision":
      return { label: "DECISION", color: "#8b5cf6" };
    default:
      return { label: type.replace("_", " ").toUpperCase(), color: "#6b7280" };
  }
}

function formatTime(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return ts;
  }
}

interface FeedEntryProps {
  message: AgentMessage;
  agentColor: (name: string) => string;
}

function FeedEntry({ message, agentColor }: FeedEntryProps) {
  const [expanded, setExpanded] = useState(false);
  const badge = typeBadge(message.type, message.subject);
  const preview = message.body.length > 120 ? message.body.slice(0, 120) + "…" : message.body;
  const fromColor = agentColor(message.from);

  const expandedHtml = useMemo(() => {
    if (!expanded) return "";
    return DOMPurify.sanitize(marked.parse(message.body, { async: false, breaks: true, gfm: true }) as string);
  }, [expanded, message.body]);

  return (
    <div
      style={{
        fontFamily: "ui-monospace, monospace",
        fontSize: 11,
        borderBottom: "1px solid #1a1a2e",
        padding: "8px 12px",
      }}
    >
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 3 }}>
        {/* Sender */}
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span
            style={{
              display: "inline-block",
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: fromColor,
              flexShrink: 0,
            }}
          />
          <span style={{ fontWeight: "bold", color: fromColor }}>{message.from}</span>
        </span>

        <span style={{ color: "#4b5563" }}>→</span>

        {/* Receiver */}
        <span style={{ color: agentColor(message.to), fontWeight: "bold" }}>{message.to}</span>

        {/* Type badge */}
        <span
          style={{
            fontSize: 9,
            color: badge.color,
            border: `1px solid ${badge.color}`,
            borderRadius: 2,
            padding: "1px 4px",
            letterSpacing: "0.05em",
            fontWeight: "bold",
          }}
        >
          {badge.label}
        </span>

        {/* Timestamp */}
        <span style={{ marginLeft: "auto", fontSize: 10, color: "#374151", flexShrink: 0 }}>
          {formatTime(message.timestamp)}
        </span>
      </div>

      {/* Subject */}
      <div style={{ fontWeight: "bold", color: "#d1d5db", marginBottom: 2 }}>
        {message.subject}
      </div>

      {/* Body preview / expanded */}
      {expanded ? (
        <>
          <div
            className="chat-markdown"
            style={{ color: "#9ca3af", lineHeight: 1.5 }}
            dangerouslySetInnerHTML={{ __html: expandedHtml }}
          />
          <button
            onClick={() => setExpanded(false)}
            style={{
              marginTop: 4,
              fontSize: 10,
              color: "#6366f1",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
              fontFamily: "ui-monospace, monospace",
            }}
          >
            show less
          </button>
        </>
      ) : (
        <div style={{ color: "#6b7280", lineHeight: 1.4 }}>
          {preview}
          {message.body.length > 120 && (
            <button
              onClick={() => setExpanded(true)}
              style={{
                marginLeft: 4,
                fontSize: 10,
                color: "#6366f1",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
                fontFamily: "ui-monospace, monospace",
              }}
            >
              show more
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function CompanyFeed() {
  const feedMessages = useAppStore((s) => s.feedMessages);
  const agentConfigs = useAppStore((s) => s.agentConfigs);
  const bottomRef = useRef<HTMLDivElement>(null);

  const agentColor = (name: string): string => {
    const cfg = agentConfigs.find((c) => c.name === name);
    return cfg?.color ?? "#818cf8";
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [feedMessages]);

  if (feedMessages.length === 0) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          textAlign: "center",
          fontFamily: "ui-monospace, monospace",
          fontSize: 12,
          color: "#374151",
        }}
      >
        Agent conversations will appear here in real-time
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      {feedMessages.map((msg) => (
        <FeedEntry key={msg.id} message={msg} agentColor={agentColor} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
