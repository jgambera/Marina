import { emote } from "../../net/ansi";
import type { CommandDef, RoomContext } from "../../types";

export function emoteCommand(): CommandDef {
  return {
    name: "emote",
    aliases: ["me", "em"],
    help: "Perform an action. Usage: emote waves hello",
    handler: (ctx: RoomContext, input) => {
      if (!input.args) {
        ctx.send(input.entity, "Emote what?");
        return;
      }

      const e = ctx.getEntity(input.entity);
      const name = e?.name ?? "Someone";

      const msg = emote(name, input.args);
      ctx.send(input.entity, msg);
      ctx.broadcastExcept(input.entity, msg);
    },
  };
}
