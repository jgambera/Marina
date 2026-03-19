/**
 * Tool for board management
 */

import type { AgentTool } from "@mariozechner/pi-agent-core";
import { type Static, Type } from "@sinclair/typebox";
import type { MarinaCommandToolContext } from "./marina-command";
import { createMarinaCommandTool } from "./marina-command";

const schema = Type.Object({
  subcommand: Type.Union(
    [
      Type.Literal("list"),
      Type.Literal("read"),
      Type.Literal("post"),
      Type.Literal("reply"),
      Type.Literal("search"),
    ],
    {
      description: "Board action: list, read, post, reply, search",
    },
  ),
  args: Type.Optional(
    Type.String({
      description:
        "Arguments. Examples: 'list' (no args), 'read general 1', 'post general My Title | Body text', 'reply general 1 | Reply text', 'search general keyword'",
    }),
  ),
});

export type MarinaBoardInput = Static<typeof schema>;

export function createMarinaBoardTool(context: MarinaCommandToolContext): AgentTool<typeof schema> {
  const commandTool = createMarinaCommandTool(context);

  return {
    name: "marina_board",
    label: "Board",
    description: `Manage message boards for persistent community posts, announcements, and knowledge sharing.

Subcommands:
- **list**: Show all available boards
- **read** <board> [postId]: Read a board's posts, or a specific post by ID
- **post** <board> <Title> | <Body>: Create a new post (pipe separates title from body)
- **reply** <board> <postId> | <text>: Reply to a post
- **search** <board> <keyword>: Search a board's posts by keyword`,
    parameters: schema,
    execute: async (
      toolCallId: string,
      { subcommand, args }: MarinaBoardInput,
      signal?: AbortSignal,
    ) => {
      let command = `board ${subcommand}`;
      if (args) command += ` ${args}`;
      return commandTool.execute(toolCallId, { command }, signal);
    },
  };
}
