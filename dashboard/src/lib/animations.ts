import { animate, createTimeline, stagger, utils } from "animejs";

// ── Spring presets ──────────────────────────────────────────────────
export const SPRING_SNAPPY = "spring(1, 80, 12, 0)";
export const SPRING_BOUNCY = "spring(1, 80, 8, 0)";
export const SPRING_GENTLE = "spring(1, 80, 18, 0)";

// ── Reduced motion ──────────────────────────────────────────────────
let _reducedMotion: boolean | null = null;

export function prefersReducedMotion(): boolean {
  if (_reducedMotion === null) {
    _reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
  return _reducedMotion;
}

// Re-export anime.js v4 utilities
export { animate, createTimeline, stagger, utils };
