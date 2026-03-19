/**
 * Shared agent infrastructure
 */

export { type ActionEntry, ActionHistory } from "./action-history";
export {
  type ContextManagerOptions,
  createContextManager,
} from "./context-manager";
export { PlatformMemoryBackend } from "./memory-platform";
export {
  getConfiguredProviderNames,
  getModelListForTUI,
  getModelsByProvider,
  getProviderDisplayName,
  resolveModel,
} from "./model-registry";
export { createOpenRouterModel, parseModelString } from "./openrouter-models";
export {
  DEFAULT_ROLE,
  getRole,
  getRoleSummary,
  ROLE_IDS,
  ROLES,
  type RoleDefinition,
  type RoleId,
} from "./roles";
export { type DiscoveryStatus, discoverSkills } from "./skill-discovery";
export { SocialAwareness, type SocialEvent, type SocialEventType } from "./social";
export { getTeamContext } from "./team-context";
