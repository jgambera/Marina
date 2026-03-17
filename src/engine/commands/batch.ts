import type { CommandDef, EntityId } from "../../types";

const MAX_BATCH = 20;

export function batchCommand(deps: {
  processCommand: (entityId: EntityId, raw: string) => void;
}): CommandDef {
  return {
    name: "batch",
    aliases: [],
    help: "Execute multiple commands in sequence, separated by semicolons.\nUsage: batch look ; north ; look ; note Found something\n\nUp to 20 commands per batch.",
    handler(ctx, input) {
      const commands = input.args
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean);

      if (commands.length === 0) {
        ctx.send(input.entity, "Usage: batch <cmd1> ; <cmd2> ; <cmd3>");
        return;
      }

      if (commands.length > MAX_BATCH) {
        ctx.send(input.entity, `Batch limited to ${MAX_BATCH} commands. Got ${commands.length}.`);
        return;
      }

      for (const cmd of commands) {
        deps.processCommand(input.entity, cmd);
      }
    },
  };
}
