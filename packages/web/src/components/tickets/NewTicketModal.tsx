import { useState } from "react";
import { useAppStore } from "../../stores/appStore.js";
import type { Ticket } from "../../types/index.js";

const INPUT_STYLE: React.CSSProperties = {
  width: "100%",
  background: "#0a0a1a",
  border: "2px solid #2a2a4e",
  borderTopColor: "#12122a",
  borderLeftColor: "#12122a",
  borderBottomColor: "#3a3a5e",
  borderRightColor: "#3a3a5e",
  color: "#d1d5db",
  fontFamily: "ui-monospace, monospace",
  fontSize: 12,
  padding: "6px 8px",
  outline: "none",
  boxSizing: "border-box",
};

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 10,
  color: "#4b5563",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginBottom: 4,
  display: "block",
};

export function NewTicketModal() {
  const setShowNewTicket = useAppStore((s) => s.setShowNewTicket);
  const agentConfigs = useAppStore((s) => s.agentConfigs);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Ticket["priority"]>("normal");
  const [assignTo, setAssignTo] = useState("ceo");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleClose() {
    setShowNewTicket(false);
  }

  async function handleSubmit() {
    if (!title.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          priority,
          assignTo: assignTo || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        setError(body || "Request failed");
        return;
      }
      setShowNewTicket(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  // Default assignee to first agent (CEO) if configs loaded
  const agentOptions: Array<{ name: string; displayName: string }> =
    agentConfigs.length > 0
      ? agentConfigs.map((a) => ({ name: a.name, displayName: a.displayName }))
      : [{ name: "ceo", displayName: "CEO" }];

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
          maxWidth: 480,
          boxShadow: "8px 8px 0 rgba(0,0,0,0.5)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 14px",
            borderBottom: "1px solid #2a2a4e",
          }}
        >
          <span style={{ fontSize: 11, color: "#8b8bbd", letterSpacing: "0.1em", textTransform: "uppercase" }}>
            New Ticket
          </span>
          <button
            type="button"
            onClick={handleClose}
            style={{
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

        {/* Form */}
        <div style={{ padding: "14px" }}>
          {error && (
            <div
              style={{
                marginBottom: 12,
                padding: "6px 10px",
                background: "#1a0a0a",
                border: "1px solid #f87171",
                color: "#f87171",
                fontSize: 11,
              }}
            >
              {error}
            </div>
          )}

          {/* Title */}
          <div style={{ marginBottom: 12 }}>
            <label style={LABEL_STYLE}>Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ticket title..."
              style={INPUT_STYLE}
              autoFocus
            />
          </div>

          {/* Description */}
          <div style={{ marginBottom: 12 }}>
            <label style={LABEL_STYLE}>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the task..."
              rows={4}
              style={{
                ...INPUT_STYLE,
                resize: "vertical",
                minHeight: 80,
              }}
            />
          </div>

          {/* Priority */}
          <div style={{ marginBottom: 12 }}>
            <label style={LABEL_STYLE}>Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as Ticket["priority"])}
              style={{
                ...INPUT_STYLE,
                cursor: "pointer",
              }}
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>

          {/* Assign to */}
          <div style={{ marginBottom: 16 }}>
            <label style={LABEL_STYLE}>Assign To</label>
            <select
              value={assignTo}
              onChange={(e) => setAssignTo(e.target.value)}
              style={{
                ...INPUT_STYLE,
                cursor: "pointer",
              }}
            >
              {agentOptions.map((a) => (
                <option key={a.name} value={a.name}>
                  {a.displayName}
                </option>
              ))}
            </select>
          </div>

          {/* Buttons */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button
              type="button"
              onClick={handleClose}
              style={{
                background: "transparent",
                border: "2px solid #2a2a4e",
                borderTopColor: "#3a3a5e",
                borderLeftColor: "#3a3a5e",
                borderBottomColor: "#12122a",
                borderRightColor: "#12122a",
                color: "#6b7280",
                fontFamily: "ui-monospace, monospace",
                fontSize: 11,
                padding: "5px 14px",
                cursor: "pointer",
                letterSpacing: "0.05em",
              }}
            >
              CANCEL
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={submitting || !title.trim()}
              style={{
                background: "#1a1a2e",
                border: "2px solid #2a2a4e",
                borderTopColor: "#3a3a5e",
                borderLeftColor: "#3a3a5e",
                borderBottomColor: "#12122a",
                borderRightColor: "#12122a",
                color: submitting || !title.trim() ? "#4b5563" : "#818cf8",
                fontFamily: "ui-monospace, monospace",
                fontSize: 11,
                padding: "5px 14px",
                cursor: submitting || !title.trim() ? "default" : "pointer",
                letterSpacing: "0.05em",
              }}
            >
              {submitting ? "CREATING..." : "CREATE"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
