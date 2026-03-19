/**
 * WebSocket client for connecting to Marina servers.
 * Mirrors the MarinaClient from the Marina SDK but adapted for Node.js
 * and extended with event emitter patterns for integration with the bot agent.
 */

import type { MarinaClientEvents, EntityId, Perception, RoomView, SessionInfo } from "./types";

export interface MarinaClientOptions {
  wsUrl: string;
  autoReconnect?: boolean;
  reconnectDelay?: number;
  commandDrainTimeout?: number;
  /** Interval (ms) for WebSocket ping keepalive. 0 to disable. Default: 30000 */
  pingInterval?: number;
}

type PerceptionHandler = (p: Perception) => void;

/**
 * WebSocket client for Marina — handles connection, login, commands, and perception dispatch.
 */
export class MarinaClient {
  private ws: WebSocket | null = null;
  private wsUrl: string;
  private autoReconnect: boolean;
  private reconnectDelay: number;
  private commandDrainTimeout: number;
  private pingInterval: number;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private session: SessionInfo | null = null;
  private perceptionHandlers: PerceptionHandler[] = [];
  private internalHandlers: PerceptionHandler[] = [];
  private commandResolvers: Array<{
    resolve: (perceptions: Perception[]) => void;
    buffer: Perception[];
    timeout: ReturnType<typeof setTimeout>;
  }> = [];
  private connected = false;
  private listeners: { [K in keyof MarinaClientEvents]?: Array<MarinaClientEvents[K]> } = {};

  // Reconnection state
  private isReconnecting = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;

  constructor(options: MarinaClientOptions) {
    if (!options.wsUrl) {
      throw new Error("wsUrl is required. Provide a WebSocket URL (e.g. ws://localhost:3300/ws)");
    }
    this.wsUrl = options.wsUrl.replace(/\/$/, "");
    this.autoReconnect = options.autoReconnect ?? true;
    this.reconnectDelay = options.reconnectDelay ?? 3000;
    this.commandDrainTimeout = options.commandDrainTimeout ?? 500;
    this.pingInterval = options.pingInterval ?? 30000;
  }

  /** Connect and login with a character name. */
  async connect(name: string): Promise<SessionInfo> {
    await this.ensureWebSocket();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.removeInternalHandler(handler);
        reject(new Error("Login timed out after 30s"));
      }, 30000);

      const handler = (p: Perception) => {
        if (p.kind === "system" && p.data?.entityId) {
          clearTimeout(timeout);
          this.removeInternalHandler(handler);
          this.session = {
            entityId: p.data.entityId as EntityId,
            token: (p.data.token as string) ?? "",
            name,
          };
          this.emit("connect");
          resolve(this.session);
        }
        if (p.kind === "error") {
          clearTimeout(timeout);
          this.removeInternalHandler(handler);
          reject(new Error((p.data?.text as string) ?? "Login failed"));
        }
      };
      this.addInternalHandler(handler);
      this.send({ type: "login", name });
    });
  }

  /** Reconnect using a previously issued session token. */
  async reconnect(token: string): Promise<SessionInfo> {
    await this.ensureWebSocket();
    return new Promise((resolve, reject) => {
      const handler = (p: Perception) => {
        if (p.kind === "system" && p.data?.entityId) {
          this.removeInternalHandler(handler);
          this.session = {
            entityId: p.data.entityId as EntityId,
            token,
            name: (p.data?.text as string)?.match(/as (\w+)/)?.[1] ?? "",
          };
          this.emit("connect");
          resolve(this.session);
        }
        if (p.kind === "error") {
          this.removeInternalHandler(handler);
          reject(new Error((p.data?.text as string) ?? "Reconnection failed"));
        }
      };
      this.addInternalHandler(handler);
      this.send({ type: "auth", token });
    });
  }

  /** Send a command and collect resulting perceptions (with configurable drain timeout). */
  async command(cmd: string): Promise<Perception[]> {
    if (!this.session) throw new Error("Not connected. Call connect() first.");
    this.emit("command_sent", cmd);
    this.send({ type: "command", command: cmd });

    return new Promise((resolve) => {
      const entry = {
        resolve,
        buffer: [] as Perception[],
        timeout: setTimeout(() => {
          const idx = this.commandResolvers.indexOf(entry);
          if (idx !== -1) this.commandResolvers.splice(idx, 1);
          resolve(entry.buffer);
        }, this.commandDrainTimeout),
      };
      this.commandResolvers.push(entry);
    });
  }

  /** Subscribe to all incoming perceptions. */
  onPerception(handler: PerceptionHandler): void {
    this.perceptionHandlers.push(handler);
  }

  /** Remove a perception handler. */
  offPerception(handler: PerceptionHandler): void {
    const idx = this.perceptionHandlers.indexOf(handler);
    if (idx !== -1) this.perceptionHandlers.splice(idx, 1);
  }

  /** Get current session info. */
  getSession(): SessionInfo | null {
    return this.session;
  }

  /** Check if connected. */
  isConnected(): boolean {
    return this.connected;
  }

  /** Get the WebSocket URL. */
  getWsUrl(): string {
    return this.wsUrl;
  }

  /** Disconnect from the server. */
  disconnect(): void {
    this.autoReconnect = false;
    this.connected = false;
    this.stopPing();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.session = null;
    this.emit("disconnect");
  }

  // ─── Typed Command Helpers ─────────────────────────────────────────────

  /** Look at the current room or a specific target. */
  async look(target?: string): Promise<RoomView | Perception[]> {
    const cmd = target ? `look ${target}` : "look";
    const perceptions = await this.command(cmd);
    const roomP = perceptions.find((p) => p.kind === "room");
    if (roomP) {
      return roomP.data as unknown as RoomView;
    }
    return perceptions;
  }

  /** Move in a direction. */
  async move(direction: string): Promise<Perception[]> {
    return this.command(direction);
  }

  /** Say something to the room. */
  async say(message: string): Promise<void> {
    await this.command(`say ${message}`);
  }

  /** Send a private message. */
  async tell(target: string, message: string): Promise<void> {
    await this.command(`tell ${target} ${message}`);
  }

  /** Get list of online players. */
  async who(): Promise<Perception[]> {
    return this.command("who");
  }

  /** Get help. */
  async help(cmd?: string): Promise<Perception[]> {
    return this.command(cmd ? `help ${cmd}` : "help");
  }

  /** Check inventory. */
  async inventory(): Promise<Perception[]> {
    return this.command("inventory");
  }

  /** Examine a target. */
  async examine(target: string): Promise<Perception[]> {
    return this.command(`examine ${target}`);
  }

  // ─── Event Emitter ──────────────────────────────────────────────────────

  /** Register an event listener. */
  on<K extends keyof MarinaClientEvents>(event: K, handler: MarinaClientEvents[K]): void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    (this.listeners[event] as Array<MarinaClientEvents[K]>).push(handler);
  }

  /** Remove an event listener. */
  off<K extends keyof MarinaClientEvents>(event: K, handler?: MarinaClientEvents[K]): void {
    if (!handler) {
      delete this.listeners[event];
      return;
    }
    const handlers = this.listeners[event];
    if (handlers) {
      const idx = (handlers as Array<MarinaClientEvents[K]>).indexOf(handler);
      if (idx !== -1) {
        (handlers as Array<MarinaClientEvents[K]>).splice(idx, 1);
      }
      if (handlers.length === 0) {
        delete this.listeners[event];
      }
    }
  }

  private emit<K extends keyof MarinaClientEvents>(event: K, ...args: any[]): void {
    const handlers = this.listeners[event];
    if (handlers) {
      for (const handler of handlers) {
        (handler as any)(...args);
      }
    }
  }

  // ─── Ping Keepalive ──────────────────────────────────────────────────

  private startPing(): void {
    this.stopPing();
    if (this.pingInterval <= 0) return;
    this.pingTimer = setInterval(() => {
      if (this.ws && this.connected) {
        try {
          // Send a lightweight JSON ping message the server can ignore
          this.ws.send(JSON.stringify({ type: "ping" }));
        } catch {
          // Ignore send errors — onclose will handle reconnect
        }
      }
    }, this.pingInterval);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  // ─── Internal WebSocket Management ─────────────────────────────────────

  private addInternalHandler(h: PerceptionHandler): void {
    this.internalHandlers.push(h);
  }

  private removeInternalHandler(h: PerceptionHandler): void {
    const idx = this.internalHandlers.indexOf(h);
    if (idx !== -1) this.internalHandlers.splice(idx, 1);
  }

  private async ensureWebSocket(): Promise<void> {
    if (this.ws && this.connected) return;

    return new Promise((resolve, reject) => {
      // The wsUrl should already end with /ws or be the full WebSocket URL
      const url = this.wsUrl.includes("/ws") ? this.wsUrl : `${this.wsUrl}/ws`;
      this.ws = new WebSocket(url);

      // 15s timeout if onopen never fires
      const connectTimeout = setTimeout(() => {
        if (!this.connected && this.ws) {
          this.ws.close();
          reject(new Error(`WebSocket connection timed out after 15s to ${url}`));
        }
      }, 15000);

      this.ws.onopen = () => {
        clearTimeout(connectTimeout);
        this.connected = true;
        this.reconnectAttempts = 0;
        this.isReconnecting = false;
        this.startPing();
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const p = JSON.parse(
            typeof event.data === "string" ? event.data : event.data.toString(),
          ) as Perception;
          this.dispatchPerception(p);
        } catch {
          // Ignore non-JSON messages
        }
      };

      this.ws.onclose = () => {
        clearTimeout(connectTimeout);
        const wasConnected = this.connected;
        this.connected = false;
        this.stopPing();
        if (wasConnected) {
          this.emit("disconnect");
        }

        if (!this.autoReconnect || !this.session) return;

        // Guard against duplicate reconnection attempts
        if (this.isReconnecting) return;

        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          console.warn(`[ws] All ${this.maxReconnectAttempts} reconnection attempts exhausted`);
          this.emit("reconnect_failed");
          return;
        }

        this.isReconnecting = true;
        this.reconnectAttempts++;
        const backoff = Math.min(this.reconnectDelay * 2 ** (this.reconnectAttempts - 1), 30000);
        console.warn(
          `[ws] Reconnecting (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${Math.round(backoff / 1000)}s...`,
        );

        setTimeout(() => {
          this.isReconnecting = false;
          this.ensureWebSocket()
            .then(() => {
              if (this.session?.token) {
                this.send({ type: "auth", token: this.session.token });
              }
            })
            .catch((e) => {
              console.warn("[ws] Reconnection failed:", e?.message ?? e);
            });
        }, backoff);
      };

      this.ws.onerror = () => {
        clearTimeout(connectTimeout);
        const error = new Error(`WebSocket connection failed to ${url}`);
        this.emit("error", error);
        reject(error);
      };
    });
  }

  private dispatchPerception(p: Perception): void {
    // Internal handlers (for connect/reconnect flows)
    for (const h of [...this.internalHandlers]) {
      h(p);
    }

    // Command resolvers (buffer perceptions for command responses)
    for (const resolver of this.commandResolvers) {
      resolver.buffer.push(p);
    }

    // User perception handlers
    for (const h of this.perceptionHandlers) {
      try {
        h(p);
      } catch {
        // Don't let user handler errors crash the client
      }
    }

    // Event emitter — emit perception event
    this.emit("perception", p);
  }

  private send(data: Record<string, unknown>): void {
    if (this.ws && this.connected) {
      this.ws.send(JSON.stringify(data));
    }
  }
}
