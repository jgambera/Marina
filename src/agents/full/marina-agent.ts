/**
 * MarinaAgent - Main agent class that orchestrates Marina gameplay
 * Combines WebSocket client, game state, tools, and LLM agent
 */

import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Agent, type AgentMessage, type AgentOptions } from "@mariozechner/pi-agent-core";
import { completeSimple, type Model } from "@mariozechner/pi-ai";
import type { IMarinaAgent } from "../agent/agent-interface";
import { ActionHistory } from "../agent/action-history";
import { createContextManager } from "../agent/context-manager";
import { PlatformMemoryBackend } from "../agent/memory-platform";
import { resolveModel } from "../agent/model-registry";
import { getRole, getRoleSummary, type RoleId } from "../agent/roles";
import { type DiscoveryStatus, discoverSkills } from "../agent/skill-discovery";
import { SocialAwareness } from "../agent/social";
import { GameStateManager } from "../game/state";
import { WorldMap } from "../mapping/map-data";
import { MarinaClient, type MarinaClientOptions } from "../net/marina-client";
import { formatPerception } from "../net/formatter";
import { MarinaMCPClient } from "../net/mcp-client";
import type { Perception, SessionInfo } from "../net/types";
import { getRoomBuildingContext } from "../rooms/context";
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
import { estimateTokens } from "../utils/token-counter";
import {
  getAutonomousSystemPrompt,
  getDiscoveryPhasePrompt,
  getTeamContext,
} from "./autonomous-prompts";
import { CuriosityEngine } from "./curiosity";
import { GoalManager } from "./goals";
import { LearningSystem } from "./learning";
import { type AgentMemory, MemoryStorage } from "./memory";
import { createMemoryTool } from "./memory-tool";

export interface MarinaAgentOptions {
  /** Marina WebSocket URL (e.g. ws://localhost:3300/ws) */
  wsUrl: string;
  /** Marina MCP URL (optional, e.g. http://localhost:3300/mcp) */
  mcpUrl?: string;
  /** Character name to login with */
  name: string;
  /** LLM model to use (default: google/gemini-2.0-flash) */
  model?: string | Model<any>;
  /** Custom system prompt (optional) */
  systemPrompt?: string;
  /** Agent options to pass through */
  agentOptions?: Partial<AgentOptions>;
  /** Agent role (default: "general") */
  role?: RoleId;
  /** Auto-discover commands via help system (default: true) */
  autoDiscoverSkills?: boolean;
  /** Callback for skill discovery progress */
  onSkillDiscovery?: (status: DiscoveryStatus) => void;
  /** Callback for connection status updates */
  onConnectionStatus?: (status: { phase: string; message: string }) => void;
  /** Enable persistent memory system (default: true) */
  enableMemory?: boolean;
  /** Bot ID for memory storage (auto-generated if not provided) */
  botId?: string;
  /** Enable world mapping (default: true) */
  enableMapping?: boolean;
  /** Session token for reconnection */
  token?: string;
  /** Max time (ms) a goal stays active before rotating (default: 180000 = 3 min) */
  goalRotationTimeout?: number;
  /** Delay (ms) between autonomous loop cycles (default: 2000) */
  loopCycleDelay?: number;
  /** Interval (ms) between memory checkpoint saves (default: 300000 = 5 min) */
  checkpointInterval?: number;
  /** Max buffered perceptions per cycle (default: 20) */
  perceptionBufferCap?: number;
  /** WebSocket ping keepalive interval in ms (default: 30000) */
  pingInterval?: number;
}

export class MarinaAgent implements IMarinaAgent {
  private agent: Agent;
  private client: MarinaClient;
  private mcpClient: MarinaMCPClient | null = null;
  private gameState: GameStateManager;
  private goalManager: GoalManager;
  private learningSystem: LearningSystem;
  private socialAwareness: SocialAwareness;
  private recentCommands: Array<{ command: string; timestamp: number }> = [];
  private characterName: string;
  private role: RoleId;
  private connected = false;
  private autonomousMode = false;
  private checkpointInterval?: ReturnType<typeof setInterval>;
  private autoDiscoverSkills: boolean;
  private onSkillDiscovery?: (status: DiscoveryStatus) => void;
  private onConnectionStatus?: (status: { phase: string; message: string }) => void;
  private skillsDiscovered = false;
  private baseTools: any[] = [];
  private enableMemory: boolean;
  private botId: string;
  private memoryStorage: MemoryStorage;
  private platformMemory: PlatformMemoryBackend | null = null;
  private curiosityEngine: CuriosityEngine | null = null;
  private agentMemory: AgentMemory | null = null;
  private enableMapping: boolean;
  private worldMap: WorldMap;
  private teamContext: string = "";
  private actionHistory: ActionHistory;
  private model: Model<any>;
  private token?: string;
  private wsUrl: string;
  private mcpUrl?: string;
  private pendingPerceptions: Array<{ text: string; priority: number; shouldRespond?: boolean }> =
    [];
  private recentReflections: Array<{ insight: string; timestamp: number }> = [];
  private autonomousLoopRunning = false;
  private autonomousLoopPromise: Promise<void> | null = null;
  /** Set to true when buildContinuationPrompt starts a new goal, consumed by the loop for auto-decomposition. */
  private newGoalJustStarted = false;
  /** Dirty flag for lazy system prompt rebuild — avoids rebuilding every prompt() call. */
  private systemPromptDirty = true;

  /** Max time (ms) a goal stays active before rotating. */
  private readonly goalRotationTimeout: number;
  /** Delay (ms) between autonomous loop cycles. */
  private readonly loopCycleDelay: number;
  /** Interval (ms) between memory checkpoint saves. */
  private readonly checkpointSaveInterval: number;
  /** Max buffered perceptions per cycle. */
  private readonly perceptionBufferCap: number;

  constructor(options: MarinaAgentOptions) {
    this.wsUrl = options.wsUrl;
    this.mcpUrl = options.mcpUrl;
    this.characterName = options.name;
    this.role = options.role || "general";
    this.autoDiscoverSkills = options.autoDiscoverSkills ?? true;
    this.onSkillDiscovery = options.onSkillDiscovery;
    this.onConnectionStatus = options.onConnectionStatus;
    this.enableMemory = options.enableMemory ?? true;
    this.botId = options.botId || `bot-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    this.memoryStorage = new MemoryStorage();
    this.actionHistory = new ActionHistory();
    this.enableMapping = options.enableMapping ?? true;
    this.worldMap = new WorldMap();
    this.token = options.token;
    this.goalRotationTimeout = options.goalRotationTimeout ?? 3 * 60 * 1000;
    this.loopCycleDelay = options.loopCycleDelay ?? 2000;
    this.checkpointSaveInterval = options.checkpointInterval ?? 5 * 60 * 1000;
    this.perceptionBufferCap = options.perceptionBufferCap ?? 20;

    // Initialize components
    this.gameState = new GameStateManager();
    this.goalManager = new GoalManager();
    this.learningSystem = new LearningSystem();
    this.socialAwareness = new SocialAwareness();

    // Create WebSocket client
    this.client = new MarinaClient({
      wsUrl: options.wsUrl,
      autoReconnect: true,
      reconnectDelay: 3000,
      pingInterval: options.pingInterval ?? 30000,
    });

    // Create MCP client if URL provided
    if (options.mcpUrl) {
      this.mcpClient = new MarinaMCPClient({ mcpUrl: options.mcpUrl });
    }

    // Set up perception handlers
    this.setupPerceptionHandlers();

    // Create tools context
    const toolContext = {
      client: this.client,
      gameState: this.gameState,
    };

    // Parse model
    const modelStr = options.model || "google/gemini-2.0-flash";
    this.model = typeof modelStr === "string" ? resolveModel(modelStr) : modelStr;

    // Create tools
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
    ];

    if (this.enableMemory) {
      // Create platform memory backend for server-side note/recall integration
      this.platformMemory = new PlatformMemoryBackend(this.client, this.characterName);
      this.curiosityEngine = new CuriosityEngine(this.platformMemory, this.goalManager);
      this.baseTools.push(createMemoryTool(this.memoryStorage, this.platformMemory));
    }
    if (this.enableMapping) {
      this.baseTools.push(createMapTool(this.worldMap));
    }

    // Create context manager for automatic pruning/summarization
    const contextManagerTransform = createContextManager({
      getModel: () => this.model,
      getSystemPrompt: () => this.agent?.state.systemPrompt ?? "",
      onBeforeCompact: (_dropped, summary) => {
        this.archiveTranscript(summary);
      },
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

    // Merge with any caller-provided transformContext
    const callerTransform = options.agentOptions?.transformContext;
    const mergedTransform = callerTransform
      ? async (messages: AgentMessage[], signal?: AbortSignal) => {
          const pruned = await contextManagerTransform(messages);
          return callerTransform(pruned, signal);
        }
      : contextManagerTransform;

    const { transformContext: _discard, ...restAgentOptions } = options.agentOptions ?? {};

    this.agent = new Agent({
      initialState: {
        systemPrompt: options.systemPrompt || this.createSystemPrompt(),
        model: this.model,
        tools: this.baseTools,
      },
      transformContext: mergedTransform,
      ...restAgentOptions,
    });
  }

  /** Set up handlers for incoming perceptions. */
  private setupPerceptionHandlers(): void {
    this.client.onPerception((p: Perception) => {
      // Update game state
      this.gameState.handlePerception(p);

      // Update world map on room perceptions
      if (this.enableMapping && p.kind === "room") {
        this.updateWorldMap(p);
      }

      // Social awareness + perception buffering for message/broadcast/movement
      if (p.kind === "message" || p.kind === "broadcast" || p.kind === "movement") {
        const events = this.socialAwareness.handlePerception(p);

        // Buffer important perceptions to feed to the agent's LLM context.
        if (this.autonomousMode) {
          const formatted = formatPerception(p, "plaintext");
          if (formatted) {
            // Score using the last social event (most specific)
            const lastEvent = events[events.length - 1];
            const priority = lastEvent
              ? this.socialAwareness.scorePerception(lastEvent, this.characterName)
              : 15;

            // Check if agent should respond (for events below steer threshold)
            const respond =
              priority < 80 && lastEvent
                ? this.socialAwareness.shouldRespond(lastEvent, this.characterName)
                : false;

            this.pendingPerceptions.push({
              text: `[${p.kind}] ${formatted}`,
              priority,
              shouldRespond: respond,
            });

            // High-priority perceptions interrupt the agent immediately
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

    // Track error/surprise perceptions for curiosity engine
    this.client.onPerception((p: Perception) => {
      if (p.kind === "error" && this.curiosityEngine) {
        this.curiosityEngine.trackSurprise();
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

  /** Update world map with room perception data. */
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
    } catch (error) {
      // Mapping is not critical
    }
  }

  /** Connect to Marina and login. */
  async connect(): Promise<SessionInfo> {
    this.onConnectionStatus?.({ phase: "connecting", message: `Connecting to ${this.wsUrl}...` });
    this.gameState.setConnectionStatus("connecting", this.wsUrl, this.mcpUrl);

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

    this.onConnectionStatus?.({
      phase: "authenticated",
      message: `Logged in as ${session.name}`,
    });

    // Load persistent memory
    if (this.enableMemory) {
      try {
        this.agentMemory = await this.memoryStorage.loadMemory(this.botId, this.characterName);
      } catch (error) {
        // Memory is not critical
      }
    }

    // Load persisted subsystem state (learning, worldMap, actionHistory)
    await this.loadSubsystemState();

    // Refresh system prompt with all loaded data
    this.agent.setSystemPrompt(this.createSystemPrompt());

    // Connect MCP client if available
    if (this.mcpClient) {
      try {
        await this.mcpClient.connect();
      } catch (error) {
        // MCP is optional
      }
    }

    // Auto-discover skills (await so first prompt has all game tools)
    if (this.autoDiscoverSkills) {
      await this.discoverSkills().catch((e) =>
        console.warn("[agent] Skill discovery failed:", e?.message ?? e),
      );
    }

    return session;
  }

  /** Disconnect from Marina. */
  async disconnect(): Promise<void> {
    // Capture the loop promise before stopAutonomousCycle nulls it
    const loopPromise = this.autonomousLoopPromise;
    this.stopAutonomousCycle();

    // Wait for any in-flight autonomous loop iteration to finish
    if (loopPromise) {
      await loopPromise;
    }

    // Save checkpoint before disconnecting
    if (this.enableMemory && this.autonomousMode) {
      await this.saveCurrentCheckpoint().catch((e) =>
        console.warn("[agent] Checkpoint save on disconnect failed:", e?.message ?? e),
      );
    }

    this.client.disconnect();
    this.mcpClient?.disconnect();
    this.connected = false;
  }

  /** Check if connected. */
  isConnected(): boolean {
    return this.connected;
  }

  /** Get the character name. */
  getCharacterName(): string {
    return this.characterName;
  }

  /** Get session token. */
  getToken(): string | undefined {
    return this.token;
  }

  /** Create the default system prompt. */
  private createSystemPrompt(): string {
    const gameStateSummary = this.gameState.getContextSummary();
    const learningSummary = this.learningSystem.getLearningReport();
    const goalSummary = this.goalManager.getProgressSummary();
    const roleSummary = getRoleSummary(this.role);
    const socialContext = this.socialAwareness.getSocialContext();
    const memorySummary = this.enableMemory ? this.memoryStorage.getMemorySummary() : "";
    const checkpointSummary = this.enableMemory ? this.memoryStorage.getCheckpointSummary() : "";

    let actionHistorySummary = "";
    if (this.actionHistory.getActionCount() > 0) {
      actionHistorySummary = `\n## RECENT ACTIVITY\n\n${this.actionHistory.getRecentSummary(5)}\n`;
    }

    const basePrompt = getAutonomousSystemPrompt(
      gameStateSummary,
      learningSummary,
      goalSummary,
      roleSummary,
      socialContext,
      memorySummary,
      checkpointSummary,
      this.teamContext,
    );

    // Add building context if role triggers it
    const buildContext = getRole(this.role).triggersBuildContext
      ? `\n${getRoomBuildingContext()}\n`
      : "";

    const fullPrompt = basePrompt + buildContext + actionHistorySummary;

    // Budget enforcement: if system prompt exceeds 40% of context window, truncate memory
    const contextWindow = this.model.contextWindow;
    if (contextWindow && contextWindow > 0) {
      const promptTokens = estimateTokens(fullPrompt);
      const budget = contextWindow * 0.4;

      if (promptTokens > budget) {
        // Rebuild with truncated memory summary
        const truncatedMemory = memorySummary
          ? memorySummary.split("\n").slice(0, 20).join("\n") +
            "\n[...memory truncated to fit context budget]\n"
          : "";

        const slimPrompt = getAutonomousSystemPrompt(
          gameStateSummary,
          learningSummary,
          goalSummary,
          roleSummary,
          socialContext,
          truncatedMemory,
          checkpointSummary,
          this.teamContext,
        );

        return slimPrompt + buildContext + actionHistorySummary;
      }
    }

    return fullPrompt;
  }

  /** Discover available commands via help system. */
  async discoverSkills(): Promise<void> {
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

  /** Send a prompt to the agent. */
  async prompt(message: string): Promise<void>;
  async prompt(message: AgentMessage | AgentMessage[]): Promise<void>;
  async prompt(message: string | AgentMessage | AgentMessage[]): Promise<void> {
    // Only rebuild system prompt when something changed (goals, role, periodic)
    if (this.systemPromptDirty) {
      this.agent.setSystemPrompt(this.createSystemPrompt());
      this.systemPromptDirty = false;
    }
    if (typeof message === "string") {
      await this.agent.prompt(message);
    } else {
      await this.agent.prompt(message);
    }
  }

  /** Send an attention/interrupt message to the agent. */
  async sendAttention(message: string): Promise<void> {
    const attentionMessage: AgentMessage = {
      role: "user",
      content: `ATTENTION:\n\n${message}\n\nIntegrate this into your current plan.`,
      timestamp: Date.now(),
    };
    this.agent.steer(attentionMessage);
  }

  /** Run agent autonomously with an optional goal. */
  async runAutonomous(goal?: string): Promise<void> {
    this.autonomousMode = true;

    if (!this.connected) {
      await this.connect();
    }

    if (this.goalManager.getAllGoals().length === 0) {
      this.goalManager.generateInitialGoals();
    }

    this.setupLearningTracking();

    if (goal) {
      this.goalManager.addGoal({
        type: "research",
        description: goal,
        priority: 10,
      });
    }

    // Select the first goal immediately so progress is tracked from the start
    if (!this.goalManager.getCurrentGoal()) {
      this.goalManager.selectNextGoal();
    }

    const currentGoal = this.goalManager.getCurrentGoal();
    const initialPrompt = `${getDiscoveryPhasePrompt(this.role)}

Your current goal: ${currentGoal ? currentGoal.description : "Explore and investigate the world"}

Other pending goals:
${
  this.goalManager
    .getAllGoals()
    .filter((g) => g.status === "pending")
    .map((g) => `- ${g.description}`)
    .join("\n") || "(none)"
}
${goal ? `\nPRIMARY OBJECTIVE: ${goal}` : ""}

Begin pursuing your goals.`;

    await this.prompt(initialPrompt);
    this.startAutonomousCycle();
  }

  private startAutonomousCycle(): void {
    // Start the continuous autonomous loop (replaces old timer-based approach)
    this.autonomousLoopRunning = true;
    this.autonomousLoopPromise = this.runAutonomousLoop();

    // Memory checkpoints on a timer (saves every 5 minutes)
    if (this.enableMemory) {
      this.checkpointInterval = setInterval(async () => {
        if (this.autonomousMode) {
          this.saveCurrentCheckpoint().catch((e) =>
            console.warn("[agent] Periodic checkpoint save failed:", e?.message ?? e),
          );
        }
      }, this.checkpointSaveInterval);
    }
  }

  /**
   * Continuous autonomous loop — the core driver of agent behavior.
   *
   * After the initial prompt completes, this loop repeatedly:
   * 1. Waits a short delay (prevents tight loops / rate limiting)
   * 2. Builds a context-aware continuation prompt (perceptions, goal state)
   * 3. Sends it to the LLM and waits for it to finish all tool calls
   * 4. Repeats
   *
   * This replaces the old timer-based approach which relied on setInterval
   * timers that couldn't reliably keep the agent active.
   */
  private async runAutonomousLoop(): Promise<void> {
    let consecutiveErrors = 0;

    while (this.autonomousLoopRunning && this.autonomousMode) {
      try {
        // Breathing room between cycles
        await this.sleep(this.loopCycleDelay);
        if (!this.autonomousLoopRunning || !this.autonomousMode) break;

        // Skip if agent is mid-stream (shouldn't happen since we await, but guard anyway)
        if (this.agent.state.isStreaming) {
          await this.sleep(1000);
          continue;
        }

        // Build the continuation prompt based on current state
        const continuationPrompt = await this.buildContinuationPrompt();

        // Send prompt and wait for full completion (including all tool calls)
        await this.prompt(continuationPrompt);

        // Auto-decompose new goals if the LLM produced a think(plan)
        if (this.newGoalJustStarted) {
          this.newGoalJustStarted = false;
          const currentGoal = this.goalManager.getCurrentGoal();
          if (currentGoal) {
            this.tryDecomposeGoalFromMessages(currentGoal);
          }
        }

        // Check if the LLM returned an error (stopReason=error on the last message)
        const messages = this.agent.state.messages;
        const lastMsg = messages[messages.length - 1];
        if (lastMsg && "stopReason" in lastMsg && (lastMsg as any).stopReason === "error") {
          consecutiveErrors++;
          const backoff = Math.min(30000, 5000 * 2 ** (consecutiveErrors - 1));
          console.error(
            `[autonomous] LLM error (attempt ${consecutiveErrors}), backing off ${Math.round(backoff / 1000)}s`,
          );
          await this.sleep(backoff);
          continue;
        }

        // Reset error count on success
        consecutiveErrors = 0;
      } catch (error) {
        consecutiveErrors++;
        // Exponential backoff: 5s, 10s, 20s, 30s max
        const backoff = Math.min(30000, 5000 * 2 ** (consecutiveErrors - 1));
        console.error(
          `[autonomous] Error (attempt ${consecutiveErrors}), backing off ${Math.round(backoff / 1000)}s:`,
          error instanceof Error ? error.message : error,
        );
        await this.sleep(backoff);
      }
    }
  }

  /** Counter for loop iterations — used to trigger periodic behaviors. */
  private loopIterationCount = 0;

  /**
   * Build a concise continuation prompt based on the current state.
   * This is called each loop iteration to give the agent fresh context
   * about what happened and what to do next.
   */
  private async buildContinuationPrompt(): Promise<string> {
    this.loopIterationCount++;
    const parts: string[] = [];

    // Mark system prompt dirty every 10 cycles for periodic refresh
    if (this.loopIterationCount % 10 === 0) {
      this.systemPromptDirty = true;
    }

    // 1. Include any buffered world events (perceptions), sorted by priority
    if (this.pendingPerceptions.length > 0) {
      const batch = this.pendingPerceptions.splice(0);
      batch.sort((a, b) => b.priority - a.priority);
      const topEvents = batch.slice(0, this.perceptionBufferCap);
      parts.push(`[World Events]\n${topEvents.map((p) => p.text).join("\n")}`);

      // Surface events that warrant a response
      const responseEvents = topEvents.filter((p) => p.shouldRespond);
      if (responseEvents.length > 0) {
        parts.push(
          `[Messages Awaiting Your Response]\n${responseEvents.map((p) => p.text).join("\n")}\nRespond naturally — use marina_channel for channel messages, or marina_command with "say" or "tell" for in-room or private messages.`,
        );
      }
    }

    // 2. Social snapshot — who's around, who's talking
    const socialCtx = this.socialAwareness.getSocialContext();
    if (socialCtx) {
      parts.push(`[Nearby]\n${socialCtx}`);
    }

    // 3. Goal management — rotate goals that are stale or complete
    let newGoalStarted = false;
    const currentGoal = this.goalManager.getCurrentGoal();
    if (currentGoal) {
      const elapsed = Date.now() - (currentGoal.startedAt || Date.now());
      const shouldRotate = currentGoal.progress >= 80 || elapsed > this.goalRotationTimeout;

      if (shouldRotate) {
        const wasSuccessful = currentGoal.progress >= 50;
        this.goalManager.completeGoal(currentGoal.id, wasSuccessful);
        this.systemPromptDirty = true;

        // Background reflection (fire and forget)
        this.performReflection(
          `Goal "${currentGoal.description}" ${wasSuccessful ? "completed" : "timed out"} at ${currentGoal.progress}% progress.`,
        ).catch((e) => console.warn("[agent] Goal reflection failed:", e?.message ?? e));

        if (wasSuccessful && this.platformMemory) {
          this.platformMemory
            .reflect(currentGoal.description)
            .catch((e: any) =>
              console.warn("[agent] Platform skill reflection failed:", e?.message ?? e),
            );
        }

        const nextGoal = this.goalManager.selectNextGoal();
        if (nextGoal) {
          newGoalStarted = true;
          parts.push(
            `Goal "${currentGoal.description}" ${wasSuccessful ? "completed" : "timed out"}. New goal: ${nextGoal.description}`,
          );
        } else {
          this.generateAdaptiveGoals();
          const newGoal = this.goalManager.selectNextGoal();
          if (newGoal) {
            newGoalStarted = true;
            parts.push(`All previous goals finished. New goal: ${newGoal.description}`);
          }
        }
      } else {
        parts.push(`Current goal: ${currentGoal.description} (${currentGoal.progress}% progress)`);
      }
    } else {
      const nextGoal = this.goalManager.selectNextGoal();
      if (nextGoal) {
        newGoalStarted = true;
        this.systemPromptDirty = true;
        parts.push(`New goal: ${nextGoal.description}`);
      } else {
        this.generateAdaptiveGoals();
        const newGoal = this.goalManager.selectNextGoal();
        if (newGoal) {
          newGoalStarted = true;
          this.systemPromptDirty = true;
          parts.push(`New goal: ${newGoal.description}`);
        }
      }
    }

    // 4. Auto-retrieve relevant memories for the current goal (capped at 3)
    if (this.enableMemory) {
      const activeGoal = this.goalManager.getCurrentGoal();
      if (activeGoal) {
        const memoryLines: string[] = [];

        if (this.platformMemory) {
          try {
            const platformResult = await this.platformMemory.search(activeGoal.description);
            if (platformResult.results && platformResult.results.length > 0) {
              const top = platformResult.results
                .slice(0, 3)
                .map((r) => `- [#${r.id} imp=${r.importance}] ${r.content}`);
              memoryLines.push(...top);
            }
          } catch (e: any) {
            console.warn("[agent] Platform recall failed:", e?.message ?? e);
          }
        }

        // Local fallback if no platform results
        if (memoryLines.length === 0) {
          try {
            const relevant = this.memoryStorage.searchMemories(activeGoal.description, {
              includeShared: true,
            });
            if (relevant.length > 0) {
              const top = relevant.slice(0, 3).map((e) => `- [${e.category}] ${e.content}`);
              memoryLines.push(...top);
            }
          } catch (e: any) {
            console.warn("[agent] Local memory search failed:", e?.message ?? e);
          }
        }

        if (memoryLines.length > 0) {
          parts.push(`[Relevant Memories]\n${memoryLines.join("\n")}`);
        }
      }
    }

    // 5. Stuck detection
    const stuckResult = this.detectStuck();
    if (stuckResult) {
      parts.push(stuckResult);
    }

    // 6. Action directive — keep the agent moving (role-specific)
    parts.push(getRole(this.role).actionDirective);

    // Track whether a new goal started so the loop can attempt auto-decomposition
    this.newGoalJustStarted = newGoalStarted;

    return parts.join("\n\n");
  }

  /**
   * Scan recent assistant messages for a think(plan) tool call and auto-decompose the goal.
   */
  private tryDecomposeGoalFromMessages(goal: import("./goals").Goal): void {
    const messages = this.agent.state.messages;
    // Scan the last few messages for think tool calls with action "plan"
    const recentMessages = messages.slice(-6);
    for (const msg of recentMessages) {
      if (!msg || (msg as any).role !== "assistant") continue;
      const content = (msg as any).content;
      if (!Array.isArray(content)) continue;

      for (const block of content) {
        if (block.type !== "toolCall" || block.name !== "think") continue;
        const args = block.arguments;
        if (args?.action === "plan" && args?.thought) {
          this.tryDecomposeGoal(goal, args.thought);
          return;
        }
      }
    }
  }

  /**
   * Parse numbered steps from a plan text and create sub-goals.
   * Idempotent — skips if goal already has sub-goals.
   */
  private tryDecomposeGoal(goal: import("./goals").Goal, planText: string): void {
    // Skip if goal already has sub-goals
    if (goal.subGoalIds && goal.subGoalIds.length > 0) return;

    const stepPattern = /^\s*\d+[.)]\s*(.+)/gm;
    const steps: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = stepPattern.exec(planText)) !== null) {
      const step = match[1]!.trim();
      if (step.length > 5 && step.length < 200) {
        steps.push(step);
      }
    }

    // Only decompose if we get 2-4 reasonable steps
    if (steps.length < 2 || steps.length > 4) return;

    const subGoals = steps.map((step) => ({
      type: goal.type,
      description: step,
      priority: goal.priority,
    }));

    this.goalManager.addSubGoals(goal.id, subGoals);
    console.log(
      `[agent] Auto-decomposed goal "${goal.description}" into ${steps.length} sub-goals`,
    );
  }

  /** Archive compacted transcript to disk for later searchability. */
  private archiveTranscript(summary: string): void {
    const dir = join(homedir(), ".marina", this.characterName, "transcripts");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filePath = join(dir, `${timestamp}.txt`);

    fs.mkdir(dir, { recursive: true })
      .then(() =>
        fs.writeFile(filePath, `# Transcript Archive — ${new Date().toISOString()}\n\n${summary}`),
      )
      .catch((e) => console.warn("[agent] Transcript archive failed:", e?.message ?? e));
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private stopAutonomousCycle(): void {
    // Stop the autonomous loop
    this.autonomousLoopRunning = false;
    this.autonomousLoopPromise = null;

    if (this.checkpointInterval) {
      clearInterval(this.checkpointInterval);
      this.checkpointInterval = undefined;
    }
    this.pendingPerceptions = [];
    this.autonomousMode = false;
  }

  private generateAdaptiveGoals(): void {
    const mapStats = this.worldMap.getStats();
    const completedGoals = this.goalManager.getCompletedGoals();
    const completedTypes = new Set(completedGoals.slice(-10).map((g) => g.type));
    const bestCmds = this.learningSystem.getBestCommands("explore", 3);
    const memoryCount = this.memoryStorage.getCurrentMemory()?.entries.length ?? 0;

    // Prioritize exploration if few rooms are known
    if (mapStats.totalRooms < 5 || mapStats.unexploredExits > 0) {
      this.goalManager.addGoal({
        type: "explore",
        description:
          bestCmds.length > 0
            ? `Explore new areas — ${mapStats.unexploredExits} unexplored exits remain. Best commands: ${bestCmds.map((c) => c.command).join(", ")}`
            : `Discover and map new areas — only ${mapStats.totalRooms} rooms known`,
        priority: 9,
      });
    }

    // Prioritize organizing if lots of memories accumulated
    if (memoryCount > 10 && !completedTypes.has("organize")) {
      this.goalManager.addGoal({
        type: "organize",
        description: `Review and consolidate ${memoryCount} memory entries, tag and categorize`,
        priority: 8,
      });
    }

    // Research is always valuable
    this.goalManager.addGoal({
      type: "research",
      description: "Investigate recent environment changes and entity activities",
      priority: 7,
    });

    // Monitor if not recently done
    if (!completedTypes.has("monitor")) {
      this.goalManager.addGoal({
        type: "monitor",
        description: "Survey the environment — who's present, what's changed",
        priority: 6,
      });
    }

    // Communicate periodically
    if (!completedTypes.has("communicate")) {
      this.goalManager.addGoal({
        type: "communicate",
        description: "Engage with other agents via channels and boards",
        priority: 5,
      });
    }
  }

  private setupLearningTracking(): void {
    const toolExecutions = new Map<string, { toolName: string; args: any; startTime: number }>();

    this.agent.subscribe((event) => {
      if (event.type === "tool_execution_start") {
        toolExecutions.set(event.toolCallId, {
          toolName: event.toolName,
          args: event.args,
          startTime: Date.now(),
        });

        // Track for loop detection and curiosity engine
        if (event.toolName === "marina_command" || event.toolName === "marina_move") {
          const cmd = event.args.command || event.args.direction || "";
          this.trackCommand(cmd);
          // Feed action to curiosity engine for entropy tracking
          if (this.curiosityEngine) {
            const verb = cmd.split(/\s+/)[0] ?? cmd;
            this.curiosityEngine.trackAction(verb);
          }
        }

        this.actionHistory.addAction({
          timestamp: Date.now(),
          type: "tool_call",
          toolName: event.toolName,
          args: event.args,
        });
      }

      if (event.type === "tool_execution_end") {
        const info = toolExecutions.get(event.toolCallId);
        if (info) {
          if (event.toolName === "marina_command" && info.args.command) {
            let responseText = "";
            if (event.result && typeof event.result === "object" && "content" in event.result) {
              const content = (event.result as any).content;
              if (Array.isArray(content) && content[0]?.type === "text") {
                responseText = content[0].text;
              }
            }
            this.learningSystem.learnFromCommand(
              info.args.command,
              !event.isError,
              Date.now() - info.startTime,
              responseText,
            );
          }

          this.actionHistory.addAction({
            timestamp: Date.now(),
            type: "outcome",
            toolName: event.toolName,
            result: event.result,
            success: !event.isError,
            error: event.isError ? String(event.result) : undefined,
          });

          toolExecutions.delete(event.toolCallId);
        }

        // Update goal progress — prefer active sub-goal if one exists
        const currentGoal = this.goalManager.getCurrentGoal();
        if (currentGoal) {
          const targetGoal = this.getActiveSubGoal(currentGoal) ?? currentGoal;
          this.updateGoalProgress(targetGoal, event);
        }
      }

      if (event.type === "turn_end" && this.actionHistory.shouldSummarize()) {
        this.summarizeActionHistory().catch((e) =>
          console.warn("[agent] Action history summarization failed:", e?.message ?? e),
        );
      }
    });
  }

  /** Find the first active or pending sub-goal for a parent goal. */
  private getActiveSubGoal(parentGoal: import("./goals").Goal): import("./goals").Goal | null {
    if (!parentGoal.subGoalIds || parentGoal.subGoalIds.length === 0) return null;
    const allGoals = this.goalManager.getAllGoals();
    // Prefer active sub-goals, then pending ones
    const activeSub = allGoals.find(
      (g) => g.parentGoalId === parentGoal.id && g.status === "active",
    );
    if (activeSub) return activeSub;
    const pendingSub = allGoals.find(
      (g) => g.parentGoalId === parentGoal.id && g.status === "pending",
    );
    return pendingSub ?? null;
  }

  private updateGoalProgress(goal: any, event: any): void {
    const { toolName } = event;
    let increment = 0;

    switch (goal.type) {
      case "explore":
        if (toolName === "marina_move" || toolName === "marina_look") {
          increment = 5;
        }
        break;
      case "learn_commands":
        if (toolName === "marina_command") {
          increment = 10;
        }
        break;
      case "research":
        if (toolName === "marina_look" || toolName === "marina_command") {
          increment = 5;
        }
        if (toolName === "memory") {
          increment = 10;
        }
        break;
      case "organize":
        if (toolName === "memory") {
          increment = 10;
        }
        break;
      case "analyze":
        if (toolName === "think") {
          increment = 5;
        }
        if (toolName === "marina_look" || toolName === "marina_command") {
          increment = 5;
        }
        break;
      case "document":
        if (toolName === "memory") {
          increment = 15;
        }
        break;
      case "monitor":
        if (
          toolName === "marina_look" ||
          toolName === "marina_state" ||
          toolName === "marina_command"
        ) {
          increment = 5;
        }
        break;
    }

    if (increment > 0) {
      goal.progress = Math.min(100, goal.progress + increment);
      this.goalManager.updateProgress(goal.id, goal.progress);
    }
  }

  /** Detect if the agent is stuck (repeating actions, think-only loops, no world actions). */
  private detectStuck(): string | null {
    const threeMinAgo = Date.now() - 3 * 60 * 1000;
    const actions = this.actionHistory.getActions(threeMinAgo);
    const toolActions = actions.filter((a) => a.type === "tool_call");

    // Pattern 1: No marina_ commands in recent actions (only think/memory)
    if (toolActions.length >= 6) {
      const last6 = toolActions.slice(-6);
      const hasWorldAction = last6.some(
        (a) => a.toolName?.startsWith("marina_") && a.toolName !== "marina_state",
      );
      if (!hasWorldAction) {
        return `[Stuck Detected] You haven't taken any world actions recently. Stop thinking/recalling and DO something: move, look, say, build.`;
      }
    }

    // Pattern 2: Only "think" tool used in last several calls
    if (toolActions.length >= 4) {
      const last4 = toolActions.slice(-4);
      if (last4.every((a) => a.toolName === "think")) {
        return `[Stuck Detected] You've been thinking without acting. Execute a world action now.`;
      }
    }

    return null;
  }

  private trackCommand(command: string): void {
    this.recentCommands.push({ command, timestamp: Date.now() });
    if (this.recentCommands.length > 20) {
      this.recentCommands = this.recentCommands.slice(-20);
    }
    this.detectLoop();
  }

  private detectLoop(): void {
    if (this.recentCommands.length < 6) return;
    const last6 = this.recentCommands.slice(-6).map((c) => c.command);

    if (
      last6[2] === last6[0] &&
      last6[3] === last6[1] &&
      last6[4] === last6[0] &&
      last6[5] === last6[1]
    ) {
      this.breakLoop("2-command loop detected");
      return;
    }

    const last4 = this.recentCommands.slice(-4).map((c) => c.command);
    if (last4.every((cmd) => cmd === last4[0])) {
      this.breakLoop("Same command repeated 4 times");
    }
  }

  private async breakLoop(reason: string): Promise<void> {
    this.recentCommands = [];
    await this.sendAttention(
      `LOOP DETECTED: ${reason}\n\nStop the current pattern. Try a completely different approach.`,
    );
  }

  private async saveCurrentCheckpoint(): Promise<void> {
    if (!this.enableMemory) return;

    const goals = this.goalManager.getAllGoals();
    const currentGoal = goals.length > 0 ? goals[0].description : "Exploring the world";
    const room = this.gameState.getCurrentRoom();
    const location = room ? `${room.short} (${room.id})` : "Unknown";

    await this.memoryStorage.saveCheckpoint({
      lastIntent: "Researching and organizing knowledge in the Marina world",
      currentGoal,
      progress: this.goalManager.getProgressSummary(),
      location,
      recentActions: this.recentCommands.slice(-5).map((c) => c.command),
    });

    // Also persist subsystem state alongside the checkpoint
    await this.saveSubsystemState();
  }

  private async summarizeActionHistory(): Promise<void> {
    if (!this.enableMemory) return;
    const summary = this.actionHistory.createSummary();
    if (!summary) return;

    try {
      const duration = Math.round((summary.period.end - summary.period.start) / 1000 / 60);
      const content = `[Session summary] (${duration} min) ${summary.summary}`;
      await this.memoryStorage.addEntry("insight", content, "medium", [
        "action-history",
        "session-summary",
      ]);
    } catch (error) {
      // Not critical
    }
  }

  /** Generate a reflection insight after completing a goal. */
  private async performReflection(context: string): Promise<void> {
    try {
      const summary = this.actionHistory.createSummary();
      const completedGoals = this.goalManager.getCompletedGoals();
      const recentCompleted = completedGoals.slice(-3);

      const parts: string[] = [];
      if (summary) {
        parts.push(
          `Activity: ${summary.totalActions} actions (${summary.successfulActions} ok, ${summary.failedActions} failed).`,
        );
        const topTools = Object.entries(summary.toolUsage)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([t, c]) => `${t}(${c})`)
          .join(", ");
        if (topTools) parts.push(`Tools: ${topTools}.`);
      }
      if (recentCompleted.length > 0) {
        parts.push(`Completed goals: ${recentCompleted.map((g) => g.description).join("; ")}.`);
      }
      parts.push(`Context: ${context}`);

      const insight = parts.join(" ");

      this.recentReflections.push({ insight, timestamp: Date.now() });
      // Keep last 5 reflections
      if (this.recentReflections.length > 5) {
        this.recentReflections = this.recentReflections.slice(-5);
      }

      // Persist to memory
      if (this.enableMemory) {
        await this.memoryStorage
          .addEntry("insight", insight, "medium", ["reflection", "auto-generated"])
          .catch((e) => console.warn("[agent] Reflection memory save failed:", e?.message ?? e));
      }
    } catch (e: any) {
      console.warn("[agent] performReflection failed:", e?.message ?? e);
    }
  }

  /** Save subsystem state (learning, worldMap, actionHistory) to disk. */
  private async saveSubsystemState(): Promise<void> {
    try {
      const stateDir = join(homedir(), ".marina", "state");
      await fs.mkdir(stateDir, { recursive: true });

      const stateFile = join(stateDir, `${this.botId}.json`);
      const state = {
        timestamp: Date.now(),
        learningSystem: this.learningSystem.toJSON(),
        worldMap: this.worldMap.toJSON(),
        actionHistory: this.actionHistory.export(),
      };
      await fs.writeFile(stateFile, JSON.stringify(state), "utf-8");
    } catch (e: any) {
      console.warn("[agent] Subsystem state save failed:", e?.message ?? e);
    }
  }

  /** Load subsystem state from disk (learning, worldMap, actionHistory). */
  private async loadSubsystemState(): Promise<void> {
    try {
      const stateFile = join(homedir(), ".marina", "state", `${this.botId}.json`);
      const content = await fs.readFile(stateFile, "utf-8");
      const state = JSON.parse(content);

      if (state.learningSystem) {
        this.learningSystem = LearningSystem.fromJSON(state.learningSystem);
      }
      if (state.worldMap) {
        this.worldMap = WorldMap.fromJSON(state.worldMap);
      }
      if (state.actionHistory) {
        this.actionHistory.import(state.actionHistory);
      }
    } catch (e: any) {
      console.warn("[agent] Subsystem state load failed (starting fresh):", e?.message ?? e);
    }
  }

  // ─── Public Accessors ─────────────────────────────────────────────────

  getAgent(): Agent {
    return this.agent;
  }
  getGameState(): GameStateManager {
    return this.gameState;
  }
  getClient(): MarinaClient {
    return this.client;
  }
  getMCPClient(): MarinaMCPClient | null {
    return this.mcpClient;
  }
  getGoalManager(): GoalManager {
    return this.goalManager;
  }
  getLearningSystem(): LearningSystem {
    return this.learningSystem;
  }
  getRole(): RoleId {
    return this.role;
  }
  getSocialAwareness(): SocialAwareness {
    return this.socialAwareness;
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

  setTeamContext(teamContext: string): void {
    this.teamContext = teamContext;
    this.agent.setSystemPrompt(this.createSystemPrompt());
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

  getDefaultSystemPrompt(): string {
    return this.createSystemPrompt();
  }

  getCurrentSystemPrompt(): string {
    return this.agent.state.systemPrompt;
  }

  setSystemPrompt(prompt: string | undefined): void {
    this.agent.setSystemPrompt(prompt || this.createSystemPrompt());
  }
}
