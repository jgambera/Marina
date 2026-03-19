/**
 * MCP client wrapper for Marina server.
 * Uses the Model Context Protocol SDK to connect to the Marina MCP endpoint.
 * Provides tool-based access to Marina commands as a secondary connection method.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp";
import type { SessionInfo } from "./types";

export interface MCPClientOptions {
  mcpUrl: string;
}

/**
 * MCP client for Marina — provides tool-based access to the game world.
 * Used as a secondary connection alongside the primary WebSocket client.
 */
export class MarinaMCPClient {
  private client: Client;
  private transport: StreamableHTTPClientTransport | null = null;
  private mcpUrl: string;
  private session: SessionInfo | null = null;
  private connected = false;

  constructor(options: MCPClientOptions) {
    this.mcpUrl = options.mcpUrl.replace(/\/$/, "");
    this.client = new Client({
      name: "marina-bot",
      version: "0.1.0",
    });
  }

  /** Connect to the MCP server. */
  async connect(): Promise<void> {
    const url = new URL(this.mcpUrl.includes("/mcp") ? this.mcpUrl : `${this.mcpUrl}/mcp`);
    this.transport = new StreamableHTTPClientTransport(url);
    await this.client.connect(this.transport);
    this.connected = true;
  }

  /** Login via MCP tool call. */
  async login(name: string): Promise<string> {
    const result = await this.callTool("login", { name });
    return result;
  }

  /** Reconnect via MCP tool call. */
  async auth(token: string): Promise<string> {
    const result = await this.callTool("auth", { token });
    return result;
  }

  /** Look at room or target. */
  async look(target?: string): Promise<string> {
    return this.callTool("look", target ? { target } : {});
  }

  /** Move in a direction. */
  async move(direction: string): Promise<string> {
    return this.callTool("move", { direction });
  }

  /** Say something. */
  async say(message: string): Promise<string> {
    return this.callTool("say", { message });
  }

  /** Send a private message. */
  async tell(target: string, message: string): Promise<string> {
    return this.callTool("tell", { target, message });
  }

  /** List online players. */
  async who(): Promise<string> {
    return this.callTool("who", {});
  }

  /** Get help. */
  async help(command?: string): Promise<string> {
    return this.callTool("help", command ? { command } : {});
  }

  /** Check inventory. */
  async inventory(): Promise<string> {
    return this.callTool("inventory", {});
  }

  /** Examine a target. */
  async examine(target: string): Promise<string> {
    return this.callTool("examine", { target });
  }

  /** Execute any command. */
  async command(input: string): Promise<string> {
    return this.callTool("command", { input });
  }

  /** Channel operations. */
  async channel(input: string): Promise<string> {
    return this.callTool("channel", { input });
  }

  /** Board operations. */
  async board(input: string): Promise<string> {
    return this.callTool("board", { input });
  }

  /** Group operations. */
  async group(input: string): Promise<string> {
    return this.callTool("group", { input });
  }

  /** Task operations. */
  async task(input: string): Promise<string> {
    return this.callTool("task", { input });
  }

  /** Macro operations. */
  async macro(input: string): Promise<string> {
    return this.callTool("macro", { input });
  }

  /** Build operations. */
  async build(input: string): Promise<string> {
    return this.callTool("build", { input });
  }

  /** Check if connected. */
  isConnected(): boolean {
    return this.connected;
  }

  /** Get session info. */
  getSession(): SessionInfo | null {
    return this.session;
  }

  /** Disconnect from MCP server. */
  async disconnect(): Promise<void> {
    this.connected = false;
    if (this.transport) {
      await this.transport.close();
      this.transport = null;
    }
    this.session = null;
  }

  /** Call an MCP tool and return its text result. */
  private async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    if (!this.connected) {
      throw new Error("MCP client not connected");
    }

    const result = await this.client.callTool({ name, arguments: args });
    const content = result.content as Array<{ type: string; text?: string }> | undefined;
    const textContent = content?.find((c) => c.type === "text");
    if (textContent && "text" in textContent) {
      return textContent.text as string;
    }
    return JSON.stringify(result.content);
  }
}
