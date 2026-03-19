// @ts-nocheck — imported from artilect-agent (non-strict tsconfig)
/**
 * Skill Discovery - Discover Marina commands and create dynamic tools
 */

import type { Agent } from "@mariozechner/pi-agent-core";
import type { GameStateManager } from "../game/state";
import type { MarinaClient } from "../net/marina-client";
import { formatPerception } from "../net/formatter";
import type { Perception } from "../net/types";
import {
  createCommandListTool,
  createDynamicTools,
  type DiscoveredCommand,
} from "../tools/dynamic-tool-factory";

export interface SkillDiscoveryOptions {
  client: MarinaClient;
  agent: Agent;
  gameState: GameStateManager;
  baseTools: any[]; // Existing tools to preserve
  timeout?: number;
  onProgress?: (status: DiscoveryStatus) => void;
}

export interface DiscoveryStatus {
  phase: "help" | "parsing" | "creating" | "complete" | "error";
  message: string;
  commandsFound?: number;
  toolsCreated?: number;
  error?: string;
}

/**
 * Discover available commands via the help system
 */
export async function discoverSkills(options: SkillDiscoveryOptions): Promise<DiscoveredCommand[]> {
  const { client, agent, gameState, baseTools, timeout = 10000, onProgress } = options;

  try {
    // Phase 1: Request help
    onProgress?.({
      phase: "help",
      message: "Requesting help from Marina server...",
    });

    const perceptions = await client.command("help");
    const helpText = perceptions.map((p) => formatPerception(p, "plaintext")).join("\n");

    // Update game state with perceptions
    for (const p of perceptions) {
      gameState.handlePerception(p);
    }

    // Phase 2: Parse help output
    onProgress?.({
      phase: "parsing",
      message: "Parsing available commands...",
    });

    const commands = parseHelpOutput(helpText);

    onProgress?.({
      phase: "parsing",
      message: `Found ${commands.length} commands`,
      commandsFound: commands.length,
    });

    // Phase 3: Create dynamic tools
    if (commands.length > 0) {
      onProgress?.({
        phase: "creating",
        message: `Creating ${commands.length} dynamic tools...`,
      });

      const dynamicTools = createDynamicTools(commands, client, gameState);
      const listTool = createCommandListTool(commands);

      // Combine base tools with new dynamic tools
      const allTools = [...baseTools, ...dynamicTools, listTool];
      agent.setTools(allTools);
    }

    // Phase 4: Complete
    onProgress?.({
      phase: "complete",
      message: `Skill discovery complete. ${commands.length} tools created.`,
      commandsFound: commands.length,
      toolsCreated: commands.length,
    });

    return commands;
  } catch (error: any) {
    onProgress?.({
      phase: "error",
      message: "Skill discovery failed",
      error: error.message,
    });
    throw error;
  }
}

/**
 * Parse help output into discovered commands
 */
function parseHelpOutput(helpText: string): DiscoveredCommand[] {
  const commands: DiscoveredCommand[] = [];
  const lines = helpText.split("\n");

  // Skip commands we already have dedicated tools for
  const builtinCommands = new Set([
    "look",
    "move",
    "go",
    "north",
    "south",
    "east",
    "west",
    "up",
    "down",
    "n",
    "s",
    "e",
    "w",
    "u",
    "d",
    "inventory",
    "i",
    "inv",
    "say",
    "tell",
    "shout",
    "help",
    "quit",
    "who",
    "score",
    "channel",
    "board",
    "group",
    "task",
    "macro",
    "build",
    "project",
    "canvas",
    "observe",
    "quest",
    "connect",
    "orient",
    "status",
    "briefing",
  ]);

  for (const line of lines) {
    // Common help format: "  command - description" or "  command  description"
    const match = line.match(/^\s+(\w+)\s+[-—:]\s+(.+)$/);
    if (match) {
      const name = match[1].toLowerCase();
      const description = match[2].trim();

      if (!builtinCommands.has(name) && name.length > 1) {
        commands.push({
          name,
          description,
          category: categorizeCommand(name, description),
        });
      }
      continue;
    }

    // Simple format: just command names in a list
    const simpleMatch = line.match(/^\s+(\w{2,20})\s*$/);
    if (simpleMatch) {
      const name = simpleMatch[1].toLowerCase();
      if (!builtinCommands.has(name)) {
        commands.push({
          name,
          description: `Execute the ${name} command`,
          category: categorizeCommand(name, ""),
        });
      }
    }
  }

  return commands;
}

/**
 * Categorize a command based on name and description
 */
function categorizeCommand(name: string, description: string): string {
  const lower = (name + " " + description).toLowerCase();

  if (lower.match(/\b(channel|chat|say|tell|shout|whisper|emote)\b/)) return "communication";
  if (lower.match(/\b(board|post|reply|note|message)\b/)) return "boards";
  if (lower.match(/\b(group|guild|party|team|invite|join|leave)\b/)) return "groups";
  if (lower.match(/\b(task|quest|mission|objective)\b/)) return "tasks";
  if (lower.match(/\b(build|room|create|edit|modify|link)\b/)) return "building";
  if (lower.match(/\b(look|examine|search|explore|map)\b/)) return "exploration";
  if (lower.match(/\b(get|take|drop|give|inventory|use|equip)\b/)) return "items";
  if (lower.match(/\b(move|go|walk|run|enter|exit|climb)\b/)) return "movement";
  if (lower.match(/\b(score|stats|status|info|who|finger)\b/)) return "information";
  if (lower.match(/\b(macro|alias|bind|trigger)\b/)) return "automation";
  if (lower.match(/\b(analyze|study|examine|inspect|investigate|query|read)\b/)) return "research";
  if (lower.match(/\b(learn|teach|library|archive|wiki|index|catalog)\b/)) return "knowledge";
  if (lower.match(/\b(watch|monitor|track|scan|survey|report)\b/)) return "observation";

  return "general";
}
