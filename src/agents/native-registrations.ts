/**
 * Register native agent types (full, lean) with the agent registry.
 * Import this module once at startup to make them available.
 */

import { registerAgentType, type AgentCreateOptions } from "../core/agent/agent-registry";
import { MarinaAgent } from "./full/marina-agent";
import { MarinaLeanAgent } from "./lean/lean-agent";

registerAgentType({
  type: "full",
  displayName: "Full Agent",
  description: "Full-featured Marina agent with goals, curiosity, learning, and memory",
  category: "native",
  detect: async () => ({ installed: true }),
  create(opts: AgentCreateOptions) {
    return new MarinaAgent({
      wsUrl: opts.wsUrl,
      mcpUrl: opts.mcpUrl,
      name: opts.name,
      model: opts.model,
      role: (opts.role as any) || "general",
      systemPrompt: opts.systemPrompt,
      token: opts.token,
      autoDiscoverSkills: true,
      agentOptions: opts.apiKey ? { getApiKey: () => opts.apiKey! } : undefined,
      onSkillDiscovery: opts.onSkillDiscovery,
      onConnectionStatus: opts.onConnectionStatus,
    });
  },
});

registerAgentType({
  type: "lean",
  displayName: "Lean Agent",
  description: "Lightweight agent that delegates memory and skills to the Marina platform",
  category: "native",
  detect: async () => ({ installed: true }),
  create(opts: AgentCreateOptions) {
    return new MarinaLeanAgent({
      wsUrl: opts.wsUrl,
      name: opts.name,
      model: opts.model,
      role: (opts.role as any) || "general",
      token: opts.token,
      autoDiscoverSkills: true,
      agentOptions: opts.apiKey ? { getApiKey: () => opts.apiKey! } : undefined,
      onSkillDiscovery: opts.onSkillDiscovery,
      onConnectionStatus: opts.onConnectionStatus,
    });
  },
});
