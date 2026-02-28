import { useEffect, useRef } from "react";
import { useWorld } from "../../hooks/use-api";
import { useWorldState } from "../../hooks/use-world-state";
import { SPRING_SNAPPY, createTimeline, prefersReducedMotion } from "../../lib/animations";
import { getDistrictColor } from "../../lib/world-graph";

export function RoomNeighborhood() {
  const selectedRoom = useWorldState((s) => s.selectedRoom);
  const wsRooms = useWorldState((s) => s.rooms);
  const { data: worldData } = useWorld();
  const containerRef = useRef<SVGSVGElement>(null);
  const lastRoomRef = useRef<string | null>(null);

  const rooms = wsRooms.length > 0 ? wsRooms : (worldData?.rooms ?? []);
  const roomMap = new Map(rooms.map((r) => [r.id, r]));

  if (!selectedRoom) {
    return (
      <div className="flex h-full items-center justify-center p-2">
        <span className="text-text-dim text-[10px]">Select a room to see neighbors</span>
      </div>
    );
  }

  const center = roomMap.get(selectedRoom);
  if (!center) {
    return (
      <div className="flex h-full items-center justify-center p-2">
        <span className="text-text-dim text-[10px]">Room not found</span>
      </div>
    );
  }

  const neighbors = Object.entries(center.exits).map(([dir, targetId]) => ({
    dir,
    id: targetId,
    room: roomMap.get(targetId),
  }));

  const cx = 130;
  const cy = 80;
  const radius = 55;
  const centerColor = getDistrictColor(center.district);

  // Position neighbors radially
  const dirAngles: Record<string, number> = {
    north: -Math.PI / 2,
    south: Math.PI / 2,
    east: 0,
    west: Math.PI,
    northeast: -Math.PI / 4,
    northwest: (-3 * Math.PI) / 4,
    southeast: Math.PI / 4,
    southwest: (3 * Math.PI) / 4,
    up: -Math.PI / 2,
    down: Math.PI / 2,
  };

  const neighborPositions = neighbors.map((n, i) => {
    const angle = dirAngles[n.dir] ?? (2 * Math.PI * i) / neighbors.length - Math.PI / 2;
    return {
      ...n,
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
    };
  });

  // Animate on room change
  useEffect(() => {
    if (!containerRef.current || prefersReducedMotion() || selectedRoom === lastRoomRef.current)
      return;
    lastRoomRef.current = selectedRoom;

    const centerEl = containerRef.current.querySelector(".nh-center");
    const neighborEls = containerRef.current.querySelectorAll(".nh-neighbor");
    const edgeEls = containerRef.current.querySelectorAll(".nh-edge");

    const tl = createTimeline({ defaults: { duration: 400 } });

    if (centerEl) {
      tl.add(centerEl, {
        scale: [0, 1],
        opacity: [0, 1],
        ease: SPRING_SNAPPY,
      });
    }
    if (neighborEls.length > 0) {
      tl.add(
        neighborEls,
        {
          scale: [0, 1],
          opacity: [0, 1],
          ease: SPRING_SNAPPY,
        },
        "-=200",
      );
    }
    if (edgeEls.length > 0) {
      tl.add(
        edgeEls,
        {
          opacity: [0, 0.5],
          duration: 300,
        },
        "-=200",
      );
    }
  }, [selectedRoom]);

  return (
    <div className="flex h-full flex-col p-2">
      <div className="text-[9px] text-text-dim uppercase tracking-wider mb-1">
        Neighborhood: {center.short}
      </div>
      <svg
        ref={containerRef}
        viewBox="0 0 260 170"
        className="h-full w-full"
        role="img"
        aria-label="Room neighborhood map"
      >
        {/* Edges */}
        {neighborPositions.map((n) => (
          <line
            key={`edge-${n.dir}`}
            className="nh-edge"
            x1={cx}
            y1={cy}
            x2={n.x}
            y2={n.y}
            stroke={centerColor}
            strokeWidth={1}
            opacity={0.5}
            strokeDasharray="4 3"
          />
        ))}

        {/* Center node */}
        <g className="nh-center">
          <circle
            cx={cx}
            cy={cy}
            r={16}
            fill={centerColor}
            fillOpacity={0.2}
            stroke={centerColor}
            strokeWidth={1.5}
          />
          <text
            x={cx}
            y={cy + 3}
            textAnchor="middle"
            fill={centerColor}
            fontSize={7}
            fontFamily="Share Tech Mono, monospace"
            fontWeight={700}
          >
            {center.short}
          </text>
        </g>

        {/* Neighbor nodes */}
        {neighborPositions.map((n) => {
          const nColor = n.room ? getDistrictColor(n.room.district) : "#5a6a7a";
          return (
            <g key={n.dir} className="nh-neighbor">
              <circle
                cx={n.x}
                cy={n.y}
                r={12}
                fill={nColor}
                fillOpacity={0.15}
                stroke={nColor}
                strokeWidth={1}
              />
              <text
                x={n.x}
                y={n.y - 2}
                textAnchor="middle"
                fill={nColor}
                fontSize={6}
                fontFamily="Share Tech Mono, monospace"
              >
                {n.room?.short ?? n.id.split("/")[1] ?? "?"}
              </text>
              <text
                x={n.x}
                y={n.y + 7}
                textAnchor="middle"
                fill="#5a6a7a"
                fontSize={5}
                fontFamily="Share Tech Mono, monospace"
              >
                {n.dir.slice(0, 2).toUpperCase()}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
