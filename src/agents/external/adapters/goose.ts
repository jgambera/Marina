/**
 * Goose Adapter — Launch Goose (Block's AI agent) as a subprocess.
 *
 * Connection: MCP — Goose has MCP-first architecture.
 * Uses `goose run` with Marina MCP server configured via env/args.
 */

import { registerAgentType, type AgentCreateOptions } from "../agent/agent-registry";
import { buildMcpServerUrl } from "../connectors/mcp-stdio-connector";
import { ExternalBridge } from "../external-bridge";
import { checkBinary } from "../util";

registerAgentType({
  type: "goose",
  displayName: "Goose",
  description: "Block's MCP-first AI agent (33.1k stars) — any LLM, CLI-launchable",
  category: "external",

  detect: () => checkBinary("goose", "--version"),

  extraFields: [
    {
      key: "provider",
      label: "LLM Provider",
      type: "string",
      placeholder: "openrouter, anthropic, openai",
    },
    {
      key: "model",
      label: "Model",
      type: "string",
      placeholder: "anthropic/claude-sonnet-4-5-20250514",
    },
    { key: "workspace", label: "Workspace", type: "string", placeholder: "/path/to/project" },
  ],

  create(opts: AgentCreateOptions): ExternalBridge {
    const mcpUrl = buildMcpServerUrl(opts.wsUrl);
    const config = opts.agentConfig ?? {};
    const workspace = (config.workspace as string) || undefined;
    const provider = (config.provider as string) || undefined;
    const model = (config.model as string) || undefined;

    // Goose uses `goose run` for non-interactive execution
    const args = [
      "run",
      "--text",
      `You are connected to Marina, a multi-agent simulation platform. ` +
        `Use the available MCP tools to interact with the world. ` +
        `Your character name is "${opts.name}". ` +
        `Goal: ${opts.systemPrompt || "Explore the world, interact with other entities, and achieve goals."}`,
    ];

    const env: Record<string, string> = {
      // Goose reads MCP server config from env
      GOOSE_MCP__marina__URI: mcpUrl,
    };

    if (provider) env.GOOSE_PROVIDER = provider;
    if (model) env.GOOSE_MODEL = model;
    if (opts.apiKey) {
      env.ANTHROPIC_API_KEY = opts.apiKey;
      env.OPENAI_API_KEY = opts.apiKey;
      env.OPENROUTER_API_KEY = opts.apiKey;
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
        command: "goose",
        args,
        env,
        cwd: workspace,
        autoRestart: false,
      },
    });
  },
});
