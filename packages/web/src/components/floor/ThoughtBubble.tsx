interface Props {
  text: string;
}

export function ThoughtBubble({ text }: Props) {
  const truncated = text.length > 80 ? text.slice(0, 77) + "..." : text;
  const width = Math.min(Math.max(truncated.length * 6.5, 120), 260);

  return (
    <g transform="translate(0, -65)">
      {/* Bubble background */}
      <rect
        x={-width / 2}
        y={-20}
        width={width}
        height={36}
        rx={8}
        fill="#1F2937"
        stroke="#374151"
        strokeWidth={1}
      />

      {/* Pointer triangle */}
      <polygon points="-6,16 6,16 0,24" fill="#1F2937" />

      {/* Text */}
      <text
        textAnchor="middle"
        dominantBaseline="central"
        fill="#9CA3AF"
        fontSize={10}
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        {truncated}
      </text>
    </g>
  );
}
