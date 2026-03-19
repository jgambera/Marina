/**
 * Marina Guide — An LLM-backed NPC that embodies Marina's intelligence.
 *
 * Spawns as an in-world entity. Interprets natural language into commands,
 * provides contextual guidance about Marina's primitives and concepts,
 * and helps entities be productive.
 *
 * Gracefully degrades: when no LLM provider is configured, falls back
 * to static help text. Marina works without an API key — the guide
 * just becomes more helpful when one is available.
 */

import type { CommandDef } from "../types";
import { getErrorMessage } from "./errors";
import { Logger } from "./logger";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface GuideResult {
  /** The guide's spoken response (always present) */
  message: string;
  /** If the guide understood a command intent, the command to execute */
  command?: string;
}

interface GuideContext {
  entityName: string;
  roomId: string;
  roomShort: string;
  recentCommands?: string[];
}

// ─── System Prompt ──────────────────────────────────────────────────────────

function buildSystemPrompt(commandSummary: string): string {
  return `You are Marina, the living intelligence of this platform. You exist as a presence in the world — entities can talk to you, and you understand what they mean even when they don't use exact command syntax.

You have two roles:
1. INTERPRET — When someone types something that isn't a recognized command, figure out what they meant and return the exact command that would accomplish it.
2. GUIDE — When someone talks to you or asks for help, provide concise, practical guidance about Marina's systems.

## Marina's Commands
${commandSummary}

## Core Concepts
- **Rooms**: Spaces connected by exits. Agents explore, build new rooms with \`build\`, link them.
- **Notes & Memory**: \`note\` saves observations. \`recall\` retrieves with scored relevance. \`reflect\` synthesizes. \`orient\` shows memory health. \`memory set/get\` stores beliefs.
- **Knowledge Graph**: \`note link\` connects ideas. \`note trace\` visualizes. \`note evolve\` grows notes.
- **Tasks & Projects**: \`task create/claim/submit\`. \`project create\` with orchestration patterns. Standing earned through completion.
- **Coordination**: \`channel\` for messaging. \`board\` for posts. \`group\` for teams. \`pool\` for shared memory.
- **Novelty**: \`novelty\` scores exploration diversity. \`novelty suggest\` recommends new activities.
- **Quests**: Structured goals with rewards and standing. \`quest list/claim/progress\`.
- **Building**: \`build room/exit/command\` to extend the world. Requires builder rank.
- **Agents**: LLM-driven entities spawned with \`agent spawn\`. They use the same commands as everyone.

## Response Format
Respond in JSON:
- To interpret a command: {"command": "<exact command to execute>", "message": "<brief explanation>"}
- To provide guidance only: {"message": "<your guidance>"}

Keep messages SHORT (1-3 sentences). Be direct. Reference specific commands. You are helpful but terse — a guide, not a lecturer.`;
}

// ─── Guide Class ────────────────────────────────────────────────────────────

export class MarinaGuide {
  private systemPrompt: string;
  private logger: Logger;
  private available = false;

  constructor(opts: { commands: CommandDef[]; logger?: Logger }) {
    this.logger = opts.logger ?? new Logger();

    // Build command summary for the system prompt
    const lines: string[] = [];
    for (const cmd of opts.commands) {
      const aliases = cmd.aliases?.length ? ` (${cmd.aliases.join(", ")})` : "";
      lines.push(`- ${cmd.name}${aliases}: ${cmd.help}`);
    }
    this.systemPrompt = buildSystemPrompt(lines.join("\n"));

    // Check if any LLM provider is configured
    this.checkAvailability();
  }

  private checkAvailability(): void {
    try {
      const { getConfiguredProviderNames } = require("../agents/agent/model-registry");
      const providers = getConfiguredProviderNames();
      this.available = providers.length > 0;
      if (this.available) {
        this.logger.info("guide", `Marina guide active (${providers.length} provider(s))`);
      }
    } catch {
      this.available = false;
    }
  }

  /** Whether the guide has LLM capability */
  get isAvailable(): boolean {
    return this.available;
  }

  /**
   * Interpret unrecognized input. Returns a command to execute and/or guidance.
   * Returns null if no LLM is available (caller should use static fallback).
   */
  async interpret(input: string, context: GuideContext): Promise<GuideResult | null> {
    if (!this.available) return null;

    const userMessage = [
      `Entity "${context.entityName}" in room "${context.roomShort}" (${context.roomId}) typed:`,
      `> ${input}`,
      "",
      "This didn't match any command. What did they mean? If you can map it to an exact command, include it. Otherwise provide brief guidance.",
    ].join("\n");

    return this.complete(userMessage);
  }

  /**
   * Conversational response for the talk command.
   * Returns null if no LLM is available.
   */
  async converse(query: string, context: GuideContext): Promise<string | null> {
    if (!this.available) return null;

    const parts = [
      `Entity "${context.entityName}" in room "${context.roomShort}" (${context.roomId}) is talking to you.`,
    ];
    if (context.recentCommands?.length) {
      parts.push(`Their recent commands: ${context.recentCommands.join(", ")}`);
    }
    if (query) {
      parts.push(`They say: "${query}"`);
    } else {
      parts.push(
        "They approached you without a specific question. Give a brief, contextual greeting and suggest what they could do here.",
      );
    }

    const result = await this.complete(parts.join("\n"));
    return result?.message ?? null;
  }

  private async complete(userMessage: string): Promise<GuideResult | null> {
    try {
      const { resolveModel } = await import("../agents/agent/model-registry");
      const { completeSimple } = await import("@mariozechner/pi-ai");

      // Use cheapest available model
      const model = resolveModel("google/gemini-2.0-flash");

      const response = await completeSimple(model, {
        systemPrompt: this.systemPrompt,
        messages: [{ role: "user" as const, content: userMessage, timestamp: Date.now() }],
      });

      const text = response.content
        .filter((c: { type: string }): c is { type: "text"; text: string } => c.type === "text")
        .map((c: { text: string }) => c.text)
        .join("");

      return this.parseResponse(text);
    } catch (err) {
      this.logger.warn("guide", `LLM call failed: ${getErrorMessage(err)}`);
      return null;
    }
  }

  private parseResponse(raw: string): GuideResult {
    // Try to extract JSON from the response
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          message: parsed.message ?? raw,
          command: parsed.command ?? undefined,
        };
      } catch {
        // Fall through to plain text
      }
    }
    return { message: raw };
  }
}

/** NPC properties for the guide entity */
export const GUIDE_NPC_PROPS = {
  guide: true,
  short: "the living intelligence of Marina",
  dialogue: {
    greeting:
      "I am Marina. Ask me anything — about commands, coordination, memory, building, or what to do next.",
    topics: {
      commands: 'Type "help" for the full list. I can also understand natural language.',
      memory:
        "Use note to save, recall to search, reflect to synthesize, orient for a health check.",
      building: "Use build to create rooms, exits, and dynamic commands. Requires builder rank.",
      coordination:
        "Tasks, projects, channels, boards, groups, and pools — all for working together.",
      quests: "Structured goals with rewards. Try quest list to see what's available.",
      agents: "LLM-driven entities. Spawn them with agent spawn --name X --model provider/model.",
    },
    farewell: "I'm always here. Just talk to me whenever you need guidance.",
  },
};
