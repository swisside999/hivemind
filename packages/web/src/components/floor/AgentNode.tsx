import { useAppStore } from "../../stores/appStore.js";
import { ThoughtBubble } from "./ThoughtBubble.js";
import type { AgentNode as AgentNodeData } from "../../hooks/useAgents.js";

const STATUS_COLORS: Record<string, string> = {
  idle: "#22C55E",
  working: "#3B82F6",
  waiting: "#EAB308",
  error: "#EF4444",
};

interface Props {
  node: AgentNodeData;
}

export function AgentNode({ node }: Props) {
  const { config, state, x, y } = node;
  const setChatTarget = useAppStore((s) => s.setChatTarget);
  const setSelectedAgent = useAppStore((s) => s.setSelectedAgent);
  const setShowAgentDetail = useAppStore((s) => s.setShowAgentDetail);

  const isActive = state.status === "working";

  const handleClick = () => {
    setChatTarget(config.name);
  };

  const handleDoubleClick = () => {
    setSelectedAgent(config.name);
    setShowAgentDetail(true);
  };

  return (
    <g
      transform={`translate(${x}, ${y})`}
      className="cursor-pointer"
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
    >
      {/* Pulse ring when active */}
      {isActive && (
        <circle
          r={38}
          fill="none"
          stroke={config.color}
          strokeWidth={2}
          opacity={0.4}
          className="animate-pulse-slow"
        />
      )}

      {/* Main avatar circle */}
      <circle r={32} fill={config.color} opacity={0.9} />

      {/* Inner glow */}
      <circle r={28} fill={config.color} opacity={0.3} />

      {/* Initials */}
      <text
        textAnchor="middle"
        dominantBaseline="central"
        fill="white"
        fontSize={14}
        fontWeight="bold"
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        {config.displayName.slice(0, 3).toUpperCase()}
      </text>

      {/* Status indicator */}
      <circle
        cx={22}
        cy={-22}
        r={6}
        fill={STATUS_COLORS[state.status] ?? STATUS_COLORS.idle}
        stroke="#111827"
        strokeWidth={2}
      />

      {/* Name label */}
      <text
        y={50}
        textAnchor="middle"
        fill="#D1D5DB"
        fontSize={12}
        fontWeight="500"
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        {config.displayName}
      </text>

      {/* Thought bubble */}
      {state.currentThought && isActive && (
        <ThoughtBubble text={state.currentThought} />
      )}
    </g>
  );
}
