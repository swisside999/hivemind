import { useEffect, useState } from "react";
import type { AgentNode } from "../../hooks/useAgents.js";

interface Props {
  from: AgentNode;
  to: AgentNode;
  label: string;
}

export function ConnectionLine({ from, to, label }: Props) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const duration = 1500;
    const start = performance.now();
    let raf: number;

    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      setProgress(t);
      if (t < 1) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const spriteX = from.x + dx * progress;
  const spriteY = from.y + dy * progress;

  // Midpoint for label
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;

  return (
    <g>
      {/* Glowing trail line */}
      <line
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        stroke="#6366F1"
        strokeWidth={2}
        strokeDasharray="4 4"
        shapeRendering="crispEdges"
        opacity={0.4}
        className="animate-dash-flow"
      />

      {/* Bright segment near the sprite */}
      <line
        x1={from.x + dx * Math.max(0, progress - 0.15)}
        y1={from.y + dy * Math.max(0, progress - 0.15)}
        x2={spriteX}
        y2={spriteY}
        stroke="#A78BFA"
        strokeWidth={3}
        opacity={0.7}
        shapeRendering="crispEdges"
      />

      {/* Traveling sprite — pixel envelope */}
      <g transform={`translate(${spriteX}, ${spriteY})`}>
        {/* Glow */}
        <circle r={8} fill="#6366F1" opacity={0.2} />
        {/* Envelope sprite (4x3 pixel art) */}
        <rect x={-6} y={-4} width={12} height={8} fill="#E0E7FF" rx={0} shapeRendering="crispEdges" />
        <rect x={-6} y={-4} width={12} height={1} fill="#818CF8" shapeRendering="crispEdges" />
        <rect x={-6} y={3} width={12} height={1} fill="#818CF8" shapeRendering="crispEdges" />
        <rect x={-6} y={-4} width={1} height={8} fill="#818CF8" shapeRendering="crispEdges" />
        <rect x={5} y={-4} width={1} height={8} fill="#818CF8" shapeRendering="crispEdges" />
        {/* Envelope flap */}
        <polygon points="-5,-3 0,1 5,-3" fill="none" stroke="#818CF8" strokeWidth={1} />
      </g>

      {/* Label — pixel styled */}
      <g transform={`translate(${midX}, ${midY - 14})`}>
        <rect
          x={-36}
          y={-8}
          width={72}
          height={14}
          fill="#1a1a2e"
          stroke="#2a2a4a"
          strokeWidth={1}
          shapeRendering="crispEdges"
        />
        <text
          textAnchor="middle"
          dominantBaseline="central"
          fill="#A5B4FC"
          fontSize={8}
          fontFamily="monospace"
          style={{ pointerEvents: "none" }}
        >
          {label.toUpperCase()}
        </text>
      </g>
    </g>
  );
}
