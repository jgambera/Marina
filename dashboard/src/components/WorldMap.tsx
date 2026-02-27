import React, { useCallback, useMemo, useRef, useState } from "react";
import { useWorldState } from "../hooks/use-world-state";
import type { EntitySummary, WorldData } from "../lib/types";
import {
  type RoomPosition,
  computeLayout,
  getDistrictColor,
  getDistrictLabel,
} from "../lib/world-graph";
import { GlassPanel } from "./GlassPanel";
import { Map as MapIcon } from "lucide-react";

function avg(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

// ── Memoized Room Node ────────────────────────────────────────────────
interface RoomNodeProps {
  room: RoomPosition;
  pop: number;
  isSelected: boolean;
  isHighlighted: boolean;
  isHub: boolean;
  shortName: string;
  entityNames: string[];
  onSelect: (roomId: string, isSelected: boolean) => void;
  onHover: (
    room: RoomPosition,
    radius: number,
    shortName: string,
    names: string[],
  ) => void;
  onLeave: () => void;
}

const RoomNode = React.memo(function RoomNode({
  room,
  pop,
  isSelected,
  isHighlighted,
  isHub,
  shortName,
  entityNames,
  onSelect,
  onHover,
  onLeave,
}: RoomNodeProps) {
  const color = getDistrictColor(room.district);
  const baseRadius = isHub ? 14 : 8;
  const radius = baseRadius + Math.min(pop * 2.5, 10);

  return (
    <g
      onClick={(e) => {
        e.stopPropagation();
        onSelect(room.id, isSelected);
      }}
      onMouseEnter={() =>
        onHover(room, radius, shortName, entityNames)
      }
      onMouseLeave={onLeave}
      className="cursor-pointer"
    >
      {/* Ambient halo */}
      <circle
        cx={room.x}
        cy={room.y}
        r={radius + 8}
        fill="none"
        stroke={color}
        strokeWidth={0.5}
        opacity={isSelected ? 0.5 : 0.15}
      />

      {/* Population pulse ring */}
      {pop > 0 && (
        <circle
          cx={room.x}
          cy={room.y}
          r={radius + 5}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          opacity={0.2}
        >
          <animate
            attributeName="opacity"
            values="0.15;0.5;0.15"
            dur="2.5s"
            repeatCount="indefinite"
          />
        </circle>
      )}

      {/* Selection ring */}
      {isSelected && (
        <circle
          cx={room.x}
          cy={room.y}
          r={radius + 11}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          opacity={0.7}
          filter="url(#glow-sm)"
        />
      )}

      {/* Keyboard highlight ring */}
      {isHighlighted && !isSelected && (
        <circle
          cx={room.x}
          cy={room.y}
          r={radius + 11}
          fill="none"
          stroke="#00ffe7"
          strokeWidth={1}
          strokeDasharray="4 3"
          opacity={0.7}
        />
      )}

      {/* Hub decorative rotating rings */}
      {isHub && (
        <circle
          cx={room.x}
          cy={room.y}
          r={radius + 20}
          fill="none"
          stroke={color}
          strokeWidth={0.6}
          strokeDasharray="3 5"
          opacity={0.3}
        >
          <animateTransform
            attributeName="transform"
            type="rotate"
            from={`0 ${room.x} ${room.y}`}
            to={`360 ${room.x} ${room.y}`}
            dur="30s"
            repeatCount="indefinite"
          />
        </circle>
      )}
      {isHub && (
        <circle
          cx={room.x}
          cy={room.y}
          r={radius + 26}
          fill="none"
          stroke={color}
          strokeWidth={0.4}
          strokeDasharray="2 8"
          opacity={0.2}
        >
          <animateTransform
            attributeName="transform"
            type="rotate"
            from={`360 ${room.x} ${room.y}`}
            to={`0 ${room.x} ${room.y}`}
            dur="45s"
            repeatCount="indefinite"
          />
        </circle>
      )}

      {/* Room circle */}
      <circle
        cx={room.x}
        cy={room.y}
        r={radius}
        fill={pop > 0 ? color : "#0d1420"}
        fillOpacity={pop > 0 ? 0.2 : 0.5}
        stroke={color}
        strokeWidth={isSelected ? 2 : isHub ? 1.5 : 1}
        opacity={isSelected ? 1 : 0.75}
        filter={pop > 0 || isHub ? "url(#glow-sm)" : undefined}
      />

      {/* Hub inner core glow */}
      {isHub && (
        <circle
          cx={room.x}
          cy={room.y}
          r={4}
          fill={color}
          opacity={0.6}
          filter="url(#glow-md)"
        >
          <animate
            attributeName="opacity"
            values="0.4;0.8;0.4"
            dur="3s"
            repeatCount="indefinite"
          />
        </circle>
      )}

      {/* Room label */}
      <text
        x={room.x}
        y={room.y + radius + 12}
        textAnchor="middle"
        fill={isSelected ? color : "#6a7a8a"}
        fontSize={isHub ? 9 : 7.5}
        fontFamily="Share Tech Mono, monospace"
        fontWeight={isHub ? 700 : 400}
      >
        {shortName}
      </text>
    </g>
  );
});

// ── Memoized Entity Dots ──────────────────────────────────────────────
interface EntityDotsProps {
  roomId: string;
  entities: EntitySummary[];
  pos: RoomPosition;
  isHub: boolean;
  onSelectEntity: (name: string) => void;
}

const EntityDots = React.memo(function EntityDots({
  entities,
  pos,
  isHub,
  onSelectEntity,
}: EntityDotsProps) {
  const baseRadius =
    (isHub ? 14 : 8) + Math.min(entities.length * 2.5, 10);

  return (
    <>
      {entities.map((ent, i) => {
        const angle =
          (2 * Math.PI * i) / entities.length - Math.PI / 2;
        const orbitR = baseRadius + 10;
        const ex = pos.x + Math.cos(angle) * orbitR;
        const ey = pos.y + Math.sin(angle) * orbitR;
        const dotColor =
          ent.kind === "agent"
            ? "#00ffe7"
            : ent.kind === "npc"
              ? "#ffcc00"
              : "#5a6a7a";

        return (
          <g key={ent.id}>
            <circle
              cx={ex}
              cy={ey}
              r={3.5}
              fill={dotColor}
              opacity={0.9}
              filter="url(#glow-sm)"
              className="cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                onSelectEntity(ent.name);
              }}
            />
            <circle
              cx={ex}
              cy={ey}
              r={1.2}
              fill="white"
              opacity={0.8}
              style={{ pointerEvents: "none" }}
            />
          </g>
        );
      })}
    </>
  );
});

// ── Main WorldMap Component ───────────────────────────────────────────
interface WorldMapProps {
  worldData?: WorldData;
}

export function WorldMap({ worldData }: WorldMapProps) {
  const selectedRoom = useWorldState((s) => s.selectedRoom);
  const selectRoom = useWorldState((s) => s.selectRoom);
  const selectEntity = useWorldState((s) => s.selectEntity);
  const wsEntities = useWorldState((s) => s.entities);
  const wsRooms = useWorldState((s) => s.rooms);
  const roomPops = useWorldState((s) => s.roomPopulations);
  const wsStartRoom = useWorldState((s) => s.startRoom);
  const wsWorldName = useWorldState((s) => s.worldName);

  const startRoom = wsStartRoom || worldData?.startRoom || "";
  const worldName = wsWorldName || worldData?.worldName || "";

  const DEFAULT_VIEWBOX = { x: 40, y: 15, w: 920, h: 720 };
  const [viewBox, setViewBox] = useState(DEFAULT_VIEWBOX);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    lines: string[];
  } | null>(null);
  const [highlightedRoom, setHighlightedRoom] = useState<
    string | null
  >(null);

  // ── Compute room positions + edges from live data ─────────────────
  const { allPositions, allEdges, posMap } = useMemo(() => {
    const rooms =
      wsRooms.length > 0 ? wsRooms : (worldData?.rooms ?? []);
    const { positions, edges } = computeLayout(rooms, startRoom);
    const pm = new Map(positions.map((p) => [p.id, p]));
    return { allPositions: positions, allEdges: edges, posMap: pm };
  }, [wsRooms, worldData, startRoom]);

  // ── District zones ────────────────────────────────────────────────
  const districtZones = useMemo(() => {
    const districts = new Map<string, RoomPosition[]>();
    for (const pos of allPositions) {
      const arr = districts.get(pos.district) || [];
      arr.push(pos);
      districts.set(pos.district, arr);
    }
    return Array.from(districts.entries()).map(
      ([district, rooms]) => {
        const cx = avg(rooms.map((r) => r.x));
        const cy = avg(rooms.map((r) => r.y));
        const maxDist = Math.max(
          ...rooms.map((r) =>
            Math.sqrt((r.x - cx) ** 2 + (r.y - cy) ** 2),
          ),
        );
        return {
          district,
          cx,
          cy,
          radius: maxDist + 70,
          color: getDistrictColor(district),
          label: getDistrictLabel(district),
        };
      },
    );
  }, [allPositions]);

  // ── Cross-district edges with gradient data ───────────────────────
  const crossEdges = useMemo(() => {
    return allEdges
      .filter((e) => e.crossDistrict)
      .map((edge) => {
        const from = posMap.get(edge.from);
        const to = posMap.get(edge.to);
        if (!from || !to) return null;
        const id = `eg-${edge.from.replace(/\//g, "-")}-${edge.to.replace(/\//g, "-")}`;
        return {
          edge,
          from,
          to,
          fromColor: getDistrictColor(from.district),
          toColor: getDistrictColor(to.district),
          id,
        };
      })
      .filter((g): g is NonNullable<typeof g> => g != null);
  }, [allEdges, posMap]);

  // ── Entity grouping by room ───────────────────────────────────────
  const entityPositions = useMemo(() => {
    const byRoom = new Map<string, typeof wsEntities>();
    for (const e of wsEntities) {
      const arr = byRoom.get(e.room) || [];
      arr.push(e);
      byRoom.set(e.room, arr);
    }
    return byRoom;
  }, [wsEntities]);

  // ── Room short name lookup ────────────────────────────────────────
  const roomShorts = useMemo(() => {
    const m = new Map<string, string>();
    const rooms =
      wsRooms.length > 0 ? wsRooms : (worldData?.rooms ?? []);
    for (const r of rooms) m.set(r.id, r.short);
    return m;
  }, [wsRooms, worldData]);

  // ── Stable callbacks for memoized children ────────────────────────
  const handleRoomSelect = useCallback(
    (roomId: string, isSelected: boolean) => {
      selectRoom(isSelected ? null : roomId);
    },
    [selectRoom],
  );

  const handleRoomHover = useCallback(
    (
      room: RoomPosition,
      radius: number,
      short: string,
      names: string[],
    ) => {
      const lines = [short];
      if (names.length > 0) lines.push(names.join(", "));
      setTooltip({ x: room.x, y: room.y - radius - 18, lines });
    },
    [],
  );

  const handleRoomLeave = useCallback(() => setTooltip(null), []);

  // ── Pan / zoom ────────────────────────────────────────────────────
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const scale = e.deltaY > 0 ? 1.1 : 0.9;
    setViewBox((vb) => {
      const cx = vb.x + vb.w / 2;
      const cy = vb.y + vb.h / 2;
      const nw = vb.w * scale;
      const nh = vb.h * scale;
      return {
        x: cx - nw / 2,
        y: cy - nh / 2,
        w: Math.max(200, Math.min(2000, nw)),
        h: Math.max(150, Math.min(1500, nh)),
      };
    });
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0)
      dragRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragRef.current || !svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const dx =
        ((e.clientX - dragRef.current.x) / rect.width) * viewBox.w;
      const dy =
        ((e.clientY - dragRef.current.y) / rect.height) * viewBox.h;
      dragRef.current = { x: e.clientX, y: e.clientY };
      setViewBox((vb) => ({ ...vb, x: vb.x - dx, y: vb.y - dy }));
    },
    [viewBox.w, viewBox.h],
  );

  const handleMouseUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const zoomBy = useCallback((scale: number) => {
    setViewBox((vb) => {
      const cx = vb.x + vb.w / 2;
      const cy = vb.y + vb.h / 2;
      const nw = Math.max(200, Math.min(2000, vb.w * scale));
      const nh = Math.max(150, Math.min(1500, vb.h * scale));
      return { x: cx - nw / 2, y: cy - nh / 2, w: nw, h: nh };
    });
  }, []);

  const panViewTo = useCallback((px: number, py: number) => {
    setViewBox((vb) => ({
      ...vb,
      x: px - vb.w / 2,
      y: py - vb.h / 2,
    }));
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const PAN = 50;
      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          if (e.shiftKey) {
            zoomBy(0.9);
          } else {
            setViewBox((vb) => ({ ...vb, y: vb.y - PAN }));
          }
          break;
        case "ArrowDown":
          e.preventDefault();
          if (e.shiftKey) {
            zoomBy(1.1);
          } else {
            setViewBox((vb) => ({ ...vb, y: vb.y + PAN }));
          }
          break;
        case "ArrowLeft":
          e.preventDefault();
          setViewBox((vb) => ({ ...vb, x: vb.x - PAN }));
          break;
        case "ArrowRight":
          e.preventDefault();
          setViewBox((vb) => ({ ...vb, x: vb.x + PAN }));
          break;
        case "+":
        case "=":
          e.preventDefault();
          zoomBy(0.9);
          break;
        case "-":
          e.preventDefault();
          zoomBy(1.1);
          break;
        case "0":
          e.preventDefault();
          setViewBox(DEFAULT_VIEWBOX);
          break;
        case "Tab": {
          e.preventDefault();
          if (allPositions.length === 0) break;
          const dir = e.shiftKey ? -1 : 1;
          const curIdx = highlightedRoom
            ? allPositions.findIndex(
                (p) => p.id === highlightedRoom,
              )
            : -1;
          let next: number;
          if (curIdx === -1) {
            next = dir > 0 ? 0 : allPositions.length - 1;
          } else {
            next =
              (((curIdx + dir) % allPositions.length) +
                allPositions.length) %
              allPositions.length;
          }
          const pos = allPositions[next]!;
          setHighlightedRoom(pos.id);
          panViewTo(pos.x, pos.y);
          break;
        }
        case "Enter":
          e.preventDefault();
          if (highlightedRoom) {
            selectRoom(
              selectedRoom === highlightedRoom
                ? null
                : highlightedRoom,
            );
          }
          break;
        case "Escape":
          setHighlightedRoom(null);
          break;
      }
    },
    [
      zoomBy,
      panViewTo,
      allPositions,
      highlightedRoom,
      selectRoom,
      selectedRoom,
    ],
  );

  const isHub = (id: string) => id === startRoom;

  return (
    <GlassPanel
      title={
        worldName ? `World Map — ${worldName}` : "World Map"
      }
      icon={<MapIcon size={14} />}
    >
      <svg
        ref={svgRef}
        tabIndex={0}
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
        className="h-full w-full cursor-grab outline-none focus:ring-1 focus:ring-primary/40 active:cursor-grabbing"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onKeyDown={handleKeyDown}
      >
        {/* ── Definitions ─────────────────────────────────── */}
        <defs>
          <filter
            id="glow-sm"
            x="-50%"
            y="-50%"
            width="200%"
            height="200%"
          >
            <feGaussianBlur stdDeviation="2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter
            id="glow-md"
            x="-50%"
            y="-50%"
            width="200%"
            height="200%"
          >
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* District zone radial gradients */}
          {districtZones.map((z) => (
            <radialGradient
              key={`zg-${z.district}`}
              id={`zg-${z.district}`}
            >
              <stop
                offset="0%"
                stopColor={z.color}
                stopOpacity="0.07"
              />
              <stop
                offset="60%"
                stopColor={z.color}
                stopOpacity="0.025"
              />
              <stop
                offset="100%"
                stopColor={z.color}
                stopOpacity="0"
              />
            </radialGradient>
          ))}

          {/* Cross-district edge linear gradients */}
          {crossEdges.map((g) => (
            <linearGradient
              key={g.id}
              id={g.id}
              x1={g.from.x}
              y1={g.from.y}
              x2={g.to.x}
              y2={g.to.y}
              gradientUnits="userSpaceOnUse"
            >
              <stop
                offset="0%"
                stopColor={g.fromColor}
                stopOpacity="0.7"
              />
              <stop
                offset="100%"
                stopColor={g.toColor}
                stopOpacity="0.7"
              />
            </linearGradient>
          ))}
        </defs>

        {/* ── Layer 1: District ambient zones ─────────────── */}
        {districtZones.map((z) => (
          <circle
            key={`zone-${z.district}`}
            cx={z.cx}
            cy={z.cy}
            r={z.radius}
            fill={`url(#zg-${z.district})`}
          />
        ))}

        {/* ── Layer 2: District labels (watermark) ────────── */}
        {districtZones.map((z) => (
          <text
            key={`dl-${z.district}`}
            x={z.cx}
            y={z.cy + 5}
            textAnchor="middle"
            dominantBaseline="central"
            fill={z.color}
            opacity={0.09}
            fontSize={22}
            fontFamily="Orbitron, monospace"
            fontWeight={700}
            letterSpacing="0.18em"
          >
            {z.label}
          </text>
        ))}

        {/* ── Layer 3: Within-district edges ──────────────── */}
        {allEdges
          .filter((e) => !e.crossDistrict)
          .map((edge) => {
            const from = posMap.get(edge.from);
            const to = posMap.get(edge.to);
            if (!from || !to) return null;
            return (
              <line
                key={`e-${edge.from}-${edge.to}`}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke={getDistrictColor(from.district)}
                strokeWidth={1.2}
                opacity={0.3}
              />
            );
          })}

        {/* ── Layer 4: Cross-district edges (gradient) ────── */}
        {crossEdges.map((g) => (
          <line
            key={`ce-${g.edge.from}-${g.edge.to}`}
            x1={g.from.x}
            y1={g.from.y}
            x2={g.to.x}
            y2={g.to.y}
            stroke={`url(#${g.id})`}
            strokeWidth={1.5}
            opacity={0.5}
            strokeDasharray="8 4"
          />
        ))}

        {/* ── Layer 5: Pulse particles on cross edges ─────── */}
        {crossEdges.map((g, i) => {
          const dur = 3 + (i % 4);
          const reverse = i % 2 === 1;
          const x1 = reverse ? g.to.x : g.from.x;
          const y1 = reverse ? g.to.y : g.from.y;
          const x2 = reverse ? g.from.x : g.to.x;
          const y2 = reverse ? g.from.y : g.to.y;
          const color = reverse ? g.toColor : g.fromColor;
          return (
            <circle
              key={`pulse-${i}`}
              r={1.8}
              fill={color}
              opacity={0}
              filter="url(#glow-sm)"
            >
              <animate
                attributeName="cx"
                from={x1}
                to={x2}
                dur={`${dur}s`}
                repeatCount="indefinite"
                begin={`${i * 0.7}s`}
              />
              <animate
                attributeName="cy"
                from={y1}
                to={y2}
                dur={`${dur}s`}
                repeatCount="indefinite"
                begin={`${i * 0.7}s`}
              />
              <animate
                attributeName="opacity"
                values="0;0.8;0.8;0"
                keyTimes="0;0.1;0.9;1"
                dur={`${dur}s`}
                repeatCount="indefinite"
                begin={`${i * 0.7}s`}
              />
            </circle>
          );
        })}

        {/* ── Layer 6: Room nodes (memoized) ──────────────── */}
        {allPositions.map((room) => {
          const pop = roomPops[room.id] ?? 0;
          const ents = entityPositions.get(room.id);
          const names = ents?.map((ent) => ent.name) || [];
          const short =
            roomShorts.get(room.id) ??
            room.id.split("/")[1] ??
            room.id;
          return (
            <RoomNode
              key={room.id}
              room={room}
              pop={pop}
              isSelected={selectedRoom === room.id}
              isHighlighted={highlightedRoom === room.id}
              isHub={isHub(room.id)}
              shortName={short}
              entityNames={names}
              onSelect={handleRoomSelect}
              onHover={handleRoomHover}
              onLeave={handleRoomLeave}
            />
          );
        })}

        {/* ── Layer 7: Entity orbit dots (memoized) ───────── */}
        {Array.from(entityPositions.entries()).map(
          ([roomId, ents]) => {
            const pos = posMap.get(roomId);
            if (!pos) return null;
            return (
              <EntityDots
                key={roomId}
                roomId={roomId}
                entities={ents}
                pos={pos}
                isHub={isHub(roomId)}
                onSelectEntity={selectEntity}
              />
            );
          },
        )}

        {/* ── Tooltip ─────────────────────────────────────── */}
        {tooltip && (
          <g>
            {(() => {
              const lineH = 10;
              const pad = 6;
              const maxLen = Math.max(
                ...tooltip.lines.map((l) => l.length),
              );
              const w = Math.max(maxLen * 5 + pad * 2, 60);
              const h = tooltip.lines.length * lineH + pad * 2;
              return (
                <>
                  <rect
                    x={tooltip.x - w / 2}
                    y={tooltip.y - h / 2}
                    width={w}
                    height={h}
                    rx={4}
                    fill="#0d1420"
                    stroke="#1a2538"
                    strokeWidth={0.5}
                    opacity={0.95}
                  />
                  {tooltip.lines.map((line, i) => (
                    <text
                      key={i}
                      x={tooltip.x}
                      y={
                        tooltip.y -
                        h / 2 +
                        pad +
                        8 +
                        i * lineH
                      }
                      textAnchor="middle"
                      fill={i === 0 ? "#c8d6e5" : "#8a9ab0"}
                      fontSize={i === 0 ? 8 : 6.5}
                      fontFamily="Share Tech Mono, monospace"
                    >
                      {line}
                    </text>
                  ))}
                </>
              );
            })()}
          </g>
        )}
      </svg>
    </GlassPanel>
  );
}
