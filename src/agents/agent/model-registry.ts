/**
 * Model Registry — Single source of truth for model discovery.
 *
 * Wraps pi-ai's built-in getProviders() / getModels() registry and exposes
 * a unified API for the web dashboard, TUI forms, and agent constructors.
 */

import type { Api, KnownProvider } from "@mariozechner/pi-ai";
import { getModel, getModels, getProviders, type Model } from "@mariozechner/pi-ai";
import { loadCustomEndpoints, type CustomEndpoint } from "../credentials/custom-endpoints";
import {
  createOpenRouterModel,
  fetchOpenRouterModels,
  parseModelString,
} from "./openrouter-models";

/** Providers we expose in the UI (subset of pi-ai's full list) */
const SUPPORTED_PROVIDERS: KnownProvider[] = [
  "anthropic",
  "google",
  "openai",
  "openrouter",
  "groq",
  "mistral",
  "xai",
  "cerebras",
];

/** Provider env-var names (matches api-keys.ts) */
const PROVIDER_ENV_KEYS: Record<string, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GEMINI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  groq: "GROQ_API_KEY",
  cerebras: "CEREBRAS_API_KEY",
  xai: "XAI_API_KEY",
  mistral: "MISTRAL_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
};

export interface ModelInfo {
  id: string; // Full "provider/model-id" string for use as config value
  name: string; // Human-friendly display name
  provider: string; // "anthropic", "openai", etc.
  inputCost: number; // $ per 1M tokens
  outputCost: number; // $ per 1M tokens
  contextWindow: number;
  maxTokens: number;
  reasoning: boolean;
}

function toModelInfo(m: Model<any>): ModelInfo {
  // pi-ai cost values are already $ per 1M tokens
  return {
    id: `${m.provider}/${m.id}`,
    name: m.name,
    provider: m.provider,
    inputCost: m.cost.input,
    outputCost: m.cost.output,
    contextWindow: m.contextWindow,
    maxTokens: m.maxTokens,
    reasoning: m.reasoning,
  };
}

/**
 * Get all models from supported providers, optionally filtered to only
 * providers the user has configured (i.e., has an API key set).
 */
export function getAvailableModels(configuredOnly?: string[]): ModelInfo[] {
  const providers = configuredOnly
    ? SUPPORTED_PROVIDERS.filter((p) => configuredOnly.includes(p))
    : SUPPORTED_PROVIDERS;

  const result: ModelInfo[] = [];

  for (const provider of providers) {
    try {
      const models = getModels(provider);
      for (const m of models) {
        result.push(toModelInfo(m));
      }
    } catch {
      // Provider not available in this pi-ai build — skip
    }
  }

  // Sort: by provider name, then cheapest first within each provider
  result.sort((a, b) => {
    if (a.provider !== b.provider) return a.provider.localeCompare(b.provider);
    return a.inputCost - b.inputCost;
  });

  return result;
}

/**
 * Get all models grouped by provider. Always returns ALL supported providers
 * (so the UI can show unconfigured providers as grayed out).
 *
 * For OpenRouter, fetches live model data from their API (cached 30 min).
 * Other providers use pi-ai's built-in registry.
 */
export async function getModelsByProvider(): Promise<Record<string, ModelInfo[]>> {
  const grouped: Record<string, ModelInfo[]> = {};

  for (const provider of SUPPORTED_PROVIDERS) {
    if (provider === "openrouter") {
      // Fetch live from OpenRouter API
      try {
        const orModels = await fetchOpenRouterModels();
        grouped[provider] = orModels.sort((a, b) => a.inputCost - b.inputCost);
      } catch {
        grouped[provider] = [];
      }
      continue;
    }
    try {
      const models = getModels(provider);
      grouped[provider] = models.map(toModelInfo).sort((a, b) => a.inputCost - b.inputCost);
    } catch {
      grouped[provider] = [];
    }
  }

  // Add custom endpoints as their own provider groups
  try {
    const customEndpoints = await loadCustomEndpoints();
    updateCustomEndpointCache(customEndpoints);
    for (const ep of customEndpoints) {
      const key = `custom:${ep.id}`;
      grouped[key] = ep.models.map((m) => ({
        id: `custom:${ep.id}/${m.id}`,
        name: m.name || m.id,
        provider: key,
        inputCost: 0,
        outputCost: 0,
        contextWindow: m.contextWindow || 128000,
        maxTokens: m.maxTokens || 16384,
        reasoning: false,
      }));
    }
  } catch {
    // custom endpoints unavailable — skip
  }

  return grouped;
}

/**
 * Resolve a model string (e.g. "anthropic/claude-sonnet-4-5") to a pi-ai Model.
 * Single function replacing duplicate parsing in both agent constructors.
 *
 * Also handles custom endpoints: "custom:<endpointId>/<modelId>"
 */
export function resolveModel(modelStr: string): Model<any> {
  // Custom endpoint: "custom:<id>/<modelId>"
  if (modelStr.startsWith("custom:")) {
    return resolveCustomModel(modelStr);
  }

  const [provider, modelId] = parseModelString(modelStr);

  if (provider === "openrouter") {
    // Try pi-ai registry first (has ~230 OpenRouter models)
    const m = getModel("openrouter" as any, modelId as any);
    if (m) return m;
    // Fall back to createOpenRouterModel for models not in registry
    return createOpenRouterModel(modelId);
  }

  const m = getModel(provider as any, modelId as any);
  if (m) return m;
  // Unknown model — fall back to gemini-2.0-flash (cheapest default)
  return getModel("google", "gemini-2.0-flash")!;
}

/** Cached custom endpoints for sync resolveModel (loaded async on first getModelsByProvider call) */
let cachedCustomEndpoints: CustomEndpoint[] = [];

/** Called by getModelsByProvider to keep the sync cache warm */
function updateCustomEndpointCache(endpoints: CustomEndpoint[]): void {
  cachedCustomEndpoints = endpoints;
}

function resolveCustomModel(modelStr: string): Model<any> {
  // Format: "custom:<endpointId>/<modelId>"
  const withoutPrefix = modelStr.slice("custom:".length); // "<endpointId>/<modelId>"
  const slashIdx = withoutPrefix.indexOf("/");
  if (slashIdx === -1) {
    return getModel("google", "gemini-2.0-flash")!;
  }
  const endpointId = withoutPrefix.substring(0, slashIdx);
  const modelId = withoutPrefix.substring(slashIdx + 1);

  const ep = cachedCustomEndpoints.find((e) => e.id === endpointId);
  if (!ep) {
    console.warn(`[model-registry] Custom endpoint ${endpointId} not found, falling back`);
    return getModel("google", "gemini-2.0-flash")!;
  }

  const modelDef = ep.models.find((m) => m.id === modelId);

  return {
    id: modelId,
    name: modelDef?.name || modelId,
    api: "openai-completions" as const,
    provider: `custom:${endpointId}`,
    baseUrl: ep.baseUrl.replace(/\/+$/, ""),
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: modelDef?.contextWindow ?? 128000,
    maxTokens: modelDef?.maxTokens ?? 16384,
  };
}

/** Display name for a provider ID */
export function getProviderDisplayName(provider: string): string {
  const names: Record<string, string> = {
    anthropic: "Anthropic",
    google: "Google",
    openai: "OpenAI",
    openrouter: "OpenRouter",
    groq: "Groq",
    mistral: "Mistral",
    xai: "xAI",
    cerebras: "Cerebras",
    deepseek: "DeepSeek",
  };
  return names[provider] || provider.charAt(0).toUpperCase() + provider.slice(1);
}

/** Get which providers have API keys set in the environment */
export function getConfiguredProviderNames(): string[] {
  const configured: string[] = [];
  for (const [provider, envVar] of Object.entries(PROVIDER_ENV_KEYS)) {
    if (process.env[envVar]) {
      configured.push(provider);
    }
  }
  // Also check ANTHROPIC_OAUTH_TOKEN
  if (process.env.ANTHROPIC_OAUTH_TOKEN && !configured.includes("anthropic")) {
    configured.push("anthropic");
  }
  return configured;
}

/**
 * Get a flat list of model IDs for TUI form cycling.
 * Only includes models from providers with configured API keys.
 */
export function getModelListForTUI(): { id: string; name: string; pricingHint: string }[] {
  const configured = getConfiguredProviderNames();
  if (configured.length === 0) {
    // No keys configured — show all so the user can at least see what's available
    return getAvailableModels().map((m) => ({
      id: m.id,
      name: m.name,
      pricingHint: formatPricingHint(m),
    }));
  }

  return getAvailableModels(configured).map((m) => ({
    id: m.id,
    name: m.name,
    pricingHint: formatPricingHint(m),
  }));
}

function formatPricingHint(m: ModelInfo): string {
  if (m.inputCost === 0 && m.outputCost === 0) return "free";
  if (m.inputCost < 0.2) return "ultra cheap";
  if (m.inputCost < 1) return "low cost";
  if (m.inputCost >= 5) return "premium";
  return "standard";
}
