/**
 * Action History - Tracks agent's actions and decisions for memory and reuse
 */

export interface ActionEntry {
  timestamp: number;
  type: "tool_call" | "decision" | "outcome" | "learning";
  toolName?: string;
  args?: any;
  result?: any;
  success?: boolean;
  error?: string;
  reasoning?: string;
  context?: string;
}

export interface ActionSummary {
  period: {
    start: number;
    end: number;
  };
  totalActions: number;
  successfulActions: number;
  failedActions: number;
  toolUsage: Record<string, number>; // tool name -> count
  keyEvents: string[]; // Important events in chronological order
  learnings: string[]; // What was learned
  achievements: string[]; // What was accomplished
  challenges: string[]; // Problems encountered
  summary: string; // Natural language summary
}

/**
 * ActionHistory tracks agent's actions and creates summaries for memory
 */
export class ActionHistory {
  private actions: ActionEntry[] = [];
  private readonly maxActions = 1000; // Keep last 1000 actions in memory
  private lastSummaryTime: number = Date.now();
  private readonly summaryInterval = 5 * 60 * 1000; // Summarize every 5 minutes

  constructor() {
    // Initialize
  }

  /**
   * Add an action entry
   */
  addAction(entry: ActionEntry): void {
    this.actions.push(entry);

    // Trim old actions to prevent memory growth
    if (this.actions.length > this.maxActions) {
      this.actions = this.actions.slice(-this.maxActions);
    }
  }

  /**
   * Get all actions in time range
   */
  getActions(startTime?: number, endTime?: number): ActionEntry[] {
    return this.actions.filter((action) => {
      if (startTime && action.timestamp < startTime) return false;
      if (endTime && action.timestamp > endTime) return false;
      return true;
    });
  }

  /**
   * Check if it's time to create a summary
   */
  shouldSummarize(): boolean {
    const now = Date.now();
    return now - this.lastSummaryTime >= this.summaryInterval;
  }

  /**
   * Create a summary of actions since last summary
   */
  createSummary(): ActionSummary | null {
    const now = Date.now();
    const startTime = this.lastSummaryTime;
    const periodActions = this.getActions(startTime, now);

    if (periodActions.length === 0) {
      return null;
    }

    // Analyze actions
    const totalActions = periodActions.length;
    const successfulActions = periodActions.filter((a) => a.success !== false).length;
    const failedActions = periodActions.filter((a) => a.success === false || a.error).length;

    // Tool usage stats
    const toolUsage: Record<string, number> = {};
    for (const action of periodActions) {
      if (action.type === "tool_call" && action.toolName) {
        toolUsage[action.toolName] = (toolUsage[action.toolName] || 0) + 1;
      }
    }

    // Extract key events (important actions)
    const keyEvents: string[] = [];
    const learnings: string[] = [];
    const achievements: string[] = [];
    const challenges: string[] = [];

    for (const action of periodActions) {
      if (action.type === "learning" && action.context) {
        learnings.push(action.context);
      } else if (action.type === "outcome" && action.success) {
        achievements.push(action.context || "Completed action successfully");
      } else if (action.type === "outcome" && !action.success) {
        challenges.push(action.error || action.context || "Action failed");
      } else if (action.type === "tool_call" && action.toolName) {
        // Only record significant tool calls
        if (
          action.toolName === "marina_move" ||
          action.toolName === "marina_build" ||
          action.toolName === "marina_command" ||
          action.toolName === "memory"
        ) {
          keyEvents.push(
            `Used ${action.toolName}${action.args ? `: ${JSON.stringify(action.args).substring(0, 50)}` : ""}`,
          );
        }
      }
    }

    // Create natural language summary
    const summary = this.generateNaturalLanguageSummary({
      totalActions,
      successfulActions,
      failedActions,
      toolUsage,
      keyEvents: keyEvents.slice(-10), // Last 10 key events
      learnings: learnings.slice(-5), // Last 5 learnings
      achievements: achievements.slice(-5),
      challenges: challenges.slice(-3),
    });

    const actionSummary: ActionSummary = {
      period: { start: startTime, end: now },
      totalActions,
      successfulActions,
      failedActions,
      toolUsage,
      keyEvents: keyEvents.slice(-10),
      learnings: learnings.slice(-5),
      achievements: achievements.slice(-5),
      challenges: challenges.slice(-3),
      summary,
    };

    // Update last summary time
    this.lastSummaryTime = now;

    return actionSummary;
  }

  /**
   * Generate natural language summary
   */
  private generateNaturalLanguageSummary(data: {
    totalActions: number;
    successfulActions: number;
    failedActions: number;
    toolUsage: Record<string, number>;
    keyEvents: string[];
    learnings: string[];
    achievements: string[];
    challenges: string[];
  }): string {
    const parts: string[] = [];

    // Activity level
    parts.push(
      `Performed ${data.totalActions} actions (${data.successfulActions} successful, ${data.failedActions} failed).`,
    );

    // Top tools used
    const topTools = Object.entries(data.toolUsage)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([tool, count]) => `${tool} (${count}x)`)
      .join(", ");
    if (topTools) {
      parts.push(`Primary tools: ${topTools}.`);
    }

    // Key achievements
    if (data.achievements.length > 0) {
      parts.push(`Achievements: ${data.achievements.slice(0, 3).join("; ")}.`);
    }

    // Learnings
    if (data.learnings.length > 0) {
      parts.push(`Learned: ${data.learnings.slice(0, 2).join("; ")}.`);
    }

    // Challenges
    if (data.challenges.length > 0) {
      parts.push(`Challenges: ${data.challenges.slice(0, 2).join("; ")}.`);
    }

    return parts.join(" ");
  }

  /**
   * Get recent activity summary (last N minutes)
   */
  getRecentSummary(minutes: number = 5): string {
    const startTime = Date.now() - minutes * 60 * 1000;
    const recentActions = this.getActions(startTime);

    if (recentActions.length === 0) {
      return "No recent activity.";
    }

    const successCount = recentActions.filter((a) => a.success !== false).length;
    const failCount = recentActions.filter((a) => a.success === false).length;

    const toolCounts: Record<string, number> = {};
    for (const action of recentActions) {
      if (action.type === "tool_call" && action.toolName) {
        toolCounts[action.toolName] = (toolCounts[action.toolName] || 0) + 1;
      }
    }

    const topTool = Object.entries(toolCounts).sort((a, b) => b[1] - a[1])[0];

    return `Last ${minutes} min: ${recentActions.length} actions (${successCount} ok, ${failCount} failed). Most used: ${topTool?.[0] || "none"}.`;
  }

  /**
   * Clear all history (useful after summarization)
   */
  clear(): void {
    this.actions = [];
  }

  /**
   * Get action count
   */
  getActionCount(): number {
    return this.actions.length;
  }

  /**
   * Export history for serialization
   */
  export(): ActionEntry[] {
    return [...this.actions];
  }

  /**
   * Import history from serialization
   */
  import(actions: ActionEntry[]): void {
    this.actions = actions;
    if (this.actions.length > this.maxActions) {
      this.actions = this.actions.slice(-this.maxActions);
    }
  }
}
