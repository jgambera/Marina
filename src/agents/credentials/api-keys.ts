/**
 * Shared API Key persistence — used by both CLI and desktop.
 *
 * Loads/saves provider API keys to ~/.marina/api-keys.json
 * and injects them into process.env.
 */

import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR = join(homedir(), ".marina");
const KEYS_FILE = join(CONFIG_DIR, "api-keys.json");

/** Environment variable names for each provider */
export const PROVIDER_ENV_KEYS: Record<string, string> = {
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

export interface ApiKeyMap {
  [envVar: string]: string;
}

/** Read saved keys from disk and set them in process.env */
export async function loadApiKeys(): Promise<ApiKeyMap> {
  try {
    const raw = await fs.readFile(KEYS_FILE, "utf-8");
    const keys: ApiKeyMap = JSON.parse(raw);
    for (const [envVar, value] of Object.entries(keys)) {
      if (value && !process.env[envVar]) {
        process.env[envVar] = value;
      }
    }
    return keys;
  } catch {
    return {};
  }
}

/** Persist keys to disk and update process.env */
export async function saveApiKeys(keys: ApiKeyMap): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });

  // Merge with existing keys
  let existing: ApiKeyMap = {};
  try {
    const raw = await fs.readFile(KEYS_FILE, "utf-8");
    existing = JSON.parse(raw);
  } catch {
    // first save
  }

  const merged = { ...existing, ...keys };

  // Remove entries with empty values
  for (const [k, v] of Object.entries(merged)) {
    if (!v) delete merged[k];
  }

  await fs.writeFile(KEYS_FILE, JSON.stringify(merged, null, 2), "utf-8");

  // Also update process.env
  for (const [envVar, value] of Object.entries(merged)) {
    if (value) process.env[envVar] = value;
  }
}

/** Get which providers have keys configured (masked, safe to expose) */
export function getConfiguredProviders(): {
  provider: string;
  envVar: string;
  configured: boolean;
}[] {
  return Object.entries(PROVIDER_ENV_KEYS).map(([provider, envVar]) => ({
    provider,
    envVar,
    configured: !!process.env[envVar],
  }));
}
