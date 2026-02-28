import { useEffect, useRef } from "react";
import { useWorldState } from "../../hooks/use-world-state";
import { SPRING_SNAPPY, animate, prefersReducedMotion, stagger } from "../../lib/animations";

const KIND_COLORS: Record<string, string> = {
  agent: "#00ffe7",
  npc: "#ffcc00",
  object: "#5a6a7a",
};

export function EntityDistribution() {
  const entities = useWorldState((s) => s.entities);
  const containerRef = useRef<SVGSVGElement>(null);
  const hasAnimated = useRef(false);

  // Kind distribution
  const kindCounts = new Map<string, number>();
  for (const e of entities) {
    kindCounts.set(e.kind, (kindCounts.get(e.kind) ?? 0) + 1);
  }
  const kindEntries = [...kindCounts.entries()].sort((a, b) => b[1] - a[1]);
  const maxKind = Math.max(1, kindEntries[0]?.[1] ?? 1);

  // Room distribution (top 5)
  const roomCounts = new Map<string, number>();
  for (const e of entities) {
    const short = e.room.split("/")[1] ?? e.room;
    roomCounts.set(short, (roomCounts.get(short) ?? 0) + 1);
  }
  const roomEntries = [...roomCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxRoom = Math.max(1, roomEntries[0]?.[1] ?? 1);

  useEffect(() => {
    if (
      hasAnimated.current ||
      !containerRef.current ||
      prefersReducedMotion() ||
      entities.length === 0
    )
      return;
    hasAnimated.current = true;

    const bars = containerRef.current.querySelectorAll(".ent-bar");
    if (bars.length === 0) return;

    animate(bars, {
      scaleX: [0, 1],
      opacity: [0, 1],
      delay: stagger(60),
      ease: SPRING_SNAPPY,
      duration: 500,
    });
  }, [entities.length]);

  const barH = 14;
  const gap = 4;
  const labelW = 60;
  const barMaxW = 120;

  return (
    <div className="flex h-full flex-col p-2">
      <div className="text-[9px] text-text-dim uppercase tracking-wider mb-1">
        Entity Distribution
      </div>
      <svg
        ref={containerRef}
        viewBox="0 0 220 180"
        className="h-full w-full"
        role="img"
        aria-label="Entity distribution chart"
      >
        {/* Kind distribution */}
        <text
          x={4}
          y={12}
          fill="#00ffe7"
          fontSize={8}
          fontFamily="Orbitron, monospace"
          fontWeight={600}
        >
          By Kind
        </text>
        {kindEntries.map(([kind, count], i) => {
          const y = 20 + i * (barH + gap);
          const w = (count / maxKind) * barMaxW;
          const color = KIND_COLORS[kind] ?? "#5a6a7a";
          return (
            <g key={kind}>
              <text
                x={labelW - 4}
                y={y + barH / 2 + 3}
                textAnchor="end"
                fill="#8a9ab0"
                fontSize={7}
                fontFamily="Share Tech Mono, monospace"
              >
                {kind}
              </text>
              <rect
                className="ent-bar"
                x={labelW}
                y={y}
                width={w}
                height={barH}
                rx={2}
                fill={color}
                opacity={0.7}
                style={{
                  transformOrigin: `${labelW}px ${y + barH / 2}px`,
                }}
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

        {/* Room distribution */}
        <text
          x={4}
          y={85}
          fill="#0088ff"
          fontSize={8}
          fontFamily="Orbitron, monospace"
          fontWeight={600}
        >
          Top Rooms
        </text>
        {roomEntries.map(([room, count], i) => {
          const y = 93 + i * (barH + gap);
          const w = (count / maxRoom) * barMaxW;
          return (
            <g key={room}>
              <text
                x={labelW - 4}
                y={y + barH / 2 + 3}
                textAnchor="end"
                fill="#8a9ab0"
                fontSize={7}
                fontFamily="Share Tech Mono, monospace"
              >
                {room}
              </text>
              <rect
                className="ent-bar"
                x={labelW}
                y={y}
                width={w}
                height={barH}
                rx={2}
                fill="#0088ff"
                opacity={0.6}
                style={{
                  transformOrigin: `${labelW}px ${y + barH / 2}px`,
                }}
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
