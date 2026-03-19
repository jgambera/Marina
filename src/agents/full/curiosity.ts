/**
 * CuriosityEngine — Drives exploration via novelty scoring, action diversity tracking,
 * and dynamic motivation weighting.
 *
 * Works alongside the goal system: when novelty is high in unexplored areas,
 * it spawns exploration goals. When the agent is in a rut, it boosts curiosity weight.
 */

import type { PlatformMemoryBackend } from "../agent/memory-platform";
import type { GoalManager } from "./goals";

/** Action category distribution tracker */
interface ActionDistribution {
  categories: Map<string, number>;
  total: number;
  lastReset: number;
}

/** Curiosity state persisted across cycles */
interface CuriosityState {
  /** Recent surprise events (count per window) */
  surpriseCount: number;
  /** Cycles since last surprise reset */
  cyclesSinceReset: number;
  /** Current composite motivation weights */
  weights: {
    entropy: number;
    novelty: number;
    goalDrive: number;
  };
  /** How many curiosity goals have been successful */
  curiositySuccessCount: number;
  /** Total curiosity goals spawned */
  curiosityGoalsSpawned: number;
  /** Goals completed since last principle distillation */
  goalsCompletedSinceDistillation: number;
}

export class CuriosityEngine {
  private platformMemory: PlatformMemoryBackend;
  private goalManager: GoalManager;
  private actionDist: ActionDistribution;
  private state: CuriosityState;

  /** How many cycles between novelty checks */
  private noveltyCheckInterval = 5;
  /** Cycle counter */
  private cycleCount = 0;
  /** Surprise rate threshold (below this = boring) */
  private boredomThreshold = 0.1;
  /** Goals completed between principle distillation */
  private distillationInterval = 3;

  constructor(platformMemory: PlatformMemoryBackend, goalManager: GoalManager) {
    this.platformMemory = platformMemory;
    this.goalManager = goalManager;
    this.actionDist = {
      categories: new Map(),
      total: 0,
      lastReset: Date.now(),
    };
    this.state = {
      surpriseCount: 0,
      cyclesSinceReset: 0,
      weights: {
        entropy: 0.25,
        novelty: 0.35,
        goalDrive: 0.4,
      },
      curiositySuccessCount: 0,
      curiosityGoalsSpawned: 0,
      goalsCompletedSinceDistillation: 0,
    };
  }

  /** Track an action for entropy calculation */
  trackAction(category: string): void {
    const count = this.actionDist.categories.get(category) ?? 0;
    this.actionDist.categories.set(category, count + 1);
    this.actionDist.total++;
  }

  /** Track a surprise event */
  trackSurprise(): void {
    this.state.surpriseCount++;
  }

  /** Track goal completion for principle distillation timing */
  trackGoalCompletion(): void {
    this.state.goalsCompletedSinceDistillation++;
  }

  /** Check if it's time to distill principles */
  shouldDistillPrinciple(): boolean {
    return this.state.goalsCompletedSinceDistillation >= this.distillationInterval;
  }

  /** Reset distillation counter after distillation */
  resetDistillationCounter(): void {
    this.state.goalsCompletedSinceDistillation = 0;
  }

  /**
   * Calculate Shannon entropy of action distribution (normalized 0-1).
   * High entropy = diverse actions = less novelty need.
   */
  private calculateEntropy(): number {
    if (this.actionDist.total === 0) return 0;
    const counts = [...this.actionDist.categories.values()];
    const n = counts.length;
    if (n <= 1) return 0;

    let h = 0;
    for (const c of counts) {
      if (c === 0) continue;
      const p = c / this.actionDist.total;
      h -= p * Math.log2(p);
    }
    return n > 1 ? h / Math.log2(n) : 0;
  }

  /** Get current surprise rate (surprises per cycle) */
  private getSurpriseRate(): number {
    if (this.state.cyclesSinceReset === 0) return 0;
    return this.state.surpriseCount / this.state.cyclesSinceReset;
  }

  /**
   * Run a curiosity cycle. Returns context lines to inject into the continuation prompt.
   * Should be called every cycle from the autonomy loop.
   */
  async runCycle(): Promise<string[]> {
    this.cycleCount++;
    this.state.cyclesSinceReset++;
    const lines: string[] = [];

    // Only check novelty every N cycles to avoid spamming the server
    if (this.cycleCount % this.noveltyCheckInterval !== 0) {
      return lines;
    }

    // Query novelty from the platform
    let noveltyScore = 50;
    let suggestions: string[] = [];
    try {
      const novelty = await this.platformMemory.getNovelty();
      noveltyScore = novelty.composite;
    } catch {
      // Platform may not support novelty yet
    }

    try {
      suggestions = await this.platformMemory.getNoveltySuggestions();
    } catch {
      // Best effort
    }

    // Calculate local entropy
    const entropy = this.calculateEntropy();
    const surpriseRate = this.getSurpriseRate();

    // Adapt weights dynamically
    this.adaptWeights(noveltyScore, entropy, surpriseRate);

    // Compute composite motivation score
    const motivation = this.computeMotivation(noveltyScore, entropy);

    // Anti-boredom: if surprise rate is very low, inject a prompt
    if (surpriseRate < this.boredomThreshold && this.state.cyclesSinceReset > 10) {
      lines.push(
        "[Curiosity] Your recent actions have been predictable. Consider trying something entirely new.",
      );
    }

    // If novelty is high in unexplored areas, consider spawning exploration goal
    if (noveltyScore > 70 && suggestions.length > 0) {
      const suggestion = suggestions[0]!;
      lines.push(
        `[Curiosity] High novelty detected (${noveltyScore}/100). Suggestion: ${suggestion}`,
      );

      // Spawn curiosity-driven exploration goal if motivation is high
      if (motivation > 0.6) {
        this.spawnCuriosityGoal(suggestion);
      }
    } else if (noveltyScore > 50 && suggestions.length > 0) {
      lines.push(
        `[Curiosity] Moderate novelty (${noveltyScore}/100). Unexplored: ${suggestions.slice(0, 2).join("; ")}`,
      );
    }

    // Reset action distribution periodically (every 50 cycles)
    if (this.cycleCount % 50 === 0) {
      this.actionDist.categories.clear();
      this.actionDist.total = 0;
      this.state.surpriseCount = 0;
      this.state.cyclesSinceReset = 0;
    }

    return lines;
  }

  /** Spawn a curiosity-driven exploration goal */
  private spawnCuriosityGoal(suggestion: string): void {
    // Use adaptive priority: more successes → higher priority for curiosity goals
    const basePriority = 5;
    const successBonus = Math.min(this.state.curiositySuccessCount, 3);
    const priority = basePriority + successBonus;

    this.goalManager.addGoal({
      type: "explore",
      description: `[Curiosity] ${suggestion}`,
      priority,
    });
    this.state.curiosityGoalsSpawned++;
  }

  /** Mark a curiosity goal as successful (called when a curiosity goal completes well) */
  markCuriositySuccess(): void {
    this.state.curiositySuccessCount++;
  }

  /** Adapt motivation weights based on current state */
  private adaptWeights(noveltyScore: number, entropy: number, surpriseRate: number): void {
    // When novelty is high everywhere, reduce curiosity weight
    if (noveltyScore > 80) {
      this.state.weights.novelty = Math.max(0.15, this.state.weights.novelty - 0.05);
      this.state.weights.goalDrive = Math.min(0.55, this.state.weights.goalDrive + 0.05);
    }

    // When stuck in a rut (low entropy, low surprise), increase curiosity
    if (entropy < 0.3 && surpriseRate < this.boredomThreshold) {
      this.state.weights.novelty = Math.min(0.5, this.state.weights.novelty + 0.05);
      this.state.weights.goalDrive = Math.max(0.25, this.state.weights.goalDrive - 0.05);
    }

    // Normalize weights to sum to 1
    const total =
      this.state.weights.entropy + this.state.weights.novelty + this.state.weights.goalDrive;
    this.state.weights.entropy /= total;
    this.state.weights.novelty /= total;
    this.state.weights.goalDrive /= total;
  }

  /** Compute composite motivation score (0-1) */
  private computeMotivation(noveltyScore: number, entropy: number): number {
    const noveltyNorm = noveltyScore / 100;
    const entropyNeed = 1 - entropy; // Low entropy = high need for diversity
    const goalProgress = this.goalManager.getCurrentGoal()?.progress ?? 0;
    const goalDrive = 1 - goalProgress / 100; // Low progress = high drive

    return (
      this.state.weights.entropy * entropyNeed +
      this.state.weights.novelty * noveltyNorm +
      this.state.weights.goalDrive * goalDrive
    );
  }
}
