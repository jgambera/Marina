import { useEffect, useRef } from "react";
import { useWorldState } from "../../hooks/use-world-state";
import { animate, prefersReducedMotion, stagger } from "../../lib/animations";
import type { WorldData } from "../../lib/types";
import { computeLayout, getDistrictColor } from "../../lib/world-graph";

interface WorldMapHeatmapProps {
  worldData?: WorldData;
}

export function WorldMapHeatmap({ worldData }: WorldMapHeatmapProps) {
  const eventFeed = useWorldState((s) => s.eventFeed);
  const wsRooms = useWorldState((s) => s.rooms);
  const wsStartRoom = useWorldState((s) => s.startRoom);
  const containerRef = useRef<SVGSVGElement>(null);
  const hasAnimated = useRef(false);

  const startRoom = wsStartRoom || worldData?.startRoom || "";
  const rooms = wsRooms.length > 0 ? wsRooms : (worldData?.rooms ?? []);
  const { positions } = computeLayout(rooms, startRoom);

  // Count events per room from feed
  const roomEventCounts = new Map<string, number>();
  for (const ev of eventFeed) {
    if (ev.room) {
      roomEventCounts.set(ev.room, (roomEventCounts.get(ev.room) ?? 0) + 1);
    }
  }
  const maxCount = Math.max(1, ...roomEventCounts.values());

  // Entrance animation
  useEffect(() => {
    if (
      hasAnimated.current ||
      !containerRef.current ||
      prefersReducedMotion() ||
      positions.length === 0
    )
      return;
    hasAnimated.current = true;

    const rects = containerRef.current.querySelectorAll(".heatmap-cell");
    if (rects.length === 0) return;

    animate(rects, {
      opacity: [0, 1],
      scale: [0.5, 1],
      delay: stagger(30),
      duration: 400,
      ease: "outQuad",
    });
  }, [positions.length]);

  return (
    <div className="flex h-full flex-col p-2">
      <div className="text-[9px] text-text-dim uppercase tracking-wider mb-1">Event Heatmap</div>
      <svg
        ref={containerRef}
        viewBox="40 15 920 720"
        className="h-full w-full"
        role="img"
        aria-label="Event heatmap"
      >
        {positions.map((pos) => {
          const count = roomEventCounts.get(pos.id) ?? 0;
          const intensity = count / maxCount;
          const color = getDistrictColor(pos.district);
          return (
            <g key={pos.id} className="heatmap-cell">
              <circle cx={pos.x} cy={pos.y} r={18} fill={color} opacity={0.1 + intensity * 0.7} />
              <circle
                cx={pos.x}
                cy={pos.y}
                r={8 + intensity * 10}
                fill={color}
                opacity={0.2 + intensity * 0.5}
              />
              {count > 0 && (
                <text
                  x={pos.x}
                  y={pos.y + 3}
                  textAnchor="middle"
                  fill="#c8d6e5"
                  fontSize={7}
                  fontFamily="Share Tech Mono, monospace"
                >
                  {count}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
