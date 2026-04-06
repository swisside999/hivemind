interface Props {
  text: string;
}

export function ThoughtBubble({ text }: Props) {
  const truncated = text.length > 60 ? text.slice(0, 57) + "..." : text;
  const width = Math.min(Math.max(truncated.length * 6, 100), 220);

  return (
    <g transform="translate(0, -62)">
      {/* Pixel-style bubble */}
      <rect
        x={-width / 2}
        y={-16}
        width={width}
        height={28}
        fill="#1a1a2e"
        stroke="#4a4a6a"
        strokeWidth={2}
        shapeRendering="crispEdges"
      />

      {/* Pixel pointer (3 stacked rects getting smaller) */}
      <rect x={-4} y={12} width={8} height={3} fill="#1a1a2e" shapeRendering="crispEdges" />
      <rect x={-2} y={15} width={4} height={3} fill="#1a1a2e" shapeRendering="crispEdges" />
      {/* Border for pointer */}
      <rect x={-5} y={12} width={1} height={3} fill="#4a4a6a" shapeRendering="crispEdges" />
      <rect x={4} y={12} width={1} height={3} fill="#4a4a6a" shapeRendering="crispEdges" />
      <rect x={-3} y={15} width={1} height={3} fill="#4a4a6a" shapeRendering="crispEdges" />
      <rect x={2} y={15} width={1} height={3} fill="#4a4a6a" shapeRendering="crispEdges" />

      {/* Typing indicator dots */}
      <circle cx={-width / 2 + 10} cy={-2} r={2} fill="#6366F1" opacity={0.6}>
        <animate attributeName="opacity" values="0.3;1;0.3" dur="1s" repeatCount="indefinite" />
      </circle>
      <circle cx={-width / 2 + 18} cy={-2} r={2} fill="#6366F1" opacity={0.6}>
        <animate attributeName="opacity" values="0.3;1;0.3" dur="1s" begin="0.2s" repeatCount="indefinite" />
      </circle>
      <circle cx={-width / 2 + 26} cy={-2} r={2} fill="#6366F1" opacity={0.6}>
        <animate attributeName="opacity" values="0.3;1;0.3" dur="1s" begin="0.4s" repeatCount="indefinite" />
      </circle>

      {/* Text */}
      <text
        x={-width / 2 + 32}
        textAnchor="start"
        dominantBaseline="central"
        fill="#9CA3AF"
        fontSize={9}
        fontFamily="monospace"
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        {truncated}
      </text>
    </g>
  );
}
