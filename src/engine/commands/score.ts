import { header, rank, separator } from "../../net/ansi";
import type { CommandDef, Entity, EntityId, RoomContext } from "../../types";
import { formatDuration } from "./format-duration";

export function scoreCommand(deps: {
  getEntity: (id: EntityId) => Entity | undefined;
  getRoomShort: (roomId: string) => string | undefined;
}): CommandDef {
  return {
    name: "score",
    aliases: ["stats", "status"],
    help: "Show your character status.",
    handler: (ctx: RoomContext, input) => {
      const entity = deps.getEntity(input.entity);
      if (!entity) return;

      const rankVal = (entity.properties.rank as number) ?? 0;

      const roomShort = deps.getRoomShort(entity.room) ?? entity.room;
      const sessionTime = formatDuration(Date.now() - entity.createdAt);

      const activeQuest = entity.properties.active_quest as string | undefined;
      const completedQuests = (entity.properties.completed_quests as string[]) ?? [];
      const districts = (entity.properties.quest_districts as string[]) ?? [];

      const lines = [
        header(entity.name),
        separator(30),
        `  Rank:     ${rank(rankVal)} (${rankVal})`,
        `  Location: ${roomShort}`,
        `  Session:  ${sessionTime}`,
        `  Items:    ${entity.inventory.length}`,
      ];

      if (districts.length > 0) {
        lines.push(`  Districts visited: ${districts.join(", ")}`);
      }

      if (activeQuest) {
        lines.push(`  Active quest: ${activeQuest}`);
      }

      if (completedQuests.length > 0) {
        lines.push(`  Completed quests: ${completedQuests.length}`);
      }

      ctx.send(input.entity, lines.join("\n"));
    },
  };
}
