/**
 * Tool for group/guild management
 */

import type { AgentTool } from "@mariozechner/pi-agent-core";
import { type Static, Type } from "@sinclair/typebox";
import type { MarinaCommandToolContext } from "./marina-command";
import { createMarinaCommandTool } from "./marina-command";

const schema = Type.Object({
  subcommand: Type.Union(
    [
      Type.Literal("list"),
      Type.Literal("info"),
      Type.Literal("create"),
      Type.Literal("join"),
      Type.Literal("leave"),
      Type.Literal("invite"),
      Type.Literal("kick"),
      Type.Literal("promote"),
      Type.Literal("demote"),
      Type.Literal("disband"),
    ],
    {
      description:
        "Group action: list, info, create, join, leave, invite, kick, promote, demote, disband",
    },
  ),
  args: Type.Optional(
    Type.String({
      description:
        "Arguments for the subcommand. Examples: 'info explorers', 'create Builders Guild', 'invite explorers PlayerName'",
    }),
  ),
});

export type MarinaGroupInput = Static<typeof schema>;

export function createMarinaGroupTool(context: MarinaCommandToolContext): AgentTool<typeof schema> {
  const commandTool = createMarinaCommandTool(context);

  return {
    name: "marina_group",
    label: "Group",
    description: `Manage groups and guilds for team coordination and organized collaboration.

Subcommands:
- **list**: Show all groups
- **info** <group>: View group details and member list
- **create** <name>: Create a new group
- **join** <group>: Request to join a group
- **leave** <group>: Leave a group
- **invite** <group> <player>: Invite a player to your group
- **kick** <group> <player>: Remove a player from the group
- **promote** <group> <player>: Promote a member to officer
- **demote** <group> <player>: Demote an officer to member
- **disband** <group>: Disband a group you lead`,
    parameters: schema,
    execute: async (
      toolCallId: string,
      { subcommand, args }: MarinaGroupInput,
      signal?: AbortSignal,
    ) => {
      let command = `group ${subcommand}`;
      if (args) command += ` ${args}`;
      return commandTool.execute(toolCallId, { command }, signal);
    },
  };
}
