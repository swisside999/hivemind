import { useEffect, useRef } from "react";

interface Props {
  emoji: string;
  x: number;
  y: number;
  onComplete: () => void;
}

export function FloatingReaction({ emoji, x, y, onComplete }: Props) {
  const elRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;

    const duration = 1500;
    const start = performance.now();
    let raf: number;

    const tick = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(elapsed / duration, 1);

      // Float upward 60px
      const offsetY = t * -60;

      // Gentle sinusoidal wobble: +/- 8px, 2 full cycles
      const wobbleX = Math.sin(t * Math.PI * 4) * 8;

      // Fade out over the last 40% of the animation
      const opacity = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;

      el.style.transform = `translate(${wobbleX}px, ${offsetY}px) scale(${1 + t * 0.15})`;
      el.style.opacity = String(opacity);

      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        onComplete();
      }
    };

    raf = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(raf);
  }, [onComplete]);

  return (
    <div
      ref={elRef}
      style={{
        position: "fixed",
        left: x,
        top: y,
        fontSize: 28,
        lineHeight: 1,
        pointerEvents: "none",
        zIndex: 999,
        willChange: "transform, opacity",
      }}
    >
      {emoji}
    </div>
  );
}
