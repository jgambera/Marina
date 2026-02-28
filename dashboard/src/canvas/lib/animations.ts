import type { Node } from "@xyflow/react";
import { SPRING_BOUNCY, animate, prefersReducedMotion, stagger } from "../../lib/animations";

type SetNodes = React.Dispatch<React.SetStateAction<Node[]>>;

/**
 * Animate nodes from their current positions to target positions.
 * Interpolates all positions in onRender callback, then calls setNodes.
 */
export function animateLayout(
  nodes: Node[],
  targetMap: Map<string, { x: number; y: number; w: number; h: number }>,
  setNodes: SetNodes,
): Promise<void> {
  if (prefersReducedMotion() || nodes.length === 0) {
    // Apply immediately
    setNodes((prev) =>
      prev.map((n) => {
        const target = targetMap.get(n.id);
        if (!target) return n;
        return {
          ...n,
          position: { x: target.x, y: target.y },
          style: { width: target.w, height: target.h },
        };
      }),
    );
    return Promise.resolve();
  }

  // Capture starting positions
  const starts = new Map(
    nodes.map((n) => [
      n.id,
      {
        x: n.position.x,
        y: n.position.y,
        w: (n.style?.width as number) ?? 300,
        h: (n.style?.height as number) ?? 200,
      },
    ]),
  );

  return new Promise<void>((resolve) => {
    const proxy = { t: 0 };

    animate(proxy, {
      t: [0, 1],
      duration: 600,
      ease: SPRING_BOUNCY,
      onRender: () => {
        const t = proxy.t;
        setNodes((prev) =>
          prev.map((n) => {
            const start = starts.get(n.id);
            const target = targetMap.get(n.id);
            if (!start || !target) return n;

            return {
              ...n,
              position: {
                x: start.x + (target.x - start.x) * t,
                y: start.y + (target.y - start.y) * t,
              },
              style: {
                width: start.w + (target.w - start.w) * t,
                height: start.h + (target.h - start.h) * t,
              },
            };
          }),
        );
      },
      onComplete: () => resolve(),
    });
  });
}

/**
 * Animate a spring entrance for DOM elements (scale 0 -> 1).
 */
export function springEntrance(elements: Element | Element[] | NodeListOf<Element>) {
  if (prefersReducedMotion()) return;

  animate(elements, {
    scale: [0, 1],
    opacity: [0, 1],
    ease: SPRING_BOUNCY,
    delay: stagger(50),
    duration: 500,
  });
}
