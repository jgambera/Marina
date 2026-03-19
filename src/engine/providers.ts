/**
 * Thin wrapper around pi-ai for model resolution.
 * Agents pass a string like "anthropic/claude-sonnet-4-5" or "google/gemini-2.5-flash"
 * and get back a pi-ai Model object ready for use with pi-agent-core.
 */

let piAi: typeof import("@mariozechner/pi-ai") | null = null;

async function loadPiAi() {
  if (!piAi) {
    piAi = await import("@mariozechner/pi-ai");
  }
  return piAi;
}

/**
 * Resolve a model string (e.g. "anthropic/claude-sonnet-4-5") into a pi-ai Model.
 * Falls back to a simple passthrough if pi-ai is not available.
 */
export function resolveModel(modelString: string): string {
  // For now, return the string as-is. The MarinaLeanAgent constructor
  // accepts either a string or a Model object. When pi-ai is installed
  // and configured, this can be upgraded to return a proper Model.
  return modelString;
}

/**
 * List available providers based on configured API keys.
 */
export async function getConfiguredProviders(): Promise<string[]> {
  const providers: string[] = [];
  const envMap: Record<string, string> = {
    openai: "OPENAI_API_KEY",
    anthropic: "ANTHROPIC_API_KEY",
    google: "GOOGLE_API_KEY",
    openrouter: "OPENROUTER_API_KEY",
    groq: "GROQ_API_KEY",
    cerebras: "CEREBRAS_API_KEY",
    xai: "XAI_API_KEY",
    mistral: "MISTRAL_API_KEY",
    deepseek: "DEEPSEEK_API_KEY",
  };

  for (const [provider, envVar] of Object.entries(envMap)) {
    if (process.env[envVar]) {
      providers.push(provider);
    }
  }

  return providers;
}
