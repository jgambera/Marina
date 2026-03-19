import type { RateLimiter } from "../auth/rate-limiter";
import type { Adapter, AdapterContext } from "../net/adapter";
import { formatPerception } from "../net/formatter";
import type { MarinaDB, PlatformAdapterRow } from "../persistence/database";
import type { Engine } from "./engine";
import { Logger } from "./logger";

// ─── Types ──────────────────────────────────────────────────────────────────

export type AdapterType = "discord" | "telegram" | "signal";
export type AdapterStatus = "running" | "starting" | "stopping" | "stopped" | "error";

export interface ManagedAdapter {
  id: string;
  type: AdapterType;
  status: AdapterStatus;
  error?: string;
  startedAt?: number;
  autoStart: boolean;
  adapter?: Adapter;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Mask a token for display: "····" + last 4 chars */
export function maskToken(token: string): string {
  if (token.length <= 4) return "····";
  return `····${token.slice(-4)}`;
}

// ─── AdapterRegistry ────────────────────────────────────────────────────────

export class AdapterRegistry {
  private adapters = new Map<string, ManagedAdapter>();
  private logger: Logger;
  private db?: MarinaDB;
  private engine?: Engine;
  private rateLimiter?: RateLimiter;

  constructor(opts: { db?: MarinaDB; logger?: Logger; rateLimiter?: RateLimiter }) {
    this.db = opts.db;
    this.logger = opts.logger ?? new Logger();
    this.rateLimiter = opts.rateLimiter;
  }

  /** Set the engine reference (called after engine construction) */
  setEngine(engine: Engine): void {
    this.engine = engine;
  }

  /** Create a new adapter entry (persists to DB, does not start) */
  create(opts: {
    type: AdapterType;
    token: string;
    settings?: Record<string, unknown>;
    autoStart?: boolean;
  }): ManagedAdapter {
    const id = crypto.randomUUID();
    const managed: ManagedAdapter = {
      id,
      type: opts.type,
      status: "stopped",
      autoStart: opts.autoStart ?? false,
    };
    this.adapters.set(id, managed);

    if (this.db) {
      this.db.createPlatformAdapter({
        id,
        type: opts.type,
        token: opts.token,
        settings: opts.settings,
        autoStart: opts.autoStart,
      });
    }

    this.logger.info("adapter-registry", `Created ${opts.type} adapter ${id}`);
    return managed;
  }

  /** Start an adapter by ID */
  async start(id: string): Promise<void> {
    const managed = this.adapters.get(id);
    if (!managed) throw new Error("Adapter not found");
    if (managed.status === "running" || managed.status === "starting") {
      throw new Error("Adapter is already running");
    }
    if (!this.engine) throw new Error("Engine not set");

    managed.status = "starting";
    managed.error = undefined;
    this.updateDbStatus(id, "starting");

    try {
      const row = this.db?.getPlatformAdapter(id);
      if (!row) throw new Error("Adapter config not found in DB");

      const ctx: AdapterContext = {
        engine: this.engine,
        rateLimiter: this.rateLimiter,
        formatPerception,
      };

      const settings = JSON.parse(row.settings) as Record<string, unknown>;
      const adapter = await this.createAdapterInstance(
        row.type as AdapterType,
        ctx,
        row.token,
        settings,
      );

      managed.adapter = adapter;
      await adapter.start();
      managed.status = "running";
      managed.startedAt = Date.now();
      this.updateDbStatus(id, "running");
      this.logger.info("adapter-registry", `Started ${managed.type} adapter ${id}`);
    } catch (err) {
      managed.status = "error";
      managed.error = err instanceof Error ? err.message : String(err);
      this.updateDbStatus(id, "error", managed.error);
      this.logger.error("adapter-registry", `Failed to start ${managed.type} adapter ${id}`, {
        error: managed.error,
      });
      throw err;
    }
  }

  /** Stop an adapter by ID */
  async stop(id: string): Promise<boolean> {
    const managed = this.adapters.get(id);
    if (!managed) return false;

    managed.status = "stopping";
    try {
      if (managed.adapter) {
        await managed.adapter.stop();
      }
    } catch {
      // Best-effort stop
    }

    managed.status = "stopped";
    managed.adapter = undefined;
    managed.startedAt = undefined;
    this.updateDbStatus(id, "stopped");
    this.logger.info("adapter-registry", `Stopped ${managed.type} adapter ${id}`);
    return true;
  }

  /** Remove an adapter (stops if running, deletes from DB) */
  async remove(id: string): Promise<boolean> {
    const managed = this.adapters.get(id);
    if (!managed) return false;

    if (managed.status === "running" || managed.status === "starting") {
      await this.stop(id);
    }

    this.adapters.delete(id);
    if (this.db) {
      this.db.deletePlatformAdapter(id);
    }
    this.logger.info("adapter-registry", `Removed ${managed.type} adapter ${id}`);
    return true;
  }

  /** List all managed adapters */
  list(): ManagedAdapter[] {
    return Array.from(this.adapters.values());
  }

  /** Get a managed adapter by ID */
  get(id: string): ManagedAdapter | undefined {
    return this.adapters.get(id);
  }

  /** Load adapters from DB and optionally auto-start them */
  async loadFromDB(): Promise<void> {
    if (!this.db) return;

    const rows = this.db.listPlatformAdapters();
    for (const row of rows) {
      const managed: ManagedAdapter = {
        id: row.id,
        type: row.type as AdapterType,
        status: "stopped",
        autoStart: row.auto_start === 1,
      };
      this.adapters.set(row.id, managed);

      if (managed.autoStart) {
        this.start(row.id).catch((err) => {
          this.logger.error(
            "adapter-registry",
            `Auto-start failed for ${row.type} adapter ${row.id}`,
            {
              error: err instanceof Error ? err.message : String(err),
            },
          );
        });
      }
    }
  }

  /** Stop all running adapters */
  async shutdown(): Promise<void> {
    const ids = Array.from(this.adapters.keys());
    await Promise.allSettled(
      ids.map((id) => {
        const m = this.adapters.get(id);
        if (m?.status === "running" || m?.status === "starting") {
          return this.stop(id);
        }
        return Promise.resolve();
      }),
    );
    this.logger.info("adapter-registry", "Shutdown complete");
  }

  /** Check if an adapter of a given type with a given token exists */
  findByTypeAndToken(type: AdapterType, token: string): ManagedAdapter | undefined {
    if (!this.db) return undefined;
    for (const managed of this.adapters.values()) {
      if (managed.type !== type) continue;
      const row = this.db.getPlatformAdapter(managed.id);
      if (row && row.token === token) return managed;
    }
    return undefined;
  }

  private async createAdapterInstance(
    type: AdapterType,
    ctx: AdapterContext,
    token: string,
    settings: Record<string, unknown>,
  ): Promise<Adapter> {
    switch (type) {
      case "discord": {
        const { DiscordAdapter } = await import("../net/discord-adapter");
        const channelIds = (settings.channelIds as string[] | undefined)?.filter(Boolean);
        return new DiscordAdapter(ctx, token, channelIds);
      }
      case "telegram": {
        const { TelegramAdapter } = await import("../net/telegram-adapter");
        return new TelegramAdapter(ctx, token);
      }
      case "signal": {
        const { SignalAdapter } = await import("../net/signal-adapter");
        const apiUrl = (settings.apiUrl as string) ?? "http://localhost:8080";
        const phoneNumber = (settings.phoneNumber as string) ?? "";
        return new SignalAdapter(ctx, apiUrl, phoneNumber);
      }
      default:
        throw new Error(`Unknown adapter type: ${type}`);
    }
  }

  private updateDbStatus(id: string, status: string, error?: string): void {
    if (this.db) {
      this.db.updatePlatformAdapterStatus(id, status, error);
    }
  }
}
