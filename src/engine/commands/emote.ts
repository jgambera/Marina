import { emote } from "../../net/ansi";
import type { CommandDef, Entity, EntityId, RoomContext } from "../../types";

export function emoteCommand(getEntity: (id: EntityId) => Entity | undefined): CommandDef {
  return {
    name: "emote",
    aliases: ["me", "em"],
    help: "Perform an action. Usage: emote waves hello",
    handler: (ctx: RoomContext, input) => {
      const entity = getEntity(input.entity);
      if (!entity) return;

      if (!input.args) {
        ctx.send(input.entity, "Emote what?");
        return;
      }

      const msg = emote(entity.name, input.args);
      ctx.send(input.entity, msg);
      ctx.broadcastExcept(input.entity, msg);
    },
  };
}
