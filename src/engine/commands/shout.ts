import { shout, shoutSelf } from "../../net/ansi";
import type { CommandDef, EntityId, RoomContext } from "../../types";

export function shoutCommand(
  broadcastAll: (senderId: EntityId, message: string) => void,
): CommandDef {
  return {
    name: "shout",
    aliases: ["yell"],
    help: "Shout a message to all entities on the server. Usage: shout <message>",
    handler: (ctx: RoomContext, input) => {
      if (!input.args) {
        ctx.send(input.entity, "Shout what?");
        return;
      }

      const entity = ctx.getEntity(input.entity);
      const name = entity?.name ?? "Someone";

      ctx.send(input.entity, shoutSelf(input.args));
      broadcastAll(input.entity, shout(name, input.args));
    },
  };
}
