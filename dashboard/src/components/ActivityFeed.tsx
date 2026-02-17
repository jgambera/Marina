import { ScrollText } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { useKeyboardNav } from "../hooks/use-keyboard-nav";
import { useWorldState } from "../hooks/use-world-state";
import type { DashboardEvent } from "../lib/types";
import { cn, formatTime } from "../lib/utils";
import { GlassPanel } from "./GlassPanel";

export function ActivityFeed() {
  const events = useWorldState((s) => s.eventFeed);
  const entities = useWorldState((s) => s.entities);
  const selectEntity = useWorldState((s) => s.selectEntity);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [events.length]);

  const onActivate = useCallback(
    (index: number) => {
      const event = events[index];
      if (!event?.entity) return;
      const name = entities.find((e) => e.id === event.entity)?.name;
      if (name) selectEntity(name);
    },
    [events, entities, selectEntity],
  );

  const { highlightedIndex, onKeyDown, containerRef } = useKeyboardNav({
    items: events,
    onActivate,
  });

  return (
    <GlassPanel title="Activity" icon={<ScrollText size={14} />}>
      <div
        ref={(el) => {
          (scrollRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
          (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
        }}
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="flex flex-col overflow-auto outline-none"
      >
        {events.length === 0 && (
          <div className="p-2 text-text-dim text-[11px]">Waiting for events...</div>
        )}
        {events.map((event, i) => (
          <EventRow
            key={`${event.timestamp}-${i}`}
            event={event}
            onEntityClick={selectEntity}
            isHighlighted={highlightedIndex === i}
          />
        ))}
      </div>
    </GlassPanel>
  );
}

function EventRow({
  event,
  onEntityClick,
  isHighlighted,
}: {
  event: DashboardEvent;
  onEntityClick: (name: string) => void;
  isHighlighted?: boolean;
}) {
  const entities = useWorldState((s) => s.entities);

  const entityName = event.entity
    ? (entities.find((e) => e.id === event.entity)?.name ?? event.entity)
    : undefined;

  let color = "text-text-dim";
  let prefix = "";
  let suffix = "";

  switch (event.type) {
    case "command":
      color = "text-primary";
      prefix = entityName ?? "";
      suffix = ` > ${event.input ?? ""}`;
      break;
    case "entity_enter":
      color = "text-secondary";
      prefix = entityName ?? "";
      suffix = ` -> ${event.room?.split("/")[1] ?? event.room ?? ""}`;
      break;
    case "entity_leave":
      color = "text-secondary";
      prefix = entityName ?? "";
      suffix = ` left ${event.room?.split("/")[1] ?? event.room ?? ""}`;
      break;
    case "connect":
      color = "text-success";
      suffix = `${event.connectionId} connected`;
      break;
    case "disconnect":
      color = "text-danger";
      suffix = `${event.connectionId} disconnected`;
      break;
    case "task_claimed":
    case "task_submitted":
    case "task_approved":
    case "task_rejected":
      color = "text-accent";
      prefix = entityName ?? "";
      suffix = ` ${event.type.replace("task_", "")} task #${event.taskId}`;
      break;
    default: {
      const label = event.type.replace(/_/g, " ");
      prefix = entityName ?? "";
      suffix = prefix
        ? ` ${label}${event.input ? `: ${event.input}` : ""}`
        : `${label}${event.input ? `: ${event.input}` : ""}`;
      if (prefix) {
        // already set
      } else {
        suffix = label + (event.input ? `: ${event.input}` : "");
      }
      break;
    }
  }

  return (
    <div
      data-kb-item
      className={cn(
        "flex items-start gap-2 px-2 py-0.5 text-[11px] leading-tight hover:bg-bg-hover",
        isHighlighted && "ring-1 ring-primary/40",
      )}
    >
      <span className="shrink-0 text-text-dim">{formatTime(event.timestamp)}</span>
      <span className={cn("truncate", color)}>
        {prefix && (
          <button
            type="button"
            className="hover:underline"
            onClick={() => entityName && onEntityClick(entityName)}
          >
            {prefix}
          </button>
        )}
        {suffix}
      </span>
    </div>
  );
}
