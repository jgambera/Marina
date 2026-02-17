import type { ServerWebSocket } from "bun";
import type { Engine } from "../engine/engine";
import type { EngineEvent } from "../types";

export interface DashboardWSData {
  connId: string;
  isDashboard: true;
}

export interface WorldSnapshot {
  timestamp: number;
  worldName: string;
  startRoom: string;
  entities: { id: string; name: string; kind: string; room: string }[];
  roomPopulations: Record<string, number>;
  rooms: {
    id: string;
    short: string;
    district: string;
    exits: Record<string, string>;
  }[];
  connections: number;
  memory: { heapUsed: number; rss: number };
}

export class DashboardBroadcaster {
  private clients = new Set<ServerWebSocket<DashboardWSData>>();

  addClient(ws: ServerWebSocket<DashboardWSData>, engine: Engine): void {
    this.clients.add(ws);
    // Send initial snapshot
    const snapshot = this.buildSnapshot(engine);
    ws.send(JSON.stringify({ type: "snapshot", data: snapshot }));
  }

  removeClient(ws: ServerWebSocket<DashboardWSData>): void {
    this.clients.delete(ws);
  }

  broadcastEvent(event: EngineEvent): void {
    if (event.type === "tick") return;
    if (this.clients.size === 0) return;
    const msg = JSON.stringify({ type: "event", data: event });
    for (const ws of this.clients) {
      try {
        ws.send(msg);
      } catch {}
    }
  }

  broadcastState(engine: Engine): void {
    if (this.clients.size === 0) return;
    const snapshot = this.buildSnapshot(engine);
    const msg = JSON.stringify({ type: "state", data: snapshot });
    for (const ws of this.clients) {
      try {
        ws.send(msg);
      } catch {}
    }
  }

  get clientCount(): number {
    return this.clients.size;
  }

  private buildSnapshot(engine: Engine): WorldSnapshot {
    const entities = engine.entities.all().map((e) => ({
      id: e.id,
      name: e.name,
      kind: e.kind,
      room: e.room as string,
    }));

    const roomPopulations: Record<string, number> = {};
    for (const e of entities) {
      roomPopulations[e.room] = (roomPopulations[e.room] ?? 0) + 1;
    }

    const rooms = engine.rooms.all().map((r) => ({
      id: r.id as string,
      short: r.module.short,
      district: (r.id as string).split("/")[0] ?? "",
      exits: Object.fromEntries(
        Object.entries(r.module.exits ?? {}).map(([k, v]) => [k, v as string]),
      ),
    }));

    const mem = process.memoryUsage();
    return {
      timestamp: Date.now(),
      worldName: engine.world?.name ?? "Unknown",
      startRoom: engine.config.startRoom as string,
      entities,
      roomPopulations,
      rooms,
      connections: engine.getConnections().size,
      memory: { heapUsed: mem.heapUsed, rss: mem.rss },
    };
  }
}
