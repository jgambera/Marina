import { Activity, FolderKanban, Frame, Plug, Radio, RotateCcw } from "lucide-react";
import { useSystem } from "../hooks/use-api";
import { useWorldState } from "../hooks/use-world-state";
import { formatUptime } from "../lib/utils";

interface HeaderProps {
  connected: boolean;
  uptime: number;
  onResetLayout?: () => void;
}

export function Header({ connected, uptime, onResetLayout }: HeaderProps) {
  const entities = useWorldState((s) => s.entities);
  const connections = useWorldState((s) => s.connections);
  const { data: systemData } = useSystem();
  const agents = entities.filter((e) => e.kind === "agent");

  return (
    <header className="glass-panel flex items-center justify-between px-3 py-1">
      <div className="flex items-center gap-3">
        <h1 className="gradient-text font-display text-lg font-bold tracking-widest">ARTILECT</h1>
        <span className="text-text-dim text-[11px]">Mission Control</span>
      </div>

      <div className="flex items-center gap-3 text-[11px]">
        <div className="flex items-center gap-1.5">
          <Radio size={12} className={connected ? "text-success" : "text-danger"} />
          <span className={connected ? "text-success" : "text-danger"}>
            {connected ? "Connected" : "Disconnected"}
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-text-dim">
          <Activity size={12} className="text-secondary" />
          <span>
            <span className="text-text-bright">{agents.length}</span> agents
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-text-dim">
          <span>
            <span className="text-text-bright">{connections}</span> conn
          </span>
        </div>

        {systemData?.projectCount != null && systemData.projectCount > 0 && (
          <div className="flex items-center gap-1.5 text-text-dim">
            <FolderKanban size={12} className="text-warning" />
            <span>
              <span className="text-text-bright">{systemData.projectCount}</span> proj
            </span>
          </div>
        )}

        {systemData?.connectorCount != null && systemData.connectorCount > 0 && (
          <div className="flex items-center gap-1.5 text-text-dim">
            <Plug size={12} className="text-accent" />
            <span>
              <span className="text-text-bright">{systemData.connectorCount}</span> conn
            </span>
          </div>
        )}

        {uptime > 0 && (
          <div className="text-text-dim">
            Uptime: <span className="text-text-bright">{formatUptime(uptime)}</span>
          </div>
        )}

        <a
          href="/canvas"
          className="flex items-center gap-1 text-text-dim transition-colors hover:text-primary"
          title="Open infinite canvas"
        >
          <Frame size={11} />
          <span>Canvas</span>
        </a>

        {onResetLayout && (
          <button
            type="button"
            onClick={onResetLayout}
            className="flex items-center gap-1 text-text-dim transition-colors hover:text-primary"
            title="Reset layout to default"
          >
            <RotateCcw size={11} />
            <span>Reset</span>
          </button>
        )}
      </div>
    </header>
  );
}
