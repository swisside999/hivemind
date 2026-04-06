import { useAppStore, type MoodType } from "../../stores/appStore.js";
import { PixelAgent } from "./PixelAgent.js";
import { ThoughtBubble } from "./ThoughtBubble.js";
import type { AgentNode as AgentNodeData } from "../../hooks/useAgents.js";

const STATUS_LABELS: Record<string, string> = {
  idle: "Idle",
  working: "Working...",
  waiting: "Waiting...",
  error: "ERROR!",
};

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
  const agentMoods = useAppStore((s) => s.agentMoods);

  const mood = agentMoods.get(config.name);
  const moodType: MoodType = mood?.type ?? "neutral";
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
      {/* Platform / shadow */}
      <ellipse cx={0} cy={32} rx={22} ry={6} fill="#000" opacity={0.3} />

      {/* Pixel art character — centered on the node */}
      <g transform="translate(-18, -28)">
        <PixelAgent
          role={config.role}
          color={config.color}
          mood={moodType}
          isActive={isActive}
          size={3}
        />
      </g>

      {/* Status badge — pixel style */}
      <g transform="translate(20, -30)">
        <rect x={-2} y={-2} width={10} height={10} fill="#111827" rx={0} />
        <rect x={0} y={0} width={6} height={6} fill={STATUS_COLORS[state.status] ?? "#22C55E"} rx={0} />
      </g>

      {/* Beer counter */}
      {mood && mood.beers > 0 && (
        <g transform="translate(-26, -30)">
          <text
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={10}
            style={{ pointerEvents: "none" }}
          >
            {"🍺".repeat(Math.min(mood.beers, 5))}
          </text>
        </g>
      )}

      {/* Name label — pixel font style */}
      <text
        y={46}
        textAnchor="middle"
        fill="#D1D5DB"
        fontSize={10}
        fontFamily="monospace"
        fontWeight="bold"
        letterSpacing={0.5}
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        {config.displayName.toUpperCase()}
      </text>

      {/* Status text */}
      {state.status !== "idle" && (
        <text
          y={58}
          textAnchor="middle"
          fill={STATUS_COLORS[state.status]}
          fontSize={8}
          fontFamily="monospace"
          style={{ pointerEvents: "none", userSelect: "none" }}
        >
          {STATUS_LABELS[state.status]}
        </text>
      )}

      {/* Thought bubble */}
      {state.currentThought && isActive && (
        <ThoughtBubble text={state.currentThought} />
      )}

    </g>
  );
}
