import { useEffect, useMemo, useRef } from "react";
import { useSystem, useWorld } from "../../hooks/use-api";
import { useWorldState } from "../../hooks/use-world-state";
import { SPRING_BOUNCY, animate, prefersReducedMotion } from "../../lib/animations";

function ArcGauge({
  label,
  value,
  max,
  unit,
  color,
  cx,
  cy,
  r,
}: {
  label: string;
  value: number;
  max: number;
  unit: string;
  color: string;
  cx: number;
  cy: number;
  r: number;
}) {
  const arcRef = useRef<SVGCircleElement>(null);
  const circumference = 2 * Math.PI * r;
  const pct = Math.min(value / Math.max(max, 1), 1);
  const dashLen = circumference * pct;

  useEffect(() => {
    if (!arcRef.current || prefersReducedMotion()) return;

    // Animate stroke-dashoffset from full circumference to target
    animate(arcRef.current, {
      strokeDashoffset: [circumference, circumference - dashLen],
      ease: SPRING_BOUNCY,
      duration: 800,
    });
  }, [dashLen, circumference]);

  return (
    <g>
      {/* Background track */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="#1a2538"
        strokeWidth={4}
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      {/* Animated arc */}
      <circle
        ref={arcRef}
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={4}
        strokeLinecap="round"
        strokeDasharray={`${circumference}`}
        strokeDashoffset={prefersReducedMotion() ? circumference - dashLen : circumference}
        transform={`rotate(-90 ${cx} ${cy})`}
        opacity={0.8}
      />
      {/* Label */}
      <text
        x={cx}
        y={cy - 4}
        textAnchor="middle"
        fill={color}
        fontSize={11}
        fontFamily="Orbitron, monospace"
        fontWeight={700}
      >
        {Math.round(pct * 100)}%
      </text>
      <text
        x={cx}
        y={cy + 10}
        textAnchor="middle"
        fill="#5a6a7a"
        fontSize={7}
        fontFamily="Share Tech Mono, monospace"
      >
        {label}
      </text>
      <text
        x={cx}
        y={cy + 20}
        textAnchor="middle"
        fill="#8a9ab0"
        fontSize={6}
        fontFamily="Share Tech Mono, monospace"
      >
        {unit}
      </text>
    </g>
  );
}

export function SystemGauges() {
  const memory = useWorldState((s) => s.memory);
  const entities = useWorldState((s) => s.entities);
  const eventFeed = useWorldState((s) => s.eventFeed);
  const { data: systemData } = useSystem();
  const { data: worldData } = useWorld();

  const cmdsPerMin = useMemo(() => {
    const oneMinAgo = Date.now() - 60_000;
    return eventFeed.filter((e) => e.type === "command" && e.timestamp > oneMinAgo).length;
  }, [eventFeed]);

  const heapMax = memory.rss > 0 ? memory.rss : 256 * 1024 * 1024;
  const entityMax = worldData?.rooms ? worldData.rooms.length * 4 : 100;
  const cmdMax = 120;

  const formatMB = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(0)}MB`;

  return (
    <div className="flex h-full flex-col p-2">
      <div className="text-[9px] text-text-dim uppercase tracking-wider mb-1">System Gauges</div>
      <svg
        viewBox="0 0 300 110"
        className="h-full w-full"
        role="img"
        aria-label="System performance gauges"
      >
        <ArcGauge
          label="Heap"
          value={memory.heapUsed}
          max={heapMax}
          unit={formatMB(memory.heapUsed)}
          color="#00ffe7"
          cx={55}
          cy={55}
          r={35}
        />
        <ArcGauge
          label="Entities"
          value={entities.length}
          max={entityMax}
          unit={`${entities.length}/${entityMax}`}
          color="#0088ff"
          cx={150}
          cy={55}
          r={35}
        />
        <ArcGauge
          label="Cmd/min"
          value={cmdsPerMin}
          max={cmdMax}
          unit={`${cmdsPerMin}/min`}
          color="#bf00ff"
          cx={245}
          cy={55}
          r={35}
        />
      </svg>
    </div>
  );
}
