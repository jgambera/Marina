import { header, separator } from "../../net/ansi";
import type { ArtilectDB } from "../../persistence/database";
import type { CommandDef, Entity, RoomContext } from "../../types";

export function poolCommand(opts: {
  getEntity: (id: string) => Entity | undefined;
  db?: ArtilectDB;
}): CommandDef {
  return {
    name: "pool",
    aliases: [],
    help: "Shared memory pools for collaborative knowledge.\nUsage: pool create <name> | pool <name> add|recall|list | pool list\n\nExamples:\n  pool create findings\n  pool findings add The decode room responds to binary input !7\n  pool findings recall binary\n  pool findings list",
    handler: (ctx: RoomContext, input) => {
      const entity = opts.getEntity(input.entity);
      if (!entity) return;
      if (!opts.db) {
        ctx.send(input.entity, "Pools require database support.");
        return;
      }
      const db = opts.db;
      const tokens = input.tokens;
      const sub = tokens[0]?.toLowerCase();

      if (!sub) {
        ctx.send(
          input.entity,
          "Usage: pool create <name> | pool <name> add <text> | pool <name> recall <query> | pool <name> list | pool list",
        );
        return;
      }

      if (sub === "list") {
        const pools = db.listMemoryPools();
        if (pools.length === 0) {
          ctx.send(input.entity, "No memory pools exist.");
          return;
        }
        const lines = [
          header("Memory Pools"),
          separator(),
          ...pools.map((p) => `  ${p.name} (by ${p.created_by})`),
        ];
        ctx.send(input.entity, lines.join("\n"));
        return;
      }

      if (sub === "create") {
        const name = tokens[1];
        if (!name) {
          ctx.send(input.entity, "Usage: pool create <name>");
          return;
        }
        const existing = db.getMemoryPool(name);
        if (existing) {
          ctx.send(input.entity, `Pool "${name}" already exists.`);
          return;
        }
        const id = `pool_${name}_${Date.now()}`;
        db.createMemoryPool(id, name, entity.name);
        ctx.send(input.entity, `Memory pool "${name}" created.`);
        return;
      }

      // Pool operations: pool <name> <action> [args]
      const poolName = sub;
      const action = tokens[1]?.toLowerCase();
      const pool = db.getMemoryPool(poolName);

      if (!pool) {
        ctx.send(
          input.entity,
          `Pool "${poolName}" not found. Use "pool create ${poolName}" to create.`,
        );
        return;
      }

      if (!action || action === "list") {
        // List recent notes in pool
        const notes = db.recallPoolNotes(pool.id, "*", {
          weightImportance: 0.5,
          weightRecency: 0.5,
          weightRelevance: 0.0,
        });
        // Fallback: if FTS "*" doesn't work, show empty
        if (notes.length === 0) {
          ctx.send(input.entity, `Pool "${poolName}" has no matching notes.`);
          return;
        }
        const lines = [
          header(`Pool: ${poolName}`),
          separator(),
          ...notes.map((n) => {
            const date = new Date(n.created_at).toISOString().slice(0, 10);
            return `  #${n.id} ${date} (${n.entity_name}) !${n.importance}: ${n.content.slice(0, 60)}`;
          }),
        ];
        ctx.send(input.entity, lines.join("\n"));
        return;
      }

      switch (action) {
        case "add": {
          const text = tokens.slice(2).join(" ");
          if (!text) {
            ctx.send(input.entity, `Usage: pool ${poolName} add <text> [!importance]`);
            return;
          }
          // Parse importance
          let importance = 5;
          let content = text;
          const impMatch = text.match(/\s+!(\d{1,2})(?:\s|$)/);
          if (impMatch) {
            const val = Number.parseInt(impMatch[1]!, 10);
            if (val >= 1 && val <= 10) {
              importance = val;
              content = text.replace(impMatch[0], " ").trim();
            }
          }
          const noteId = db.addPoolNote(pool.id, entity.name, content, importance);
          ctx.send(input.entity, `Added note #${noteId} to pool "${poolName}".`);
          return;
        }

        case "recall": {
          const query = tokens.slice(2).join(" ");
          if (!query) {
            ctx.send(input.entity, `Usage: pool ${poolName} recall <query>`);
            return;
          }
          const results = db.recallPoolNotes(pool.id, query);
          if (results.length === 0) {
            ctx.send(input.entity, "No matching notes in pool.");
            return;
          }
          for (const note of results) {
            db.touchNote(note.id);
          }
          const lines = [
            header(`Pool "${poolName}" recall: "${query}"`),
            separator(),
            ...results.map((n) => {
              const now = Date.now();
              const age = Math.floor((now - n.created_at) / 86400000);
              const ageStr = age === 0 ? "today" : `${age}d ago`;
              return `  #${n.id} [score=${n.score.toFixed(2)} imp=${n.importance} ${ageStr}] (${n.entity_name}): ${n.content.slice(0, 60)}`;
            }),
          ];
          ctx.send(input.entity, lines.join("\n"));
          return;
        }

        default:
          ctx.send(
            input.entity,
            `Usage: pool ${poolName} add <text> | pool ${poolName} recall <query> | pool ${poolName} list`,
          );
      }
    },
  };
}
