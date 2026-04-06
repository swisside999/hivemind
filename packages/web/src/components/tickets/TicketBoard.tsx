import { useAppStore } from "../../stores/appStore.js";
import type { Ticket, TicketStatus } from "../../types/index.js";
import { TicketCard } from "./TicketCard.js";

interface Column {
  id: string;
  label: string;
  color: string;
  statuses: TicketStatus[];
}

const COLUMNS: Column[] = [
  { id: "backlog", label: "BACKLOG", color: "#6b7280", statuses: ["backlog", "assigned"] },
  { id: "in_progress", label: "IN PROGRESS", color: "#3b82f6", statuses: ["in_progress"] },
  { id: "review", label: "REVIEW", color: "#f59e0b", statuses: ["in_review"] },
  { id: "qa", label: "QA", color: "#a78bfa", statuses: ["qa"] },
  { id: "done", label: "DONE", color: "#4ade80", statuses: ["done", "failed"] },
];

export function TicketBoard() {
  const tickets = useAppStore((s) => s.tickets);
  const setShowNewTicket = useAppStore((s) => s.setShowNewTicket);

  // Only root tickets
  const rootTickets = tickets.filter((t) => t.parentTicketId === null);

  function ticketsForColumn(col: Column): Ticket[] {
    const list = rootTickets.filter((t) => col.statuses.includes(t.status));
    if (col.id === "done") {
      // Failed tickets sorted to bottom
      const normal = list.filter((t) => t.status !== "failed");
      const failed = list.filter((t) => t.status === "failed");
      return [...normal, ...failed];
    }
    return list;
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "#0a0a1a",
        fontFamily: "ui-monospace, monospace",
      }}
    >
      {/* Board header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 16px",
          borderBottom: "1px solid #1a1a2e",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: 12,
            color: "#8b8bbd",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          Ticket Board
        </span>
        <button
          type="button"
          onClick={() => setShowNewTicket(true)}
          style={{
            background: "#1a1a2e",
            border: "2px solid #2a2a4e",
            borderTopColor: "#3a3a5e",
            borderLeftColor: "#3a3a5e",
            borderBottomColor: "#12122a",
            borderRightColor: "#12122a",
            color: "#818cf8",
            fontFamily: "ui-monospace, monospace",
            fontSize: 11,
            padding: "4px 12px",
            cursor: "pointer",
            letterSpacing: "0.05em",
          }}
        >
          + NEW TICKET
        </button>
      </div>

      {/* Columns */}
      <div
        style={{
          display: "flex",
          flex: 1,
          gap: 0,
          overflowX: "auto",
          overflowY: "hidden",
        }}
      >
        {COLUMNS.map((col) => {
          const colTickets = ticketsForColumn(col);
          return (
            <div
              key={col.id}
              style={{
                flex: "1 0 200px",
                minWidth: 180,
                maxWidth: 280,
                display: "flex",
                flexDirection: "column",
                borderRight: "1px solid #1a1a2e",
              }}
            >
              {/* Column header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 10px",
                  borderBottom: "1px solid #1a1a2e",
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    display: "inline-block",
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: col.color,
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontSize: 10,
                    color: col.color,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    fontWeight: "bold",
                  }}
                >
                  {col.label}
                </span>
                <span
                  style={{
                    marginLeft: "auto",
                    fontSize: 10,
                    color: "#4b5563",
                    background: "#0f0f23",
                    border: "1px solid #1a1a2e",
                    borderRadius: 2,
                    padding: "1px 5px",
                  }}
                >
                  {colTickets.length}
                </span>
              </div>

              {/* Card list */}
              <div
                style={{
                  flex: 1,
                  overflowY: "auto",
                  padding: "8px 8px",
                }}
              >
                {colTickets.map((ticket) => (
                  <TicketCard key={ticket.id} ticket={ticket} />
                ))}
                {colTickets.length === 0 && (
                  <div style={{ fontSize: 10, color: "#1f2937", textAlign: "center", paddingTop: 16 }}>
                    —
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
