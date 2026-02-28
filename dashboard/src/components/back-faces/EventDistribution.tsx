import { useEffect, useRef } from "react";
import { useWorldState } from "../../hooks/use-world-state";
import { SPRING_SNAPPY, animate, prefersReducedMotion, stagger } from "../../lib/animations";

const EVENT_COLORS: Record<string, string> = {
  command: "#00ffe7",
  entity_enter: "#0088ff",
  entity_leave: "#0066cc",
  connect: "#00ff88",
  disconnect: "#ff4444",
  task_claimed: "#bf00ff",
  task_submitted: "#ff00cc",
  task_approved: "#ffcc00",
};

export function EventDistribution() {
  const eventFeed = useWorldState((s) => s.eventFeed);
  const containerRef = useRef<SVGSVGElement>(null);
  const hasAnimated = useRef(false);

  // Count by event type
  const typeCounts = new Map<string, number>();
  for (const ev of eventFeed) {
    typeCounts.set(ev.type, (typeCounts.get(ev.type) ?? 0) + 1);
  }

  const sorted = [...typeCounts.entries()].sort((a, b) => b[1] - a[1]);
  const maxCount = Math.max(1, sorted[0]?.[1] ?? 1);

  useEffect(() => {
    if (
      hasAnimated.current ||
      !containerRef.current ||
      prefersReducedMotion() ||
      sorted.length === 0
    )
      return;
    hasAnimated.current = true;

    const bars = containerRef.current.querySelectorAll(".dist-bar");
    if (bars.length === 0) return;

    animate(bars, {
      scaleX: [0, 1],
      opacity: [0, 1],
      delay: stagger(50),
      ease: SPRING_SNAPPY,
      duration: 500,
    });
  }, [sorted.length]);

  const barH = 14;
  const gap = 4;
  const labelW = 90;
  const barMaxW = 160;
  const totalH = sorted.length * (barH + gap) + 20;

  return (
    <div className="flex h-full flex-col p-2">
      <div className="text-[9px] text-text-dim uppercase tracking-wider mb-1">
        Event Distribution
      </div>
      <svg
        ref={containerRef}
        viewBox={`0 0 280 ${totalH}`}
        className="h-full w-full"
        role="img"
        aria-label="Event distribution chart"
      >
        {sorted.map(([type, count], i) => {
          const y = i * (barH + gap) + 4;
          const w = (count / maxCount) * barMaxW;
          const color = EVENT_COLORS[type] ?? "#5a6a7a";
          return (
            <g key={type}>
              <text
                x={labelW - 4}
                y={y + barH / 2 + 3}
                textAnchor="end"
                fill="#8a9ab0"
                fontSize={7}
                fontFamily="Share Tech Mono, monospace"
              >
                {type.replace(/_/g, " ")}
              </text>
              <rect
                className="dist-bar"
                x={labelW}
                y={y}
                width={w}
                height={barH}
                rx={2}
                fill={color}
                opacity={0.7}
                style={{ transformOrigin: `${labelW}px ${y + barH / 2}px` }}
              />
              <text
                x={labelW + w + 4}
                y={y + barH / 2 + 3}
                fill="#c8d6e5"
                fontSize={7}
                fontFamily="Share Tech Mono, monospace"
              >
                {count}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
