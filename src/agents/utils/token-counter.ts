// @ts-nocheck — imported from artilect-agent (non-strict tsconfig)
/**
 * Token Counter - Estimate tokens and costs for LLM usage
 */

export interface ModelPricing {
  inputPerMillion: number; // Cost per 1M input tokens
  outputPerMillion: number; // Cost per 1M output tokens
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost: number;
}

/**
 * Model pricing (as of 2024-2026)
 * Prices in USD per 1 million tokens
 * Source: Provider pricing pages, updated regularly
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  // Anthropic Claude
  "anthropic/claude-sonnet-4-5": {
    inputPerMillion: 3.0,
    outputPerMillion: 15.0,
  },
  "anthropic/claude-sonnet-4-0": {
    inputPerMillion: 3.0,
    outputPerMillion: 15.0,
  },
  "anthropic/claude-opus-4-6": {
    inputPerMillion: 5.0,
    outputPerMillion: 25.0,
  },
  "anthropic/claude-opus-4-5": {
    inputPerMillion: 5.0,
    outputPerMillion: 25.0,
  },
  "anthropic/claude-haiku-4-5": {
    inputPerMillion: 1.0,
    outputPerMillion: 5.0,
  },

  // OpenAI GPT
  "openai/gpt-4o": {
    inputPerMillion: 2.5,
    outputPerMillion: 10.0,
  },
  "openai/gpt-4o-mini": {
    inputPerMillion: 0.15,
    outputPerMillion: 0.6,
  },
  "openai/gpt-4.1": {
    inputPerMillion: 2.0,
    outputPerMillion: 8.0,
  },
  "openai/gpt-4.1-mini": {
    inputPerMillion: 0.4,
    outputPerMillion: 1.6,
  },
  "openai/gpt-4.1-nano": {
    inputPerMillion: 0.1,
    outputPerMillion: 0.4,
  },
  "openai/gpt-4-turbo": {
    inputPerMillion: 10.0,
    outputPerMillion: 30.0,
  },
  "openai/gpt-5": {
    inputPerMillion: 1.25,
    outputPerMillion: 10.0,
  },

  // Google Gemini
  "google/gemini-2.5-flash": {
    inputPerMillion: 0.3,
    outputPerMillion: 2.5,
  },
  "google/gemini-2.0-flash": {
    inputPerMillion: 0.1,
    outputPerMillion: 0.4,
  },
  "google/gemini-2.0-flash-lite": {
    inputPerMillion: 0.075,
    outputPerMillion: 0.3,
  },
  "google/gemini-1.5-pro": {
    inputPerMillion: 1.25,
    outputPerMillion: 5.0,
  },
  "google/gemini-1.5-flash": {
    inputPerMillion: 0.075,
    outputPerMillion: 0.3,
  },

  // Default fallback (Claude Sonnet pricing)
  default: {
    inputPerMillion: 3.0,
    outputPerMillion: 15.0,
  },
};

/**
 * Estimate token count from text
 * Uses a simple heuristic: ~4 characters per token for English
 * This is approximate but good enough for cost estimation
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;

  // Simple heuristic: 1 token ≈ 4 characters for English
  // Add some extra for JSON structure, special tokens, etc.
  const baseTokens = Math.ceil(text.length / 4);

  // Add overhead for structure (JSON, formatting, etc.)
  const overhead = Math.ceil(baseTokens * 0.1);

  return baseTokens + overhead;
}

/**
 * Get pricing for a model
 */
export function getModelPricing(model: string): ModelPricing {
  return MODEL_PRICING[model] || MODEL_PRICING.default;
}

/**
 * Calculate cost from token counts
 */
export function calculateCost(inputTokens: number, outputTokens: number, model: string): number {
  const pricing = getModelPricing(model);

  const inputCost = (inputTokens / 1_000_000) * pricing.inputPerMillion;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPerMillion;

  return inputCost + outputCost;
}

/**
 * Format cost as string with appropriate precision
 */
export function formatCost(cost: number): string {
  if (cost === 0) return "$0.00";
  if (cost < 0.001) return `$${(cost * 1000).toFixed(4)}¢`; // Show as cents if very small
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

/**
 * Format token count with thousands separator
 */
export function formatTokens(tokens: number): string {
  if (tokens < 1000) return tokens.toString();
  if (tokens < 1_000_000) return `${(tokens / 1000).toFixed(1)}K`;
  return `${(tokens / 1_000_000).toFixed(2)}M`;
}

/**
 * Calculate tokens per minute
 */
export function calculateTokensPerMinute(totalTokens: number, startTime: number): number {
  const elapsedMinutes = (Date.now() - startTime) / 1000 / 60;
  if (elapsedMinutes < 0.1) return 0; // Avoid division by very small numbers
  return Math.round(totalTokens / elapsedMinutes);
}

/**
 * Estimate cost per hour based on current rate
 */
export function estimateCostPerHour(totalCost: number, startTime: number): number {
  const elapsedHours = (Date.now() - startTime) / 1000 / 60 / 60;
  if (elapsedHours < 0.01) return 0; // Avoid division by very small numbers
  return totalCost / elapsedHours;
}
