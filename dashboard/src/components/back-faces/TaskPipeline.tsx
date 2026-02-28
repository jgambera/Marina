import { useEffect, useRef } from "react";
import { useSystem } from "../../hooks/use-api";
import { SPRING_SNAPPY, animate, prefersReducedMotion, stagger } from "../../lib/animations";

const STAGES = [
  { key: "open", label: "Open", color: "#00ff88" },
  { key: "claimed", label: "Claimed", color: "#ffcc00" },
  { key: "submitted", label: "Submitted", color: "#0088ff" },
  { key: "completed", label: "Done", color: "#5a6a7a" },
] as const;

export function TaskPipeline() {
  const { data: systemData } = useSystem();
  const containerRef = useRef<SVGSVGElement>(null);
  const hasAnimated = useRef(false);

  const tasks = systemData?.tasks ?? {
    open: 0,
    claimed: 0,
    submitted: 0,
    completed: 0,
  };
  const values = [tasks.open, tasks.claimed, tasks.submitted, tasks.completed];
  const maxVal = Math.max(1, ...values);

  useEffect(() => {
    if (hasAnimated.current || !containerRef.current || prefersReducedMotion()) return;
    hasAnimated.current = true;

    const bars = containerRef.current.querySelectorAll(".pipe-bar");
    if (bars.length === 0) return;

    animate(bars, {
      scaleY: [0, 1],
      opacity: [0, 1],
      delay: stagger(80),
      ease: SPRING_SNAPPY,
      duration: 600,
    });
  }, []);

  const barW = 30;
  const gap = 20;
  const maxBarH = 100;
  const startX = 40;
  const baseY = 130;

  return (
    <div className="flex h-full flex-col p-2">
      <div className="text-[9px] text-text-dim uppercase tracking-wider mb-1">Task Pipeline</div>
      <svg
        ref={containerRef}
        viewBox="0 0 260 160"
        className="h-full w-full"
        role="img"
        aria-label="Task pipeline visualization"
      >
        {STAGES.map((stage, i) => {
          const x = startX + i * (barW + gap);
          const val = values[i]!;
          const h = (val / maxVal) * maxBarH;
          const y = baseY - h;

          return (
            <g key={stage.key}>
              {/* Bar */}
              <rect
                className="pipe-bar"
                x={x}
                y={y}
                width={barW}
                height={h}
                rx={3}
                fill={stage.color}
                opacity={0.7}
                style={{ transformOrigin: `${x + barW / 2}px ${baseY}px` }}
              />
              {/* Value on top */}
              <text
                x={x + barW / 2}
                y={y - 4}
                textAnchor="middle"
                fill="#c8d6e5"
                fontSize={9}
                fontFamily="Orbitron, monospace"
                fontWeight={700}
              >
                {val}
              </text>
              {/* Label below */}
              <text
                x={x + barW / 2}
                y={baseY + 12}
                textAnchor="middle"
                fill="#5a6a7a"
                fontSize={7}
                fontFamily="Share Tech Mono, monospace"
              >
                {stage.label}
              </text>
              {/* Arrow between stages */}
              {i < STAGES.length - 1 && (
                <text
                  x={x + barW + gap / 2}
                  y={baseY - maxBarH / 2}
                  textAnchor="middle"
                  fill="#2a3a4a"
                  fontSize={12}
                >
                  →
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
