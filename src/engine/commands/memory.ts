import { header, separator } from "../../net/ansi";
import type { ArtilectDB } from "../../persistence/database";
import type { CommandDef, Entity, RoomContext } from "../../types";

export function memoryCommand(opts: {
  getEntity: (id: string) => Entity | undefined;
  db?: ArtilectDB;
}): CommandDef {
  return {
    name: "memory",
    aliases: [],
    help: "Core memory (key-value store). Usage: memory | memory set <key> <value> | memory get <key> | memory delete <key> | memory list | memory history <key>",
    handler: (ctx: RoomContext, input) => {
      const entity = opts.getEntity(input.entity);
      if (!entity) return;
      if (!opts.db) {
        ctx.send(input.entity, "Memory requires database support.");
        return;
      }
      const db = opts.db;
      const tokens = input.tokens;
      const sub = tokens[0]?.toLowerCase();

      if (!sub || sub === "list") {
        const entries = db.listCoreMemory(entity.name);
        if (entries.length === 0) {
          ctx.send(input.entity, "Core memory is empty.");
          return;
        }
        const lines = [
          header("Core Memory"),
          separator(),
          ...entries.map((e) => {
            const truncated = e.value.length > 50 ? `${e.value.slice(0, 50)}...` : e.value;
            return `  ${e.key} (v${e.version}): ${truncated}`;
          }),
        ];
        ctx.send(input.entity, lines.join("\n"));
        return;
      }

      switch (sub) {
        case "set": {
          const key = tokens[1];
          if (!key) {
            ctx.send(input.entity, "Usage: memory set <key> <value>");
            return;
          }
          const value = tokens.slice(2).join(" ");
          if (!value) {
            ctx.send(input.entity, "Usage: memory set <key> <value>");
            return;
          }
          db.setCoreMemory(entity.name, key, value);
          ctx.send(input.entity, `Memory "${key}" set.`);
          return;
        }

        case "get": {
          const key = tokens[1];
          if (!key) {
            ctx.send(input.entity, "Usage: memory get <key>");
            return;
          }
          const entry = db.getCoreMemory(entity.name, key);
          if (!entry) {
            ctx.send(input.entity, `No memory entry for "${key}".`);
            return;
          }
          ctx.send(input.entity, `${key} (v${entry.version}): ${entry.value}`);
          return;
        }

        case "delete": {
          const key = tokens[1];
          if (!key) {
            ctx.send(input.entity, "Usage: memory delete <key>");
            return;
          }
          const deleted = db.deleteCoreMemory(entity.name, key);
          if (deleted) {
            ctx.send(input.entity, `Memory "${key}" deleted.`);
          } else {
            ctx.send(input.entity, `No memory entry for "${key}".`);
          }
          return;
        }

        case "history": {
          const key = tokens[1];
          if (!key) {
            ctx.send(input.entity, "Usage: memory history <key>");
            return;
          }
          const history = db.getCoreMemoryHistory(entity.name, key);
          if (history.length === 0) {
            ctx.send(input.entity, `No edit history for "${key}".`);
            return;
          }
          const lines = [
            header(`History: ${key}`),
            separator(),
            ...history.map((h) => {
              const date = new Date(h.changed_at).toISOString().slice(0, 19);
              return `  ${date}: "${h.old_value}" -> "${h.new_value}"`;
            }),
          ];
          ctx.send(input.entity, lines.join("\n"));
          return;
        }

        default:
          ctx.send(
            input.entity,
            "Usage: memory | memory set <key> <value> | memory get <key> | memory delete <key> | memory list | memory history <key>",
          );
      }
    },
  };
}
