import type { EntityId, Perception, RoomId } from "../types";

export type { Perception };

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SessionInfo {
  entityId: EntityId;
  token: string;
  name: string;
}

export interface RoomView {
  id: RoomId;
  short: string;
  long: string;
  items: Record<string, string>;
  exits: string[];
  entities: { id: EntityId; name: string; short: string }[];
}

export interface ClientOptions {
  autoReconnect?: boolean;
  reconnectDelay?: number;
}

type PerceptionHandler = (p: Perception) => void;

// ─── ArtilectClient ──────────────────────────────────────────────────────────

export class ArtilectClient {
  private ws: WebSocket | null = null;
  private url: string;
  private options: Required<ClientOptions>;
  private session: SessionInfo | null = null;
  private handlers: PerceptionHandler[] = [];
  private commandResolvers: Array<{
    resolve: (perceptions: Perception[]) => void;
    buffer: Perception[];
    timeout: ReturnType<typeof setTimeout>;
  }> = [];
  private connected = false;

  constructor(url: string, options?: ClientOptions) {
    this.url = url.replace(/\/$/, "");
    this.options = {
      autoReconnect: options?.autoReconnect ?? true,
      reconnectDelay: options?.reconnectDelay ?? 3000,
    };
  }

  /** Connect and login with a character name. */
  async connect(name: string): Promise<SessionInfo> {
    await this.ensureWebSocket();
    return new Promise((resolve, reject) => {
      const handler = (p: Perception) => {
        if (p.kind === "system" && p.data?.entityId) {
          this.removeInternalHandler(handler);
          this.session = {
            entityId: p.data.entityId as EntityId,
            token: (p.data.token as string) ?? "",
            name,
          };
          resolve(this.session);
        }
        if (p.kind === "error") {
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

  /** Send a command and collect resulting perceptions (with 500ms buffer). */
  async command(cmd: string): Promise<Perception[]> {
    if (!this.session) throw new Error("Not connected. Call connect() first.");
    this.send({ type: "command", command: cmd });

    return new Promise((resolve) => {
      const entry = {
        resolve,
        buffer: [] as Perception[],
        timeout: setTimeout(() => {
          const idx = this.commandResolvers.indexOf(entry);
          if (idx !== -1) this.commandResolvers.splice(idx, 1);
          resolve(entry.buffer);
        }, 500),
      };
      this.commandResolvers.push(entry);
    });
  }

  /** Subscribe to all incoming perceptions. */
  onPerception(handler: PerceptionHandler): void {
    this.handlers.push(handler);
  }

  /** Remove a perception handler. */
  offPerception(handler: PerceptionHandler): void {
    const idx = this.handlers.indexOf(handler);
    if (idx !== -1) this.handlers.splice(idx, 1);
  }

  /** Get current session info. */
  getSession(): SessionInfo | null {
    return this.session;
  }

  /** Disconnect from the server gracefully. */
  disconnect(): void {
    // Send quit command before closing to clean up server-side entity
    if (this.session && this.ws && this.connected) {
      this.send({ type: "command", command: "quit" });
    }
    this.connected = false;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.session = null;
  }

  // ─── Internal WebSocket Management ────────────────────────────────────

  private internalHandlers: PerceptionHandler[] = [];

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
      const wsUrl = `${this.url}/ws`;
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.connected = true;
        // Skip the welcome message
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const p = JSON.parse(event.data as string) as Perception;
          this.dispatchPerception(p);
        } catch {
          // Ignore non-JSON messages
        }
      };

      this.ws.onclose = () => {
        this.connected = false;
        if (this.options.autoReconnect && this.session) {
          setTimeout(() => {
            this.ensureWebSocket()
              .then(() => {
                if (this.session?.token) {
                  this.send({ type: "auth", token: this.session.token });
                }
              })
              .catch(() => {});
          }, this.options.reconnectDelay);
        }
      };

      this.ws.onerror = () => {
        reject(new Error("WebSocket connection failed"));
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

    // User handlers
    for (const h of this.handlers) {
      try {
        h(p);
      } catch {
        // Don't let user handler errors crash the client
      }
    }
  }

  private send(data: Record<string, unknown>): void {
    if (this.ws && this.connected) {
      this.ws.send(JSON.stringify(data));
    }
  }
}

// ─── ArtilectAgent (typed command helpers) ───────────────────────────────────

export class ArtilectAgent extends ArtilectClient {
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

  /** Send a message to a channel. */
  async channel(name: string, message: string): Promise<void> {
    await this.command(`channel send ${name} ${message}`);
  }

  /** Get list of online entities. */
  async who(): Promise<Perception[]> {
    return this.command("who");
  }

  /** Get help. */
  async help(command?: string): Promise<Perception[]> {
    return this.command(command ? `help ${command}` : "help");
  }

  /** Check inventory. */
  async inventory(): Promise<Perception[]> {
    return this.command("inventory");
  }

  /** Examine a target. */
  async examine(target: string): Promise<Perception[]> {
    return this.command(`examine ${target}`);
  }

  /** Board operations. */
  async board(sub: string, ...args: string[]): Promise<Perception[]> {
    return this.command(`board ${sub} ${args.join(" ")}`.trim());
  }

  /** Task operations. */
  async task(sub: string, ...args: string[]): Promise<Perception[]> {
    return this.command(`task ${sub} ${args.join(" ")}`.trim());
  }

  /** Group operations. */
  async group(sub: string, ...args: string[]): Promise<Perception[]> {
    return this.command(`group ${sub} ${args.join(" ")}`.trim());
  }

  /** Macro operations. */
  async macro(sub: string, ...args: string[]): Promise<Perception[]> {
    return this.command(`macro ${sub} ${args.join(" ")}`.trim());
  }

  /** Global search. */
  async search(query: string): Promise<Perception[]> {
    return this.command(`search ${query}`);
  }

  /** Save a note (tagged with current room). */
  async note(text: string): Promise<Perception[]> {
    return this.command(`note ${text}`);
  }

  /** List all personal notes. */
  async notes(): Promise<Perception[]> {
    return this.command("note list");
  }

  /** Experiment operations. */
  async experiment(sub: string, ...args: string[]): Promise<Perception[]> {
    return this.command(`experiment ${sub} ${args.join(" ")}`.trim());
  }

  /** Bookmark current room or manage bookmarks. */
  async bookmark(sub?: string, ...args: string[]): Promise<Perception[]> {
    if (!sub) return this.command("bookmark");
    return this.command(`bookmark ${sub} ${args.join(" ")}`.trim());
  }

  /** Export a board's posts. */
  async exportBoard(name: string, format?: string): Promise<Perception[]> {
    return this.command(`export ${name}${format ? ` ${format}` : ""}`);
  }

  /** Create a task bundle (parent container). */
  async taskBundle(title: string, description?: string): Promise<Perception[]> {
    const desc = description ? ` | ${description}` : "";
    return this.command(`task bundle ${title}${desc}`);
  }

  /** Assign a task to a bundle. */
  async taskAssign(taskId: number, bundleId: number): Promise<Perception[]> {
    return this.command(`task assign ${taskId} ${bundleId}`);
  }

  /** List children of a task bundle. */
  async taskChildren(bundleId: number): Promise<Perception[]> {
    return this.command(`task children ${bundleId}`);
  }

  /** Vote on a board post with optional numeric score (1-10). */
  async boardScore(postId: number, direction: string, score?: number): Promise<Perception[]> {
    const scorePart = score ? ` ${score}` : "";
    return this.command(`board vote ${postId} ${direction}${scorePart}`);
  }

  /** Get score breakdown for a board post. */
  async boardScores(postId: number): Promise<Perception[]> {
    return this.command(`board scores ${postId}`);
  }

  /** Core memory operations. */
  async memory(sub: string, ...args: string[]): Promise<Perception[]> {
    return this.command(`memory ${sub} ${args.join(" ")}`.trim());
  }

  /** Scored note retrieval. */
  async recall(query: string, mode?: "recent" | "important"): Promise<Perception[]> {
    const modifier = mode ? ` ${mode}` : "";
    return this.command(`recall ${query}${modifier}`);
  }

  /** Create a reflection from recent notes. */
  async reflect(topic?: string): Promise<Perception[]> {
    return this.command(topic ? `reflect ${topic}` : "reflect");
  }

  /** Note with importance and type. */
  async typedNote(text: string, importance?: number, type?: string): Promise<Perception[]> {
    const imp = importance ? ` importance ${importance}` : "";
    const t = type ? ` type ${type}` : "";
    return this.command(`note ${text}${imp}${t}`);
  }

  /** Link two notes. */
  async noteLink(id1: number, id2: number, rel: string): Promise<Perception[]> {
    return this.command(`note link ${id1} ${id2} ${rel}`);
  }

  /** Correct a note. */
  async noteCorrect(id: number, newText: string): Promise<Perception[]> {
    return this.command(`note correct ${id} ${newText}`);
  }

  /** Trace note graph. */
  async noteTrace(id: number): Promise<Perception[]> {
    return this.command(`note trace ${id}`);
  }

  /** Shared memory pool operations. */
  async pool(sub: string, ...args: string[]): Promise<Perception[]> {
    return this.command(`pool ${sub} ${args.join(" ")}`.trim());
  }

  // ─── Canvas & Assets ─────────────────────────────────────────────────────

  /** Upload an asset from a URL. Returns the asset upload response. */
  async uploadAsset(url: string): Promise<Perception[]> {
    return this.command(`canvas asset upload ${url}`);
  }

  /** List uploaded assets. */
  async listAssets(): Promise<Perception[]> {
    return this.command("canvas asset list");
  }

  /** Delete an asset by ID. */
  async deleteAsset(assetId: string): Promise<Perception[]> {
    return this.command(`canvas asset delete ${assetId}`);
  }

  /** Create a new canvas. */
  async createCanvas(name: string, description?: string): Promise<Perception[]> {
    const desc = description ? ` ${description}` : "";
    return this.command(`canvas create ${name}${desc}`);
  }

  /** List all canvases. */
  async listCanvases(): Promise<Perception[]> {
    return this.command("canvas list");
  }

  /** Publish an asset to a canvas as a typed node. */
  async publishToCanvas(type: string, assetId: string, canvas?: string): Promise<Perception[]> {
    const target = canvas ? ` ${canvas}` : "";
    return this.command(`canvas publish ${type} ${assetId}${target}`);
  }

  /** Get canvas info including nodes. */
  async canvasInfo(name: string): Promise<Perception[]> {
    return this.command(`canvas info ${name}`);
  }

  /** List nodes on a canvas. */
  async canvasNodes(name: string): Promise<Perception[]> {
    return this.command(`canvas nodes ${name}`);
  }

  /** Delete a canvas. */
  async deleteCanvas(name: string): Promise<Perception[]> {
    return this.command(`canvas delete ${name}`);
  }

  // ─── Shell ─────────────────────────────────────────────────────────────

  /** Run a shell command. */
  async run(cmd: string): Promise<Perception[]> {
    return this.command(`run ${cmd}`);
  }

  /** Run a shell command quietly (suppress output). */
  async runQuiet(cmd: string): Promise<Perception[]> {
    return this.command(`run quiet ${cmd}`);
  }

  /** Shell management operations. */
  async shell(sub: string, ...args: string[]): Promise<Perception[]> {
    return this.command(`shell ${sub} ${args.join(" ")}`.trim());
  }

  /** Execute multiple commands in sequence. */
  async batch(...commands: string[]): Promise<Perception[]> {
    return this.command(`batch ${commands.join(" ; ")}`);
  }

  /** Gracefully quit and disconnect. */
  async quit(): Promise<void> {
    await this.command("quit");
    this.disconnect();
  }
}
