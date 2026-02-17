import { Client, Events, GatewayIntentBits, type Message } from "discord.js";
import type { Connection, EntityId, Perception } from "../types";
import type { Adapter, AdapterContext } from "./adapter";
import { formatPerception } from "./formatter";

export class DiscordAdapter implements Adapter {
  readonly name = "discord";
  readonly protocol = "discord";
  private client: Client;
  private ctx: AdapterContext;
  private allowedChannels: Set<string>;
  private userConnections = new Map<string, string>(); // discordUserId -> connId
  private connIdCounter = 0;

  constructor(ctx: AdapterContext, token: string, channelIds?: string[]) {
    this.ctx = ctx;
    this.allowedChannels = new Set(channelIds ?? []);
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });
    this.setupHandlers(token);
  }

  private setupHandlers(token: string): void {
    const engine = this.ctx.engine;
    const rateLimiter = this.ctx.rateLimiter;
    const userConns = this.userConnections;
    const allowedChannels = this.allowedChannels;

    this.client.once(Events.ClientReady, (c) => {
      console.log(`Discord adapter ready as ${c.user.tag}`);
    });

    this.client.on(Events.MessageCreate, async (message: Message) => {
      try {
        // Ignore bot messages
        if (message.author.bot) return;

        // Check channel whitelist (empty = all channels)
        if (allowedChannels.size > 0 && !allowedChannels.has(message.channelId)) return;

        const discordUserId = message.author.id;
        const text = message.content.trim();
        if (!text) return;

        const existingConnId = userConns.get(discordUserId);

        if (!existingConnId) {
          // Not connected — treat first message as login name
          const connId = `discord_${++this.connIdCounter}`;

          const conn: Connection = {
            id: connId,
            protocol: "websocket" as const,
            entity: null,
            connectedAt: Date.now(),
            send(perception: Perception) {
              const formatted = formatPerception(perception, "markdown");
              if ("send" in message.channel) {
                (message.channel as { send: (s: string) => Promise<unknown> })
                  .send(formatted)
                  .catch(() => {});
              }
            },
            close() {
              userConns.delete(discordUserId);
            },
          };

          engine.addConnection(conn);
          userConns.set(discordUserId, connId);

          const result = engine.login(connId, text);
          if ("error" in result) {
            await message.reply(result.error).catch(() => {});
            engine.removeConnection(connId);
            userConns.delete(discordUserId);
            return;
          }

          this.linkUser(discordUserId, result.entityId);
          await message.reply(`Logged in as ${text}. Type commands to play!`).catch(() => {});
          return;
        }

        // Already connected — process command
        const entityId = engine.getConnectionEntity(existingConnId);
        if (!entityId) {
          userConns.delete(discordUserId);
          await message.reply("Session expired. Send your name to log in again.").catch(() => {});
          return;
        }

        // Rate limit
        if (rateLimiter && !rateLimiter.consume(entityId)) {
          await message.reply("Rate limited. Please slow down.").catch(() => {});
          return;
        }

        engine.processCommand(entityId, text);
      } catch (err) {
        console.error("[discord] Message handler error:", err);
      }
    });
  }

  private linkUser(_discordUserId: string, _entityId: EntityId): void {
    // Adapter linking is handled externally if needed
  }

  async start(): Promise<void> {
    const token = process.env.DISCORD_TOKEN;
    if (!token) {
      console.warn("Discord adapter: DISCORD_TOKEN not set, skipping.");
      return;
    }
    await this.client.login(token);
    console.log("Discord adapter started.");
  }

  async stop(): Promise<void> {
    for (const [, connId] of this.userConnections) {
      this.ctx.engine.removeConnection(connId);
    }
    this.userConnections.clear();
    this.client.destroy();
  }
}
