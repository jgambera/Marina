import { header, separator } from "../../net/ansi";
import type { ArtilectDB } from "../../persistence/database";
import type { CommandDef, Entity, RoomContext } from "../../types";

const VALID_NOTE_TYPES = new Set([
  "observation",
  "fact",
  "decision",
  "inference",
  "skill",
  "episode",
  "principle",
]);

const VALID_RELATIONSHIPS = new Set([
  "supports",
  "contradicts",
  "caused_by",
  "related_to",
  "part_of",
  "supersedes",
]);

function parseNoteText(input: string): {
  content: string;
  importance?: number;
  noteType?: string;
} {
  let importance: number | undefined;
  let noteType: string | undefined;
  let text = input;

  // Extract !N (importance 1-10)
  const impMatch = text.match(/\s+!(\d{1,2})(?:\s|$)/);
  if (impMatch) {
    const val = Number.parseInt(impMatch[1]!, 10);
    if (val >= 1 && val <= 10) {
      importance = val;
      text = text.replace(impMatch[0], " ").trim();
    }
  }

  // Extract #type
  const typeMatch = text.match(/\s+#(\w+)(?:\s|$)/);
  if (typeMatch && VALID_NOTE_TYPES.has(typeMatch[1]!)) {
    noteType = typeMatch[1];
    text = text.replace(typeMatch[0], " ").trim();
  }

  return { content: text, importance, noteType };
}

export function noteCommand(opts: {
  getEntity: (id: string) => Entity | undefined;
  db?: ArtilectDB;
}): CommandDef {
  return {
    name: "note",
    aliases: [],
    help: "Personal notes. Usage: note <text> [!importance] [#type] | note list | note space | note search <query> | note delete <id> | note link <id1> <id2> <rel> | note correct <id> <text> | note trace <id> | note graph | note evolve <id> | note types",
    handler: (ctx: RoomContext, input) => {
      const entity = opts.getEntity(input.entity);
      if (!entity) return;
      if (!opts.db) {
        ctx.send(input.entity, "Notes require database support.");
        return;
      }
      const db = opts.db;
      const tokens = input.tokens;
      const sub = tokens[0]?.toLowerCase();

      if (!sub) {
        ctx.send(
          input.entity,
          "Usage: note <text> [!importance] [#type] | note list | note space | note search <query> | note delete <id> | note link <id1> <id2> <rel> | note correct <id> <text> | note trace <id> | note graph | note evolve <id> | note types",
        );
        return;
      }

      switch (sub) {
        case "list": {
          const notes = db.getNotesByEntity(entity.name);
          if (notes.length === 0) {
            ctx.send(input.entity, "You have no notes.");
            return;
          }
          const lines = [
            header("Your Notes"),
            separator(),
            ...notes.map((n) => {
              const room = n.room_id ? ` [${n.room_id}]` : "";
              const date = new Date(n.created_at).toISOString().slice(0, 10);
              const imp = n.importance !== 5 ? ` !${n.importance}` : "";
              const type = n.note_type !== "observation" ? ` #${n.note_type}` : "";
              return `  #${n.id} ${date}${room}${imp}${type}: ${n.content.slice(0, 60)}`;
            }),
          ];
          ctx.send(input.entity, lines.join("\n"));
          return;
        }

        case "space": {
          const notes = db.getNotesByRoom(input.room);
          if (notes.length === 0) {
            ctx.send(input.entity, "No notes for this space.");
            return;
          }
          const lines = [
            header(`Notes for ${input.room}`),
            separator(),
            ...notes.map((n) => {
              const date = new Date(n.created_at).toISOString().slice(0, 10);
              return `  #${n.id} ${date} (${n.entity_name}): ${n.content.slice(0, 60)}`;
            }),
          ];
          ctx.send(input.entity, lines.join("\n"));
          return;
        }

        case "search": {
          const query = tokens.slice(1).join(" ");
          if (!query) {
            ctx.send(input.entity, "Usage: note search <query>");
            return;
          }
          const notes = db.searchNotes(entity.name, query);
          if (notes.length === 0) {
            ctx.send(input.entity, "No matching notes found.");
            return;
          }
          const lines = [
            header(`Search: "${query}"`),
            separator(),
            ...notes.map((n) => {
              const room = n.room_id ? ` [${n.room_id}]` : "";
              return `  #${n.id}${room}: ${n.content.slice(0, 60)}`;
            }),
          ];
          ctx.send(input.entity, lines.join("\n"));
          return;
        }

        case "delete": {
          const id = Number.parseInt(tokens[1] ?? "", 10);
          if (Number.isNaN(id)) {
            ctx.send(input.entity, "Usage: note delete <id>");
            return;
          }
          const deleted = db.deleteNote(id, entity.name);
          if (deleted) {
            ctx.send(input.entity, `Note #${id} deleted.`);
          } else {
            ctx.send(input.entity, `Note #${id} not found or not yours.`);
          }
          return;
        }

        case "link": {
          const id1 = Number.parseInt(tokens[1] ?? "", 10);
          const id2 = Number.parseInt(tokens[2] ?? "", 10);
          const rel = tokens[3]?.toLowerCase();
          if (Number.isNaN(id1) || Number.isNaN(id2) || !rel) {
            ctx.send(input.entity, "Usage: note link <id1> <id2> <relationship>");
            return;
          }
          if (!VALID_RELATIONSHIPS.has(rel)) {
            ctx.send(
              input.entity,
              `Invalid relationship. Valid: ${[...VALID_RELATIONSHIPS].join(", ")}`,
            );
            return;
          }
          const note1 = db.getNote(id1);
          const note2 = db.getNote(id2);
          if (!note1 || !note2) {
            ctx.send(input.entity, "One or both notes not found.");
            return;
          }
          try {
            db.createNoteLink(id1, id2, rel);
            ctx.send(input.entity, `Linked note #${id1} -> #${id2} (${rel}).`);
          } catch {
            ctx.send(input.entity, "Link already exists.");
          }
          return;
        }

        case "correct": {
          const id = Number.parseInt(tokens[1] ?? "", 10);
          if (Number.isNaN(id)) {
            ctx.send(input.entity, "Usage: note correct <id> <new text>");
            return;
          }
          const oldNote = db.getNote(id);
          if (!oldNote) {
            ctx.send(input.entity, `Note #${id} not found.`);
            return;
          }
          const newText = tokens.slice(2).join(" ");
          if (!newText) {
            ctx.send(input.entity, "Usage: note correct <id> <new text>");
            return;
          }
          const parsed = parseNoteText(newText);
          const newId = db.createNote(entity.name, parsed.content, input.room, {
            importance: parsed.importance ?? oldNote.importance,
            noteType: parsed.noteType ?? oldNote.note_type,
            supersedesId: id,
          });
          db.createNoteLink(newId, id, "supersedes");
          ctx.send(input.entity, `Note #${newId} created, superseding #${id}.`);
          return;
        }

        case "trace": {
          const id = Number.parseInt(tokens[1] ?? "", 10);
          if (Number.isNaN(id)) {
            ctx.send(input.entity, "Usage: note trace <id>");
            return;
          }
          const graph = db.traceNoteGraph(id, 2);
          if (graph.length === 0) {
            ctx.send(input.entity, `Note #${id} not found.`);
            return;
          }
          const lines = [header("Note Graph"), separator()];
          for (const entry of graph) {
            const indent = "  ".repeat(entry.depth);
            const type = entry.note.note_type !== "observation" ? ` #${entry.note.note_type}` : "";
            lines.push(`${indent}#${entry.note.id}${type}: ${entry.note.content.slice(0, 50)}`);
            for (const link of entry.links) {
              const dir =
                link.source_id === entry.note.id
                  ? `-> #${link.target_id}`
                  : `<- #${link.source_id}`;
              lines.push(`${indent}  ${link.relationship} ${dir}`);
            }
          }
          ctx.send(input.entity, lines.join("\n"));
          return;
        }

        case "types": {
          const types = [...VALID_NOTE_TYPES].sort();
          const rels = [...VALID_RELATIONSHIPS].sort();
          const lines = [
            header("Note Types & Relationships"),
            separator(),
            `Types: ${types.join(", ")}`,
            `Relationships: ${rels.join(", ")}`,
            "",
            "Usage: note <text> #<type> !<importance>",
            "       note link <id1> <id2> <relationship>",
          ];
          ctx.send(input.entity, lines.join("\n"));
          return;
        }

        case "evolve": {
          const id = Number.parseInt(tokens[1] ?? "", 10);
          if (Number.isNaN(id)) {
            ctx.send(input.entity, "Usage: note evolve <id>");
            return;
          }
          const oldNote = db.getNote(id);
          if (!oldNote) {
            ctx.send(input.entity, `Note #${id} not found.`);
            return;
          }
          // Gather linked notes for context
          const graph = db.traceNoteGraph(id, 1);
          const contextParts = [oldNote.content];
          for (const entry of graph) {
            if (entry.note.id !== id) {
              contextParts.push(entry.note.content);
            }
          }
          // Create evolved note incorporating context
          const linkedCount = graph.length - 1;
          const evolvedContent =
            linkedCount > 0
              ? `[Evolved from #${id} with ${linkedCount} linked notes] ${contextParts.join(" | ")}`
              : `[Evolved from #${id}] ${oldNote.content}`;
          const newImportance = Math.min(oldNote.importance + 1, 10);
          const newId = db.createNote(entity.name, evolvedContent, input.room, {
            importance: newImportance,
            noteType: oldNote.note_type,
            supersedesId: id,
          });
          db.createNoteLink(newId, id, "supersedes");
          // Copy existing links to the evolved note
          const oldLinks = db.getNoteLinks(id);
          for (const link of oldLinks) {
            const otherId = link.source_id === id ? link.target_id : link.source_id;
            if (link.relationship !== "supersedes") {
              try {
                db.createNoteLink(newId, otherId, link.relationship);
              } catch {
                // Ignore duplicate links
              }
            }
          }
          ctx.send(
            input.entity,
            `Note #${newId} evolved from #${id} (importance=${newImportance}, ${linkedCount} linked notes incorporated).`,
          );
          return;
        }

        case "graph": {
          const notes = db.getNotesByEntity(entity.name);
          if (notes.length === 0) {
            ctx.send(input.entity, "No notes to graph.");
            return;
          }
          // Count notes by type
          const typeCounts: Record<string, number> = {};
          for (const n of notes) {
            typeCounts[n.note_type] = (typeCounts[n.note_type] ?? 0) + 1;
          }
          // Count edges by relationship
          const edgeCounts: Record<string, number> = {};
          for (const n of notes) {
            const links = db.getNoteLinks(n.id);
            for (const link of links) {
              // Only count edges from source to avoid double-counting
              if (link.source_id === n.id) {
                edgeCounts[link.relationship] = (edgeCounts[link.relationship] ?? 0) + 1;
              }
            }
          }
          const lines = [
            header("Knowledge Graph"),
            separator(),
            `Notes: ${notes.length}`,
            ...Object.entries(typeCounts).map(([type, count]) => `  ${type}: ${count}`),
          ];
          const totalEdges = Object.values(edgeCounts).reduce((a, b) => a + b, 0);
          if (totalEdges > 0) {
            lines.push(`Edges: ${totalEdges}`);
            for (const [rel, count] of Object.entries(edgeCounts)) {
              lines.push(`  ${rel}: ${count}`);
            }
          }
          ctx.send(input.entity, lines.join("\n"));
          return;
        }

        default: {
          // Save a note: "note <text> [!importance] [#type]"
          const content = input.args;
          if (!content) {
            ctx.send(input.entity, "Usage: note <text>");
            return;
          }
          const parsed = parseNoteText(content);
          const id = db.createNote(entity.name, parsed.content, input.room, {
            importance: parsed.importance,
            noteType: parsed.noteType,
          });
          const extras: string[] = [];
          if (parsed.importance) extras.push(`importance=${parsed.importance}`);
          if (parsed.noteType) extras.push(`type=${parsed.noteType}`);

          // Auto-link: find similar existing notes and create related_to links
          const autoLinked: number[] = [];
          try {
            const similar = db.findSimilarNotes(entity.name, parsed.content, id);
            for (const s of similar.slice(0, 3)) {
              try {
                db.createNoteLink(id, s.id, "related_to");
                autoLinked.push(s.id);
              } catch {
                // Ignore duplicate links
              }
            }
          } catch {
            // Auto-linking is best-effort
          }

          const suffix = extras.length > 0 ? ` (${extras.join(", ")})` : "";
          const linkInfo =
            autoLinked.length > 0
              ? ` Auto-linked to notes ${autoLinked.map((i) => `#${i}`).join(", ")} (related_to).`
              : "";
          ctx.send(input.entity, `Note #${id} saved${suffix}.${linkInfo}`);
        }
      }
    },
  };
}
