import { useAppStore } from "../../stores/appStore.js";
import type { Ticket } from "../../types/index.js";

const PRIORITY_COLORS: Record<Ticket["priority"], string> = {
  low: "#4ade80",
  normal: "#60a5fa",
  high: "#fbbf24",
  critical: "#f87171",
};

interface Props {
  ticket: Ticket;
}

export function TicketCard({ ticket }: Props) {
  const setSelectedTicket = useAppStore((s) => s.setSelectedTicket);
  const setShowTicketDetail = useAppStore((s) => s.setShowTicketDetail);
  const tickets = useAppStore((s) => s.tickets);

  const subtasks = tickets.filter((t) => t.parentTicketId === ticket.id);
  const doneSubtasks = subtasks.filter((t) => t.status === "done").length;
  const failed = ticket.status === "failed";

  function handleClick() {
    setSelectedTicket(ticket.id);
    setShowTicketDetail(true);
  }

  const priorityColor = PRIORITY_COLORS[ticket.priority];

  return (
    <button
      type="button"
      onClick={handleClick}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        background: "#0f0f23",
        border: "2px solid #2a2a4e",
        borderTopColor: "#3a3a5e",
        borderLeftColor: "#3a3a5e",
        borderBottomColor: "#12122a",
        borderRightColor: "#12122a",
        padding: "8px 10px",
        cursor: "pointer",
        fontFamily: "ui-monospace, monospace",
        color: "#d1d5db",
        marginBottom: 6,
        opacity: failed ? 0.65 : 1,
      }}
      className="ticket-card-btn"
    >
      {/* Top row: id + priority dot */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: priorityColor,
            flexShrink: 0,
            display: "inline-block",
          }}
        />
        <span style={{ fontSize: 10, color: "#6b7280", letterSpacing: "0.05em" }}>
          HM-{ticket.number}
        </span>
        {failed && (
          <span style={{ marginLeft: "auto", fontSize: 12 }} title="Failed">
            💀
          </span>
        )}
      </div>

      {/* Title */}
      <div
        style={{
          fontSize: 12,
          color: "#e5e7eb",
          marginBottom: 6,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {ticket.title}
      </div>

      {/* Bottom row: assignee + subtask count */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
        {ticket.assignedTo ? (
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#818cf8",
                display: "inline-block",
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 10, color: "#9ca3af" }}>{ticket.assignedTo}</span>
          </div>
        ) : (
          <span style={{ fontSize: 10, color: "#4b5563" }}>unassigned</span>
        )}

        {subtasks.length > 0 && (
          <span style={{ fontSize: 10, color: "#6b7280" }}>
            [{doneSubtasks}/{subtasks.length}]
          </span>
        )}
      </div>
    </button>
  );
}
