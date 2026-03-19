/**
 * Claude Code Adapter — Launch Claude Code (Anthropic's CLI agent) as a subprocess.
 *
 * Connection: MCP — Claude Code has native --mcp-server support.
 * The bridge logs in to Marina via WebSocket, then Claude Code discovers
 * Marina commands as MCP tools via the server's MCP endpoint.
 */

import { registerAgentType, type AgentCreateOptions } from "../agent/agent-registry";
import { buildMcpServerUrl } from "../connectors/mcp-stdio-connector";
import { ExternalBridge } from "../external-bridge";
import { checkBinary } from "../util";

registerAgentType({
  type: "claude-code",
  displayName: "Claude Code",
  description: "Anthropic's CLI agent (78.7k stars) — native MCP, subprocess SDK",
  category: "external",

  detect: () => checkBinary("claude", "--version"),

  extraFields: [
    { key: "workspace", label: "Workspace", type: "string", placeholder: "/path/to/project" },
    {
      key: "model",
      label: "Claude Model",
      type: "string",
      placeholder: "claude-sonnet-4-5-20250514",
      default: "claude-sonnet-4-5-20250514",
    },
    {
      key: "allowedTools",
      label: "Allowed Tools",
      type: "string",
      placeholder: "mcp__marina (comma-separated)",
    },
  ],

  create(opts: AgentCreateOptions): ExternalBridge {
    const mcpUrl = buildMcpServerUrl(opts.wsUrl);
    const config = opts.agentConfig ?? {};
    const workspace = (config.workspace as string) || undefined;
    const claudeModel = (config.model as string) || "claude-sonnet-4-5-20250514";
    const allowedTools = (config.allowedTools as string) || undefined;

    const args = [
      "--print", // non-interactive mode
      "--mcp-server",
      `marina:${mcpUrl}`,
      "--model",
      claudeModel,
    ];

    if (allowedTools) {
      for (const tool of allowedTools.split(",").map((t) => t.trim())) {
        args.push("--allowedTools", tool);
      }
    }

    // The prompt tells Claude Code about Marina
    args.push(
      "--",
      `You are connected to Marina, a multi-agent simulation platform. ` +
        `Use the marina MCP tools to interact with the world: look around, move, talk to entities, ` +
        `create memories (note), recall memories (recall), and explore. ` +
        `Your character name is "${opts.name}". ` +
        `Goal: ${opts.systemPrompt || "Explore the world, interact with other entities, and achieve goals."}`,
    );

    const env: Record<string, string> = {};
    if (opts.apiKey) {
      env.ANTHROPIC_API_KEY = opts.apiKey;
    }

    return new ExternalBridge({
      wsUrl: opts.wsUrl,
      name: opts.name,
      connector: "mcp-stdio",
      onProcessOutput: opts.onProcessOutput,
      onActionLog: opts.onActionLog,
      onConnectionStatus: opts.onConnectionStatus,
      onSkillDiscovery: opts.onSkillDiscovery,
      process: {
        command: "claude",
        args,
        env,
        cwd: workspace,
        autoRestart: false,
      },
    });
  },
});
