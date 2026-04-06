import { useEffect, useRef } from "react";
import { useAppStore } from "../../stores/appStore.js";

interface Props {
  x: number;
  y: number;
  agentName: string;
  agentDisplayName: string;
  onClose: () => void;
  onTalkTo: () => void;
  onViewDetails: () => void;
  onGiveBeer: () => void;
  onPraise: () => void;
  onPoke: () => void;
}

interface MenuItem {
  emoji: string;
  label: string;
  action: () => void;
}

export function ContextMenu({
  x,
  y,
  agentName,
  agentDisplayName,
  onClose,
  onTalkTo,
  onViewDetails,
  onGiveBeer,
  onPraise,
  onPoke,
}: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  const mood = useAppStore((s) => s.agentMoods.get(agentName));

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    // Delay attaching so the originating right-click doesn't immediately close
    const id = requestAnimationFrame(() => {
      document.addEventListener("mousedown", handleClick);
    });

    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [onClose]);

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const topItems: MenuItem[] = [
    { emoji: "\u{1F4AC}", label: `Talk to ${agentDisplayName}`, action: onTalkTo },
    { emoji: "\u{1F50D}", label: "View Details", action: onViewDetails },
  ];

  const interactionItems: MenuItem[] = [
    { emoji: "\u{1F37A}", label: "Give Beer", action: onGiveBeer },
    { emoji: "\u2B50", label: "Praise", action: onPraise },
    { emoji: "\u{1F449}", label: "Poke", action: onPoke },
  ];

  return (
    <div
      ref={menuRef}
      className="animate-ctx-menu-in"
      style={{
        position: "fixed",
        left: x,
        top: y,
        zIndex: 1000,
        minWidth: 200,
        background: "#1a1a2e",
        border: "2px solid #2a2a4e",
        borderTopColor: "#3a3a5e",
        borderLeftColor: "#3a3a5e",
        borderBottomColor: "#12122a",
        borderRightColor: "#12122a",
        boxShadow: "4px 4px 0 rgba(0,0,0,0.5), inset 1px 1px 0 rgba(255,255,255,0.05)",
        fontFamily: "ui-monospace, SFMono-Regular, 'Cascadia Mono', Consolas, monospace",
        fontSize: 13,
        color: "#d1d5db",
        userSelect: "none",
        imageRendering: "pixelated",
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Header */}
      <div
        style={{
          padding: "6px 12px",
          borderBottom: "1px solid #2a2a4e",
          color: "#8b8bbd",
          fontSize: 11,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
        }}
      >
        {agentDisplayName}
      </div>

      {/* Top actions */}
      <div style={{ padding: "4px 0" }}>
        {topItems.map((item) => (
          <MenuRow key={item.label} item={item} onClose={onClose} />
        ))}
      </div>

      <Separator />

      {/* Interaction actions */}
      <div style={{ padding: "4px 0" }}>
        {interactionItems.map((item) => (
          <MenuRow key={item.label} item={item} onClose={onClose} />
        ))}
      </div>

      <Separator />

      {/* Stats row */}
      <div
        style={{
          padding: "6px 12px",
          display: "flex",
          gap: 14,
          fontSize: 12,
          color: "#6b7280",
        }}
      >
        <span title="Stats">
          {"\u{1F4CA}"} Stats
        </span>
        <span title="Beers given">{"\u{1F37A}"} {mood?.beers ?? 0}</span>
        <span title="Praises">{"\u2B50"} {mood?.praises ?? 0}</span>
        <span title="Pokes">{"\u{1F449}"} {mood?.pokes ?? 0}</span>
      </div>
    </div>
  );
}

function MenuRow({ item, onClose }: { item: MenuItem; onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={() => {
        item.action();
        onClose();
      }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        width: "100%",
        padding: "5px 12px",
        background: "transparent",
        border: "none",
        color: "inherit",
        fontFamily: "inherit",
        fontSize: "inherit",
        cursor: "pointer",
        textAlign: "left",
      }}
      className="ctx-menu-item"
    >
      <span style={{ width: 20, textAlign: "center", flexShrink: 0 }}>
        {item.emoji}
      </span>
      <span>{item.label}</span>
    </button>
  );
}

function Separator() {
  return (
    <div
      style={{
        height: 1,
        margin: "0 8px",
        background: "linear-gradient(to right, transparent, #2a2a4e, transparent)",
      }}
    />
  );
}
