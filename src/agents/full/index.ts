/**
 * Full agent deliverable
 */

export { MarinaAgent, type MarinaAgentOptions } from "./marina-agent";
export {
  getAutonomousSystemPrompt,
  getDiscoveryPhasePrompt,
  getTeamContext,
} from "./autonomous-prompts";
export { CuriosityEngine } from "./curiosity";
export { type Goal, GoalManager, type GoalMetrics, type GoalType } from "./goals";
export { type CommandPattern, type EnvironmentCapabilities, LearningSystem } from "./learning";
export { type AgentMemory, getMemoryStorage, type MemoryEntry, MemoryStorage } from "./memory";
export { createMemoryTool, type MemoryToolInput } from "./memory-tool";
