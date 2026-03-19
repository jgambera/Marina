/**
 * External Agent Bridge — Implements IMarinaAgent for external agents.
 *
 * Owns the WebSocket connection to Marina, spawns a child process,
 * and connects them via the adapter's preferred protocol (MCP, WS text, or OpenAI).
 * Appears identical to native agents from the dashboard's perspective.
 */

import type { IMarinaAgent } from "../agent/agent-interface";
import { MarinaClient } from "../net/marina-client";
import { formatPerception } from "../net/formatter";
import type { Perception } from "../net/types";
import { ProcessManager, type ProcessConfig } from "./process-manager";

export type ConnectorType = "mcp-stdio" | "ws-text" | "openai" | "none";

export interface ExternalBridgeOptions {
  /** WebSocket URL to Marina server. */
  wsUrl: string;
  /** Character name in Marina. */
  name: string;
  /** Process config for the child agent. */
  process: ProcessConfig;
  /** How to connect the child to Marina. */
  connector: ConnectorType;
  /** Callbacks */
  onProcessOutput?: (data: string) => void;
  onActionLog?: (entry: {
    timestamp: number;
    source: string;
    action: string;
    detail?: string;
  }) => void;
  onConnectionStatus?: (status: { phase: string; message: string }) => void;
  onSkillDiscovery?: (status: {
    phase: string;
    message: string;
    commandsFound?: number;
    toolsCreated?: number;
  }) => void;
}

export class ExternalBridge implements IMarinaAgent {
  private client: MarinaClient;
  private proc: ProcessManager;
  private options: ExternalBridgeOptions;
  private subscribers: Array<(event: any) => void> = [];
  private connectorCleanup: (() => void) | null = null;
  private autonomous = false;
  private actionLog: Array<{ timestamp: number; source: string; action: string; detail?: string }> =
    [];

  constructor(options: ExternalBridgeOptions) {
    this.options = options;
    this.client = new MarinaClient({
      wsUrl: options.wsUrl,
      autoReconnect: true,
      pingInterval: 30000,
    });
    this.proc = new ProcessManager(options.process);

    // Forward process output to dashboard
    this.proc.on("stdout", (data) => {
      options.onProcessOutput?.(data);
      this.emit({ type: "process_output", stream: "stdout", data });
    });
    this.proc.on("stderr", (data) => {
      options.onProcessOutput?.(data);
      this.emit({ type: "process_output", stream: "stderr", data });
    });
    this.proc.on("error", (error) => {
      this.logAction("process", "error", error.message);
      this.emit({ type: "error", error });
    });
    this.proc.on("exit", (code, signal) => {
      this.logAction("process", "exit", `code=${code} signal=${signal}`);
      this.emit({ type: "process_exit", code, signal });
    });
    this.proc.on("restart", (attempt) => {
      this.logAction("process", "restart", `attempt ${attempt}`);
    });
  }

  async runAutonomous(goal?: string): Promise<void> {
    this.autonomous = true;
    this.options.onConnectionStatus?.({ phase: "connecting", message: "Connecting to Marina..." });

    // 1. Connect to Marina
    const session = await this.client.connect(this.options.name);
    this.options.onConnectionStatus?.({
      phase: "connected",
      message: `Connected as ${session.name}`,
    });

    this.logAction("bridge", "connected", `entity=${session.entityId}`);

    // Emit first turn marker so dashboard recognizes the bot as running
    this.emit({ type: "turn_end" });

    // Fake skill discovery for dashboard
    this.options.onSkillDiscovery?.({
      phase: "complete",
      message: "External agent — skills discovered by child process",
      commandsFound: 0,
      toolsCreated: 0,
    });

    // 2. Set up connector based on type
    await this.setupConnector();

    // 3. Forward Marina perceptions to subscribers (for dashboard)
    this.client.onPerception((p: Perception) => {
      const text = formatPerception(p, "ansi");
      if (text) {
        this.emit({ type: "mud_perception", perception: p, text });
      }
    });

    // 4. Log commands sent to Marina
    this.client.on("command_sent", (cmd: string) => {
      this.logAction("agent→marina", "command", cmd);
    });

    // 5. Start the child process
    this.proc.start();
    this.logAction(
      "bridge",
      "process_started",
      `${this.options.process.command} ${(this.options.process.args ?? []).join(" ")}`,
    );

    // 6. Wait for process to exit (or for stop)
    return new Promise<void>((resolve) => {
      const onExit = () => {
        this.autonomous = false;
        resolve();
      };
      this.proc.on("exit", onExit);
    });
  }

  stopAutonomous(): void {
    this.autonomous = false;
    this.proc.stop();
  }

  disconnect(): void {
    this.stopAutonomous();
    this.connectorCleanup?.();
    this.connectorCleanup = null;
    this.client.disconnect();
  }

  subscribe(handler: (event: any) => void): () => void {
    this.subscribers.push(handler);
    return () => {
      const idx = this.subscribers.indexOf(handler);
      if (idx >= 0) this.subscribers.splice(idx, 1);
    };
  }

  getClient(): MarinaClient {
    return this.client;
  }

  async sendAttention(message: string): Promise<void> {
    // For external agents, send as stdin message with a special prefix
    this.proc.write(`[ATTENTION] ${message}\n`);
    this.logAction("bridge", "attention", message);
  }

  setSystemPrompt(_prompt: string | undefined): void {
    // External agents manage their own prompts — log but don't enforce
    this.logAction("bridge", "system_prompt_ignored", "External agents manage their own prompts");
  }

  isAutonomous(): boolean {
    return this.autonomous;
  }

  isConnected(): boolean {
    return this.client.isConnected();
  }

  /** Get the action log for monitoring. */
  getActionLog(): Array<{ timestamp: number; source: string; action: string; detail?: string }> {
    return this.actionLog;
  }

  private emit(event: any): void {
    for (const handler of this.subscribers) {
      try {
        handler(event);
      } catch {
        // Don't let subscriber errors break the bridge
      }
    }
  }

  private logAction(source: string, action: string, detail?: string): void {
    const entry = { timestamp: Date.now(), source, action, detail };
    this.actionLog.push(entry);
    if (this.actionLog.length > 1000) {
      this.actionLog = this.actionLog.slice(-500);
    }
    this.options.onActionLog?.(entry);
  }

  private async setupConnector(): Promise<void> {
    switch (this.options.connector) {
      case "ws-text": {
        const { connectWsText } = await import("./connectors/ws-text-connector");
        this.connectorCleanup = connectWsText({
          client: this.client,
          process: this.proc,
          onCommand: (cmd) => this.logAction("agent→marina", "command", cmd),
        });
        break;
      }
      case "mcp-stdio":
        // For MCP, the child agent connects to Marina's MCP server directly.
        // The bridge just owns the WebSocket for login/perceptions.
        // No special wiring needed — the child discovers tools from the MCP server.
        break;
      case "openai":
        // OpenAI-compatible agents talk directly to Marina's /v1 endpoint.
        // The bridge just owns the WebSocket for login/perceptions.
        break;
      case "none":
        break;
    }
  }
}
