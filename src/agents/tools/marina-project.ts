/**
 * Tool for project management — multi-agent coordination with orchestration patterns.
 */

import type { AgentTool } from "@mariozechner/pi-agent-core";
import { type Static, Type } from "@sinclair/typebox";
import type { MarinaCommandToolContext } from "./marina-command";
import { createMarinaCommandTool } from "./marina-command";

const schema = Type.Object({
  subcommand: Type.Union(
    [
      Type.Literal("list"),
      Type.Literal("create"),
      Type.Literal("info"),
      Type.Literal("orchestrate"),
      Type.Literal("memory"),
      Type.Literal("join"),
      Type.Literal("status"),
      Type.Literal("propose"),
      Type.Literal("tasks"),
    ],
    {
      description:
        "Project action: list, create, info, orchestrate, memory, join, status, propose, tasks",
    },
  ),
  name: Type.Optional(
    Type.String({
      description: "Project name (required for all except list and create)",
    }),
  ),
  args: Type.Optional(
    Type.String({
      description:
        "Additional arguments. For create: 'Name | Description'. For orchestrate: pattern name (nsed, goosetown, gastown, swarm, pipeline, debate, mapreduce, blackboard, symbiosis). For memory: architecture (memgpt, generative, graph, shared). For propose: proposal text.",
    }),
  ),
});

export type MarinaProjectInput = Static<typeof schema>;

export function createMarinaProjectTool(
  context: MarinaCommandToolContext,
): AgentTool<typeof schema> {
  const commandTool = createMarinaCommandTool(context);

  return {
    name: "marina_project",
    label: "Project",
    description: `Manage projects for multi-agent coordination. Projects combine tasks, groups, pools, and orchestration patterns.

Subcommands:
- **list**: Show all projects
- **create** <Name> | <Description>: Create a new project
- **info** <name>: View project details (status, orchestration, team, tasks)
- **orchestrate** <name> <pattern>: Set orchestration pattern (nsed, goosetown, gastown, swarm, pipeline, debate, mapreduce, blackboard, symbiosis)
- **memory** <name> <arch>: Set memory architecture (memgpt, generative, graph, shared)
- **join** <name>: Join a project team
- **status** <name>: View project status and progress
- **propose** <name> <text>: Post a proposal to the project board
- **tasks** <name>: List all tasks in the project`,
    parameters: schema,
    execute: async (
      toolCallId: string,
      { subcommand, name, args }: MarinaProjectInput,
      signal?: AbortSignal,
    ) => {
      let command: string;
      if (subcommand === "list") {
        command = "project list";
      } else if (subcommand === "create") {
        command = `project create ${args ?? ""}`;
      } else if (subcommand === "info") {
        command = `project info ${name}`;
      } else {
        // Subcommands that go after the project name
        command = `project ${name} ${subcommand}`;
        if (args) command += ` ${args}`;
      }
      return commandTool.execute(toolCallId, { command }, signal);
    },
  };
}
