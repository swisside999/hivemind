import { useState } from "react";
import { useAppStore } from "../../stores/appStore.js";
import type { Ticket, TicketStatus } from "../../types/index.js";
import { TicketTimeline } from "./TicketTimeline.js";

const STATUS_COLORS: Record<TicketStatus, string> = {
  backlog: "#6b7280",
  assigned: "#818cf8",
  in_progress: "#3b82f6",
  in_review: "#f59e0b",
  qa: "#a78bfa",
  done: "#4ade80",
  failed: "#f87171",
};

const PRIORITY_COLORS: Record<Ticket["priority"], string> = {
  low: "#4ade80",
  normal: "#60a5fa",
  high: "#fbbf24",
  critical: "#f87171",
};

function AgentDot({ name, color }: { name: string; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <span
        style={{
          display: "inline-block",
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: color,
          flexShrink: 0,
        }}
      />
      <span style={{ fontSize: 11, color: "#d1d5db" }}>{name}</span>
    </div>
  );
}

export function TicketDetail() {
  const selectedTicket = useAppStore((s) => s.selectedTicket);
  const setShowTicketDetail = useAppStore((s) => s.setShowTicketDetail);
  const setSelectedTicket = useAppStore((s) => s.setSelectedTicket);
  const tickets = useAppStore((s) => s.tickets);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);

  const ticket = tickets.find((t) => t.id === selectedTicket);

  if (!ticket) return null;

  const subtasks = tickets.filter((t) => t.parentTicketId === ticket.id);
  const statusColor = STATUS_COLORS[ticket.status];
  const priorityColor = PRIORITY_COLORS[ticket.priority];

  function handleClose() {
    setShowTicketDetail(false);
    setSelectedTicket(null);
  }

  async function handleSendComment() {
    if (!comment.trim()) return;
    setSending(true);
    try {
      await fetch(`/api/tickets/${ticket!.id}/comment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: comment.trim() }),
      });
      setComment("");
    } catch {
      // ignore
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        zIndex: 2000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
      onClick={handleClose}
    >
      <div
        style={{
          background: "#1a1a2e",
          border: "2px solid #2a2a4e",
          borderTopColor: "#3a3a5e",
          borderLeftColor: "#3a3a5e",
          borderBottomColor: "#12122a",
          borderRightColor: "#12122a",
          fontFamily: "ui-monospace, monospace",
          color: "#d1d5db",
          width: "100%",
          maxWidth: 640,
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "8px 8px 0 rgba(0,0,0,0.5)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 14px",
            borderBottom: "1px solid #2a2a4e",
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 11, color: "#6b7280", letterSpacing: "0.05em" }}>
            HM-{ticket.number}
          </span>

          <span
            style={{
              fontSize: 10,
              color: statusColor,
              border: `1px solid ${statusColor}`,
              borderRadius: 2,
              padding: "1px 6px",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}
          >
            {ticket.status.replace(/_/g, " ")}
          </span>

          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: priorityColor,
              display: "inline-block",
              flexShrink: 0,
            }}
            title={ticket.priority}
          />

          <button
            type="button"
            onClick={handleClose}
            style={{
              marginLeft: "auto",
              background: "transparent",
              border: "none",
              color: "#6b7280",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 16,
              lineHeight: 1,
              padding: "2px 4px",
            }}
          >
            ✕
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "14px 14px 0 14px" }}>
          {/* Title */}
          <div style={{ fontSize: 15, fontWeight: "bold", color: "#e5e7eb", marginBottom: 8 }}>
            {ticket.title}
          </div>

          {/* Description */}
          {ticket.description && (
            <div
              style={{
                fontSize: 12,
                color: "#9ca3af",
                lineHeight: 1.6,
                marginBottom: 14,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {ticket.description}
            </div>
          )}

          {/* Agent row */}
          <div
            style={{
              display: "flex",
              gap: 20,
              marginBottom: 14,
              padding: "8px 10px",
              background: "#0f0f23",
              border: "1px solid #1a1a2e",
              flexWrap: "wrap",
            }}
          >
            <div>
              <div style={{ fontSize: 10, color: "#4b5563", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.05em" }}>Assignee</div>
              {ticket.assignedTo ? (
                <AgentDot name={ticket.assignedTo} color="#818cf8" />
              ) : (
                <span style={{ fontSize: 11, color: "#4b5563" }}>—</span>
              )}
            </div>
            <div>
              <div style={{ fontSize: 10, color: "#4b5563", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.05em" }}>Reviewer</div>
              {ticket.reviewedBy ? (
                <AgentDot name={ticket.reviewedBy} color="#f97316" />
              ) : (
                <span style={{ fontSize: 11, color: "#4b5563" }}>—</span>
              )}
            </div>
            <div>
              <div style={{ fontSize: 10, color: "#4b5563", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.05em" }}>QA</div>
              {ticket.testedBy ? (
                <AgentDot name={ticket.testedBy} color="#e11d48" />
              ) : (
                <span style={{ fontSize: 11, color: "#4b5563" }}>—</span>
              )}
            </div>
          </div>

          {/* Subtasks */}
          {subtasks.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div
                style={{
                  fontSize: 10,
                  color: "#4b5563",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  marginBottom: 6,
                }}
              >
                Subtasks ({subtasks.filter((s) => s.status === "done").length}/{subtasks.length})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {subtasks.map((sub) => (
                  <div
                    key={sub.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "4px 8px",
                      background: "#0a0a1a",
                      border: "1px solid #1a1a2e",
                      fontSize: 11,
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: STATUS_COLORS[sub.status],
                        flexShrink: 0,
                        display: "inline-block",
                      }}
                    />
                    <span style={{ color: "#9ca3af", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {sub.title}
                    </span>
                    <span style={{ fontSize: 10, color: "#4b5563" }}>HM-{sub.number}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Timeline */}
          <div style={{ marginBottom: 14 }}>
            <div
              style={{
                fontSize: 10,
                color: "#4b5563",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: 8,
              }}
            >
              Timeline
            </div>
            <TicketTimeline events={ticket.events} />
          </div>
        </div>

        {/* Comment input */}
        <div
          style={{
            borderTop: "1px solid #2a2a4e",
            padding: "10px 14px",
            display: "flex",
            gap: 8,
            flexShrink: 0,
          }}
        >
          <input
            type="text"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSendComment();
              }
            }}
            placeholder="Add a comment..."
            style={{
              flex: 1,
              background: "#0a0a1a",
              border: "2px solid #2a2a4e",
              borderTopColor: "#12122a",
              borderLeftColor: "#12122a",
              borderBottomColor: "#3a3a5e",
              borderRightColor: "#3a3a5e",
              color: "#d1d5db",
              fontFamily: "ui-monospace, monospace",
              fontSize: 12,
              padding: "5px 8px",
              outline: "none",
            }}
          />
          <button
            type="button"
            onClick={() => void handleSendComment()}
            disabled={sending || !comment.trim()}
            style={{
              background: "#1a1a2e",
              border: "2px solid #2a2a4e",
              borderTopColor: "#3a3a5e",
              borderLeftColor: "#3a3a5e",
              borderBottomColor: "#12122a",
              borderRightColor: "#12122a",
              color: sending || !comment.trim() ? "#4b5563" : "#818cf8",
              fontFamily: "ui-monospace, monospace",
              fontSize: 11,
              padding: "5px 12px",
              cursor: sending || !comment.trim() ? "default" : "pointer",
              letterSpacing: "0.05em",
            }}
          >
            SEND
          </button>
        </div>
      </div>
    </div>
  );
}
