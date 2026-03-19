import type { Connection, EntityId, Perception } from "../types";
import type { Adapter, AdapterContext } from "./adapter";
import { formatPerception } from "./formatter";

/** Message from signal-cli-rest-api GET /v1/receive/{number} */
interface SignalEnvelope {
  envelope?: {
    source?: string;
    sourceNumber?: string;
    dataMessage?: {
      message?: string;
      timestamp?: number;
    };
  };
}

export class SignalAdapter implements Adapter {
  readonly name = "signal";
  readonly protocol = "signal";
  private ctx: AdapterContext;
  private apiUrl: string;
  private phoneNumber: string;
  private phoneConnections = new Map<string, string>(); // sourceNumber -> connId
  private connIdCounter = 0;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(ctx: AdapterContext, apiUrl: string, phoneNumber: string) {
    this.ctx = ctx;
    this.apiUrl = apiUrl.replace(/\/$/, ""); // strip trailing slash
    this.phoneNumber = phoneNumber;
  }

  async start(): Promise<void> {
    this.running = true;
    // Verify connectivity with a quick check
    try {
      const res = await fetch(`${this.apiUrl}/v1/about`);
      if (!res.ok) throw new Error(`Signal API returned ${res.status}`);
    } catch (err) {
      this.running = false;
      throw new Error(
        `Cannot reach signal-cli-rest-api at ${this.apiUrl}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    this.pollTimer = setInterval(() => this.poll(), 2000);
    console.log(`Signal adapter started (polling ${this.apiUrl} for ${this.phoneNumber}).`);
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    for (const [, connId] of this.phoneConnections) {
      this.ctx.engine.removeConnection(connId);
    }
    this.phoneConnections.clear();
  }

  private async poll(): Promise<void> {
    if (!this.running) return;

    try {
      const res = await fetch(`${this.apiUrl}/v1/receive/${encodeURIComponent(this.phoneNumber)}`);
      if (!res.ok) return;

      const envelopes: SignalEnvelope[] = await res.json();
      for (const env of envelopes) {
        const source = env.envelope?.sourceNumber ?? env.envelope?.source;
        const text = env.envelope?.dataMessage?.message;
        if (!source || !text) continue;
        this.handleMessage(source, text);
      }
    } catch {
      // Silently ignore poll errors — will retry on next interval
    }
  }

  private handleMessage(source: string, text: string): void {
    const engine = this.ctx.engine;
    const rateLimiter = this.ctx.rateLimiter;

    try {
      const existingConnId = this.phoneConnections.get(source);

      if (!existingConnId) {
        // Not connected — treat as login
        const connId = `signal_${++this.connIdCounter}`;
        const phoneConns = this.phoneConnections;

        const conn: Connection = {
          id: connId,
          protocol: "websocket" as const,
          entity: null,
          connectedAt: Date.now(),
          send: (perception: Perception) => {
            const formatted = formatPerception(perception, "plaintext");
            this.sendMessage(source, formatted);
          },
          close() {
            phoneConns.delete(source);
          },
        };

        engine.addConnection(conn);
        phoneConns.set(source, connId);

        const result = engine.login(connId, text.trim());
        if ("error" in result) {
          this.sendMessage(source, result.error);
          engine.removeConnection(connId);
          phoneConns.delete(source);
          return;
        }

        this.sendMessage(source, `Logged in as ${text.trim()}. Type commands to play!`);
        return;
      }

      // Already connected — process command
      const entityId = engine.getConnectionEntity(existingConnId);
      if (!entityId) {
        this.phoneConnections.delete(source);
        this.sendMessage(source, "Session expired. Send your name to log in again.");
        return;
      }

      if (rateLimiter && !rateLimiter.consume(entityId)) {
        this.sendMessage(source, "Rate limited. Please slow down.");
        return;
      }

      engine.processCommand(entityId, text);
    } catch (err) {
      console.error("[signal] Message handler error:", err);
    }
  }

  private sendMessage(recipient: string, message: string): void {
    fetch(`${this.apiUrl}/v2/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        number: this.phoneNumber,
        recipients: [recipient],
        message,
      }),
    }).catch(() => {});
  }
}
