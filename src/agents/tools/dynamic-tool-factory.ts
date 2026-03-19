// @ts-nocheck — imported from artilect-agent (non-strict tsconfig)
/**
 * Dynamic Tool Factory - Create tools from discovered Marina commands
 */

import type { AgentTool } from "@mariozechner/pi-agent-core";
import type { GameStateManager } from "../game/state";
import type { MarinaClient } from "../net/marina-client";
import { formatPerception } from "../net/formatter";

export interface DiscoveredCommand {
  name: string;
  description: string;
  usage?: string;
  aliases?: string[];
  category?: string;
}

export interface DynamicToolOptions {
  command: DiscoveredCommand;
  client: MarinaClient;
  gameState: GameStateManager;
}

/**
 * Create a dynamic tool from a discovered command
 */
export function createDynamicTool(options: DynamicToolOptions): AgentTool {
  const { command, client, gameState } = options;

  // Build tool parameters based on command usage
  const parameters: any = {
    type: "object",
    properties: {},
    required: [],
  };

  // Parse usage to detect parameters
  if (command.usage) {
    const paramMatches = command.usage.matchAll(/<([^>]+)>/g);
    for (const match of paramMatches) {
      const paramName = match[1].toLowerCase();
      parameters.properties[paramName] = {
        type: "string",
        description: `The ${paramName} for ${command.name} command`,
      };
      parameters.required.push(paramName);
    }
  }

  const hasParameters = Object.keys(parameters.properties).length > 0;

  const tool: AgentTool = {
    name: `marina_${command.name}`,
    label: command.name,
    description: `${command.description}${command.usage ? ` Usage: ${command.usage}` : ""}${
      command.aliases ? ` Aliases: ${command.aliases.join(", ")}` : ""
    }`,
    parameters: hasParameters ? parameters : undefined,

    async execute(toolCallId: string, params: any, signal?: AbortSignal) {
      // Build command string
      let commandStr = command.name;
      if (hasParameters && params) {
        const paramValues = Object.values(params);
        if (paramValues.length > 0) {
          commandStr += " " + paramValues.join(" ");
        }
      }

      const perceptions = await client.command(commandStr);

      // Update game state
      for (const p of perceptions) {
        gameState.handlePerception(p);
      }

      const formatted = perceptions
        .map((p) => formatPerception(p, "plaintext"))
        .filter(Boolean)
        .join("\n\n");

      return {
        content: [{ type: "text", text: formatted || "(no response)" }],
        details: {
          success: true,
          command: commandStr,
          perceptionCount: perceptions.length,
        },
      };
    },
  };

  return tool;
}

/**
 * Create multiple dynamic tools from a list of commands
 */
export function createDynamicTools(
  commands: DiscoveredCommand[],
  client: MarinaClient,
  gameState: GameStateManager,
): AgentTool[] {
  return commands.map((command) => createDynamicTool({ command, client, gameState }));
}

/**
 * Create a meta-tool that lists all available commands
 */
export function createCommandListTool(commands: DiscoveredCommand[]): AgentTool {
  const categorized = new Map<string, DiscoveredCommand[]>();

  for (const cmd of commands) {
    const category = cmd.category || "other";
    if (!categorized.has(category)) {
      categorized.set(category, []);
    }
    categorized.get(category)!.push(cmd);
  }

  let commandList = "Available commands by category:\n\n";
  for (const [category, cmds] of categorized.entries()) {
    commandList += `${category.toUpperCase()}:\n`;
    for (const cmd of cmds) {
      commandList += `  - ${cmd.name}${cmd.usage ? ` ${cmd.usage}` : ""}: ${cmd.description}\n`;
    }
    commandList += "\n";
  }

  return {
    name: "list_commands",
    label: "List Commands",
    description:
      "List all available commands that have been discovered. Use this to see what actions you can take.",
    parameters: {
      type: "object",
      properties: {},
    } as any,

    async execute() {
      return {
        content: [{ type: "text", text: commandList }],
        details: {
          success: true,
          commands: commandList,
          count: commands.length,
        },
      };
    },
  };
}
