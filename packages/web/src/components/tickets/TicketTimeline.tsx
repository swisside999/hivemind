import type { TicketEvent } from "../../types/index.js";

interface Props {
  events: TicketEvent[];
}

const ACTOR_COLORS: Record<string, string> = {
  ceo: "#f59e0b",
  cto: "#3b82f6",
  cpo: "#8b5cf6",
  coo: "#10b981",
  "senior-dev": "#06b6d4",
  "junior-dev": "#84cc16",
  "code-reviewer": "#f97316",
  designer: "#ec4899",
  "design-reviewer": "#a78bfa",
  devops: "#14b8a6",
  qa: "#e11d48",
};

function actorColor(actor: string): string {
  return ACTOR_COLORS[actor] ?? "#818cf8";
}

function eventDescription(event: TicketEvent): string {
  switch (event.type) {
    case "created":
      return "created this ticket";
    case "assigned":
      return event.data.toAgent
        ? `assigned to ${event.data.toAgent}`
        : "assigned ticket";
    case "status_change":
      return `moved from ${event.data.fromStatus ?? "?"} → ${event.data.toStatus ?? "?"}`;
    case "comment":
      return "commented";
    case "review_submitted":
      return "submitted review";
    case "qa_result":
      return "submitted QA result";
    case "escalated":
      return event.data.reason ? `escalated: ${event.data.reason}` : "escalated ticket";
    case "closed":
      return "closed ticket";
    default:
      return event.type;
  }
}

function badgeForEvent(event: TicketEvent): { label: string; color: string } | null {
  if (event.type === "review_submitted") {
    if (event.data.reviewResult === "approved") {
      return { label: "APPROVED", color: "#4ade80" };
    }
    if (event.data.reviewResult === "changes_requested") {
      return { label: "CHANGES REQUESTED", color: "#fbbf24" };
    }
  }
  if (event.type === "qa_result") {
    if (event.data.qaResult === "passed") {
      return { label: "PASSED", color: "#4ade80" };
    }
    if (event.data.qaResult === "failed") {
      return { label: "FAILED", color: "#f87171" };
    }
  }
  return null;
}

function formatTime(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return ts;
  }
}

export function TicketTimeline({ events }: Props) {
  if (events.length === 0) {
    return (
      <div style={{ fontSize: 11, color: "#4b5563", fontFamily: "ui-monospace, monospace", padding: "8px 0" }}>
        No events yet.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {events.map((event) => {
        const badge = badgeForEvent(event);
        const color = actorColor(event.actor);

        return (
          <div
            key={event.id}
            style={{
              display: "flex",
              gap: 8,
              fontFamily: "ui-monospace, monospace",
              fontSize: 12,
            }}
          >
            {/* Color dot */}
            <div style={{ paddingTop: 3, flexShrink: 0 }}>
              <span
                style={{
                  display: "inline-block",
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: color,
                }}
              />
            </div>

            {/* Content */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                <span style={{ fontWeight: "bold", color: color }}>{event.actor}</span>
                <span style={{ color: "#9ca3af" }}>{eventDescription(event)}</span>
                {badge && (
                  <span
                    style={{
                      fontSize: 10,
                      color: badge.color,
                      border: `1px solid ${badge.color}`,
                      borderRadius: 2,
                      padding: "1px 5px",
                      letterSpacing: "0.05em",
                      fontWeight: "bold",
                    }}
                  >
                    {badge.label}
                  </span>
                )}
                <span style={{ marginLeft: "auto", fontSize: 10, color: "#4b5563", flexShrink: 0 }}>
                  {formatTime(event.timestamp)}
                </span>
              </div>

              {/* Comment body */}
              {event.type === "comment" && event.data.comment && (
                <div
                  style={{
                    marginTop: 4,
                    padding: "6px 8px",
                    background: "#0a0a1a",
                    border: "1px solid #1a1a2e",
                    color: "#d1d5db",
                    fontSize: 12,
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {event.data.comment}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
