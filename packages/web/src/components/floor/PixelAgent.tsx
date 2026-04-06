import { useMemo, type ReactElement } from "react";

// ---------------------------------------------------------------------------
// Shared palette tokens
// ---------------------------------------------------------------------------
const S = "#FFDAB9"; // skin
const H = "#4A3728"; // hair (dark brown)
const W = "#FFFFFF"; // white / eyes
const K = "#000000"; // black / outlines / pupils
const G = "#888888"; // grey (glasses, metal)
const P = "#FFB6C1"; // pink (rosy cheeks)
const R = "#FF4444"; // red accent
const Y = "#FFD700"; // gold / crown
const L = "#87CEEB"; // light blue (screen glow)
const BK = "#2A2A2A"; // near-black (dark items)
const BR = "#8B4513"; // brown (accessories)
const _ = null; // transparent

type Pixel = string | null;
type Sprite = Pixel[][];

// ---------------------------------------------------------------------------
// Helper: build a sprite using the agent's outfit color
// Each function returns a 16-row x 12-col grid.
// ---------------------------------------------------------------------------

function ceoCrown(c: string): Sprite {
  return [
    [_, _, _, Y, _, Y, _, Y, _, _, _, _],
    [_, _, _, Y, Y, Y, Y, Y, _, _, _, _],
    [_, _, _, H, H, H, H, H, _, _, _, _],
    [_, _, H, H, H, H, H, H, H, _, _, _],
    [_, _, S, S, S, S, S, S, S, _, _, _],
    [_, _, K, W, S, S, S, W, K, _, _, _],
    [_, _, S, S, S, K, S, S, S, _, _, _],
    [_, _, _, S, S, S, S, S, _, _, _, _],
    [_, _, c, c, c, c, c, c, c, _, _, _],
    [_, _, c, W, c, c, c, W, c, _, _, _],
    [_, _, c, c, c, c, c, c, c, _, _, _],
    [_, _, c, c, c, c, c, c, c, _, _, _],
    [_, _, _, c, c, c, c, c, _, _, _, _],
    [_, _, _, S, _, _, _, S, _, _, _, _],
    [_, _, S, S, _, _, _, S, S, _, _, _],
    [_, _, K, K, _, _, _, K, K, _, _, _],
  ];
}

function ctoHoodie(c: string): Sprite {
  return [
    [_, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, H, H, H, H, H, _, _, _, _],
    [_, _, H, H, H, H, H, H, H, _, _, _],
    [_, _, S, S, S, S, S, S, S, _, _, _],
    [_, _, G, W, S, S, S, W, G, _, _, _],
    [_, _, G, K, S, S, S, K, G, _, _, _],
    [_, _, S, S, S, K, S, S, S, _, _, _],
    [_, _, _, S, S, S, S, S, _, _, _, _],
    [_, _, c, c, c, c, c, c, c, _, _, _],
    [_, c, c, c, c, c, c, c, c, c, _, _],
    [_, c, c, S, c, c, c, S, L, L, _, _],
    [_, _, c, c, c, c, c, c, L, L, _, _],
    [_, _, _, c, c, c, c, c, G, _, _, _],
    [_, _, _, S, _, _, _, S, _, _, _, _],
    [_, _, S, S, _, _, _, S, S, _, _, _],
    [_, _, K, K, _, _, _, K, K, _, _, _],
  ];
}

function cpoBeret(c: string): Sprite {
  return [
    [_, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, c, c, c, c, c, c, _, _, _, _],
    [_, c, c, c, c, c, c, c, c, _, _, _],
    [_, _, _, H, H, H, H, H, _, _, _, _],
    [_, _, S, S, S, S, S, S, S, _, _, _],
    [_, _, W, K, S, S, S, K, W, _, _, _],
    [_, _, S, S, S, K, S, S, S, _, _, _],
    [_, _, _, S, S, S, S, S, _, _, _, _],
    [_, _, c, c, c, c, c, c, c, _, _, _],
    [_, _, c, c, c, c, c, c, c, _, _, _],
    [_, _, S, c, c, c, c, c, S, _, Y, _],
    [_, _, _, c, c, c, c, c, _, Y, Y, _],
    [_, _, _, c, c, c, c, c, _, _, Y, _],
    [_, _, _, S, _, _, _, S, _, _, _, _],
    [_, _, S, S, _, _, _, S, S, _, _, _],
    [_, _, K, K, _, _, _, K, K, _, _, _],
  ];
}

function cooClipboard(c: string): Sprite {
  return [
    [_, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, H, H, H, H, H, _, _, _, _],
    [_, _, H, H, H, H, H, H, H, _, _, _],
    [_, G, S, S, S, S, S, S, S, G, _, _],
    [_, G, W, K, S, S, S, K, W, G, _, _],
    [_, _, S, S, S, K, S, S, S, _, _, _],
    [_, _, _, S, S, S, S, S, _, _, _, _],
    [_, _, c, c, c, c, c, c, c, _, _, _],
    [_, _, c, c, c, c, c, c, c, _, _, _],
    [_, _, S, c, c, c, c, c, S, _, _, _],
    [_, _, _, c, c, c, c, W, W, W, _, _],
    [_, _, _, c, c, c, c, W, K, W, _, _],
    [_, _, _, c, c, c, c, W, K, W, _, _],
    [_, _, _, S, _, _, _, S, W, W, _, _],
    [_, _, S, S, _, _, _, S, S, _, _, _],
    [_, _, K, K, _, _, _, K, K, _, _, _],
  ];
}

function seniorDev(c: string): Sprite {
  return [
    [_, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, G, _, _, _, _, _, G, _, _, _],
    [_, _, G, H, H, H, H, H, G, _, _, _],
    [_, _, _, H, H, H, H, H, _, _, _, _],
    [_, _, S, S, S, S, S, S, S, _, _, _],
    [_, _, K, W, S, S, S, W, K, _, _, _],
    [_, _, S, S, S, S, S, S, S, _, _, _],
    [_, _, _, S, S, S, S, S, _, _, _, _],
    [_, _, c, c, c, c, c, c, c, _, _, _],
    [_, _, c, c, c, c, c, c, c, _, _, _],
    [BR, BR, S, c, c, c, c, c, S, _, _, _],
    [BR, W, _, c, c, c, c, c, _, _, _, _],
    [BR, BR, _, c, c, c, c, c, _, _, _, _],
    [_, _, _, S, _, _, _, S, _, _, _, _],
    [_, _, S, S, _, _, _, S, S, _, _, _],
    [_, _, K, K, _, _, _, K, K, _, _, _],
  ];
}

function juniorDev(c: string): Sprite {
  return [
    [_, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, H, H, H, H, H, _, _, _, _],
    [_, _, H, H, H, H, H, H, H, _, _, _],
    [_, _, S, S, S, S, S, S, S, _, _, _],
    [_, _, W, K, S, S, S, K, W, _, _, _],
    [_, _, W, K, S, S, S, K, W, _, _, _],
    [_, _, _, S, S, S, S, S, _, _, _, _],
    [_, _, c, c, c, c, c, c, c, _, _, _],
    [_, _, c, c, c, c, c, c, c, _, _, _],
    [_, _, S, c, c, c, c, c, S, _, _, _],
    [_, _, _, c, c, c, c, c, _, _, _, _],
    [_, _, _, c, c, c, c, c, _, _, _, _],
    [_, _, _, S, _, _, _, S, _, _, _, _],
    [_, _, S, S, _, _, _, S, S, _, _, _],
    [_, _, BR, BR, BR, BR, BR, BR, _, _, _, _],
  ];
}

function codeReviewer(c: string): Sprite {
  return [
    [_, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, H, H, H, H, H, _, _, _, _],
    [_, _, H, H, H, H, H, H, H, _, _, _],
    [_, _, S, S, S, S, S, S, S, _, _, _],
    [_, _, G, W, S, S, S, W, G, _, _, _],
    [_, _, G, K, S, S, S, K, G, _, _, _],
    [_, _, S, S, R, K, R, S, S, _, _, _],
    [_, _, _, S, S, S, S, S, _, _, _, _],
    [_, _, c, c, c, c, c, c, c, _, _, _],
    [_, _, c, c, c, c, c, c, c, _, _, _],
    [_, G, G, c, c, c, c, c, c, c, _, _],
    [G, G, G, c, c, c, c, c, c, c, c, _],
    [_, G, G, c, c, c, c, c, c, c, _, _],
    [_, _, _, S, _, _, _, S, _, _, _, _],
    [_, _, S, S, _, _, _, S, S, _, _, _],
    [_, _, K, K, _, _, _, K, K, _, _, _],
  ];
}

function designerArt(c: string): Sprite {
  return [
    [_, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, H, H, H, H, H, _, _, _, _],
    [_, _, H, H, H, H, H, H, H, _, _, _],
    [_, _, H, H, H, H, H, H, H, _, _, _],
    [_, _, S, S, S, S, S, S, S, _, _, _],
    [_, _, K, W, S, S, S, W, K, _, _, _],
    [_, _, S, S, S, S, S, S, S, _, _, _],
    [_, _, _, S, S, S, S, S, _, _, _, _],
    [_, _, c, c, c, c, c, c, c, _, _, _],
    [_, _, c, c, c, c, c, c, c, _, _, _],
    [_, _, S, c, c, c, c, c, S, BR, _, _],
    [_, _, _, c, c, c, c, c, _, BR, _, _],
    [_, _, _, c, c, c, c, c, _, R, _, _],
    [_, _, _, S, _, _, _, S, _, _, _, _],
    [_, _, S, S, _, _, _, S, S, _, _, _],
    [_, _, K, K, _, _, _, K, K, _, _, _],
  ];
}

function designReviewer(c: string): Sprite {
  return [
    [_, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, H, H, H, H, H, _, _, _, _],
    [_, _, H, H, H, H, H, H, H, _, _, _],
    [_, _, S, S, S, S, S, S, S, _, _, _],
    [_, _, G, W, S, S, S, W, G, _, _, _],
    [_, _, G, K, S, S, S, K, G, _, _, _],
    [_, _, S, S, S, K, S, S, S, _, _, _],
    [_, _, _, S, S, S, S, S, _, _, _, _],
    [_, _, c, c, c, c, c, c, c, _, _, _],
    [_, _, c, c, c, c, c, c, c, _, _, _],
    [_, _, S, c, c, c, c, c, S, G, _, _],
    [_, _, _, c, c, c, c, c, _, G, _, _],
    [_, _, _, c, c, c, c, c, _, G, _, _],
    [_, _, _, S, _, _, _, S, _, G, _, _],
    [_, _, S, S, _, _, _, S, S, _, _, _],
    [_, _, K, K, _, _, _, K, K, _, _, _],
  ];
}

function devopsHardhat(c: string): Sprite {
  return [
    [_, _, _, Y, Y, Y, Y, Y, _, _, _, _],
    [_, _, Y, Y, Y, Y, Y, Y, Y, _, _, _],
    [_, _, _, H, H, H, H, H, _, _, _, _],
    [_, _, S, S, S, S, S, S, S, _, _, _],
    [_, _, K, W, S, S, S, W, K, _, _, _],
    [_, _, S, S, S, K, S, S, S, _, _, _],
    [_, _, _, S, S, S, S, S, _, _, _, _],
    [_, _, c, c, c, c, c, c, c, _, _, _],
    [_, _, c, c, c, c, c, c, c, _, _, _],
    [_, _, S, c, c, c, c, c, G, _, _, _],
    [_, _, _, c, c, c, c, G, G, _, _, _],
    [_, _, _, c, c, c, c, c, _, _, _, _],
    [_, _, _, c, c, c, c, c, _, G, G, _],
    [_, _, _, S, _, _, _, S, _, G, K, G],
    [_, _, S, S, _, _, _, S, S, G, K, G],
    [_, _, K, K, _, _, _, K, K, G, G, _],
  ];
}

function qaBugHunter(c: string): Sprite {
  return [
    [_, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, BK, BK, BK, BK, BK, BK, _, _, _, _],
    [_, BK, BK, BK, BK, BK, BK, BK, BK, _, _, _],
    [_, _, _, H, H, H, H, H, _, _, _, _],
    [_, _, S, S, S, S, S, S, S, _, _, _],
    [_, _, K, W, S, S, S, W, K, _, _, _],
    [_, _, S, S, S, K, S, S, S, _, _, _],
    [_, _, _, S, S, S, S, S, _, _, _, _],
    [_, _, c, c, c, c, c, c, c, _, _, _],
    [_, _, c, c, c, c, c, c, c, _, _, _],
    [_, G, G, c, c, c, c, c, S, _, _, _],
    [G, G, G, c, c, c, c, c, _, _, _, _],
    [_, G, G, c, c, c, c, c, _, _, _, _],
    [_, _, _, S, _, _, _, S, _, _, _, _],
    [_, _, S, S, _, _, _, S, S, _, _, _],
    [_, _, K, K, _, _, _, K, K, _, _, _],
  ];
}

// ---------------------------------------------------------------------------
// Mood overlays -- return extra pixels to draw ON TOP of the base sprite
// Each entry: [row, col, color]
// ---------------------------------------------------------------------------
type Overlay = [number, number, string][];

function moodOverlay(
  mood: Props["mood"],
  frame: number,
): { overlay: Overlay; above: Overlay } {
  const overlay: Overlay = [];
  const above: Overlay = [];

  switch (mood) {
    case "happy":
      // smile
      overlay.push([6, 3, K], [6, 7, K], [6, 4, K], [6, 6, K]);
      break;
    case "tipsy":
      // rosy cheeks
      overlay.push([5, 2, P], [5, 8, P]);
      break;
    case "drunk":
      // rosy cheeks + droopy eyes + swirl above head
      overlay.push([5, 2, P], [5, 8, P]);
      overlay.push([4, 3, S], [4, 7, S]); // half-close eyes
      // swirl
      {
        const sx = frame % 2 === 0 ? 4 : 5;
        const sy = frame % 2 === 0 ? 5 : 6;
        above.push([0, sx, "#AA88FF"], [0, sy, "#AA88FF"]);
        above.push([0, sx + 1, "#CC99FF"]);
      }
      break;
    case "annoyed":
      // angry brows + "!" above
      overlay.push([4, 2, R], [4, 3, R], [4, 7, R], [4, 8, R]);
      above.push([0, 5, R], [1, 5, R]);
      break;
    case "praised":
      // sparkles around character
      {
        const sp = frame % 2 === 0 ? Y : W;
        above.push(
          [0, 0, sp],
          [0, 11, sp],
          [2, 11, sp],
          [15, 0, sp],
          [15, 11, sp],
          [8, 0, sp],
        );
      }
      break;
    case "focused":
      // determined brows + sweat drop
      overlay.push([4, 2, K], [4, 8, K]);
      above.push([3, 10, L], [4, 10, L]);
      break;
    case "neutral":
    default:
      break;
  }

  return { overlay, above };
}

// ---------------------------------------------------------------------------
// Map role slugs to sprite builders
// ---------------------------------------------------------------------------
const SPRITE_BUILDERS: Record<string, (c: string) => Sprite> = {
  ceo: ceoCrown,
  cto: ctoHoodie,
  cpo: cpoBeret,
  coo: cooClipboard,
  "senior-dev": seniorDev,
  "junior-dev": juniorDev,
  "code-reviewer": codeReviewer,
  designer: designerArt,
  "design-reviewer": designReviewer,
  devops: devopsHardhat,
  qa: qaBugHunter,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  role: string;
  color: string;
  mood: "neutral" | "happy" | "focused" | "tipsy" | "drunk" | "annoyed" | "praised";
  isActive: boolean;
  size?: number;
}

export function PixelAgent({
  role,
  color,
  mood,
  isActive,
  size = 3,
}: Props) {
  // Build the base sprite for this role (memoised on role + color)
  const sprite = useMemo(() => {
    const builder = SPRITE_BUILDERS[role] ?? ceoCrown;
    return builder(color);
  }, [role, color]);

  // Animation frame for mood effects (toggles 0/1 via CSS class trick — we
  // just render frame 0 statically and let CSS handle the animation).
  const frame = 0;
  const { overlay, above } = useMemo(
    () => moodOverlay(mood, frame),
    [mood, frame],
  );

  const cols = 12;
  const rows = 16;
  const w = cols * size;
  const h = rows * size;

  // Collect all rects
  const rects: React.ReactElement[] = [];
  let idx = 0;

  // Base sprite
  for (let r = 0; r < rows; r++) {
    const row = sprite[r];
    if (!row) continue;
    for (let c = 0; c < cols; c++) {
      const px = row[c];
      if (px) {
        rects.push(
          <rect
            key={idx++}
            x={c * size}
            y={r * size}
            width={size}
            height={size}
            fill={px}
          />,
        );
      }
    }
  }

  // Mood overlays (on top of body)
  for (const [r, c, fill] of overlay) {
    rects.push(
      <rect
        key={idx++}
        x={c * size}
        y={r * size}
        width={size}
        height={size}
        fill={fill}
      />,
    );
  }

  // Mood overlays (absolute positions, e.g. sparkles / exclamation)
  for (const [r, c, fill] of above) {
    rects.push(
      <rect
        key={idx++}
        x={c * size}
        y={r * size}
        width={size}
        height={size}
        fill={fill}
      />,
    );
  }

  // Determine wobble / bounce animation class
  let animationClass = "";
  if (mood === "drunk") {
    animationClass = "hivemind-pixel-drunk";
  } else if (mood === "tipsy") {
    animationClass = "hivemind-pixel-tipsy";
  } else if (isActive || mood === "happy") {
    animationClass = "hivemind-pixel-bounce";
  }

  return (
    <>
      {/* Inject keyframe styles once (idempotent via id check) */}
      <style>{`
        @keyframes hivemind-bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
        @keyframes hivemind-tipsy {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(2deg); }
          75% { transform: rotate(-2deg); }
        }
        @keyframes hivemind-drunk {
          0%, 100% { transform: rotate(0deg) translateX(0); }
          25% { transform: rotate(4deg) translateX(2px); }
          75% { transform: rotate(-4deg) translateX(-2px); }
        }
        @keyframes hivemind-sparkle {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        .hivemind-pixel-bounce {
          animation: hivemind-bounce 0.8s ease-in-out infinite;
        }
        .hivemind-pixel-tipsy {
          animation: hivemind-tipsy 1.2s ease-in-out infinite;
          transform-origin: center bottom;
        }
        .hivemind-pixel-drunk {
          animation: hivemind-drunk 0.7s ease-in-out infinite;
          transform-origin: center bottom;
        }
        .hivemind-pixel-sparkle rect {
          animation: hivemind-sparkle 0.6s ease-in-out infinite alternate;
        }
      `}</style>
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        shapeRendering="crispEdges"
        className={animationClass}
        style={{ imageRendering: "pixelated" }}
      >
        {/* Drop shadow beneath character */}
        <ellipse
          cx={w / 2}
          cy={h - size * 0.5}
          rx={w * 0.3}
          ry={size}
          fill="rgba(0,0,0,0.25)"
        />

        {/* Sparkle wrapper for praised mood */}
        <g className={mood === "praised" ? "hivemind-pixel-sparkle" : undefined}>
          {rects}
        </g>
      </svg>
    </>
  );
}
