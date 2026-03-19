/**
 * IMarinaAgent — Common interface for all agent types.
 *
 * Extracted from the implicit contract used by IPCBridge and IPCCommandHandler.
 * Native agents (full, lean) and external bridges all implement this.
 */

import type { MarinaClient } from "../net/marina-client";

export interface IMarinaAgent {
  /** Start the autonomous loop. Resolves when the loop ends or the agent disconnects. */
  runAutonomous(goal?: string): Promise<void>;

  /** Stop the autonomous loop gracefully. */
  stopAutonomous(): void;

  /** Disconnect from the Marina server. */
  disconnect(): void | Promise<void>;

  /** Subscribe to agent events (tool_execution_start, message_start, message_update, etc.). Returns unsubscribe fn. */
  subscribe(handler: (event: any) => void): () => void;

  /** Get the underlying MarinaClient (WebSocket connection). */
  getClient(): MarinaClient;

  /** Send an attention/interrupt message to the agent. */
  sendAttention(message: string): Promise<void>;

  /** Override the system prompt. Pass undefined to reset to default. */
  setSystemPrompt(prompt: string | undefined): void;

  /** Whether the agent is currently running autonomously. */
  isAutonomous(): boolean;

  /** Whether the agent is connected to the server. */
  isConnected(): boolean;
}
