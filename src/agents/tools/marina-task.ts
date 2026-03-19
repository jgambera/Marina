/**
 * Tool for task board management
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
      Type.Literal("claim"),
      Type.Literal("submit"),
      Type.Literal("approve"),
      Type.Literal("reject"),
      Type.Literal("cancel"),
      Type.Literal("bundle"),
      Type.Literal("assign"),
      Type.Literal("children"),
    ],
    {
      description:
        "Task action: list, info, create, claim, submit, approve, reject, cancel, bundle, assign, children",
    },
  ),
  args: Type.Optional(
    Type.String({
      description:
        "Arguments. Examples: 'create Map the dungeon | Explore all rooms', 'claim 3', 'submit 3 | Found 12 rooms', 'bundle Sprint 1 | First batch', 'assign 3 1', 'children 1'",
    }),
  ),
});

export type MarinaTaskInput = Static<typeof schema>;

export function createMarinaTaskTool(context: MarinaCommandToolContext): AgentTool<typeof schema> {
  const commandTool = createMarinaCommandTool(context);

  return {
    name: "marina_task",
    label: "Task",
    description: `Manage the task board for community quests and objectives.

Subcommands:
- **list**: Show all tasks and their status
- **info** <taskId>: View task details
- **create** <Title> | <Description>: Create a new task (pipe separates title from description)
- **claim** <taskId>: Claim a task to work on
- **submit** <taskId> | <report>: Submit a completed task with results
- **approve** <taskId> <claimant>: Approve a submitted task
- **reject** <taskId> <claimant>: Reject a submitted task
- **cancel** <taskId>: Cancel a task you created
- **bundle** <Title> | <Description>: Create a task bundle (parent container for related tasks)
- **assign** <taskId> <bundleId>: Assign a task to a bundle
- **children** <bundleId>: List child tasks of a bundle`,
    parameters: schema,
    execute: async (
      toolCallId: string,
      { subcommand, args }: MarinaTaskInput,
      signal?: AbortSignal,
    ) => {
      let command = `task ${subcommand}`;
      if (args) command += ` ${args}`;
      return commandTool.execute(toolCallId, { command }, signal);
    },
  };
}
