import { header, separator } from "../../net/ansi";
import type { GroupManager } from "../../coordination/group-manager";
import type { TaskManager } from "../../coordination/task-manager";
import type { ArtilectDB } from "../../persistence/database";
import type { CommandDef, Entity, EntityId, RoomContext } from "../../types";

export function briefCommand(deps: {
  getEntity: (id: EntityId) => Entity | undefined;
  db?: ArtilectDB;
  taskManager?: TaskManager;
  groupManager?: GroupManager;
  getOnlineAgents: () => Entity[];
}): CommandDef {
  return {
    name: "brief",
    aliases: ["orient", "sitrep"],
    help: "Get oriented. Shows the current state of the world — who is here, what exists, where to start.",
    handler: (ctx: RoomContext, input) => {
      const entity = deps.getEntity(input.entity);
      if (!entity) return;

      const lines = [header("Briefing"), separator()];

      // Online entities
      const online = deps.getOnlineAgents();
      if (online.length > 1) {
        const others = online.filter((e) => e.id !== input.entity);
        const names = others
          .slice(0, 10)
          .map((e) => e.name)
          .join(", ");
        const more = others.length > 10 ? ` (+${others.length - 10} more)` : "";
        lines.push(`Online: ${names}${more}`);
      } else {
        lines.push("Online: you are the only entity here");
      }

      if (!deps.db) {
        ctx.send(input.entity, lines.join("\n"));
        return;
      }
      const db = deps.db;

      // Active projects
      const projects = db.listProjects().filter((p) => p.status === "active");
      if (projects.length > 0) {
        const projectLines = projects.slice(0, 5).map((p) => {
          const orch = p.orchestration !== "custom" ? ` [${p.orchestration}]` : "";
          return `  ${p.name}${orch}: ${p.description.slice(0, 50) || "(no description)"}`;
        });
        const more = projects.length > 5 ? `  (+${projects.length - 5} more)` : "";
        lines.push("", "Projects:");
        lines.push(...projectLines);
        if (more) lines.push(more);
      }

      // Open tasks
      if (deps.taskManager) {
        const tasks = deps.taskManager
          .list()
          .filter((t) => t.status === "open" || t.status === "claimed");
        if (tasks.length > 0) {
          const open = tasks.filter((t) => t.status === "open").length;
          const claimed = tasks.filter((t) => t.status === "claimed").length;
          lines.push("", `Tasks: ${open} open, ${claimed} in progress`);
        }
      }

      // Memory pools
      const pools = db.listMemoryPools();
      if (pools.length > 0) {
        const poolSummaries = pools.slice(0, 8).map((p) => {
          const notes = db.getPoolNotes(p.id, 1);
          const count = notes.length > 0 ? "active" : "empty";
          return `${p.name} (${count})`;
        });
        lines.push("", `Pools: ${poolSummaries.join(", ")}`);
      }

      // Core memory snapshot (if entity has any)
      const memories = db.listCoreMemory(entity.name);
      if (memories.length > 0) {
        lines.push("", "Your memory:");
        for (const m of memories.slice(0, 5)) {
          lines.push(`  ${m.key}: ${m.value.slice(0, 50)}`);
        }
      }

      // Guide hint for new agents
      if (memories.length === 0 && projects.length === 0) {
        lines.push("", "New here? Try:", "  pool guide recall getting started", "  help", "  look");
      }

      ctx.send(input.entity, lines.join("\n"));
    },
  };
}
