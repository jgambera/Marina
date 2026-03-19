/**
 * OpenAI-Compatible Connector — Configures the child agent's environment
 * to point at Marina's OpenAI-compatible endpoint.
 *
 * Best for: agents that expect to talk to an LLM endpoint (Aider, Continue.dev, Cursor).
 * Zero bridge needed — the agent talks directly to Marina's /v1/chat/completions.
 *
 * This connector just provides the right env vars. The agent thinks it's talking
 * to an OpenAI-compatible API, but it's actually talking to the Marina world.
 */

/**
 * Build env vars that point an OpenAI-compatible agent at Marina's endpoint.
 */
export function buildOpenAIEnv(wsUrl: string, apiKey?: string): Record<string, string> {
  // Convert ws://host:3300/ws → http://host:3300/v1
  try {
    const url = new URL(wsUrl);
    const host = url.hostname;
    const port = url.port || "3300";
    const baseUrl = `http://${host}:${port}/v1`;

    return {
      OPENAI_API_BASE: baseUrl,
      OPENAI_BASE_URL: baseUrl,
      OPENAI_API_KEY: apiKey || "marina",
    };
  } catch {
    return {
      OPENAI_API_BASE: "http://localhost:3300/v1",
      OPENAI_BASE_URL: "http://localhost:3300/v1",
      OPENAI_API_KEY: apiKey || "marina",
    };
  }
}
