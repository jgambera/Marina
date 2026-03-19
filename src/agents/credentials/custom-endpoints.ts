// @ts-nocheck — imported from artilect-agent (non-strict tsconfig)
/**
 * Custom Endpoints — user-defined OpenAI-compatible LLM endpoints.
 *
 * Supports local LLMs (Ollama, llama.cpp, vLLM, LM Studio), private
 * deployments, or any provider with an OpenAI-compatible API.
 *
 * Persisted to ~/.marina/custom-endpoints.json
 */

import { promises as fs } from "node:fs";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR = join(homedir(), ".marina");
const ENDPOINTS_FILE = join(CONFIG_DIR, "custom-endpoints.json");

export interface CustomEndpoint {
  id: string;
  name: string; // Display name, e.g. "Local Llama 3"
  baseUrl: string; // e.g. "http://localhost:11434/v1"
  apiKey?: string; // Optional — many local LLMs don't need one
  models: CustomEndpointModel[];
}

export interface CustomEndpointModel {
  id: string; // Model ID as the endpoint expects it, e.g. "llama3:70b"
  name?: string; // Optional display name override
  contextWindow?: number;
  maxTokens?: number;
}

/** In-memory cache */
let cached: CustomEndpoint[] | null = null;

export async function loadCustomEndpoints(): Promise<CustomEndpoint[]> {
  if (cached) return cached;
  try {
    const raw = await fs.readFile(ENDPOINTS_FILE, "utf-8");
    cached = JSON.parse(raw) as CustomEndpoint[];
    return cached;
  } catch {
    cached = [];
    return [];
  }
}

export async function saveCustomEndpoints(endpoints: CustomEndpoint[]): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await fs.writeFile(ENDPOINTS_FILE, JSON.stringify(endpoints, null, 2), "utf-8");
  cached = endpoints;
}

export async function addCustomEndpoint(
  endpoint: Omit<CustomEndpoint, "id">,
): Promise<CustomEndpoint> {
  const endpoints = await loadCustomEndpoints();
  const entry: CustomEndpoint = { ...endpoint, id: randomBytes(8).toString("hex") };
  endpoints.push(entry);
  await saveCustomEndpoints(endpoints);
  return entry;
}

export async function updateCustomEndpoint(
  id: string,
  update: Partial<Omit<CustomEndpoint, "id">>,
): Promise<CustomEndpoint | null> {
  const endpoints = await loadCustomEndpoints();
  const idx = endpoints.findIndex((e) => e.id === id);
  if (idx === -1) return null;
  endpoints[idx] = { ...endpoints[idx], ...update, id };
  await saveCustomEndpoints(endpoints);
  return endpoints[idx];
}

export async function deleteCustomEndpoint(id: string): Promise<boolean> {
  const endpoints = await loadCustomEndpoints();
  const idx = endpoints.findIndex((e) => e.id === id);
  if (idx === -1) return false;
  endpoints.splice(idx, 1);
  await saveCustomEndpoints(endpoints);
  return true;
}

/**
 * Try to auto-detect models from an OpenAI-compatible endpoint.
 * Calls GET /models (or /v1/models) and returns the model IDs.
 */
export async function probeEndpointModels(baseUrl: string, apiKey?: string): Promise<string[]> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  // Try /models first, then /v1/models
  for (const suffix of ["/models", "/v1/models"]) {
    const url = baseUrl.replace(/\/+$/, "") + suffix;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(url, { signal: controller.signal, headers });
      clearTimeout(timeout);
      if (!res.ok) continue;
      const json = (await res.json()) as { data?: { id: string }[] };
      if (Array.isArray(json.data)) {
        return json.data.map((m) => m.id).filter(Boolean);
      }
    } catch {
      // try next suffix
    }
  }
  return [];
}
