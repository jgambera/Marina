import type { CommandDef, Connection, EntityId } from "../../types";

export function quitCommand(deps: {
  getConnection: (entityId: EntityId) => Connection | undefined;
}): CommandDef {
  return {
    name: "quit",
    aliases: ["exit", "logout", "disconnect"],
    help: "Disconnect from Artilect and end your session.",
    handler(ctx, input) {
      const conn = deps.getConnection(input.entity);
      if (!conn) {
        ctx.send(input.entity, "No active connection found.");
        return;
      }
      ctx.send(input.entity, "Goodbye. Your session has ended.");
      // close() triggers the protocol's close handler, which calls
      // engine.removeConnection() → entity cleanup + departure broadcast
      conn.close();
    },
  };
}
