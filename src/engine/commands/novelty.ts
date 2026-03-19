import { header, separator } from "../../net/ansi";
import type { MarinaDB } from "../../persistence/database";
import type { CommandDef, Entity, RoomContext } from "../../types";

/**
 * Calculate entropy of a distribution (higher = more diverse).
 * Returns value 0-1 (normalized by log(n)).
 */
function entropy(counts: number[]): number {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  const n = counts.length;
  if (n <= 1) return 0;
  let h = 0;
  for (const c of counts) {
    if (c === 0) continue;
    const p = c / total;
    h -= p * Math.log2(p);
  }
  return h / Math.log2(n); // Normalize to 0-1
}

export function noveltyCommand(deps: {
  getEntity: (id: string) => Entity | undefined;
  db?: MarinaDB;
  getTotalRoomCount?: () => number;
}): CommandDef {
  return {
    name: "novelty",
    aliases: [],
    help: "Exploration novelty scoring. Usage: novelty | novelty suggest | novelty stats",
    handler: (ctx: RoomContext, input) => {
      const entity = deps.getEntity(input.entity);
      if (!entity) return;
      if (!deps.db) {
        ctx.send(input.entity, "Novelty requires database support.");
        return;
      }
      const db = deps.db;
      const sub = input.tokens[0]?.toLowerCase();

      const stats = db.getActivityStats(entity.name);

      if (sub === "stats") {
        const totalRooms = deps.getTotalRoomCount?.() ?? 0;
        const worldPct = totalRooms > 0 ? Math.round((stats.roomsVisited / totalRooms) * 100) : 0;
        const lines = [
          header("Exploration Statistics"),
          separator(),
          `Rooms visited: ${stats.roomsVisited}${totalRooms > 0 ? ` / ${totalRooms} (${worldPct}%)` : ""}`,
          `Unique commands used: ${stats.uniqueCommands}`,
          `Entities interacted with: ${stats.entitiesInteracted}`,
          `Total actions: ${stats.totalActions}`,
        ];

        // Show command diversity
        const topCommands = db.getActivityByType(entity.name, "command", 10);
        if (topCommands.length > 0) {
          lines.push("", "Top commands:");
          for (const cmd of topCommands.slice(0, 5)) {
            lines.push(`  ${cmd.key}: ${cmd.count} times`);
          }
        }

        ctx.send(input.entity, lines.join("\n"));
        return;
      }

      if (sub === "suggest") {
        const suggestions: string[] = [];

        // Suggest based on under-explored areas
        if (stats.roomsVisited < 3) {
          suggestions.push("Explore more rooms — try moving in different directions");
        }
        if (stats.uniqueCommands < 5) {
          suggestions.push("Try new commands — use 'help' to discover available actions");
        }
        if (stats.entitiesInteracted < 2) {
          suggestions.push("Interact with other entities — try 'who' and 'tell' commands");
        }

        // Check for repetitive behavior
        const topCommands = db.getActivityByType(entity.name, "command", 5);
        if (topCommands.length > 0) {
          const total = topCommands.reduce((s, c) => s + c.count, 0);
          const topPct = topCommands[0] ? Math.round((topCommands[0].count / total) * 100) : 0;
          const topCmd = topCommands[0];
          if (topPct > 50 && topCmd) {
            suggestions.push(`Diversify actions — '${topCmd.key}' is ${topPct}% of your activity`);
          }
        }

        // Check notes for under-explored knowledge
        const notes = db.getNotesByEntity(entity.name, 50);
        if (notes.length < 3) {
          suggestions.push("Take more notes to build your knowledge base — use 'note'");
        }

        if (suggestions.length === 0) {
          suggestions.push(
            "You've been exploring well! Try visiting previously explored areas again for changes.",
          );
        }

        const lines = [
          header("Novelty Suggestions"),
          separator(),
          ...suggestions.slice(0, 3).map((s, i) => `  ${i + 1}. ${s}`),
        ];
        ctx.send(input.entity, lines.join("\n"));
        return;
      }

      // Default: composite novelty score
      const scores: { label: string; score: number }[] = [];

      // Room novelty: how new is this room to the entity?
      const roomVisits = db.getRoomVisitCount(entity.name, input.room);
      const roomNovelty = roomVisits === 0 ? 100 : Math.max(0, 100 - roomVisits * 20);
      scores.push({ label: "Room", score: roomNovelty });

      // Action diversity: entropy of command distribution
      const commandDist = db.getActivityByType(entity.name, "command", 50);
      const commandCounts = commandDist.map((c) => c.count);
      const actionEntropy = commandCounts.length > 0 ? entropy(commandCounts) : 0;
      // Low entropy = high novelty need (actions are repetitive)
      const actionNovelty = Math.round((1 - actionEntropy) * 100);
      scores.push({ label: "Action diversity need", score: actionNovelty });

      // Knowledge novelty: how many notes relate to current room?
      const roomNotes = db.getNotesByRoom(input.room, 50);
      const knowledgeNovelty =
        roomNotes.length === 0 ? 100 : Math.max(0, 100 - roomNotes.length * 15);
      scores.push({ label: "Knowledge gap", score: knowledgeNovelty });

      // Social novelty: have we interacted with entities here?
      const socialNovelty =
        stats.entitiesInteracted < 2 ? 80 : Math.max(0, 60 - stats.entitiesInteracted * 10);
      scores.push({ label: "Social", score: socialNovelty });

      // Composite
      const composite = Math.round(scores.reduce((sum, s) => sum + s.score, 0) / scores.length);

      const lines = [
        header("Novelty Score"),
        separator(),
        `Composite: ${composite}/100`,
        "",
        ...scores.map((s) => `  ${s.label}: ${s.score}/100`),
      ];
      ctx.send(input.entity, lines.join("\n"));
    },
  };
}
