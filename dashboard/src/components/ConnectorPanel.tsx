import { Play, Plus, Radio, Square, Trash2 } from "lucide-react";
import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAdapters } from "../hooks/use-api";
import { deleteApi, postApi } from "../lib/api";
import type { PlatformAdapterEntry } from "../lib/types";
import { cn } from "../lib/utils";
import { AddAdapterModal } from "./AddAdapterModal";
import { GlassPanel } from "./GlassPanel";

const STATUS_COLORS: Record<string, string> = {
  running: "#00ffe7",
  starting: "#ffcc00",
  stopping: "#ffcc00",
  stopped: "#5a6a7a",
  error: "#ff4444",
};

const TYPE_LABELS: Record<string, string> = {
  discord: "Discord",
  telegram: "Telegram",
  signal: "Signal",
};

export function ConnectorPanel() {
  const { data: adapters } = useAdapters();
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const list = adapters ?? [];

  const handleStart = useCallback(
    async (id: string) => {
      setBusy(id);
      try {
        await postApi(`/api/adapters/${encodeURIComponent(id)}/start`, {});
        queryClient.invalidateQueries({ queryKey: ["adapters"] });
      } catch {
        // best effort
      } finally {
        setBusy(null);
      }
    },
    [queryClient],
  );

  const handleStop = useCallback(
    async (id: string) => {
      setBusy(id);
      try {
        await postApi(`/api/adapters/${encodeURIComponent(id)}/stop`, {});
        queryClient.invalidateQueries({ queryKey: ["adapters"] });
      } catch {
        // best effort
      } finally {
        setBusy(null);
      }
    },
    [queryClient],
  );

  const handleRemove = useCallback(
    async (id: string) => {
      setBusy(id);
      try {
        await deleteApi(`/api/adapters/${encodeURIComponent(id)}`);
        queryClient.invalidateQueries({ queryKey: ["adapters"] });
      } catch {
        // best effort
      } finally {
        setBusy(null);
      }
    },
    [queryClient],
  );

  return (
    <>
      <GlassPanel title="Connectors" icon={<Radio size={14} />}>
        <div className="flex flex-col overflow-y-auto">
          <div className="flex items-center justify-end px-2 py-1 border-b border-border">
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-1 text-[10px] text-primary hover:text-text-bright transition-colors"
              title="Add adapter"
            >
              <Plus size={12} />
              <span>Add</span>
            </button>
          </div>

          {list.length === 0 && (
            <div className="p-2 text-text-dim text-[11px]">No platform adapters configured</div>
          )}

          {list.map((adapter) => (
            <AdapterRow
              key={adapter.id}
              adapter={adapter}
              isBusy={busy === adapter.id}
              onStart={handleStart}
              onStop={handleStop}
              onRemove={handleRemove}
            />
          ))}
        </div>
      </GlassPanel>

      {showAdd && (
        <AddAdapterModal
          onClose={() => setShowAdd(false)}
          onCreated={() => {
            queryClient.invalidateQueries({ queryKey: ["adapters"] });
            setShowAdd(false);
          }}
        />
      )}
    </>
  );
}

function AdapterRow({
  adapter,
  isBusy,
  onStart,
  onStop,
  onRemove,
}: {
  adapter: PlatformAdapterEntry;
  isBusy: boolean;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const isRunning = adapter.status === "running" || adapter.status === "starting";

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-2 py-1 text-[12px] hover:bg-bg-hover transition-colors",
      )}
    >
      <span
        className="inline-block h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: STATUS_COLORS[adapter.status] ?? "#5a6a7a" }}
        title={adapter.error ? `${adapter.status}: ${adapter.error}` : adapter.status}
      />
      <span className="shrink-0 rounded bg-bg-card px-1 text-[9px] text-secondary uppercase">
        {TYPE_LABELS[adapter.type] ?? adapter.type}
      </span>
      <span className="flex-1 truncate text-text-dim text-[10px]" title={adapter.token}>
        {adapter.token}
      </span>
      {adapter.error && (
        <span className="truncate text-red-400 text-[9px] max-w-[120px]" title={adapter.error}>
          {adapter.error}
        </span>
      )}
      <button
        type="button"
        title={isRunning ? "Stop" : "Start"}
        disabled={isBusy || adapter.status === "stopping"}
        onClick={() => (isRunning ? onStop(adapter.id) : onStart(adapter.id))}
        className="text-text-dim hover:text-primary transition-colors disabled:opacity-30"
      >
        {isRunning ? <Square size={11} /> : <Play size={11} />}
      </button>
      <button
        type="button"
        title="Remove"
        disabled={isBusy}
        onClick={() => onRemove(adapter.id)}
        className="text-text-dim hover:text-red-400 transition-colors disabled:opacity-30"
      >
        <Trash2 size={11} />
      </button>
    </div>
  );
}
