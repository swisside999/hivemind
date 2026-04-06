import { useState, useEffect, useMemo } from "react";
import { marked } from "marked";
import { useAppStore } from "../../stores/appStore.js";

export function WikiPanel() {
  const sharedMemory = useAppStore((s) => s.sharedMemory);
  const setSharedMemory = useAppStore((s) => s.setSharedMemory);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/shared-memory")
      .then((r) => r.json())
      .then((d) => setSharedMemory(d.content ?? ""))
      .catch(() => {});
  }, [setSharedMemory]);

  useEffect(() => {
    if (editing) setDraft(sharedMemory);
  }, [editing, sharedMemory]);

  const html = useMemo(() => {
    if (!sharedMemory) return "";
    return marked.parse(sharedMemory, { async: false }) as string;
  }, [sharedMemory]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch("/api/shared-memory", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: draft }),
      });
      setSharedMemory(draft);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#0a0a1a", fontFamily: "ui-monospace, monospace" }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 16px", borderBottom: "1px solid #1a1a2e",
      }}>
        <span style={{ fontSize: 12, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.1em" }}>
          Company Wiki
        </span>
        <div style={{ display: "flex", gap: 6 }}>
          {editing ? (
            <>
              <button
                onClick={() => setEditing(false)}
                style={{ background: "#1a1a2e", border: "1px solid #2a2a4e", padding: "4px 10px", color: "#9ca3af", fontFamily: "inherit", fontSize: 11, cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{ background: "#4F46E5", border: "none", padding: "4px 10px", color: "white", fontFamily: "inherit", fontSize: 11, cursor: "pointer", opacity: saving ? 0.5 : 1 }}
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </>
          ) : (
            <button
              onClick={() => setEditing(true)}
              style={{ background: "#1a1a2e", border: "1px solid #2a2a4e", padding: "4px 10px", color: "#9ca3af", fontFamily: "inherit", fontSize: 11, cursor: "pointer" }}
            >
              Edit
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "auto", padding: "16px" }}>
        {editing ? (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            style={{
              width: "100%", height: "100%", background: "#0f0f23",
              border: "1px solid #2a2a4e", padding: "12px",
              color: "#d1d5db", fontFamily: "ui-monospace, monospace",
              fontSize: 13, resize: "none", outline: "none",
            }}
          />
        ) : sharedMemory ? (
          <div className="chat-markdown" dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <div style={{ color: "#4b5563", textAlign: "center", paddingTop: 40 }}>
            <p style={{ fontSize: 14 }}>No wiki content yet</p>
            <p style={{ fontSize: 11, marginTop: 8 }}>Click "Edit" to add shared knowledge that all agents will see</p>
          </div>
        )}
      </div>
    </div>
  );
}
