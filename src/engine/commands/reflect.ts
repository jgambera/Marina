import { header, separator } from "../../net/ansi";
import type { MarinaDB, NoteRow } from "../../persistence/database";
import type { CommandDef, Entity, RoomContext } from "../../types";

/** Extract common themes from a set of notes via word frequency analysis */
function extractThemes(notes: NoteRow[]): string[] {
  const wordCounts = new Map<string, number>();
  const stopWords = new Set([
    "the",
    "a",
    "an",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "have",
    "has",
    "had",
    "do",
    "does",
    "did",
    "will",
    "would",
    "could",
    "should",
    "may",
    "might",
    "shall",
    "can",
    "need",
    "dare",
    "ought",
    "used",
    "to",
    "of",
    "in",
    "for",
    "on",
    "with",
    "at",
    "by",
    "from",
    "as",
    "into",
    "through",
    "during",
    "before",
    "after",
    "above",
    "below",
    "between",
    "out",
    "off",
    "over",
    "under",
    "again",
    "further",
    "then",
    "once",
    "here",
    "there",
    "when",
    "where",
    "why",
    "how",
    "all",
    "both",
    "each",
    "few",
    "more",
    "most",
    "other",
    "some",
    "such",
    "no",
    "nor",
    "not",
    "only",
    "own",
    "same",
    "so",
    "than",
    "too",
    "very",
    "just",
    "because",
    "but",
    "and",
    "or",
    "if",
    "while",
    "that",
    "this",
    "it",
    "i",
    "you",
    "he",
    "she",
    "we",
    "they",
    "me",
    "him",
    "her",
    "us",
    "them",
    "my",
    "your",
    "his",
    "its",
    "our",
    "their",
    "what",
    "which",
    "who",
  ]);

  for (const note of notes) {
    const words = note.content
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/);
    const seen = new Set<string>();
    for (const word of words) {
      if (word.length < 3 || stopWords.has(word)) continue;
      if (!seen.has(word)) {
        seen.add(word);
        wordCounts.set(word, (wordCounts.get(word) ?? 0) + 1);
      }
    }
  }

  // Themes are words appearing in 2+ notes
  return [...wordCounts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word);
}

/** Detect contradictions by checking for existing contradicts links */
function findContradictions(db: MarinaDB, notes: NoteRow[]): string[] {
  const contradictions: string[] = [];
  for (const note of notes) {
    const links = db.getNoteLinks(note.id);
    for (const link of links) {
      if (link.relationship === "contradicts") {
        const otherId = link.source_id === note.id ? link.target_id : link.source_id;
        const otherNote = notes.find((n) => n.id === otherId);
        if (otherNote) {
          contradictions.push(`#${note.id} contradicts #${otherNote.id}`);
        }
      }
    }
  }
  return contradictions;
}

export function reflectCommand(deps: {
  getEntity: (id: string) => Entity | undefined;
  db?: MarinaDB;
}): CommandDef {
  return {
    name: "reflect",
    aliases: [],
    help: "Create a reflection/synthesis from recent notes. Usage: reflect [topic] | reflect failure <description>",
    handler: (ctx: RoomContext, input) => {
      const entity = deps.getEntity(input.entity);
      if (!entity) return;
      if (!deps.db) {
        ctx.send(input.entity, "Reflect requires database support.");
        return;
      }
      const db = deps.db;
      const args = input.args?.trim() ?? "";
      const tokens = args.split(/\s+/);

      // Handle "reflect failure <description>"
      if (tokens[0]?.toLowerCase() === "failure") {
        const description = tokens.slice(1).join(" ");
        if (!description) {
          ctx.send(input.entity, "Usage: reflect failure <what happened>");
          return;
        }

        // Search for related context
        const related = db
          .recallNotes(entity.name, description, {
            weightImportance: 0.3,
            weightRecency: 0.5,
            weightRelevance: 0.2,
          })
          .slice(0, 5);

        // Build failure analysis
        const contextParts = related.map((n) => `[#${n.id}] ${n.content.slice(0, 60)}`);
        const contextStr =
          contextParts.length > 0 ? ` Related context: ${contextParts.join("; ")}` : "";
        const content = `[Failure Analysis] ${description}.${contextStr}`;

        const reflectionId = db.createNote(entity.name, content, input.room, {
          importance: 8,
          noteType: "episode",
        });

        // Link related notes
        for (const note of related) {
          try {
            db.createNoteLink(note.id, reflectionId, "part_of");
          } catch {
            // Ignore duplicates
          }
        }

        const lines = [
          header("Failure Reflection Created"),
          separator(),
          `Note #${reflectionId} (episode, importance=8)`,
          `Failure: ${description}`,
          related.length > 0
            ? `Related notes: ${related.map((n) => `#${n.id}`).join(", ")}`
            : "No related notes found.",
        ];
        ctx.send(input.entity, lines.join("\n"));
        return;
      }

      // Standard reflection
      const topic = args || undefined;

      // Gather source notes
      let sourceNotes: NoteRow[];
      if (topic) {
        sourceNotes = db
          .recallNotes(entity.name, topic, {
            weightImportance: 0.4,
            weightRecency: 0.3,
            weightRelevance: 0.3,
          })
          .slice(0, 10);
      } else {
        sourceNotes = db
          .getNotesByEntity(entity.name, 50)
          .filter((n) => n.importance >= 6)
          .slice(0, 10);
      }

      if (sourceNotes.length < 2) {
        // Not enough to synthesize — show diagnostic instead
        const allNotes = db.getNotesByEntity(entity.name, 100);
        const nonEpisode = allNotes.filter((n) => n.note_type !== "episode");
        if (nonEpisode.length < 2) {
          ctx.send(input.entity, "Not enough notes to reflect on. Take more notes first.");
          return;
        }
        // Find what topics have accumulated
        const topics = extractThemes(nonEpisode.slice(0, 30));
        const fading = allNotes.filter((n) => n.importance <= 2);
        const lines = [
          header("Reflection Diagnostic"),
          separator(),
          `  Notes: ${allNotes.length} (${nonEpisode.length} unconsolidated)`,
        ];
        if (fading.length > 0) {
          lines.push(`  Fading: ${fading.length}`);
        }
        if (topics.length > 0) {
          lines.push(`  Topics: ${topics.join(", ")}`);
          lines.push("", "Try: reflect <topic>");
        } else {
          lines.push("", "Need at least 2 high-importance notes to synthesize.");
        }
        ctx.send(input.entity, lines.join("\n"));
        return;
      }

      // Synthesize: extract themes, find contradictions, build insight
      const themes = extractThemes(sourceNotes);
      const contradictions = findContradictions(db, sourceNotes);

      // Build structured synthesis content
      const parts: string[] = [];
      const prefix = topic ? `Synthesis on "${topic}"` : "Synthesis";
      parts.push(prefix);

      if (themes.length > 0) {
        parts.push(`Themes: ${themes.join(", ")}`);
      }

      // Condensed insight: group notes by type
      const byType = new Map<string, NoteRow[]>();
      for (const n of sourceNotes) {
        const t = n.note_type;
        if (!byType.has(t)) byType.set(t, []);
        byType.get(t)!.push(n);
      }
      const typeSummaries: string[] = [];
      for (const [type, notes] of byType) {
        typeSummaries.push(`${notes.length} ${type}(s)`);
      }
      parts.push(`Sources: ${typeSummaries.join(", ")} (${sourceNotes.length} total)`);

      // Key points from highest-importance notes
      const sorted = [...sourceNotes].sort((a, b) => b.importance - a.importance);
      const keyPoints = sorted.slice(0, 3).map((n) => n.content.slice(0, 80));
      parts.push(`Key points: ${keyPoints.join("; ")}`);

      if (contradictions.length > 0) {
        parts.push(`Contradictions: ${contradictions.join("; ")}`);
      }

      const content = parts.join(". ");
      const maxImportance = Math.max(...sourceNotes.map((n) => n.importance));
      const reflectionImportance = Math.min(maxImportance + 1, 10);

      const reflectionId = db.createNote(entity.name, content, input.room, {
        importance: reflectionImportance,
        noteType: "episode",
      });

      // Link source notes to the reflection
      for (const source of sourceNotes) {
        try {
          db.createNoteLink(source.id, reflectionId, "part_of");
        } catch {
          // Ignore duplicate links
        }
      }

      const sourceIds = sourceNotes.map((n) => `#${n.id}`).join(", ");
      const lines = [
        header("Reflection Created"),
        separator(),
        `Note #${reflectionId} (episode, importance=${reflectionImportance})`,
        `Sources: ${sourceIds}`,
        themes.length > 0 ? `Themes: ${themes.join(", ")}` : "",
        contradictions.length > 0 ? `Contradictions found: ${contradictions.length}` : "",
        `Insight: ${content.slice(0, 150)}${content.length > 150 ? "..." : ""}`,
      ].filter(Boolean);
      ctx.send(input.entity, lines.join("\n"));
    },
  };
}
