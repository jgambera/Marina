/**
 * Exploration Strategy - Algorithms for efficient world mapping
 */

import type { WorldMap } from "./map-data";

export interface ExplorationDecision {
  /** Action to take */
  action: "move" | "backtrack" | "complete";
  /** Direction to move (if action is move or backtrack) */
  direction?: string;
  /** Reason for decision */
  reason: string;
  /** Path to follow (for backtracking) */
  path?: string[];
}

export type StrategyType = "dfs" | "bfs" | "nearest";

/**
 * Exploration strategy interface
 */
export abstract class ExplorationStrategy {
  abstract getNextMove(map: WorldMap): ExplorationDecision;
}

/**
 * Depth-First Search - Explore as deep as possible before backtracking
 */
export class DFSStrategy extends ExplorationStrategy {
  private visitStack: string[] = [];

  getNextMove(map: WorldMap): ExplorationDecision {
    const currentRoom = map.getCurrentRoom();

    if (!currentRoom) {
      return {
        action: "complete",
        reason: "No current room",
      };
    }

    // Check for unexplored exits in current room
    const unexplored = map.getUnexploredExitsFromCurrentRoom();

    if (unexplored.length > 0) {
      const direction = unexplored[0];
      this.visitStack.push(currentRoom.id);

      return {
        action: "move",
        direction,
        reason: `Exploring ${direction} from ${currentRoom.title}`,
      };
    }

    // No unexplored exits - backtrack
    if (this.visitStack.length > 0) {
      const previousRoomId = this.visitStack.pop()!;
      const path = map.findPath(currentRoom.id, previousRoomId);

      if (path && path.length > 0) {
        return {
          action: "backtrack",
          direction: path[0],
          path: path,
          reason: `Backtracking to ${previousRoomId} (${path.length} steps)`,
        };
      }
    }

    // Check if there are any unexplored exits in the entire map
    const allUnexplored = map.getUnexploredExits();
    if (allUnexplored.length > 0) {
      const nearest = allUnexplored[0];
      const path = map.findPath(currentRoom.id, nearest.roomId);

      if (path && path.length > 0) {
        return {
          action: "backtrack",
          direction: path[0],
          path: path,
          reason: `Moving to unexplored area at ${nearest.roomId}`,
        };
      }
    }

    return {
      action: "complete",
      reason: "All exits explored",
    };
  }
}

/**
 * Breadth-First Search - Explore level by level
 */
export class BFSStrategy extends ExplorationStrategy {
  private explorationQueue: Array<{ roomId: string; direction: string }> = [];
  private explored = new Set<string>();

  getNextMove(map: WorldMap): ExplorationDecision {
    const currentRoom = map.getCurrentRoom();

    if (!currentRoom) {
      return {
        action: "complete",
        reason: "No current room",
      };
    }

    // Mark current room as explored
    this.explored.add(currentRoom.id);

    // Add unexplored exits to queue
    const unexplored = map.getUnexploredExitsFromCurrentRoom();
    for (const direction of unexplored) {
      const targetId = currentRoom.exits.get(direction)!;
      if (!this.explored.has(targetId)) {
        this.explorationQueue.push({
          roomId: currentRoom.id,
          direction,
        });
      }
    }

    // Process queue
    if (this.explorationQueue.length > 0) {
      const next = this.explorationQueue.shift()!;

      // Are we already in the right room?
      if (next.roomId === currentRoom.id) {
        return {
          action: "move",
          direction: next.direction,
          reason: `Exploring ${next.direction} (BFS level traversal)`,
        };
      }

      // Navigate to the room
      const path = map.findPath(currentRoom.id, next.roomId);
      if (path && path.length > 0) {
        return {
          action: "backtrack",
          direction: path[0],
          path: path,
          reason: `Navigating to next BFS target (${path.length} steps)`,
        };
      }
    }

    return {
      action: "complete",
      reason: "BFS exploration complete",
    };
  }
}

/**
 * Nearest Unexplored - Always go to nearest unexplored exit
 */
export class NearestUnexploredStrategy extends ExplorationStrategy {
  getNextMove(map: WorldMap): ExplorationDecision {
    const currentRoom = map.getCurrentRoom();

    if (!currentRoom) {
      return {
        action: "complete",
        reason: "No current room",
      };
    }

    // Check current room first
    const unexplored = map.getUnexploredExitsFromCurrentRoom();

    if (unexplored.length > 0) {
      const direction = unexplored[0];

      return {
        action: "move",
        direction,
        reason: `Exploring ${direction} from ${currentRoom.title}`,
      };
    }

    // Find nearest unexplored exit in map
    const allUnexplored = map.getUnexploredExits();

    if (allUnexplored.length === 0) {
      return {
        action: "complete",
        reason: "All exits explored",
      };
    }

    // Find closest unexplored exit
    let nearestDistance = Infinity;
    let nearestPath: string[] | null = null;

    for (const unexploredExit of allUnexplored) {
      const path = map.findPath(currentRoom.id, unexploredExit.roomId);
      if (path && path.length < nearestDistance) {
        nearestDistance = path.length;
        nearestPath = path;
      }
    }

    if (nearestPath && nearestPath.length > 0) {
      return {
        action: "backtrack",
        direction: nearestPath[0],
        path: nearestPath,
        reason: `Moving to nearest unexplored (${nearestDistance} steps away)`,
      };
    }

    return {
      action: "complete",
      reason: "Cannot reach unexplored areas",
    };
  }
}

/**
 * Get exploration strategy by type
 */
export function getExplorationStrategy(type: StrategyType): ExplorationStrategy {
  switch (type) {
    case "dfs":
      return new DFSStrategy();
    case "bfs":
      return new BFSStrategy();
    case "nearest":
      return new NearestUnexploredStrategy();
    default:
      return new NearestUnexploredStrategy();
  }
}
