import { Code, DoorOpen, Eye } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRoomDetail } from "../hooks/use-api";
import { useKeyboardNav } from "../hooks/use-keyboard-nav";
import { useWorldState } from "../hooks/use-world-state";
import { cn } from "../lib/utils";
import { getDistrictColor } from "../lib/world-graph";
import { GlassPanel } from "./GlassPanel";

type ViewMode = "view" | "source";

export function RoomDetail() {
  const selectedRoom = useWorldState((s) => s.selectedRoom);
  const selectRoom = useWorldState((s) => s.selectRoom);
  const selectEntity = useWorldState((s) => s.selectEntity);
  const { data, isLoading, isError } = useRoomDetail(selectedRoom);
  const [mode, setMode] = useState<ViewMode>("view");

  // Reset to view mode when room changes
  useEffect(() => {
    setMode("view");
  }, [selectedRoom]);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  if (!selectedRoom) {
    return (
      <GlassPanel title="Room Detail" icon={<DoorOpen size={14} />}>
        <div className="p-2 text-text-dim text-[11px]">Click a room on the map to inspect it.</div>
      </GlassPanel>
    );
  }

  const district = selectedRoom.split("/")[0] ?? "";
  const districtColor = getDistrictColor(district);

  // Build flat navigable items list: exits then entities
  const navItems = useMemo(() => {
    if (!data) return [];
    const items: { type: "exit" | "entity"; key: string; label: string }[] = [];
    for (const [dir, target] of Object.entries(data.exits)) {
      items.push({ type: "exit", key: target, label: dir });
    }
    for (const e of data.entities) {
      items.push({ type: "entity", key: e.name, label: e.name });
    }
    return items;
  }, [data]);

  const onActivateNav = useCallback(
    (index: number) => {
      const item = navItems[index];
      if (!item) return;
      if (item.type === "exit") selectRoom(item.key);
      else selectEntity(item.key);
    },
    [navItems, selectRoom, selectEntity],
  );

  const {
    highlightedIndex: navHighlight,
    onKeyDown: navKeyDown,
    containerRef: navContainerRef,
  } = useKeyboardNav({ items: navItems, onActivate: onActivateNav });

  return (
    <GlassPanel title="Room Detail" icon={<DoorOpen size={14} />}>
      <div
        ref={navContainerRef}
        tabIndex={0}
        onKeyDown={navKeyDown}
        className="flex flex-1 flex-col overflow-hidden text-[11px] outline-none"
      >
        {isLoading && <div className="p-2 text-text-dim">Loading...</div>}
        {isError && (
          <div className="p-2 text-red-400 text-[11px]">Failed to load room details.</div>
        )}
        {data && (
          <>
            {/* Header row: district badge + name + mode toggle */}
            <div className="flex items-center gap-2 px-2 pt-1.5 pb-1">
              <span
                className="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase"
                style={{
                  backgroundColor: `${districtColor}20`,
                  color: districtColor,
                }}
              >
                {district}
              </span>
              <span className="flex-1 font-display text-text-bright text-[12px]">{data.short}</span>

              {/* View / Source toggle */}
              {data.source && (
                <div className="flex rounded border border-border text-[10px]">
                  <button
                    type="button"
                    onClick={() => setMode("view")}
                    className={cn(
                      "flex items-center gap-0.5 px-1.5 py-0.5 transition-colors",
                      mode === "view"
                        ? "bg-primary/15 text-primary"
                        : "text-text-dim hover:text-text",
                    )}
                  >
                    <Eye size={9} />
                    View
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("source")}
                    className={cn(
                      "flex items-center gap-0.5 border-l border-border px-1.5 py-0.5 transition-colors",
                      mode === "source"
                        ? "bg-primary/15 text-primary"
                        : "text-text-dim hover:text-text",
                    )}
                  >
                    <Code size={9} />
                    Source
                  </button>
                </div>
              )}
            </div>

            {/* Content area */}
            <div className="flex-1 overflow-auto">
              {mode === "view" ? (
                <div className="flex flex-col gap-1.5 px-2 pb-2">
                  <p className="text-text leading-relaxed">{data.long}</p>

                  {/* Exits */}
                  <div>
                    <span className="text-text-dim">Exits: </span>
                    {Object.entries(data.exits).map(([dir, target], i) => (
                      <button
                        key={dir}
                        type="button"
                        data-kb-item
                        className={cn(
                          "mr-2 text-secondary hover:underline",
                          navHighlight === i && "ring-1 ring-primary/40 rounded px-0.5",
                        )}
                        onClick={() => selectRoom(target)}
                      >
                        {dir}
                      </button>
                    ))}
                  </div>

                  {/* Entities */}
                  {data.entities.length > 0 && (
                    <div>
                      <span className="text-text-dim">Here: </span>
                      {data.entities.map((e, i) => {
                        const navIdx = Object.keys(data.exits).length + i;
                        return (
                          <button
                            key={e.id}
                            type="button"
                            data-kb-item
                            className={cn(
                              "mr-2 text-primary hover:underline",
                              navHighlight === navIdx && "ring-1 ring-primary/40 rounded px-0.5",
                            )}
                            onClick={() => selectEntity(e.name)}
                          >
                            {e.name}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Items — clickable, expand to show description */}
                  {Object.keys(data.items).length > 0 && (
                    <div>
                      <span className="text-text-dim">Items: </span>
                      {Object.entries(data.items).map(([name, desc]) => (
                        <span key={name}>
                          <button
                            type="button"
                            className={cn(
                              "mr-1 transition-colors hover:underline",
                              expandedItem === name ? "text-warning" : "text-teal",
                            )}
                            onClick={() => setExpandedItem(expandedItem === name ? null : name)}
                          >
                            {name}
                          </button>
                          {expandedItem === name && (
                            <div className="animate-fade-in my-1 rounded border border-border bg-bg px-2 py-1 text-[10px] text-text leading-relaxed">
                              {desc}
                            </div>
                          )}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <pre className="h-full overflow-auto bg-bg p-2 text-[10px] leading-relaxed">
                  <HighlightedSource code={data.source!} />
                </pre>
              )}
            </div>
          </>
        )}
      </div>
    </GlassPanel>
  );
}

function HighlightedSource({ code }: { code: string }) {
  const lines = code.split("\n");
  return (
    <>
      {lines.map((line, i) => (
        <div key={i}>
          <span className="text-text-dim select-none mr-2">{String(i + 1).padStart(3)}</span>
          <span
            dangerouslySetInnerHTML={{
              __html: highlightLine(line),
            }}
          />
        </div>
      ))}
    </>
  );
}

function highlightLine(line: string): string {
  return line
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(
      /\b(import|export|from|const|let|var|function|return|if|else|for|of|in|type|interface|default|as|new|true|false|null|undefined)\b/g,
      '<span style="color:#00ffe7">$1</span>',
    )
    .replace(
      /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g,
      '<span style="color:#00ff88">$1</span>',
    )
    .replace(/(\/\/.*)/g, '<span style="color:#5a6a7a">$1</span>');
}
