// @ts-nocheck — non-strict tsconfig (agents subsystem)
/**
 * Context Manager - Manages LLM conversation context window
 *
 * Provides a transformContext callback that prunes, summarizes, and truncates
 * messages to keep the conversation within the model's context window budget.
 */

import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type {
  AssistantMessage,
  Message,
  Model,
  ToolResultMessage,
  UserMessage,
} from "@mariozechner/pi-ai";
import { estimateTokens } from "../utils/token-counter";

/** Options for creating a context manager */
export interface ContextManagerOptions {
  /** Returns the current model (called at transform time) */
  getModel: () => Model<any>;
  /** Returns the current system prompt (called at transform time) */
  getSystemPrompt: () => string;
  /** Threshold ratio of context window to trigger pruning (default: 0.8) */
  pruneThreshold?: number;
  /** Target ratio of context window after pruning (default: 0.6) */
  pruneTarget?: number;
  /** Max tokens for a single tool result before truncation (default: 2000) */
  maxToolResultTokens?: number;
  /** Minimum number of recent messages to always keep (default: 10) */
  minRecentMessages?: number;
  /** Called before messages are compacted/dropped. Receives dropped messages and their summary. */
  onBeforeCompact?: (droppedMessages: AgentMessage[], summary: string) => void;
  /** Optional LLM-based summarization. Returns a concise summary of dropped messages.
   * Receives the messages and a rule-based fallback summary. */
  summarizeWithLLM?: (messages: AgentMessage[], ruleBasedFallback: string) => Promise<string>;
}

/**
 * Create a transformContext callback for the Agent.
 *
 * Behavior:
 * - Estimates tokens for system prompt + all messages
 * - If under pruneThreshold, only truncates oversized tool results
 * - If over pruneThreshold, compresses middle messages into a summary
 * - Always keeps messages[0] (initial goals) and last N recent messages
 */
export function createContextManager(options: ContextManagerOptions) {
  const {
    getModel,
    getSystemPrompt,
    pruneThreshold = 0.8,
    pruneTarget = 0.6,
    maxToolResultTokens = 2000,
    minRecentMessages = 10,
    onBeforeCompact,
    summarizeWithLLM,
  } = options;

  return async (messages: AgentMessage[]): Promise<AgentMessage[]> => {
    // Safety: never let context management break the agent loop
    try {
      if (messages.length === 0) return messages;

      const model = getModel();
      const systemPrompt = getSystemPrompt();
      const contextWindow = model.contextWindow;

      // Guard against invalid context window
      if (!contextWindow || contextWindow <= 0) {
        return messages;
      }

      // Estimate current usage
      const systemTokens = estimateTokens(systemPrompt || "");
      const messageTokens = messages.reduce((sum, msg) => sum + estimateMessageTokens(msg), 0);
      const totalTokens = systemTokens + messageTokens;
      const usageRatio = totalTokens / contextWindow;

      // Warn if system prompt alone is >50% of budget
      if (systemTokens > contextWindow * 0.5) {
        console.warn(
          `[context-manager] System prompt uses ${Math.round((systemTokens / contextWindow) * 100)}% of context window (${systemTokens} tokens)`,
        );
      }

      // Under threshold: only truncate oversized tool results
      if (usageRatio < pruneThreshold) {
        return truncateOversizedToolResults(messages, maxToolResultTokens);
      }

      // ─── Tiered compaction based on context pressure ─────────────
      let targetRatio: number;
      let keepRecent: number;
      let maxSummaryRatio: number;

      if (usageRatio >= 0.95) {
        // Tier 3 — Emergency: minimal context, no summary
        console.warn(
          `[context-manager] Emergency compaction (${Math.round(usageRatio * 100)}% usage)`,
        );
        targetRatio = 0.4;
        keepRecent = 4;
        maxSummaryRatio = 0;
      } else if (usageRatio >= 0.9) {
        // Tier 2 — Aggressive: smaller recent window, compressed summary
        console.warn(
          `[context-manager] Aggressive compaction (${Math.round(usageRatio * 100)}% usage)`,
        );
        targetRatio = 0.5;
        keepRecent = 6;
        maxSummaryRatio = 0.05;
      } else {
        // Tier 1 — Standard: current behavior
        targetRatio = pruneTarget;
        keepRecent = minRecentMessages;
        maxSummaryRatio = 0.1;
      }

      const targetTokens = contextWindow * targetRatio;
      const budgetForMessages = targetTokens - systemTokens;

      if (budgetForMessages <= 0) {
        // System prompt alone exceeds budget — keep only recent messages
        const recent = messages.slice(-keepRecent);
        return truncateOversizedToolResults(recent, maxToolResultTokens);
      }

      // Always keep first message (initial goals/instructions)
      const first = messages[0];
      const firstTokens = estimateMessageTokens(first);

      // Determine how many recent messages to keep
      let recentCount = Math.min(keepRecent, messages.length);
      let recentMessages = messages.slice(-recentCount);
      let recentTokens = recentMessages.reduce((sum, msg) => sum + estimateMessageTokens(msg), 0);

      // If recent + first already exceeds budget, reduce recent count
      while (recentCount > 4 && firstTokens + recentTokens > budgetForMessages) {
        recentCount--;
        recentMessages = messages.slice(-recentCount);
        recentTokens = recentMessages.reduce((sum, msg) => sum + estimateMessageTokens(msg), 0);
      }

      // Middle messages to summarize (between first and recent)
      const middleEnd = messages.length - recentCount;
      const middleMessages = middleEnd > 1 ? messages.slice(1, middleEnd) : [];

      // Archive dropped messages before compaction
      if (onBeforeCompact && middleMessages.length > 0) {
        try {
          const archiveSummary = summarizeMessages(middleMessages);
          onBeforeCompact(middleMessages as AgentMessage[], archiveSummary);
        } catch (e: any) {
          console.warn("[context] Transcript archival failed:", e?.message ?? e);
        }
      }

      // Build result
      const result: AgentMessage[] = [first];

      if (middleMessages.length > 0 && maxSummaryRatio > 0) {
        const ruleBasedSummary = summarizeMessages(middleMessages);
        let summary: string;
        if (summarizeWithLLM) {
          try {
            summary = await summarizeWithLLM(middleMessages as AgentMessage[], ruleBasedSummary);
          } catch (e: any) {
            console.warn("[context] LLM summarization failed, using rule-based:", e?.message ?? e);
            summary = ruleBasedSummary;
          }
        } else {
          summary = ruleBasedSummary;
        }

        const maxSummaryTokens = Math.floor(contextWindow * maxSummaryRatio);
        const summaryText = summary.length > 0 ? truncateText(summary, maxSummaryTokens) : "";

        if (summaryText.length > 0) {
          const summaryMessage: UserMessage = {
            role: "user",
            content: `[Context summary — ${middleMessages.length} messages compressed]\n${summaryText}`,
            timestamp: Date.now(),
          };
          result.push(summaryMessage as AgentMessage);
        }
      } else if (middleMessages.length > 0) {
        // Emergency tier: no summary, just note how many messages were dropped
        const dropNote: UserMessage = {
          role: "user",
          content: `[${middleMessages.length} earlier messages dropped — context emergency]`,
          timestamp: Date.now(),
        };
        result.push(dropNote as AgentMessage);
      }

      result.push(...recentMessages);

      let finalResult = truncateOversizedToolResults(result, maxToolResultTokens);

      // ─── Final safety net: emergency fallback if still over 95% ──
      const finalTokens =
        systemTokens + finalResult.reduce((sum, msg) => sum + estimateMessageTokens(msg), 0);
      if (finalTokens > contextWindow * 0.95 && finalResult.length > 5) {
        console.warn(
          `[context-manager] Post-prune still at ${Math.round((finalTokens / contextWindow) * 100)}% — emergency truncation`,
        );
        const emergencyMessages: AgentMessage[] = [
          finalResult[0],
          {
            role: "user",
            content: `[Emergency: ${finalResult.length - 5} messages dropped to fit context window]`,
            timestamp: Date.now(),
          } as AgentMessage,
          ...finalResult.slice(-4),
        ];
        finalResult = truncateOversizedToolResults(emergencyMessages, maxToolResultTokens);
      }

      return finalResult;
    } catch (error) {
      // Context management must never break the agent — return messages unchanged
      console.error("[context-manager] Error during context transform, passing through:", error);
      return messages;
    }
  };
}

/**
 * Estimate token count for a single AgentMessage.
 */
export function estimateMessageTokens(msg: AgentMessage): number {
  try {
    const m = msg as Message;

    if (!m || !m.role) return 0;

    // Overhead for message structure (role, timestamp, etc.)
    let tokens = 4;

    if (m.role === "user") {
      const user = m as UserMessage;
      if (typeof user.content === "string") {
        tokens += estimateTokens(user.content);
      } else if (Array.isArray(user.content)) {
        for (const block of user.content) {
          if (block.type === "text") {
            tokens += estimateTokens(block.text);
          } else if (block.type === "image") {
            tokens += 300; // rough estimate for image tokens
          }
        }
      }
    } else if (m.role === "assistant") {
      const assistant = m as AssistantMessage;
      if (Array.isArray(assistant.content)) {
        for (const block of assistant.content) {
          if (block.type === "text") {
            tokens += estimateTokens(block.text);
          } else if (block.type === "thinking") {
            tokens += estimateTokens(block.thinking);
          } else if (block.type === "toolCall") {
            tokens += estimateTokens(block.name);
            tokens += estimateTokens(JSON.stringify(block.arguments ?? {}));
          }
        }
      }
    } else if (m.role === "toolResult") {
      const toolResult = m as ToolResultMessage;
      tokens += estimateTokens(toolResult.toolName || "");
      if (Array.isArray(toolResult.content)) {
        for (const block of toolResult.content) {
          if (block.type === "text") {
            tokens += estimateTokens(block.text);
          } else if (block.type === "image") {
            tokens += 300;
          }
        }
      }
    }

    return tokens;
  } catch {
    return 50; // Safe fallback estimate
  }
}

/**
 * Produce a human-readable description of a tool call.
 */
export function describeToolAction(toolName: string, args: Record<string, any>): string {
  switch (toolName) {
    case "marina_move":
      return `Moved ${args.direction || "somewhere"}`;
    case "marina_look":
      return args.target ? `Looked at ${args.target}` : "Looked at surroundings";
    case "marina_command":
      return `Ran command: ${args.command || "unknown"}`;
    case "marina_build":
      return `Build: ${args.subcommand || "action"}${args.name ? ` "${args.name}"` : ""}`;
    case "marina_channel":
      return `Channel ${args.action || "action"}${args.channel ? ` #${args.channel}` : ""}`;
    case "marina_board":
      return `Board ${args.action || "action"}${args.board ? ` "${args.board}"` : ""}`;
    case "marina_inventory":
      return "Checked inventory";
    case "marina_state":
      return "Checked game state";
    case "marina_group":
      return `Group ${args.action || "action"}`;
    case "marina_task":
      return `Task ${args.action || "action"}`;
    case "memory":
      if (args.action === "write")
        return `Saved memory [${args.category || ""}]: ${(args.content || "").slice(0, 60)}`;
      if (args.action === "search") return `Searched memory for "${args.query || ""}"`;
      if (args.action === "update") return `Updated memory ${args.entryId || ""}`;
      if (args.action === "remove") return `Removed memory ${args.entryId || ""}`;
      return `Memory ${args.action || "action"}`;
    case "think":
      return `Thinking: ${(args.action || args.thought || "").slice(0, 60)}`;
    case "world_map":
      return `Map ${args.action || "action"}`;
    default:
      return `${toolName}(${Object.values(args)
        .filter((v) => typeof v === "string")
        .map((v) => String(v).slice(0, 30))
        .join(", ")})`;
  }
}

/**
 * Summarize a sequence of messages into a compact, human-readable action log.
 * Uses semantic descriptions instead of raw tool call signatures.
 */
export function summarizeMessages(messages: Message[]): string {
  const lines: string[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    if (msg.role === "assistant" && Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === "toolCall") {
          const description = describeToolAction(block.name, block.arguments);
          const resultSummary = findToolResultSummary(messages, i + 1, block.id);
          lines.push(`${description}${resultSummary ? ` -> ${resultSummary}` : ""}`);
        } else if (block.type === "text" && block.text.length > 0) {
          const brief = block.text.slice(0, 100).replace(/\n/g, " ");
          lines.push(`[thought] ${brief}${block.text.length > 100 ? "..." : ""}`);
        }
      }
    } else if (msg.role === "user") {
      const text =
        typeof msg.content === "string"
          ? msg.content
          : msg.content
              .filter((b): b is { type: "text"; text: string } => b.type === "text")
              .map((b) => b.text)
              .join(" ");
      if (text.length > 0) {
        const brief = text.slice(0, 100).replace(/\n/g, " ");
        lines.push(`[event] ${brief}${text.length > 100 ? "..." : ""}`);
      }
    }
  }

  return lines.join("\n");
}

/**
 * Extract the most informative argument for a given tool name.
 */
export function summarizeArgs(toolName: string, args: Record<string, any>): string {
  if (!args || typeof args !== "object") return "";

  // Tool-specific key argument extraction
  switch (toolName) {
    case "marina_move":
      return args.direction || "";
    case "marina_command":
      return args.command || "";
    case "marina_look":
      return args.target || "";
    case "marina_build":
      return `${args.subcommand || ""}${args.name ? ` ${args.name}` : ""}`;
    case "marina_channel":
      return `${args.action || ""}${args.channel ? ` #${args.channel}` : ""}`;
    case "marina_board":
      return `${args.action || ""}${args.board ? ` ${args.board}` : ""}`;
    case "memory":
      return `${args.action || ""}${args.query ? ` "${args.query}"` : ""}${args.category ? ` [${args.category}]` : ""}`;
    case "think":
      return args.action || "";
    case "world_map":
      return args.action || "";
    default: {
      // Generic: show first string arg value (truncated)
      const firstVal = Object.values(args).find((v) => typeof v === "string" && v.length > 0);
      if (firstVal) return String(firstVal).slice(0, 40);
      return "";
    }
  }
}

/**
 * Find and summarize the tool result for a given toolCallId, starting from startIndex.
 */
function findToolResultSummary(
  messages: Message[],
  startIndex: number,
  toolCallId: string,
): string {
  for (let i = startIndex; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role === "toolResult" && msg.toolCallId === toolCallId) {
      return summarizeToolResult(msg);
    }
  }
  return "";
}

/**
 * Summarize a tool result message with tool-aware extraction.
 * Produces concise outcome descriptions (e.g. "entered The Library (exits: south, east)").
 */
export function summarizeToolResult(msg: ToolResultMessage): string {
  if (msg.isError) return "[error]";

  const textBlocks = msg.content.filter(
    (b): b is { type: "text"; text: string } => b.type === "text",
  );
  if (textBlocks.length === 0) return "[ok]";

  const fullText = textBlocks
    .map((b) => b.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  // Try to extract structured outcome based on tool name
  const outcome = extractStructuredOutcome(msg.toolName, fullText);
  if (outcome) return outcome;

  if (fullText.length <= 120) return fullText;
  return fullText.slice(0, 117) + "...";
}

/**
 * Extract a structured, informative outcome from tool result text.
 * Returns null if no structured extraction is possible.
 */
function extractStructuredOutcome(toolName: string, text: string): string | null {
  switch (toolName) {
    case "marina_move": {
      // Look for room name in response (typically first line or after "You move...")
      const roomMatch = text.match(/(?:entered|arrive at|You are in)\s+(.+?)(?:\.|$)/i);
      const exitsMatch = text.match(/(?:exits?|Exits?):\s*(.+?)(?:\.|$)/i);
      if (roomMatch) {
        const room = roomMatch[1]!.trim().slice(0, 50);
        const exits = exitsMatch ? ` (exits: ${exitsMatch[1]!.trim().slice(0, 40)})` : "";
        return `entered ${room}${exits}`;
      }
      return null;
    }

    case "marina_look": {
      // Extract room title and entity count
      const lines = text.split(/\n/).filter(Boolean);
      const title = lines[0]?.slice(0, 60);
      if (!title) return null;
      const entityCount = (text.match(/(?:entities|players|NPCs)/gi) || []).length;
      return entityCount > 0 ? `${title} (${entityCount} entities)` : title;
    }

    case "marina_command": {
      // For recall: show result count
      const recallMatch = text.match(/(\d+)\s+(?:notes?|results?|memories?)\s+found/i);
      if (recallMatch) return `found ${recallMatch[1]} results`;
      // For note: show note ID
      const noteMatch = text.match(/Note #(\d+)/);
      if (noteMatch) return `created note #${noteMatch[1]}`;
      // For novelty: show composite score
      const noveltyMatch = text.match(/Composite:\s*(\d+)/);
      if (noveltyMatch) return `novelty score: ${noveltyMatch[1]}`;
      // For skill store
      const skillMatch = text.match(/Skill #(\d+)/);
      if (skillMatch) return `stored skill #${skillMatch[1]}`;
      return null;
    }

    case "memory": {
      const savedMatch = text.match(/Memory saved.*?ID:\s*(\S+)/);
      if (savedMatch) return `saved (${savedMatch[1]!.slice(0, 20)})`;
      const foundMatch = text.match(/Found (\d+) memories/);
      if (foundMatch) return `found ${foundMatch[1]} memories`;
      return null;
    }

    default:
      return null;
  }
}

/**
 * Truncate oversized tool results in-place.
 * Returns a new array with tool results clipped to maxTokens.
 */
export function truncateOversizedToolResults(
  messages: AgentMessage[],
  maxTokens: number,
): AgentMessage[] {
  try {
    return messages.map((msg) => {
      const m = msg as Message;
      if (!m || m.role !== "toolResult") return msg;

      const toolResult = m as ToolResultMessage;
      if (!Array.isArray(toolResult.content)) return msg;

      const resultTokens = estimateMessageTokens(msg);
      if (resultTokens <= maxTokens) return msg;

      // Truncate text content blocks
      const truncatedContent = toolResult.content.map((block) => {
        if (block.type !== "text") return block;

        const blockTokens = estimateTokens(block.text);
        if (blockTokens <= maxTokens) return block;

        // Truncate to fit within budget (approximate chars = tokens * 4 / 1.1)
        const maxChars = Math.floor((maxTokens * 4) / 1.1);
        return {
          ...block,
          text: block.text.slice(0, maxChars) + `\n\n[...truncated, ${blockTokens} tokens total]`,
        };
      });

      return {
        ...toolResult,
        content: truncatedContent,
      } as AgentMessage;
    });
  } catch {
    return messages; // Return unchanged on error
  }
}

/**
 * Truncate text to fit within a token budget.
 */
function truncateText(text: string, maxTokens: number): string {
  const tokens = estimateTokens(text);
  if (tokens <= maxTokens) return text;

  const maxChars = Math.floor((maxTokens * 4) / 1.1);
  return text.slice(0, maxChars) + "\n[...summary truncated]";
}
