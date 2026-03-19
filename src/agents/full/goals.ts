/**
 * Goal system for autonomous agent behavior
 * Tracks objectives, progress, and success metrics
 */

export interface Goal {
  id: string;
  type: GoalType;
  description: string;
  priority: number;
  status: "pending" | "active" | "completed" | "failed";
  progress: number;
  startedAt?: number;
  completedAt?: number;
  metrics?: GoalMetrics;
  parentGoalId?: string;
  subGoalIds?: string[];
}

export type GoalType =
  | "explore"
  | "learn_commands"
  | "build_rooms"
  | "communicate"
  | "coordinate"
  | "interact_social"
  | "create_content"
  | "research"
  | "organize"
  | "analyze"
  | "document"
  | "monitor";

export interface GoalMetrics {
  roomsExplored?: number;
  roomsBuilt?: number;
  itemsCollected?: number;
  messagesSent?: number;
  contentCreated?: number;
  entitiesInteracted?: number;
  topicsResearched?: number;
  entriesOrganized?: number;
  patternsIdentified?: number;
  documentsCreated?: number;
  entitiesStudied?: number;
}

export class GoalManager {
  private goals: Goal[] = [];
  private currentGoal: Goal | null = null;
  private completedGoals: Goal[] = [];

  /**
   * Generate initial goals for an Marina agent
   */
  generateInitialGoals(): Goal[] {
    const initialGoals: Goal[] = [
      {
        id: "explore-world",
        type: "explore",
        description:
          "Explore the world — move through exits, visit new rooms, and note what you find",
        priority: 10,
        status: "pending",
        progress: 0,
        metrics: { roomsExplored: 0 },
      },
      {
        id: "talk-to-others",
        type: "communicate",
        description:
          "Talk to other agents and players — introduce yourself, ask what they're working on, coordinate",
        priority: 9,
        status: "pending",
        progress: 0,
      },
      {
        id: "build-something",
        type: "build_rooms",
        description:
          "Build a new room or improve an existing area — use the build system to create something",
        priority: 7,
        status: "pending",
        progress: 0,
        metrics: { roomsBuilt: 0 },
      },
      {
        id: "complete-a-task",
        type: "coordinate",
        description:
          "Find and complete a community task — check task list, claim one, and finish it",
        priority: 8,
        status: "pending",
        progress: 0,
      },
      {
        id: "share-knowledge",
        type: "create_content",
        description:
          "Post something useful on a board or channel — share a discovery, write a guide, or start a discussion",
        priority: 6,
        status: "pending",
        progress: 0,
      },
    ];

    this.goals = initialGoals;
    return initialGoals;
  }

  /**
   * Select next goal to pursue.
   * Prefers pending sub-goals of the most recently completed parent,
   * then falls back to highest-priority pending goal.
   */
  selectNextGoal(): Goal | null {
    const pendingGoals = this.goals.filter((g) => g.status === "pending");

    if (pendingGoals.length === 0) {
      return null;
    }

    // Check if the most recently completed goal has pending sub-goals
    const lastCompleted = this.completedGoals[this.completedGoals.length - 1];
    if (lastCompleted?.subGoalIds && lastCompleted.subGoalIds.length > 0) {
      const pendingSub = pendingGoals.find((g) => g.parentGoalId === lastCompleted.id);
      if (pendingSub) {
        pendingSub.status = "active";
        pendingSub.startedAt = Date.now();
        this.currentGoal = pendingSub;
        return pendingSub;
      }
    }

    // Fall back to highest-priority pending goal
    pendingGoals.sort((a, b) => b.priority - a.priority);

    const goal = pendingGoals[0];
    goal.status = "active";
    goal.startedAt = Date.now();
    this.currentGoal = goal;

    return goal;
  }

  /**
   * Update progress on current goal
   */
  updateProgress(goalId: string, progress: number, metrics?: Partial<GoalMetrics>): void {
    const goal = this.goals.find((g) => g.id === goalId);
    if (!goal) return;

    goal.progress = Math.min(100, progress);

    if (metrics && goal.metrics) {
      Object.assign(goal.metrics, metrics);
    }

    if (goal.progress >= 100) {
      this.completeGoal(goalId, true);
    }
  }

  /**
   * Mark goal as completed.
   * When completing a sub-goal, recalculates parent's progress.
   */
  completeGoal(goalId: string, success: boolean): void {
    const goalIndex = this.goals.findIndex((g) => g.id === goalId);
    if (goalIndex === -1) return;

    const goal = this.goals[goalIndex];
    goal.status = success ? "completed" : "failed";
    goal.completedAt = Date.now();

    this.completedGoals.push(goal);
    this.goals.splice(goalIndex, 1);

    if (this.currentGoal?.id === goalId) {
      this.currentGoal = null;
    }

    // If this was a sub-goal, recalculate parent's progress
    if (goal.parentGoalId) {
      const parent =
        this.goals.find((g) => g.id === goal.parentGoalId) ??
        this.completedGoals.find((g) => g.id === goal.parentGoalId);
      if (parent?.subGoalIds && parent.subGoalIds.length > 0) {
        const completedCount = parent.subGoalIds.filter((id) =>
          this.completedGoals.some((g) => g.id === id && g.status === "completed"),
        ).length;
        parent.progress = Math.round((completedCount / parent.subGoalIds.length) * 100);
      }
    }
  }

  /**
   * Add a new goal dynamically.
   * If parentGoalId is provided, the new goal is linked as a sub-goal.
   */
  addGoal(goal: Omit<Goal, "id" | "status" | "progress">, parentGoalId?: string): Goal {
    const newGoal: Goal = {
      ...goal,
      id: `goal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      status: "pending",
      progress: 0,
    };

    if (parentGoalId) {
      newGoal.parentGoalId = parentGoalId;
      const parent =
        this.goals.find((g) => g.id === parentGoalId) ??
        this.completedGoals.find((g) => g.id === parentGoalId);
      if (parent) {
        if (!parent.subGoalIds) parent.subGoalIds = [];
        parent.subGoalIds.push(newGoal.id);
      }
    }

    this.goals.push(newGoal);
    return newGoal;
  }

  /**
   * Batch-create sub-goals under a parent.
   */
  addSubGoals(parentId: string, subGoals: Array<Omit<Goal, "id" | "status" | "progress">>): Goal[] {
    return subGoals.map((sg) => this.addGoal(sg, parentId));
  }

  /**
   * Get current active goal
   */
  getCurrentGoal(): Goal | null {
    return this.currentGoal;
  }

  /**
   * Get all goals
   */
  getAllGoals(): Goal[] {
    return [...this.goals];
  }

  /**
   * Get completed goals
   */
  getCompletedGoals(): Goal[] {
    return [...this.completedGoals];
  }

  /**
   * Get progress summary
   */
  getProgressSummary(): string {
    const active = this.goals.filter((g) => g.status === "active").length;
    const pending = this.goals.filter((g) => g.status === "pending").length;
    const completed = this.completedGoals.filter((g) => g.status === "completed").length;
    const failed = this.completedGoals.filter((g) => g.status === "failed").length;

    const lines = [
      `Goals: ${active} active, ${pending} pending, ${completed} completed, ${failed} failed`,
    ];

    if (this.currentGoal) {
      lines.push(`\nCurrent Goal: ${this.currentGoal.description}`);
      lines.push(`  Progress: ${this.currentGoal.progress}%`);

      if (this.currentGoal.metrics) {
        lines.push(`  Metrics:`);
        for (const [key, value] of Object.entries(this.currentGoal.metrics)) {
          lines.push(`    ${key}: ${value}`);
        }
      }
    }

    if (completed > 0) {
      lines.push("\nRecently Completed:");
      for (const goal of this.completedGoals.slice(-3)) {
        lines.push(`  - ${goal.description}`);
      }
    }

    return lines.join("\n");
  }
}
