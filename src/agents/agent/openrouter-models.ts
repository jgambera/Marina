/**
 * OpenRouter Model Resolution
 *
 * Fetches available models from the OpenRouter API at runtime and caches them.
 * Falls back to a small static catalog if the API is unreachable.
 * Uses the OpenAI-compatible completions API at https://openrouter.ai/api/v1.
 */

import type { Model } from "@mariozechner/pi-ai";
import type { ModelInfo } from "./model-registry";

/** Shape of a single model from the OpenRouter /api/v1/models endpoint */
interface OpenRouterAPIModel {
  id: string;
  name: string;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string };
  top_provider?: { max_completion_tokens?: number; is_moderated?: boolean };
  architecture?: { modality?: string; tokenizer?: string; instruct_type?: string };
}

/** Cached fetched models — null means not yet fetched */
let cachedModels: ModelInfo[] | null = null;
let fetchPromise: Promise<ModelInfo[]> | null = null;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
let cacheTimestamp = 0;

/**
 * Fetch and cache OpenRouter models from their API.
 * Returns ModelInfo[] suitable for the dashboard model picker.
 * Non-blocking — returns cached data immediately if available.
 */
export async function fetchOpenRouterModels(): Promise<ModelInfo[]> {
  // Return cache if fresh
  if (cachedModels && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return cachedModels;
  }

  // Deduplicate concurrent fetches
  if (fetchPromise) return fetchPromise;

  fetchPromise = doFetch();
  try {
    const result = await fetchPromise;
    return result;
  } finally {
    fetchPromise = null;
  }
}

async function doFetch(): Promise<ModelInfo[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch("https://openrouter.ai/api/v1/models", {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`OpenRouter API ${res.status}`);

    const json = (await res.json()) as { data: OpenRouterAPIModel[] };
    if (!Array.isArray(json.data)) throw new Error("Unexpected response shape");

    // Filter to chat models only, skip embedding/image-only models
    const models: ModelInfo[] = json.data
      .filter((m) => m.id && m.pricing)
      .map((m) => {
        const promptCost = Number.parseFloat(m.pricing?.prompt || "0") * 1_000_000;
        const completionCost = Number.parseFloat(m.pricing?.completion || "0") * 1_000_000;
        return {
          id: `openrouter/${m.id}`,
          name: m.name || m.id,
          provider: "openrouter",
          inputCost: Math.round(promptCost * 100) / 100,
          outputCost: Math.round(completionCost * 100) / 100,
          contextWindow: m.context_length || 128000,
          maxTokens: m.top_provider?.max_completion_tokens || 16384,
          reasoning: /\b(think|reason|r1)\b/i.test(m.name || m.id),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    cachedModels = models;
    cacheTimestamp = Date.now();
    return models;
  } catch (err) {
    console.error(
      "[openrouter] Failed to fetch models, using fallback catalog:",
      (err as Error).message,
    );
    // Return cached data if we have it (even if stale), otherwise fallback catalog
    if (cachedModels) return cachedModels;
    return getFallbackCatalog();
  }
}

/** Static fallback if API is unreachable */
function getFallbackCatalog(): ModelInfo[] {
  const entries: {
    id: string;
    name: string;
    input: number;
    output: number;
    context: number;
    maxTokens: number;
    reasoning?: boolean;
  }[] = [
    {
      id: "anthropic/claude-sonnet-4",
      name: "Claude Sonnet 4",
      input: 3,
      output: 15,
      context: 200000,
      maxTokens: 64000,
    },
    {
      id: "anthropic/claude-opus-4",
      name: "Claude Opus 4",
      input: 15,
      output: 75,
      context: 200000,
      maxTokens: 32000,
    },
    {
      id: "google/gemini-2.5-pro-preview",
      name: "Gemini 2.5 Pro",
      input: 1.25,
      output: 10,
      context: 1048576,
      maxTokens: 65536,
      reasoning: true,
    },
    {
      id: "google/gemini-2.5-flash-preview",
      name: "Gemini 2.5 Flash",
      input: 0.15,
      output: 0.6,
      context: 1048576,
      maxTokens: 65536,
      reasoning: true,
    },
    {
      id: "openai/gpt-4.1",
      name: "GPT-4.1",
      input: 2,
      output: 8,
      context: 1047576,
      maxTokens: 32768,
    },
    {
      id: "openai/o3",
      name: "o3",
      input: 2,
      output: 8,
      context: 200000,
      maxTokens: 100000,
      reasoning: true,
    },
    {
      id: "deepseek/deepseek-r1",
      name: "DeepSeek R1",
      input: 0.55,
      output: 2.19,
      context: 163840,
      maxTokens: 163840,
      reasoning: true,
    },
    {
      id: "meta-llama/llama-4-maverick",
      name: "Llama 4 Maverick",
      input: 0.25,
      output: 1,
      context: 1048576,
      maxTokens: 65536,
    },
    {
      id: "qwen/qwen3-235b-a22b",
      name: "Qwen3 235B",
      input: 0.2,
      output: 0.6,
      context: 40960,
      maxTokens: 40960,
    },
  ];

  return entries.map((e) => ({
    id: `openrouter/${e.id}`,
    name: e.name,
    provider: "openrouter",
    inputCost: e.input,
    outputCost: e.output,
    contextWindow: e.context,
    maxTokens: e.maxTokens,
    reasoning: e.reasoning ?? false,
  }));
}

/**
 * Build a Model object for any OpenRouter model ID.
 * Uses cached API data if available, otherwise sensible defaults.
 */
export function createOpenRouterModel(modelId: string): Model<"openai-completions"> {
  // Check cached API data first
  const cached = cachedModels?.find((m) => m.id === `openrouter/${modelId}`);

  return {
    id: modelId,
    name: cached?.name || modelId.split("/").pop() || modelId,
    api: "openai-completions" as const,
    provider: "openrouter",
    baseUrl: "https://openrouter.ai/api/v1",
    reasoning: cached?.reasoning ?? false,
    input: ["text", "image"],
    cost: {
      input: cached ? cached.inputCost / 1_000_000 : 0,
      output: cached ? cached.outputCost / 1_000_000 : 0,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: cached?.contextWindow ?? 128000,
    maxTokens: cached?.maxTokens ?? 16384,
  };
}

/**
 * Parse a model string into provider + modelId, handling OpenRouter's
 * three-segment format: "openrouter/anthropic/claude-sonnet-4"
 *
 * Returns [provider, modelId]:
 *   "google/gemini-2.0-flash"              → ["google", "gemini-2.0-flash"]
 *   "openrouter/anthropic/claude-sonnet-4"  → ["openrouter", "anthropic/claude-sonnet-4"]
 */
export function parseModelString(modelStr: string): [string, string] {
  const idx = modelStr.indexOf("/");
  if (idx === -1) return ["anthropic", modelStr];
  return [modelStr.substring(0, idx), modelStr.substring(idx + 1)];
}
