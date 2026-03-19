import type { MarinaDB } from "../persistence/database";
import type { EntityId } from "../types";
import { Logger } from "./logger";

// ─── Types ──────────────────────────────────────────────────────────────────

/** Role IDs supported by the agent system */
export type AgentRoleId = "general" | "architect" | "scholar" | "diplomat" | "mentor" | "merchant";

export interface ManagedAgent {
  id: string;
  name: string;
  model: string;
  role: AgentRoleId;
  entityId?: EntityId;
  status: "starting" | "running" | "stopping" | "stopped" | "error";
  startedAt: number;
  error?: string;
  /** Internal reference to the lean agent instance */
  agent?: { disconnect(): Promise<void> };
}

export interface SpawnOptions {
  name: string;
  model: string;
  role?: AgentRoleId;
  wsUrl?: string;
}

// ─── AgentRuntime ───────────────────────────────────────────────────────────

export class AgentRuntime {
  private agents = new Map<string, ManagedAgent>();
  private logger: Logger;
  private db?: MarinaDB;
  private defaultWsUrl: string;

  constructor(opts: { db?: MarinaDB; logger?: Logger; wsPort?: number }) {
    this.db = opts.db;
    this.logger = opts.logger ?? new Logger();
    this.defaultWsUrl = `ws://localhost:${opts.wsPort ?? 3300}`;
  }

  /** Spawn a new managed agent that connects via loopback WebSocket */
  async spawn(opts: SpawnOptions): Promise<ManagedAgent> {
    if (this.agents.has(opts.name)) {
      throw new Error(`Agent "${opts.name}" is already running`);
    }

    const id = crypto.randomUUID();
    const role = opts.role ?? "general";
    const managed: ManagedAgent = {
      id,
      name: opts.name,
      model: opts.model,
      role,
      status: "starting",
      startedAt: Date.now(),
    };
    this.agents.set(opts.name, managed);

    // Persist to DB
    if (this.db) {
      this.db.run(
        `INSERT OR REPLACE INTO managed_agents (id, name, model, role, status, started_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, opts.name, opts.model, role, "starting", managed.startedAt],
      );
    }

    try {
      // Dynamic import to avoid circular deps and allow tree-shaking
      const { MarinaLeanAgent } = await import("../agents/lean/lean-agent");

      const wsUrl = opts.wsUrl ?? this.defaultWsUrl;

      const agent = new MarinaLeanAgent({
        wsUrl,
        name: opts.name,
        model: opts.model,
        role,
      });

      managed.agent = agent;

      // Connect the agent to the server
      const session = await agent.connect();
      managed.status = "running";
      managed.entityId = session.entityId as EntityId;

      // Start autonomous mode
      agent.runAutonomous().catch(() => {});

      if (this.db) {
        this.db.run("UPDATE managed_agents SET status = ?, entity_id = ? WHERE id = ?", [
          "running",
          managed.entityId ?? null,
          id,
        ]);
      }

      this.logger.info("agent-runtime", `Spawned agent "${opts.name}" (${opts.model}, ${role})`);
      return managed;
    } catch (err) {
      managed.status = "error";
      managed.error = err instanceof Error ? err.message : String(err);
      this.agents.delete(opts.name);
      if (this.db) {
        this.db.run("UPDATE managed_agents SET status = ?, error = ? WHERE id = ?", [
          "error",
          managed.error,
          id,
        ]);
      }
      this.logger.error("agent-runtime", `Failed to spawn "${opts.name}"`, {
        error: managed.error,
      });
      throw err;
    }
  }

  /** Stop a managed agent by name */
  async stop(name: string): Promise<boolean> {
    const managed = this.agents.get(name);
    if (!managed) return false;

    managed.status = "stopping";
    try {
      if (managed.agent) {
        await managed.agent.disconnect();
      }
    } catch {
      // Best-effort stop
    }

    managed.status = "stopped";
    this.agents.delete(name);

    if (this.db) {
      this.db.run("DELETE FROM managed_agents WHERE name = ?", [name]);
    }

    this.logger.info("agent-runtime", `Stopped agent "${name}"`);
    return true;
  }

  /** List all managed agents */
  list(): ManagedAgent[] {
    return Array.from(this.agents.values());
  }

  /** Get a managed agent by name */
  get(name: string): ManagedAgent | undefined {
    return this.agents.get(name);
  }

  /** Stop all managed agents (called during engine shutdown) */
  async shutdown(): Promise<void> {
    const names = Array.from(this.agents.keys());
    await Promise.allSettled(names.map((name) => this.stop(name)));
    this.logger.info("agent-runtime", `Shutdown complete (${names.length} agents stopped)`);
  }
}
