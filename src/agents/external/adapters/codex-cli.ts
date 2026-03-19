/**
 * Codex CLI Adapter — Launch OpenAI's Codex CLI agent as a subprocess.
 *
 * Connection: MCP — Codex CLI supports MCP via shell-tool-mcp or direct config.
 * Massive OpenAI user base (65.7k stars).
 */

import { registerAgentType, type AgentCreateOptions } from "../agent/agent-registry";
import { buildMcpServerUrl } from "../connectors/mcp-stdio-connector";
import { ExternalBridge } from "../external-bridge";
import { checkBinary } from "../util";

registerAgentType({
  type: "codex-cli",
  displayName: "Codex CLI",
  description: "OpenAI's CLI agent (65.7k stars) — massive user base, MCP support",
  category: "external",

  detect: () => checkBinary("codex", "--version"),

  extraFields: [
    { key: "model", label: "Model", type: "string", placeholder: "o4-mini" },
    { key: "workspace", label: "Workspace", type: "string", placeholder: "/path/to/project" },
    { key: "provider", label: "Provider", type: "string", placeholder: "openai, openrouter" },
  ],

  create(opts: AgentCreateOptions): ExternalBridge {
    const mcpUrl = buildMcpServerUrl(opts.wsUrl);
    const config = opts.agentConfig ?? {};
    const workspace = (config.workspace as string) || undefined;
    const model = (config.model as string) || "o4-mini";
    const provider = (config.provider as string) || undefined;

    const args = [
      "--quiet",
      "--model",
      model,
      // Codex CLI takes the prompt as positional arg
      `You are connected to Marina, a multi-agent simulation platform. ` +
        `Use the available tools to interact with the world. ` +
        `Your character name is "${opts.name}". ` +
        `Goal: ${opts.systemPrompt || "Explore the world, interact with other entities, and achieve goals."}`,
    ];

    const env: Record<string, string> = {};
    if (opts.apiKey) {
      env.OPENAI_API_KEY = opts.apiKey;
    }
    if (provider === "openrouter") {
      env.OPENAI_BASE_URL = "https://openrouter.ai/api/v1";
      if (opts.apiKey) env.OPENROUTER_API_KEY = opts.apiKey;
    }

    // Codex CLI reads MCP config from config file — we set env var to point at Marina
    env.CODEX_MCP_MARINA_URL = mcpUrl;

    return new ExternalBridge({
      wsUrl: opts.wsUrl,
      name: opts.name,
      connector: "mcp-stdio",
      onProcessOutput: opts.onProcessOutput,
      onActionLog: opts.onActionLog,
      onConnectionStatus: opts.onConnectionStatus,
      onSkillDiscovery: opts.onSkillDiscovery,
      process: {
        command: "codex",
        args,
        env,
        cwd: workspace,
        autoRestart: false,
      },
    });
  },
});
