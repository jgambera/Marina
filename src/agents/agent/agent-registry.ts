/**
 * Agent Registry — Extensible registry of agent types.
 *
 * Replaces the hardcoded full/lean if/else in handler.ts with an open registry.
 * Native agents register at import time; external adapters register dynamically.
 */

import type { IMarinaAgent } from "./agent-interface";

// ─── Detection ─────────────────────────────────────────────────────────────

export interface DetectionResult {
  installed: boolean;
  version?: string;
  path?: string;
  error?: string;
}

// ─── Extra config fields for dashboard UI ──────────────────────────────────

export interface ExtraFieldDef {
  key: string;
  label: string;
  type: "string" | "number" | "boolean" | "select";
  placeholder?: string;
  options?: string[]; // for "select" type
  required?: boolean;
  default?: string | number | boolean;
}

// ─── Agent creation options ────────────────────────────────────────────────

export interface AgentCreateOptions {
  wsUrl: string;
  mcpUrl?: string;
  name: string;
  model: string;
  role: string;
  systemPrompt?: string;
  token?: string;
  apiKey?: string;
  agentConfig?: Record<string, unknown>;
  onSkillDiscovery?: (status: {
    phase: string;
    message: string;
    commandsFound?: number;
    toolsCreated?: number;
  }) => void;
  onConnectionStatus?: (status: { phase: string; message: string }) => void;
  onProcessOutput?: (data: string) => void;
  onActionLog?: (entry: {
    timestamp: number;
    source: string;
    action: string;
    detail?: string;
  }) => void;
}

// ─── Agent type definition ─────────────────────────────────────────────────

export interface AgentTypeDefinition {
  /** Unique type key: "full", "lean", "claude-code", "goose", etc. */
  type: string;

  /** Human-readable name for the dashboard. */
  displayName: string;

  /** Short description shown in the UI. */
  description: string;

  /** "native" = built-in agent, "external" = subprocess bridge. */
  category: "native" | "external";

  /** Check whether this agent is installed/available on the host. */
  detect(): Promise<DetectionResult>;

  /** Extra config fields shown in the dashboard launch form. */
  extraFields?: ExtraFieldDef[];

  /** Factory: create an agent instance. */
  create(opts: AgentCreateOptions): IMarinaAgent;
}

// ─── Registry singleton ────────────────────────────────────────────────────

const registry = new Map<string, AgentTypeDefinition>();

/** Register an agent type. Overwrites if the type key already exists. */
export function registerAgentType(def: AgentTypeDefinition): void {
  registry.set(def.type, def);
}

/** Get a registered agent type by key. */
export function getAgentType(type: string): AgentTypeDefinition | undefined {
  return registry.get(type);
}

/** Get all registered agent types. */
export function getAllAgentTypes(): AgentTypeDefinition[] {
  return Array.from(registry.values());
}

/** Check if an agent type is registered. */
export function hasAgentType(type: string): boolean {
  return registry.has(type);
}
