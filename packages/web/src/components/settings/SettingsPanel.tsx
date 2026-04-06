import { useState } from "react";
import { useAppStore } from "../../stores/appStore.js";

const API_BASE = import.meta.env.DEV
  ? `http://${window.location.hostname}:3100`
  : "";

const panelStyle: React.CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, monospace",
  background: "#0a0a1a",
  color: "#d1d5db",
  padding: 24,
  height: "100%",
  overflowY: "auto",
};

const sectionStyle: React.CSSProperties = {
  background: "#0f0f23",
  border: "1px solid #2a2a4e",
  borderTop: "1px solid #3a3a5e",
  borderLeft: "1px solid #3a3a5e",
  borderBottom: "1px solid #12122a",
  borderRight: "1px solid #12122a",
  padding: 20,
  marginBottom: 20,
  maxWidth: 560,
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: "0.12em",
  color: "#6366F1",
  marginBottom: 16,
  textTransform: "uppercase",
  fontWeight: 700,
};

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#d1d5db",
  marginBottom: 4,
  display: "block",
};

const descriptionStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#6b7280",
  marginBottom: 12,
};

const radioGroupStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  background: "#1a1a2e",
  border: "1px solid #2a2a4e",
  padding: 10,
  marginBottom: 16,
};

const radioLabelStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#d1d5db",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const toggleRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: 4,
};

const selectStyle: React.CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, monospace",
  fontSize: 12,
  background: "#1a1a2e",
  color: "#d1d5db",
  border: "1px solid #2a2a4e",
  padding: "5px 10px",
  cursor: "pointer",
  outline: "none",
  marginBottom: 16,
};

const buttonStyle: React.CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, monospace",
  fontSize: 12,
  letterSpacing: "0.05em",
  padding: "7px 18px",
  cursor: "pointer",
  border: "1px solid #2a2a4e",
  borderTop: "1px solid #3a3a5e",
  borderLeft: "1px solid #3a3a5e",
  borderBottom: "1px solid #12122a",
  borderRight: "1px solid #12122a",
  background: "#1a1a2e",
  color: "#d1d5db",
};

const saveButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  background: "#6366F1",
  color: "#fff",
  border: "1px solid #818cf8",
  borderBottom: "1px solid #4338ca",
  borderRight: "1px solid #4338ca",
};

function ToggleSwitch({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      style={{
        width: 44,
        height: 22,
        borderRadius: 11,
        border: "1px solid #2a2a4e",
        background: value ? "#6366F1" : "#1a1a2e",
        cursor: "pointer",
        position: "relative",
        transition: "background 0.15s",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: value ? 23 : 2,
          width: 16,
          height: 16,
          borderRadius: 8,
          background: value ? "#fff" : "#6b7280",
          transition: "left 0.15s",
        }}
      />
    </button>
  );
}

export function SettingsPanel() {
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");

  const [local, setLocal] = useState({ ...settings });

  const updateLocal = (key: string, value: unknown) => {
    setLocal((prev) => ({ ...prev, [key]: value }));
    setStatus("idle");
  };

  const handleSave = async () => {
    setSaving(true);
    setStatus("idle");
    try {
      const res = await fetch(`${API_BASE}/api/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(local),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? "Failed to save");
      }
      const data = await res.json() as { settings: typeof settings };
      setSettings(data.settings);
      setLocal(data.settings);
      setStatus("saved");
    } catch {
      setStatus("error");
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async (type: "messages" | "tickets") => {
    try {
      const res = await fetch(`${API_BASE}/api/export/${type}`);
      if (!res.ok) {
        throw new Error("Export failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `hivemind-${type}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch {
      // Silently fail — download will not trigger
    }
  };

  const hasChanges =
    local.defaultModel !== settings.defaultModel ||
    local.autoCommit !== settings.autoCommit ||
    local.logLevel !== settings.logLevel ||
    local.intelligentModelSelection !== settings.intelligentModelSelection;

  return (
    <div style={panelStyle}>
      {/* Settings Section */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Settings</div>

        {/* Default Model */}
        <div style={labelStyle}>Default Model</div>
        <div style={radioGroupStyle}>
          {([
            { value: "haiku", label: "Haiku", desc: "fast, cheap" },
            { value: "sonnet", label: "Sonnet", desc: "balanced" },
            { value: "opus", label: "Opus", desc: "powerful, expensive" },
          ] as const).map((opt) => (
            <label key={opt.value} style={radioLabelStyle}>
              <input
                type="radio"
                name="defaultModel"
                checked={local.defaultModel === opt.value}
                onChange={() => updateLocal("defaultModel", opt.value)}
                style={{ accentColor: "#6366F1" }}
              />
              <span>
                {opt.label}{" "}
                <span style={{ color: "#6b7280", fontSize: 11 }}>({opt.desc})</span>
              </span>
            </label>
          ))}
        </div>

        {/* Intelligent Model Selection */}
        <div style={toggleRowStyle}>
          <div>
            <div style={labelStyle}>Intelligent Model Selection</div>
          </div>
          <ToggleSwitch
            value={local.intelligentModelSelection}
            onChange={(v) => updateLocal("intelligentModelSelection", v)}
          />
        </div>
        <div style={descriptionStyle}>Auto-pick model by task complexity</div>

        {/* Auto-commit */}
        <div style={toggleRowStyle}>
          <div>
            <div style={labelStyle}>Auto-commit Agent Work</div>
          </div>
          <ToggleSwitch
            value={local.autoCommit}
            onChange={(v) => updateLocal("autoCommit", v)}
          />
        </div>
        <div style={descriptionStyle}>Automatically git commit after tasks</div>

        {/* Log Level */}
        <div style={labelStyle}>Log Level</div>
        <select
          value={local.logLevel}
          onChange={(e) => updateLocal("logLevel", e.target.value)}
          style={selectStyle}
        >
          <option value="debug">debug</option>
          <option value="info">info</option>
          <option value="warn">warn</option>
          <option value="error">error</option>
        </select>

        {/* Save */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !hasChanges}
            style={{
              ...saveButtonStyle,
              opacity: saving || !hasChanges ? 0.5 : 1,
              cursor: saving || !hasChanges ? "default" : "pointer",
            }}
          >
            {saving ? "Saving..." : "Save Settings"}
          </button>
          {status === "saved" && (
            <span style={{ fontSize: 11, color: "#4ade80" }}>Settings saved</span>
          )}
          {status === "error" && (
            <span style={{ fontSize: 11, color: "#f87171" }}>Failed to save</span>
          )}
        </div>
      </div>

      {/* Export Section */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Export</div>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            onClick={() => handleExport("messages")}
            style={buttonStyle}
          >
            Export Messages
          </button>
          <button
            type="button"
            onClick={() => handleExport("tickets")}
            style={buttonStyle}
          >
            Export Tickets
          </button>
        </div>
        <div style={{ ...descriptionStyle, marginTop: 10 }}>
          Download conversation logs and ticket data as JSON files
        </div>
      </div>
    </div>
  );
}
