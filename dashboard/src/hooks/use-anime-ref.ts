import type { AnimationParams, TargetsParam } from "animejs";
import { useCallback, useEffect, useRef } from "react";
import { animate, prefersReducedMotion } from "../lib/animations";

interface AnimationSlot {
  animation: ReturnType<typeof animate> | null;
}

/**
 * Hook that manages anime.js animation lifecycles.
 * Cancels previous animations when starting new ones on the same slot,
 * and pauses all animations on unmount.
 */
export function useAnimeRef() {
  const slotsRef = useRef<Map<string, AnimationSlot>>(new Map());

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      for (const slot of slotsRef.current.values()) {
        if (slot.animation) {
          slot.animation.pause();
        }
      }
      slotsRef.current.clear();
    };
  }, []);

  const run = useCallback(
    (key: string, targets: TargetsParam, props: AnimationParams) => {
      if (prefersReducedMotion()) return null;

      // Cancel previous animation in this slot
      const existing = slotsRef.current.get(key);
      if (existing?.animation) {
        existing.animation.pause();
      }

      const anim = animate(targets, props);
      slotsRef.current.set(key, { animation: anim });
      return anim;
    },
    [],
  );

  const cancel = useCallback((key: string) => {
    const slot = slotsRef.current.get(key);
    if (slot?.animation) {
      slot.animation.pause();
      slotsRef.current.delete(key);
    }
  }, []);

  const cancelAll = useCallback(() => {
    for (const slot of slotsRef.current.values()) {
      if (slot.animation) {
        slot.animation.pause();
      }
    }
    slotsRef.current.clear();
  }, []);

  return { run, cancel, cancelAll };
}
