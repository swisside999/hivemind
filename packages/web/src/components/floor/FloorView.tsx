import { useState, useCallback } from "react";
import { useAgentNodes } from "../../hooks/useAgents.js";
import { useAppStore } from "../../stores/appStore.js";
import { AgentNode } from "./AgentNode.js";
import { ConnectionLine } from "./ConnectionLine.js";
import { ContextMenu } from "./ContextMenu.js";
import { FloatingReaction } from "./FloatingReaction.js";

interface ContextMenuState {
  x: number;
  y: number;
  agentName: string;
}

export function FloorView() {
  const nodes = useAgentNodes();
  const connections = useAppStore((s) => s.connections);
  const connected = useAppStore((s) => s.connected);
  const agentConfigs = useAppStore((s) => s.agentConfigs);
  const reactions = useAppStore((s) => s.reactions);
  const addReaction = useAppStore((s) => s.addReaction);
  const removeReaction = useAppStore((s) => s.removeReaction);
  const giveBeer = useAppStore((s) => s.giveBeer);
  const praiseAgent = useAppStore((s) => s.praiseAgent);
  const pokeAgent = useAppStore((s) => s.pokeAgent);
  const setChatTarget = useAppStore((s) => s.setChatTarget);
  const setSelectedAgent = useAppStore((s) => s.setSelectedAgent);
  const setShowAgentDetail = useAppStore((s) => s.setShowAgentDetail);

  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null);

  const nodeMap = new Map(nodes.map((n) => [n.config.name, n]));

  // Hierarchy lines
  const hierarchyLines: { from: typeof nodes[0]; to: typeof nodes[0] }[] = [];
  for (const node of nodes) {
    if (node.config.reportsTo) {
      const parent = nodeMap.get(node.config.reportsTo);
      if (parent) hierarchyLines.push({ from: parent, to: node });
    }
  }

  const handleContextMenu = useCallback((e: React.MouseEvent, agentName: string) => {
    setCtxMenu({ x: e.clientX, y: e.clientY, agentName });
  }, []);

  const spawnReaction = useCallback((agentName: string, emoji: string) => {
    const node = nodeMap.get(agentName);
    if (!node) return;
    const id = crypto.randomUUID();
    // Convert SVG coords to approximate screen position
    // The SVG viewBox is 1000x550, we approximate
    const svgEl = document.querySelector("#floor-svg");
    if (!svgEl) return;
    const rect = svgEl.getBoundingClientRect();
    const scaleX = rect.width / 1000;
    const scaleY = rect.height / 550;
    addReaction({
      id,
      agentName,
      emoji,
      x: rect.left + node.x * scaleX,
      y: rect.top + node.y * scaleY - 20,
      createdAt: Date.now(),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, addReaction]);

  const handleGiveBeer = useCallback(() => {
    if (!ctxMenu) return;
    giveBeer(ctxMenu.agentName);
    spawnReaction(ctxMenu.agentName, "🍺");
    setCtxMenu(null);
  }, [ctxMenu, giveBeer, spawnReaction]);

  const handlePraise = useCallback(() => {
    if (!ctxMenu) return;
    praiseAgent(ctxMenu.agentName);
    spawnReaction(ctxMenu.agentName, "⭐");
    setCtxMenu(null);
  }, [ctxMenu, praiseAgent, spawnReaction]);

  const handlePoke = useCallback(() => {
    if (!ctxMenu) return;
    pokeAgent(ctxMenu.agentName);
    spawnReaction(ctxMenu.agentName, "👉");
    setCtxMenu(null);
  }, [ctxMenu, pokeAgent, spawnReaction]);

  const handleTalkTo = useCallback(() => {
    if (!ctxMenu) return;
    setChatTarget(ctxMenu.agentName);
    setCtxMenu(null);
  }, [ctxMenu, setChatTarget]);

  const handleViewDetails = useCallback(() => {
    if (!ctxMenu) return;
    setSelectedAgent(ctxMenu.agentName);
    setShowAgentDetail(true);
    setCtxMenu(null);
  }, [ctxMenu, setSelectedAgent, setShowAgentDetail]);

  const ctxConfig = ctxMenu ? agentConfigs.find((c) => c.name === ctxMenu.agentName) : null;

  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: "#0a0a1a" }}>
      {/* Pixel grid background */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(99,102,241,0.5) 1px, transparent 1px),
            linear-gradient(90deg, rgba(99,102,241,0.5) 1px, transparent 1px)
          `,
          backgroundSize: "24px 24px",
        }}
      />

      {/* Floating particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 20 }, (_, i) => (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              width: i % 3 === 0 ? 3 : 2,
              height: i % 3 === 0 ? 3 : 2,
              left: `${(i * 37 + 13) % 100}%`,
              top: `${(i * 23 + 7) % 100}%`,
              background: i % 4 === 0 ? "#6366F1" : i % 3 === 0 ? "#A78BFA" : "#4ECDC4",
              opacity: 0.3 + (i % 5) * 0.1,
              animation: `float-particle ${3 + (i % 4)}s ease-in-out infinite alternate`,
              animationDelay: `${i * 0.3}s`,
            }}
          />
        ))}
      </div>

      {/* Connection status banner */}
      {!connected && (
        <div
          className="absolute top-4 left-1/2 -translate-x-1/2 z-10 px-4 py-2 text-xs font-mono"
          style={{
            background: "#1a0a0a",
            border: "2px solid #EF4444",
            color: "#EF4444",
            imageRendering: "pixelated",
          }}
        >
          ⚠ DISCONNECTED — RECONNECTING...
        </div>
      )}

      {/* Empty state */}
      {nodes.length === 0 && (
        <div className="flex h-full items-center justify-center">
          <div
            className="text-center p-8 font-mono"
            style={{ border: "2px solid #374151", background: "#111827" }}
          >
            <p className="text-base text-gray-400">NO COMPANY LOADED</p>
            <p className="mt-2 text-xs text-gray-600">Create a project to hire your team</p>
          </div>
        </div>
      )}

      {/* The Floor SVG */}
      <svg
        id="floor-svg"
        viewBox="0 0 1000 550"
        className="h-full w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Hierarchy lines — dashed, pixel-style */}
        {hierarchyLines.map(({ from, to }) => (
          <line
            key={`h-${from.config.name}-${to.config.name}`}
            x1={from.x}
            y1={from.y + 32}
            x2={to.x}
            y2={to.y - 28}
            stroke="#2a2a4a"
            strokeWidth={2}
            strokeDasharray="6 6"
            shapeRendering="crispEdges"
          />
        ))}

        {/* Active communication lines */}
        {connections.map((conn) => {
          const fromNode = nodeMap.get(conn.from);
          const toNode = nodeMap.get(conn.to);
          if (!fromNode || !toNode) return null;
          return (
            <ConnectionLine
              key={`c-${conn.from}-${conn.to}`}
              from={fromNode}
              to={toNode}
              label={conn.type.replace("_", " ")}
            />
          );
        })}

        {/* Agent nodes */}
        {nodes.map((node) => (
          <AgentNode
            key={node.config.name}
            node={node}
            onContextMenu={handleContextMenu}
          />
        ))}
      </svg>

      {/* Context menu (HTML overlay) */}
      {ctxMenu && ctxConfig && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          agentName={ctxMenu.agentName}
          agentDisplayName={ctxConfig.displayName}
          onClose={() => setCtxMenu(null)}
          onTalkTo={handleTalkTo}
          onViewDetails={handleViewDetails}
          onGiveBeer={handleGiveBeer}
          onPraise={handlePraise}
          onPoke={handlePoke}
        />
      )}

      {/* Floating reactions (HTML overlay) */}
      {reactions.map((r) => (
        <FloatingReaction
          key={r.id}
          emoji={r.emoji}
          x={r.x}
          y={r.y}
          onComplete={() => removeReaction(r.id)}
        />
      ))}

      {/* RPG-style floor title */}
      <div
        className="absolute bottom-3 right-3 font-mono text-xs tracking-widest pointer-events-none select-none"
        style={{ color: "#2a2a4a" }}
      >
        THE FLOOR
      </div>
    </div>
  );
}
