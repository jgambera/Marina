/**
 * Tool for canvas management — collaborative whiteboards with asset publishing.
 */

import type { AgentTool } from "@mariozechner/pi-agent-core";
import { type Static, Type } from "@sinclair/typebox";
import type { MarinaCommandToolContext } from "./marina-command";
import { createMarinaCommandTool } from "./marina-command";

const schema = Type.Object({
  subcommand: Type.Union(
    [
      Type.Literal("create"),
      Type.Literal("list"),
      Type.Literal("info"),
      Type.Literal("publish"),
      Type.Literal("nodes"),
      Type.Literal("layout"),
      Type.Literal("delete"),
      Type.Literal("asset"),
    ],
    {
      description: "Canvas action: create, list, info, publish, nodes, layout, delete, asset",
    },
  ),
  args: Type.Optional(
    Type.String({
      description:
        "Arguments. For create: '<name> [description]'. For publish: '<type> <asset_id> [canvas]'. For layout: '<grid|timeline> <name>'. For asset: 'upload|list|info|delete [args]'.",
    }),
  ),
});

export type MarinaCanvasInput = Static<typeof schema>;

export function createMarinaCanvasTool(
  context: MarinaCommandToolContext,
): AgentTool<typeof schema> {
  const commandTool = createMarinaCommandTool(context);

  return {
    name: "marina_canvas",
    label: "Canvas",
    description: `Manage collaborative canvases for visual organization and asset publishing.

Subcommands:
- **create** <name> [description]: Create a new canvas
- **list**: List all canvases
- **info** <name>: View canvas details
- **publish** <type> <asset_id> [canvas]: Publish an asset as a node (types: image, video, pdf, audio, document, text, embed, frame)
- **nodes** <name>: List all nodes on a canvas
- **layout** <grid|timeline> <name>: Auto-arrange canvas nodes
- **delete** <name>: Delete a canvas
- **asset** upload|list|info|delete [args]: Manage assets (upload from URL, list, view info, delete)`,
    parameters: schema,
    execute: async (
      toolCallId: string,
      { subcommand, args }: MarinaCanvasInput,
      signal?: AbortSignal,
    ) => {
      let command = `canvas ${subcommand}`;
      if (args) command += ` ${args}`;
      return commandTool.execute(toolCallId, { command }, signal);
    },
  };
}
