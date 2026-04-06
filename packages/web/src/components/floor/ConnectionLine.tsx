import type { AgentNode } from "../../hooks/useAgents.js";

interface Props {
  from: AgentNode;
  to: AgentNode;
  label: string;
}

export function ConnectionLine({ from, to, label }: Props) {
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;

  return (
    <g>
      <line
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        stroke="#6366F1"
        strokeWidth={2}
        strokeDasharray="6 4"
        className="animate-dash-flow"
        opacity={0.6}
      />

      {/* Direction arrow at midpoint */}
      <circle cx={midX} cy={midY} r={3} fill="#6366F1" />

      {/* Label */}
      <rect
        x={midX - 40}
        y={midY - 20}
        width={80}
        height={16}
        rx={4}
        fill="#1F2937"
        opacity={0.9}
      />
      <text
        x={midX}
        y={midY - 12}
        textAnchor="middle"
        dominantBaseline="central"
        fill="#A5B4FC"
        fontSize={9}
        style={{ pointerEvents: "none" }}
      >
        {label}
      </text>
    </g>
  );
}
