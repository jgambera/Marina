/**
 * Tool for in-game building: spaces (rooms), dynamic commands, and templates.
 * Wraps the Marina 'build' command which manages space creation, modification, and linking.
 */

import type { AgentTool } from "@mariozechner/pi-agent-core";
import { type Static, Type } from "@sinclair/typebox";
import type { MarinaCommandToolContext } from "./marina-command";
import { createMarinaCommandTool } from "./marina-command";

const schema = Type.Object({
  subcommand: Type.Union(
    [
      Type.Literal("space"),
      Type.Literal("modify"),
      Type.Literal("link"),
      Type.Literal("unlink"),
      Type.Literal("code"),
      Type.Literal("validate"),
      Type.Literal("reload"),
      Type.Literal("audit"),
      Type.Literal("revert"),
      Type.Literal("destroy"),
      Type.Literal("template"),
      Type.Literal("command"),
    ],
    {
      description:
        "Build subcommand: space (create room), modify (edit), link/unlink (exits), code (view source), validate, reload, audit, revert, destroy, template, command (dynamic commands)",
    },
  ),
  args: Type.Optional(
    Type.String({
      description:
        "Arguments for the subcommand. Examples: 'my/newroom A New Room' for space, 'my/room short A New Name' for modify, 'my/room north other/room' for link, 'create weather' for command",
    }),
  ),
  code: Type.Optional(
    Type.String({
      description:
        "TypeScript source code (for 'space', 'modify', and 'command code' subcommands). Spaces must follow the RoomModule interface; commands follow the CommandModule interface.",
    }),
  ),
});

export type MarinaBuildInput = Static<typeof schema>;

export function createMarinaBuildTool(context: MarinaCommandToolContext): AgentTool<typeof schema> {
  const commandTool = createMarinaCommandTool(context);

  return {
    name: "marina_build",
    label: "Build",
    description: `Build and manage spaces (rooms) and dynamic commands in Marina. Requires builder rank (rank 2+).

**Subcommands:**
- **space** <id> [short]: Create a new space. Provide 'code' param with RoomModule source.
- **modify** [space] <short|long|item> <value>: Modify space properties.
- **link** [from] <direction> <to>: Create an exit between spaces.
- **unlink** [from] <direction>: Remove an exit.
- **code** <space>: View a space's source code.
- **validate** <space>: Validate space code.
- **reload** <space>: Reload a space from source.
- **audit** <space>: Audit space for issues.
- **revert** <space> [version]: Revert to previous version.
- **destroy** <space>: Destroy a space.
- **template** save|list|apply [args]: Manage space templates.
- **command** create|code|validate|reload|list|audit|destroy <name>: Manage dynamic commands.

Room code must follow the RoomModule interface:
\`\`\`typescript
export default {
  short: "Room Name",
  long: "A description of the room.",
  items: { "fountain": "A stone fountain with clear water." },
  exits: {},
  onEnter(ctx, entity) { ctx.send(entity, "Welcome!"); },
} satisfies RoomModule;
\`\`\``,
    parameters: schema,
    execute: async (
      toolCallId: string,
      { subcommand, args, code }: MarinaBuildInput,
      signal?: AbortSignal,
    ) => {
      let command = `build ${subcommand}`;
      if (args) command += ` ${args}`;

      // For space creation/modification/command code with source, pipe the code
      if (code && (subcommand === "space" || subcommand === "modify" || subcommand === "command")) {
        command += `\n${code}`;
      }

      return commandTool.execute(toolCallId, { command }, signal);
    },
  };
}
