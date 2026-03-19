import { Bot, Plus, X } from "lucide-react";
import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAgents } from "../hooks/use-api";
import { postApi } from "../lib/api";
import type { ManagedAgentInfo } from "../lib/types";
import { cn, formatUptime } from "../lib/utils";
import { GlassPanel } from "./GlassPanel";
import { SpawnAgentModal } from "./SpawnAgentModal";

const STATUS_COLORS: Record<string, string> = {
  running: "#00ffe7",
  starting: "#ffcc00",
  stopping: "#ffcc00",
  stopped: "#5a6a7a",
  error: "#ff4444",
};

export function AgentPanel() {
  const { data } = useAgents();
  const queryClient = useQueryClient();
  const [showSpawn, setShowSpawn] = useState(false);
  const [stopping, setStopping] = useState<string | null>(null);

  const agents = data?.agents ?? [];

  const handleStop = useCallback(
    async (name: string) => {
      setStopping(name);
      try {
        await postApi(`/api/agents/${encodeURIComponent(name)}/stop`, {});
        queryClient.invalidateQueries({ queryKey: ["agents"] });
      } catch {
        // best effort
      } finally {
        setStopping(null);
      }
    },
    [queryClient],
  );

  return (
    <>
      <GlassPanel title="Agents" icon={<Bot size={14} />}>
        <div className="flex flex-col overflow-y-auto">
          <div className="flex items-center justify-end px-2 py-1 border-b border-border">
            <button
              type="button"
              onClick={() => setShowSpawn(true)}
              className="flex items-center gap-1 text-[10px] text-primary hover:text-text-bright transition-colors"
              title="Spawn agent"
            >
              <Plus size={12} />
              <span>Spawn</span>
            </button>
          </div>

          {agents.length === 0 && (
            <div className="p-2 text-text-dim text-[11px]">No agents running</div>
          )}

          {agents.map((agent) => (
            <AgentRow
              key={agent.id}
              agent={agent}
              isStopping={stopping === agent.name}
              onStop={handleStop}
            />
          ))}
        </div>
      </GlassPanel>

      {showSpawn && (
        <SpawnAgentModal
          onClose={() => setShowSpawn(false)}
          onSpawned={() => {
            queryClient.invalidateQueries({ queryKey: ["agents"] });
            setShowSpawn(false);
          }}
        />
      )}
    </>
  );
}

function AgentRow({
  agent,
  isStopping,
  onStop,
}: {
  agent: ManagedAgentInfo;
  isStopping: boolean;
  onStop: (name: string) => void;
}) {
  const modelShort = agent.model.includes("/") ? agent.model.split("/").pop()! : agent.model;

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-2 py-1 text-[12px] hover:bg-bg-hover transition-colors",
      )}
    >
      <span
        className="inline-block h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: STATUS_COLORS[agent.status] ?? "#5a6a7a" }}
        title={agent.status}
      />
      <span className="flex-1 truncate text-text-bright font-medium">{agent.name}</span>
      <span className="shrink-0 rounded bg-bg-card px-1 text-[9px] text-secondary">
        {agent.role}
      </span>
      <span className="truncate text-text-dim text-[10px] max-w-[100px]" title={agent.model}>
        {modelShort}
      </span>
      <span className="text-text-dim text-[10px] shrink-0">{formatUptime(agent.uptimeMs)}</span>
      <button
        type="button"
        title={`Stop ${agent.name}`}
        disabled={isStopping || agent.status === "stopping"}
        onClick={() => onStop(agent.name)}
        className="text-text-dim hover:text-red-400 transition-colors disabled:opacity-30"
      >
        <X size={12} />
      </button>
    </div>
  );
}
