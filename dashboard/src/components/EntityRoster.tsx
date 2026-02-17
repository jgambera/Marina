import { ChevronDown, ChevronRight, Trash2, Users } from "lucide-react";
import { useCallback, useState } from "react";
import { useEntityDetail } from "../hooks/use-api";
import { useKeyboardNav } from "../hooks/use-keyboard-nav";
import { useWorldState } from "../hooks/use-world-state";
import { deleteApi } from "../lib/api";
import { cn, formatTime } from "../lib/utils";
import { GlassPanel } from "./GlassPanel";

export function EntityRoster() {
  const entities = useWorldState((s) => s.entities);
  const selectedEntity = useWorldState((s) => s.selectedEntity);
  const selectEntity = useWorldState((s) => s.selectEntity);
  const selectRoom = useWorldState((s) => s.selectRoom);

  const sorted = [...entities].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "agent" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const onActivate = useCallback(
    (index: number) => {
      const ent = sorted[index];
      if (!ent) return;
      selectEntity(selectedEntity === ent.name ? null : ent.name);
    },
    [sorted, selectEntity, selectedEntity],
  );

  const { highlightedIndex, onKeyDown, containerRef } = useKeyboardNav({
    items: sorted,
    onActivate,
  });

  return (
    <GlassPanel title="Entities" icon={<Users size={14} />}>
      <div
        ref={containerRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="flex flex-col outline-none"
      >
        {sorted.length === 0 && (
          <div className="p-2 text-text-dim text-[11px]">No entities online</div>
        )}
        {sorted.map((e, idx) => {
          const isSelected = selectedEntity === e.name;
          const isHighlighted = highlightedIndex === idx;
          return (
            <div key={e.id} data-kb-item>
              <button
                type="button"
                onClick={() => selectEntity(isSelected ? null : e.name)}
                className={cn(
                  "flex w-full items-center gap-2 px-2 py-1 text-left text-[12px] transition-colors hover:bg-bg-hover",
                  isSelected && "bg-bg-hover",
                  isHighlighted && "ring-1 ring-primary/40",
                )}
              >
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{
                    backgroundColor:
                      e.kind === "agent" ? "#00ffe7" : e.kind === "npc" ? "#ffcc00" : "#5a6a7a",
                  }}
                />
                <span className="flex-1 truncate text-text-bright">{e.name}</span>
                <span className="truncate text-text-dim text-[10px]">{e.room.split("/")[1]}</span>
                <button
                  type="button"
                  title={`Remove ${e.name}`}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    if (window.confirm(`Remove entity "${e.name}"?`)) {
                      deleteApi(`/api/entities/${encodeURIComponent(e.name)}`);
                    }
                  }}
                  className="text-text-dim hover:text-red-400 transition-colors"
                >
                  <Trash2 size={10} />
                </button>
                {isSelected ? (
                  <ChevronDown size={10} className="text-text-dim" />
                ) : (
                  <ChevronRight size={10} className="text-text-dim" />
                )}
              </button>

              {isSelected && (
                <EntityExpandedDetail
                  name={e.name}
                  room={e.room}
                  onRoomClick={() => selectRoom(e.room)}
                />
              )}
            </div>
          );
        })}
      </div>
    </GlassPanel>
  );
}

function EntityExpandedDetail({
  name,
  room,
  onRoomClick,
}: {
  name: string;
  room: string;
  onRoomClick: () => void;
}) {
  const { data, isLoading } = useEntityDetail(name);
  const [expandedNoteId, setExpandedNoteId] = useState<number | null>(null);

  return (
    <div className="animate-fade-in border-t border-border bg-bg-card px-2 py-1 text-[11px]">
      {isLoading && <div className="text-text-dim">Loading...</div>}
      {data && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className="text-text-dim">Room:</span>
            <button type="button" onClick={onRoomClick} className="text-secondary hover:underline">
              {room}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-text-dim">Rank:</span>
            <span className="text-text-bright">{data.rank}</span>
          </div>

          {/* Core Memory */}
          {data.coreMemory && data.coreMemory.length > 0 && (
            <div>
              <div className="text-primary text-[10px] uppercase tracking-wider mb-0.5">
                Core Memory
              </div>
              {data.coreMemory.map((m) => (
                <div key={m.key} className="flex gap-1 text-[10px] leading-tight">
                  <span className="text-secondary">{m.key}:</span>
                  <span className="text-text truncate">{m.value}</span>
                  <span className="text-text-dim">(v{m.version})</span>
                </div>
              ))}
            </div>
          )}

          {/* Recent Notes */}
          {data.notes && data.notes.length > 0 && (
            <div>
              <div className="text-primary text-[10px] uppercase tracking-wider mb-0.5">
                Notes ({data.notes.length})
              </div>
              {data.notes.slice(0, 5).map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => setExpandedNoteId(expandedNoteId === n.id ? null : n.id)}
                  className="flex w-full gap-1 text-[10px] leading-tight text-left hover:bg-bg-hover transition-colors"
                >
                  <span className="text-warning shrink-0">!{n.importance}</span>
                  <span className="text-accent shrink-0">#{n.note_type}</span>
                  <span
                    className={cn(
                      "text-text",
                      expandedNoteId === n.id ? "whitespace-pre-wrap" : "truncate",
                    )}
                  >
                    {n.content}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Recent Activity */}
          {data.recentActivity && data.recentActivity.length > 0 && (
            <div>
              <div className="text-primary text-[10px] uppercase tracking-wider mb-0.5">
                Recent Activity
              </div>
              {data.recentActivity.slice(0, 8).map((a, i) => (
                <div key={i} className="flex gap-1 text-[10px] leading-tight">
                  <span className="text-text-dim">{formatTime(a.timestamp)}</span>
                  <span className="text-text">{a.input ?? a.type}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
