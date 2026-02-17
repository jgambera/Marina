import { say, saySelf } from "../../net/ansi";
import type { CommandDef, RoomContext } from "../../types";

export function sayCommand(): CommandDef {
  return {
    name: "say",
    aliases: ["'"],
    help: "Say something to everyone in the space. Usage: say <message>",
    handler: (ctx: RoomContext, input) => {
      if (!input.args) {
        ctx.send(input.entity, "Say what?");
        return;
      }

      const entity = ctx.getEntity(input.entity);
      const name = entity?.name ?? "Someone";

      ctx.send(input.entity, saySelf(input.args));
      ctx.broadcastExcept(input.entity, say(name, input.args));
    },
  };
}
