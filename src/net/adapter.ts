import type { RateLimiter } from "../auth/rate-limiter";
import type { Engine } from "../engine/engine";
import type { Perception } from "../types";

// ─── Adapter Interface ───────────────────────────────────────────────────────

export interface Adapter {
  readonly name: string;
  readonly protocol: string;
  start(): Promise<void> | void;
  stop(): Promise<void> | void;
}

// ─── Adapter Context (shared utilities for all adapters) ─────────────────────

export interface AdapterContext {
  engine: Engine;
  rateLimiter?: RateLimiter;
  formatPerception: (p: Perception, medium: Medium) => string;
}

// ─── Output Medium ───────────────────────────────────────────────────────────

export type Medium = "json" | "ansi" | "markdown" | "plaintext" | "html";
