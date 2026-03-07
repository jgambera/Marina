import { dim, entity, header, rank, separator } from "../../net/ansi";
import type { CommandDef, Entity, RoomContext } from "../../types";
import { formatDuration } from "./format-duration";

export function whoCommand(
  getOnlineEntities: () => Entity[],
  getRoomShort?: (roomId: string) => string | undefined,
): CommandDef {
  return {
    name: "who",
    aliases: [],
    help: "List all connected entities.",
    handler: (ctx: RoomContext, input) => {
      const online = getOnlineEntities();
      if (online.length === 0) {
        ctx.send(input.entity, "No one is online.");
        return;
      }

      const lines = [header(`Online Entities (${online.length})`), separator(50)];

      for (const e of online) {
        const rankVal = (e.properties.rank as number) ?? 0;
        const rankStr = rank(rankVal);
        const roomShort = getRoomShort ? getRoomShort(e.room) : undefined;
        const location = roomShort ? ` ${dim(`in ${roomShort}`)}` : "";
        const idle = formatDuration(Date.now() - e.createdAt);
        lines.push(`  ${entity(e.name)} ${rankStr}${location} ${dim(`(${idle})`)}`);
      }

      ctx.send(input.entity, lines.join("\n"));
    },
  };
}
