import { header, separator } from "../../net/ansi";
import type { ArtilectDB } from "../../persistence/database";
import type { CommandDef, Entity, RoomContext } from "../../types";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

function relativeTime(ts: number, now: number): string {
  const diff = now - ts;
  if (diff < HOUR_MS) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < DAY_MS) return `${Math.floor(diff / HOUR_MS)}h ago`;
  const days = Math.floor(diff / DAY_MS);
  return days === 1 ? "1d ago" : `${days}d ago`;
}

export function orientCommand(deps: {
  getEntity: (id: string) => Entity | undefined;
  db?: ArtilectDB;
  getTotalRoomCount?: () => number;
}): CommandDef {
  return {
    name: "orient",
    aliases: ["status", "briefing"],
    help: "Memory health summary — your knowledge state, vitality zones, recent activity.\nUsage: orient",
    handler: (ctx: RoomContext, input) => {
      const entity = deps.getEntity(input.entity);
      if (!entity) return;
      if (!deps.db) {
        ctx.send(input.entity, "Orient requires database support.");
        return;
      }
      const db = deps.db;
      const now = Date.now();
      const lines: string[] = [header("Orientation Briefing"), separator()];

      // Core memory (active beliefs & goals)
      const coreMemory = db.listCoreMemory(entity.name);
      if (coreMemory.length > 0) {
        lines.push("  Core Memory:");
        for (const m of coreMemory) {
          const val = m.value.length > 60 ? `${m.value.slice(0, 60)}...` : m.value;
          lines.push(`    ${m.key} (v${m.version}): ${val}`);
        }
        lines.push("");
      }

      // Recent notes (last 24h)
      const recentNotes = db.getNotesByEntity(entity.name, 100);
      const last24h = recentNotes.filter((n) => now - n.created_at < DAY_MS);
      const last7d = recentNotes.filter((n) => now - n.created_at < 7 * DAY_MS);
      if (last24h.length > 0) {
        lines.push(`  Recent Notes (last 24h): ${last24h.length}`);
        for (const n of last24h.slice(0, 5)) {
          const age = relativeTime(n.created_at, now);
          lines.push(`    #${n.id} [imp=${n.importance} ${age}]: ${n.content.slice(0, 55)}`);
        }
        if (last24h.length > 5) {
          lines.push(`    ... and ${last24h.length - 5} more`);
        }
        lines.push("");
      }

      // High-importance notes (imp >= 8)
      const highImp = recentNotes.filter((n) => n.importance >= 8);
      if (highImp.length > 0) {
        lines.push(`  High-Priority Notes (importance >= 8): ${highImp.length}`);
        for (const n of highImp.slice(0, 5)) {
          lines.push(`    #${n.id} [imp=${n.importance}]: ${n.content.slice(0, 55)}`);
        }
        if (highImp.length > 5) {
          lines.push(`    ... and ${highImp.length - 5} more`);
        }
        lines.push("");
      }

      // Memory health: vitality zones
      const allNotes = recentNotes;
      const totalNotes = allNotes.length;
      let active = 0;
      let stale = 0;
      let fading = 0;
      for (const n of allNotes) {
        const lastTouch = n.last_accessed ?? n.created_at;
        const daysSince = (now - lastTouch) / DAY_MS;
        if (daysSince < 3 || n.importance >= 7) active++;
        else if (daysSince < 14 || n.importance >= 4) stale++;
        else fading++;
      }
      lines.push("  Memory Health:");
      lines.push(`    Total notes: ${totalNotes}`);
      if (totalNotes > 0) {
        lines.push(`    Active: ${active}  Stale: ${stale}  Fading: ${fading}`);
      }

      // Note types distribution
      const typeCounts = new Map<string, number>();
      for (const n of allNotes) {
        const t = n.note_type || "general";
        typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
      }
      if (typeCounts.size > 1) {
        const sorted = [...typeCounts.entries()].sort((a, b) => b[1] - a[1]);
        lines.push(`    Types: ${sorted.map(([t, c]) => `${t}(${c})`).join(" ")}`);
      }

      // Knowledge graph stats
      const linkCount = db.countNoteLinks(entity.name);
      if (linkCount > 0) {
        lines.push(`    Graph links: ${linkCount}`);
      }
      lines.push("");

      // Activity stats
      const stats = db.getActivityStats(entity.name);
      if (stats.totalActions > 0) {
        lines.push("  Activity:");
        lines.push(
          `    ${stats.roomsVisited} rooms visited, ${stats.uniqueCommands} commands used, ${stats.entitiesInteracted} interactions`,
        );
        lines.push("");
      }

      // Week-over-week trend
      if (last7d.length > 0) {
        const avgImp = last7d.reduce((s, n) => s + n.importance, 0) / last7d.length;
        lines.push(`  7-Day Summary: ${last7d.length} notes, avg importance ${avgImp.toFixed(1)}`);
      }

      ctx.send(input.entity, lines.join("\n"));
    },
  };
}
