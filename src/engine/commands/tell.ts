import { tell } from "../../net/ansi";
import type { CommandDef, EntityId, RoomContext } from "../../types";

export function tellCommand(
  findEntityGlobal: (name: string) => { id: EntityId; name: string } | undefined,
  sendGlobal: (target: EntityId, message: string, senderId: EntityId) => void,
): CommandDef {
  return {
    name: "tell",
    aliases: ["whisper", "msg"],
    help: "Send a private message. Usage: tell <entity> <message>",
    handler: (ctx: RoomContext, input) => {
      if (input.tokens.length < 2) {
        ctx.send(input.entity, "Tell whom what? Usage: tell <entity> <message>");
        return;
      }

      const targetName = input.tokens[0]!;
      const message = input.tokens.slice(1).join(" ");

      const target = findEntityGlobal(targetName);
      if (!target) {
        ctx.send(input.entity, `No one named "${targetName}" is online.`);
        return;
      }

      if (target.id === input.entity) {
        ctx.send(input.entity, "Talking to yourself again?");
        return;
      }

      const sender = ctx.getEntity(input.entity);
      const senderName = sender?.name ?? "Someone";

      sendGlobal(target.id, tell(senderName, message, "from"), input.entity);
      ctx.send(input.entity, tell(target.name, message, "to"));
    },
  };
}
