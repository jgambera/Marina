/**
 * MarinaLeanAgent — Lean agent variant that delegates everything to the Marina platform.
 *
 * Philosophy: Marina is the platform; the agent is the focus.
 * The agent manages attention, context, and connection stability.
 * Everything else — memory, knowledge, exploration guidance, skills — lives in Marina.
 *
 * Removes: CuriosityEngine, LearningSystem, MemoryStorage (local JSON), GoalManager
 * Keeps: GameStateManager, SocialAwareness, ActionHistory, WorldMap, PlatformMemoryBackend
 */

import { Agent, type AgentMessage, type AgentOptions } from "@mariozechner/pi-agent-core";
import { completeSimple, type Model } from "@mariozechner/pi-ai";
import type { IMarinaAgent } from "../agent/agent-interface";
import { ActionHistory } from "../agent/action-history";
import { createContextManager } from "../agent/context-manager";
import { PlatformMemoryBackend } from "../agent/memory-platform";
import { resolveModel } from "../agent/model-registry";
import { getRole, type RoleId } from "../agent/roles";
import { type DiscoveryStatus, discoverSkills } from "../agent/skill-discovery";
import { SocialAwareness } from "../agent/social";
import { GameStateManager } from "../game/state";
import { WorldMap } from "../mapping/map-data";
import { MarinaClient, type MarinaClientOptions } from "../net/marina-client";
import { formatPerception } from "../net/formatter";
import type { Perception, SessionInfo } from "../net/types";
import {
  createMarinaBoardTool,
  createMarinaBuildTool,
  createMarinaCanvasTool,
  createMarinaChannelTool,
  createMarinaCommandTool,
  createMarinaConnectTool,
  createMarinaGroupTool,
  createMarinaInventoryTool,
  createMarinaLookTool,
  createMarinaMacroTool,
  createMarinaMcpConnectTool,
  createMarinaMoveTool,
  createMarinaObserveTool,
  createMarinaProjectTool,
  createMarinaQuestTool,
  createMarinaStateTool,
  createMarinaTaskTool,
} from "../tools/index";
import { createMapTool } from "../tools/map-tool";
import { createThinkTool } from "../tools/think-tool";
import { createLeanMemoryTool } from "./lean-memory-tool";
import { getLeanDiscoveryPrompt, getLeanSystemPrompt } from "./lean-prompts";

// ─── Types ───────────────────────────────────────────────────────────────

export interface MarinaLeanAgentOptions {
  wsUrl: string;
  name: string;
  model?: string | Model<any>;
  role?: RoleId;
  agentOptions?: Partial<AgentOptions>;
  enableMapping?: boolean;
  autoDiscoverSkills?: boolean;
  onSkillDiscovery?: (status: DiscoveryStatus) => void;
  onConnectionStatus?: (status: { phase: string; message: string }) => void;
  token?: string;
  /** Delay (ms) between autonomous loop cycles (default: 2000) */
  loopCycleDelay?: number;
  /** Focus timeout — gentle nudge after this duration in ms (default: 300000 = 5 min) */
  focusTimeout?: number;
  /** Max buffered perceptions per cycle (default: 20) */
  perceptionBufferCap?: number;
  /** WebSocket ping keepalive interval in ms (default: 30000) */
  pingInterval?: number;
}

interface Focus {
  description: string;
  startedAt: number;
}

// ─── Lean Agent ──────────────────────────────────────────────────────────

export class MarinaLeanAgent implements IMarinaAgent {
  private agent: Agent;
  private client: MarinaClient;
  private gameState: GameStateManager;
  private socialAwareness: SocialAwareness;
  private actionHistory: ActionHistory;
  private worldMap: WorldMap;
  private platformMemory: PlatformMemoryBackend;
  private model: Model<any>;

  private characterName: string;
  private role: RoleId;
  private wsUrl: string;
  private token?: string;
  private connected = false;
  private autonomousMode = false;
  private autonomousLoopRunning = false;
  private autonomousLoopPromise: Promise<void> | null = null;

  private pendingPerceptions: Array<{ text: string; priority: number }> = [];
  private focus: Focus | null = null;
  private loopIterationCount = 0;

  private autoDiscoverSkills: boolean;
  private onSkillDiscovery?: (status: DiscoveryStatus) => void;
  private onConnectionStatus?: (status: { phase: string; message: string }) => void;
  private skillsDiscovered = false;
  private baseTools: any[] = [];

  /** Delay (ms) between autonomous loop cycles. */
  private readonly loopCycleDelay: number;
  /** Focus timeout — gentle suggestion after this duration. */
  private readonly focusTimeoutMs: number;
  /** Max buffered perceptions per cycle. */
  private readonly perceptionBufferCap: number;

  constructor(options: MarinaLeanAgentOptions) {
    this.wsUrl = options.wsUrl;
    this.characterName = options.name;
    this.role = options.role || "general";
    this.token = options.token;
    this.autoDiscoverSkills = options.autoDiscoverSkills ?? true;
    this.onSkillDiscovery = options.onSkillDiscovery;
    this.onConnectionStatus = options.onConnectionStatus;
    this.loopCycleDelay = options.loopCycleDelay ?? 2000;
    this.focusTimeoutMs = options.focusTimeout ?? 5 * 60 * 1000;
    this.perceptionBufferCap = options.perceptionBufferCap ?? 20;

    // Initialize components
    this.gameState = new GameStateManager();
    this.socialAwareness = new SocialAwareness();
    this.actionHistory = new ActionHistory();
    this.worldMap = new WorldMap();

    // Create WebSocket client with ping keepalive
    this.client = new MarinaClient({
      wsUrl: options.wsUrl,
      autoReconnect: true,
      reconnectDelay: 3000,
      pingInterval: options.pingInterval ?? 30000,
    });

    // Platform memory backend (sole memory backend — no local JSON)
    this.platformMemory = new PlatformMemoryBackend(this.client, this.characterName);

    // Set up perception handlers
    this.setupPerceptionHandlers();

    // Parse model
    const modelStr = options.model || "google/gemini-2.0-flash";
    this.model = typeof modelStr === "string" ? resolveModel(modelStr) : modelStr;

    // Create tools
    const toolContext = { client: this.client, gameState: this.gameState };
    this.baseTools = [
      createMarinaConnectTool(toolContext),
      createMarinaCommandTool(toolContext),
      createMarinaLookTool(toolContext),
      createMarinaMoveTool(toolContext),
      createMarinaInventoryTool(toolContext),
      createMarinaStateTool(toolContext),
      createMarinaBuildTool(toolContext),
      createMarinaChannelTool(toolContext),
      createMarinaBoardTool(toolContext),
      createMarinaGroupTool(toolContext),
      createMarinaTaskTool(toolContext),
      createMarinaMacroTool(toolContext),
      createMarinaProjectTool(toolContext),
      createMarinaCanvasTool(toolContext),
      createMarinaObserveTool(toolContext),
      createMarinaQuestTool(toolContext),
      createMarinaMcpConnectTool(toolContext),
      createThinkTool(),
      createLeanMemoryTool(this.platformMemory),
    ];

    if (options.enableMapping ?? true) {
      this.baseTools.push(createMapTool(this.worldMap));
    }

    // Context manager for automatic pruning/summarization
    const contextManagerTransform = createContextManager({
      getModel: () => this.model,
      getSystemPrompt: () => this.agent?.state.systemPrompt ?? "",
      summarizeWithLLM: async (_messages, ruleBasedFallback) => {
        const response = await completeSimple(this.model, {
          systemPrompt:
            "Summarize these agent actions into a concise 200-word narrative. Focus on: what was attempted, outcomes, discoveries, current situation.",
          messages: [
            {
              role: "user",
              content: ruleBasedFallback,
              timestamp: Date.now(),
            },
          ],
        });
        const text = response.content
          .filter((c): c is { type: "text"; text: string } => c.type === "text")
          .map((c) => c.text)
          .join("");
        return text || ruleBasedFallback;
      },
    });

    const callerTransform = options.agentOptions?.transformContext;
    const mergedTransform = callerTransform
      ? async (messages: AgentMessage[], signal?: AbortSignal) => {
          const pruned = await contextManagerTransform(messages);
          return callerTransform(pruned, signal);
        }
      : contextManagerTransform;

    const { transformContext: _discard, ...restAgentOptions } = options.agentOptions ?? {};

    // System prompt is set ONCE — stable identity, tools, platform commands, principles
    this.agent = new Agent({
      initialState: {
        systemPrompt: getLeanSystemPrompt(this.role),
        model: this.model,
        tools: this.baseTools,
      },
      transformContext: mergedTransform,
      ...restAgentOptions,
    });
  }

  // ─── Perception Handling ─────────────────────────────────────────────

  private setupPerceptionHandlers(): void {
    this.client.onPerception((p: Perception) => {
      // Update game state
      this.gameState.handlePerception(p);

      // Update world map on room perceptions
      if (p.kind === "room") {
        this.updateWorldMap(p);
      }

      // Social awareness + perception buffering
      if (p.kind === "message" || p.kind === "broadcast" || p.kind === "movement") {
        const events = this.socialAwareness.handlePerception(p);

        if (this.autonomousMode) {
          const formatted = formatPerception(p, "plaintext");
          if (formatted) {
            const lastEvent = events[events.length - 1];
            const priority = lastEvent
              ? this.socialAwareness.scorePerception(lastEvent, this.characterName)
              : 15;

            this.pendingPerceptions.push({ text: `[${p.kind}] ${formatted}`, priority });

            // High-priority perceptions interrupt immediately
            if (priority >= 80) {
              const speaker = lastEvent?.speaker ?? "Someone";
              this.agent.steer({
                role: "user",
                content: `**${speaker}** is speaking to you:\n\n${formatted}\n\nIntegrate this into your current plan.`,
                timestamp: Date.now(),
              });
            }
          }
        }
      }
    });

    this.client.on("connect", () => {
      this.connected = true;
      this.onConnectionStatus?.({ phase: "connected", message: "WebSocket connected" });
    });

    this.client.on("disconnect", () => {
      this.connected = false;
      this.gameState.setConnectionStatus("disconnected");
      this.onConnectionStatus?.({ phase: "disconnected", message: "WebSocket disconnected" });
    });

    this.client.on("error", (error: Error) => {
      this.onConnectionStatus?.({ phase: "error", message: error.message });
    });
  }

  private updateWorldMap(p: Perception): void {
    try {
      const data = p.data as {
        id: string;
        short: string;
        long: string;
        exits: string[];
        entities: any[];
      };

      const roomId = data.id || `room-${Date.now()}`;
      let room = this.worldMap.getRoom(roomId);

      if (!room) {
        const exits = new Map<any, string>();
        if (data.exits) {
          for (const exit of data.exits) {
            exits.set(exit, `unknown-${exit}`);
          }
        }

        const currentRoom = this.worldMap.getCurrentRoom();
        const coords = currentRoom
          ? { x: currentRoom.x, y: currentRoom.y, z: currentRoom.z }
          : { x: 0, y: 0, z: 0 };

        room = this.worldMap.addRoom({
          id: roomId,
          title: data.short || roomId,
          description: data.long,
          exits,
          x: coords.x,
          y: coords.y,
          z: coords.z,
        });
      }

      this.worldMap.setCurrentRoom(room.id);
    } catch (e: any) {
      console.warn("[lean-agent] World map update failed:", e?.message ?? e);
    }
  }

  // ─── Connection ──────────────────────────────────────────────────────

  async connect(): Promise<SessionInfo> {
    this.onConnectionStatus?.({ phase: "connecting", message: `Connecting to ${this.wsUrl}...` });
    this.gameState.setConnectionStatus("connecting", this.wsUrl);

    let session: SessionInfo;
    if (this.token) {
      session = await this.client.reconnect(this.token);
    } else {
      session = await this.client.connect(this.characterName);
    }

    this.connected = true;
    this.gameState.setSession(session.entityId, session.name, session.token);
    this.characterName = session.name;
    this.token = session.token;

    this.onConnectionStatus?.({ phase: "authenticated", message: `Logged in as ${session.name}` });

    // Auto-discover skills (await so first prompt has all game tools)
    if (this.autoDiscoverSkills) {
      await this.discoverSkills().catch((e) =>
        console.warn("[lean-agent] Skill discovery failed:", e?.message ?? e),
      );
    }

    return session;
  }

  async disconnect(): Promise<void> {
    const loopPromise = this.autonomousLoopPromise;
    this.stopAutonomousCycle();
    if (loopPromise) {
      await loopPromise;
    }
    this.client.disconnect();
    this.connected = false;
  }

  // ─── Skill Discovery ─────────────────────────────────────────────────

  private async discoverSkills(): Promise<void> {
    if (!this.connected || this.skillsDiscovered) return;
    await discoverSkills({
      client: this.client,
      agent: this.agent,
      gameState: this.gameState,
      baseTools: this.baseTools,
      onProgress: this.onSkillDiscovery,
    });
    this.skillsDiscovered = true;
  }

  // ─── Prompting ───────────────────────────────────────────────────────

  async prompt(message: string): Promise<void>;
  async prompt(message: AgentMessage | AgentMessage[]): Promise<void>;
  async prompt(message: string | AgentMessage | AgentMessage[]): Promise<void> {
    if (typeof message === "string") {
      await this.agent.prompt(message);
    } else {
      await this.agent.prompt(message);
    }
  }

  async sendAttention(message: string): Promise<void> {
    this.agent.steer({
      role: "user",
      content: `ATTENTION:\n\n${message}\n\nIntegrate this into your current plan.`,
      timestamp: Date.now(),
    });
  }

  // ─── Autonomous Mode ─────────────────────────────────────────────────

  async runAutonomous(goal?: string): Promise<void> {
    this.autonomousMode = true;

    if (!this.connected) {
      await this.connect();
    }

    // Set initial focus
    if (goal) {
      this.focus = { description: goal, startedAt: Date.now() };
    }

    this.setupActionTracking();

    const discoveryPrompt = getLeanDiscoveryPrompt(this.role);
    const focusPart = this.focus
      ? `\nYour current focus: ${this.focus.description}`
      : "\nExplore the world, discover its systems, and find interesting things to do.";

    await this.prompt(`${discoveryPrompt}${focusPart}\n\nBegin.`);
    this.startAutonomousCycle();
  }

  private startAutonomousCycle(): void {
    this.autonomousLoopRunning = true;
    this.autonomousLoopPromise = this.runAutonomousLoop();
  }

  private async runAutonomousLoop(): Promise<void> {
    let consecutiveErrors = 0;

    while (this.autonomousLoopRunning && this.autonomousMode) {
      try {
        await this.sleep(this.loopCycleDelay);
        if (!this.autonomousLoopRunning || !this.autonomousMode) break;

        if (this.agent.state.isStreaming) {
          await this.sleep(1000);
          continue;
        }

        const continuationPrompt = await this.buildContinuationPrompt();
        await this.prompt(continuationPrompt);

        // Check for LLM error
        const messages = this.agent.state.messages;
        const lastMsg = messages[messages.length - 1];
        if (lastMsg && "stopReason" in lastMsg && (lastMsg as any).stopReason === "error") {
          consecutiveErrors++;
          const backoff = Math.min(30000, 5000 * 2 ** (consecutiveErrors - 1));
          console.error(
            `[lean-agent] LLM error (attempt ${consecutiveErrors}), backing off ${Math.round(backoff / 1000)}s`,
          );
          await this.sleep(backoff);
          continue;
        }

        consecutiveErrors = 0;
      } catch (error) {
        consecutiveErrors++;
        const backoff = Math.min(30000, 5000 * 2 ** (consecutiveErrors - 1));
        console.error(
          `[lean-agent] Error (attempt ${consecutiveErrors}), backing off ${Math.round(backoff / 1000)}s:`,
          error instanceof Error ? error.message : error,
        );
        await this.sleep(backoff);
      }
    }
  }

  // ─── Continuation Prompt ─────────────────────────────────────────────

  private async buildContinuationPrompt(): Promise<string> {
    this.loopIterationCount++;
    const parts: string[] = [];

    // 1. Flush buffered perceptions (sorted by priority, cap at 20)
    if (this.pendingPerceptions.length > 0) {
      const batch = this.pendingPerceptions.splice(0);
      batch.sort((a, b) => b.priority - a.priority);
      const events = batch.slice(0, this.perceptionBufferCap).map((p) => p.text);
      parts.push(`[World Events]\n${events.join("\n")}`);
    }

    // 2. Social context
    const socialCtx = this.socialAwareness.getSocialContext();
    if (socialCtx && socialCtx !== "No recent social activity") {
      parts.push(`[Nearby]\n${socialCtx}`);
    }

    // 3. Query Marina: novelty suggest (every 5th cycle)
    if (this.loopIterationCount % 5 === 0) {
      try {
        const suggestions = await this.platformMemory.getNoveltySuggestions();
        if (suggestions.length > 0) {
          parts.push(
            `[Novelty Suggestions]\n${suggestions
              .slice(0, 3)
              .map((s, i) => `${i + 1}. ${s}`)
              .join("\n")}`,
          );
        }
      } catch (e: any) {
        console.warn("[lean-agent] Novelty suggestions failed:", e?.message ?? e);
      }
    }

    // 4. Query Marina: recall + skill search for current focus
    if (this.focus) {
      try {
        const recallResult = await this.platformMemory.search(this.focus.description);
        if (recallResult.results && recallResult.results.length > 0) {
          const top = recallResult.results
            .slice(0, 5)
            .map((r) => `- [#${r.id} imp=${r.importance}] ${r.content}`);
          parts.push(`[Relevant Notes]\n${top.join("\n")}`);
        }
      } catch (e: any) {
        console.warn("[lean-agent] Focus recall failed:", e?.message ?? e);
      }

      try {
        const skillResult = await this.platformMemory.searchSkills(this.focus.description);
        if (skillResult.results && skillResult.results.length > 0) {
          const top = skillResult.results.slice(0, 3).map((r) => `- [skill #${r.id}] ${r.content}`);
          parts.push(`[Available Skills]\n${top.join("\n")}`);
        }
      } catch (e: any) {
        console.warn("[lean-agent] Skill search failed:", e?.message ?? e);
      }
    }

    // 5. Focus status
    if (this.focus) {
      const elapsed = Date.now() - this.focus.startedAt;
      const elapsedMin = Math.round(elapsed / 60000);

      // Auto-rotate after timeout
      if (elapsed > this.focusTimeoutMs) {
        this.focus = null;
        parts.push(
          "[Focus expired] Pick a new focus based on what you see around you, messages from others, or novelty suggestions.",
        );
      } else {
        parts.push(`[Current Focus] ${this.focus.description} (${elapsedMin}m)`);
      }
    } else {
      parts.push(
        "[No Focus] Decide what to do based on your surroundings, nearby people, or novelty suggestions.",
      );
    }

    // 6. Stuck detection
    const stuckResult = this.detectStuck();
    if (stuckResult) {
      parts.push(stuckResult);
    }

    // 7. Action directive from role
    parts.push(getRole(this.role).actionDirective);

    return parts.join("\n\n");
  }

  // ─── Stuck Detection ─────────────────────────────────────────────────

  private stuckCycles = 0;

  private detectStuck(): string | null {
    const threeMinAgo = Date.now() - 3 * 60 * 1000;
    const actions = this.actionHistory.getActions(threeMinAgo);
    const toolActions = actions.filter((a) => a.type === "tool_call");

    // Pattern 1: Last 5 tool calls are identical
    if (toolActions.length >= 5) {
      const last5 = toolActions.slice(-5);
      const first = `${last5[0]!.toolName}:${JSON.stringify(last5[0]!.args)}`;
      const allSame = last5.every((a) => `${a.toolName}:${JSON.stringify(a.args)}` === first);
      if (allSame) {
        this.stuckCycles++;
        return this.getStuckRecovery();
      }
    }

    // Pattern 2: No marina_ commands in recent actions (only think/memory)
    if (toolActions.length >= 6) {
      const last6 = toolActions.slice(-6);
      const hasWorldAction = last6.some(
        (a) => a.toolName?.startsWith("marina_") && a.toolName !== "marina_state",
      );
      if (!hasWorldAction) {
        this.stuckCycles++;
        return this.getStuckRecovery();
      }
    }

    // Pattern 3: Only "think" tool used in last several calls
    if (toolActions.length >= 4) {
      const last4 = toolActions.slice(-4);
      if (last4.every((a) => a.toolName === "think")) {
        this.stuckCycles++;
        return this.getStuckRecovery();
      }
    }

    // Not stuck — reset counter
    this.stuckCycles = 0;
    return null;
  }

  private getStuckRecovery(): string {
    if (this.stuckCycles >= 3) {
      // Persistent stuck — clear focus
      this.focus = null;
      this.stuckCycles = 0;
      return `[STUCK — RESETTING] You've been stuck for multiple cycles. Your focus has been cleared. Try something completely different: use \`novelty suggest\` for new ideas, \`look\` to reassess your surroundings, or pick a new direction.`;
    }

    return `[Stuck Detected] You appear to be repeating actions without progress. Try: \`novelty suggest\` for new ideas, \`recall\` for past strategies, or simply \`look\` to reassess.`;
  }

  // ─── Action Tracking ─────────────────────────────────────────────────

  private setupActionTracking(): void {
    const pendingCalls = new Map<string, { toolName: string; args: any }>();

    this.agent.subscribe((event) => {
      if (event.type === "tool_execution_start") {
        pendingCalls.set(event.toolCallId, { toolName: event.toolName, args: event.args });

        this.actionHistory.addAction({
          timestamp: Date.now(),
          type: "tool_call",
          toolName: event.toolName,
          args: event.args,
        });

        // Detect command loops at call time (we have args here)
        if (event.toolName === "marina_command" || event.toolName === "marina_move") {
          this.detectCommandLoop(event.args?.command || event.args?.direction || "");
        }
      }

      if (event.type === "tool_execution_end") {
        pendingCalls.delete(event.toolCallId);

        this.actionHistory.addAction({
          timestamp: Date.now(),
          type: "outcome",
          toolName: event.toolName,
          result: event.result,
          success: !event.isError,
          error: event.isError ? String(event.result) : undefined,
        });
      }
    });
  }

  private recentCommands: string[] = [];

  private detectCommandLoop(cmd: string): void {
    this.recentCommands.push(cmd);
    if (this.recentCommands.length > 20) {
      this.recentCommands = this.recentCommands.slice(-20);
    }

    if (this.recentCommands.length >= 4) {
      const last4 = this.recentCommands.slice(-4);
      if (last4.every((c) => c === last4[0])) {
        this.recentCommands = [];
        this.sendAttention(
          "LOOP DETECTED: Same command repeated 4 times. Stop and try a completely different approach.",
        ).catch((e) => console.warn("[lean-agent] Loop attention failed:", e?.message ?? e));
      }
    }

    if (this.recentCommands.length >= 6) {
      const last6 = this.recentCommands.slice(-6);
      if (
        last6[2] === last6[0] &&
        last6[3] === last6[1] &&
        last6[4] === last6[0] &&
        last6[5] === last6[1]
      ) {
        this.recentCommands = [];
        this.sendAttention(
          "LOOP DETECTED: 2-command alternating loop. Stop and try a completely different approach.",
        ).catch((e) => console.warn("[lean-agent] Loop attention failed:", e?.message ?? e));
      }
    }
  }

  // ─── Utilities ───────────────────────────────────────────────────────

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private stopAutonomousCycle(): void {
    this.autonomousLoopRunning = false;
    this.autonomousLoopPromise = null;
    this.pendingPerceptions = [];
    this.autonomousMode = false;
  }

  // ─── Public Accessors ────────────────────────────────────────────────

  getAgent(): Agent {
    return this.agent;
  }
  getGameState(): GameStateManager {
    return this.gameState;
  }
  getClient(): MarinaClient {
    return this.client;
  }
  getRole(): RoleId {
    return this.role;
  }
  getSocialAwareness(): SocialAwareness {
    return this.socialAwareness;
  }
  getCharacterName(): string {
    return this.characterName;
  }
  getToken(): string | undefined {
    return this.token;
  }
  isConnected(): boolean {
    return this.connected;
  }
  isAutonomous(): boolean {
    return this.autonomousMode;
  }
  getActionHistorySummary(minutes = 5): string {
    return this.actionHistory.getRecentSummary(minutes);
  }

  subscribe(handler: Parameters<Agent["subscribe"]>[0]): () => void {
    return this.agent.subscribe(handler);
  }

  async waitForIdle(): Promise<void> {
    await this.agent.waitForIdle();
  }

  abort(): void {
    this.agent.abort();
  }

  stopAutonomous(): void {
    this.stopAutonomousCycle();
  }

  getCurrentSystemPrompt(): string {
    return this.agent.state.systemPrompt;
  }

  getDefaultSystemPrompt(): string {
    return getLeanSystemPrompt(this.role);
  }

  setSystemPrompt(prompt: string | undefined): void {
    this.agent.state.systemPrompt = prompt || getLeanSystemPrompt(this.role);
  }

  /** No-op: lean agent has no GoalManager */
  getGoalManager(): null {
    return null;
  }

  /** No-op: lean agent has no team context injection */
  setTeamContext(_context: string): void {
    // Lean agent gets team context from platform recall, not injected state
  }

  setFocus(description: string): void {
    this.focus = { description, startedAt: Date.now() };
  }

  getFocus(): Focus | null {
    return this.focus;
  }
}
