import { header, separator } from "../../net/ansi";
import type { ArtilectDB } from "../../persistence/database";
import type { CommandDef, Entity, RoomContext } from "../../types";

export function recallCommand(opts: {
  getEntity: (id: string) => Entity | undefined;
  db?: ArtilectDB;
}): CommandDef {
  return {
    name: "recall",
    aliases: [],
    help: "Scored note retrieval. Usage: recall <query> [--recent | --important] [--type <type>]",
    handler: (ctx: RoomContext, input) => {
      const entity = opts.getEntity(input.entity);
      if (!entity) return;
      if (!opts.db) {
        ctx.send(input.entity, "Recall requires database support.");
        return;
      }
      const db = opts.db;
      const args = input.args;
      if (!args) {
        ctx.send(input.entity, "Usage: recall <query> [--recent | --important] [--type <type>]");
        return;
      }

      // Parse flags
      let weightImportance = 0.33;
      let weightRecency = 0.33;
      let weightRelevance = 0.34;
      let query = args;
      let noteType: string | undefined;

      // Extract --type <type>
      const typeMatch = query.match(/--type\s+(\w+)/);
      if (typeMatch) {
        noteType = typeMatch[1];
        query = query.replace(typeMatch[0], "").trim();
      }

      if (query.includes("--recent")) {
        weightImportance = 0.2;
        weightRecency = 0.6;
        weightRelevance = 0.2;
        query = query.replace("--recent", "").trim();
      } else if (query.includes("--important")) {
        weightImportance = 0.6;
        weightRecency = 0.2;
        weightRelevance = 0.2;
        query = query.replace("--important", "").trim();
      }

      if (!query) {
        ctx.send(input.entity, "Usage: recall <query> [--recent | --important] [--type <type>]");
        return;
      }

      const weights = { weightImportance, weightRecency, weightRelevance };
      const results = noteType
        ? db.recallNotesWithType(entity.name, query, noteType, weights)
        : db.recallNotes(entity.name, query, weights);

      if (results.length === 0) {
        ctx.send(input.entity, "No matching memories found.");
        return;
      }

      // Touch each returned note to update last_accessed and recall_count
      for (const note of results) {
        db.touchNote(note.id);
      }

      const now = Date.now();
      const typeLabel = noteType ? ` (type=${noteType})` : "";
      const lines = [
        header(`Recall: "${query}"${typeLabel}`),
        separator(),
        ...results.map((n) => {
          const age = Math.floor((now - n.created_at) / 86400000);
          const ageStr = age === 0 ? "today" : `${age}d ago`;
          return `  #${n.id} [score=${n.score.toFixed(2)} imp=${n.importance} ${ageStr}]: ${n.content.slice(0, 60)}`;
        }),
      ];
      ctx.send(input.entity, lines.join("\n"));
    },
  };
}
