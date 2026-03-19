/**
 * Memory Tool - Allows agent to write persistent memories
 */

import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { type Static, Type } from "@sinclair/typebox";
import type { PlatformMemoryBackend } from "../agent/memory-platform";
import { categoryToNoteType, importanceLevelToNum } from "../utils/memory-utils";
import type { MemoryStorage } from "./memory";

const memoryToolSchema = Type.Object({
  action: Type.Union(
    [
      Type.Literal("write"),
      Type.Literal("search"),
      Type.Literal("update"),
      Type.Literal("remove"),
      Type.Literal("share"),
      Type.Literal("import_shared"),
      Type.Literal("list_tags"),
      Type.Literal("verify"),
      Type.Literal("consolidate"),
      Type.Literal("optimize"),
      Type.Literal("checkpoint"),
      Type.Literal("propose_goal"),
      Type.Literal("vote_goal"),
      Type.Literal("get_goals"),
      Type.Literal("delegate_task"),
      Type.Literal("accept_task"),
      Type.Literal("update_task"),
      Type.Literal("get_tasks"),
      Type.Literal("orient"),
    ],
    {
      description:
        "Action to perform: write, search, update, remove, share, import_shared, list_tags, verify, consolidate, optimize, checkpoint, orient (memory health), propose_goal, vote_goal, get_goals, delegate_task, accept_task, update_task, get_tasks",
    },
  ),
  category: Type.Optional(
    Type.Union(
      [
        Type.Literal("instruction"),
        Type.Literal("insight"),
        Type.Literal("goal"),
        Type.Literal("preference"),
        Type.Literal("discovery"),
        Type.Literal("strategy"),
        Type.Literal("observation"),
        Type.Literal("research_note"),
        Type.Literal("reference"),
      ],
      {
        description: "Memory category (required for 'write' action)",
      },
    ),
  ),
  content: Type.Optional(
    Type.String({
      description: "The content to remember (required for 'write' action)",
    }),
  ),
  importance: Type.Optional(
    Type.Union([Type.Literal("low"), Type.Literal("medium"), Type.Literal("high")], {
      description: "Importance level (default: medium, for 'write' action)",
    }),
  ),
  tags: Type.Optional(
    Type.Array(Type.String(), {
      description: "Tags for organizing/searching memories (for 'write' and 'search' actions)",
    }),
  ),
  query: Type.Optional(
    Type.String({
      description: "Search query text (for 'search' action)",
    }),
  ),
  entryId: Type.Optional(
    Type.String({
      description: "Entry ID (for 'share', 'update', or 'remove' actions)",
    }),
  ),
  newContent: Type.Optional(
    Type.String({
      description: "Updated content for the entry (for 'update' action)",
    }),
  ),
  poolId: Type.Optional(
    Type.String({
      description:
        "Shared memory pool ID (default: 'default', for 'share' and 'import_shared' actions)",
    }),
  ),
  includeShared: Type.Optional(
    Type.Boolean({
      description:
        "Include shared memories in search results (default: false, for 'search' action)",
    }),
  ),
  lastIntent: Type.Optional(
    Type.String({
      description: "What you were trying to do (for 'checkpoint' action)",
    }),
  ),
  currentGoal: Type.Optional(
    Type.String({
      description: "Your main objective (for 'checkpoint' action)",
    }),
  ),
  subGoals: Type.Optional(
    Type.Array(Type.String(), {
      description: "Smaller steps toward main goal (for 'checkpoint' action)",
    }),
  ),
  progress: Type.Optional(
    Type.String({
      description: "Description of current progress (for 'checkpoint' action)",
    }),
  ),
  location: Type.Optional(
    Type.String({
      description: "Current in-game location (for 'checkpoint' action)",
    }),
  ),
  recentActions: Type.Optional(
    Type.Array(Type.String(), {
      description: "Last few actions taken (for 'checkpoint' action)",
    }),
  ),
  nextPlannedAction: Type.Optional(
    Type.String({
      description: "What to do next (for 'checkpoint' action)",
    }),
  ),
  checkpointContext: Type.Optional(
    Type.String({
      description: "Additional context for resumption (for 'checkpoint' action)",
    }),
  ),
  // Team goal parameters
  goalDescription: Type.Optional(
    Type.String({
      description: "Team goal description (for 'propose_goal' action)",
    }),
  ),
  goalPriority: Type.Optional(
    Type.Union([Type.Literal("low"), Type.Literal("medium"), Type.Literal("high")], {
      description: "Goal priority (for 'propose_goal' action, default: medium)",
    }),
  ),
  goalId: Type.Optional(
    Type.String({
      description: "Goal ID (for 'vote_goal', 'delegate_task', 'get_goal_tasks' actions)",
    }),
  ),
  vote: Type.Optional(
    Type.Union([Type.Literal("agree"), Type.Literal("disagree")], {
      description: "Vote on goal (for 'vote_goal' action)",
    }),
  ),
  goalStatus: Type.Optional(
    Type.Union(
      [
        Type.Literal("proposed"),
        Type.Literal("active"),
        Type.Literal("completed"),
        Type.Literal("rejected"),
      ],
      {
        description: "Filter goals by status (for 'get_goals' action)",
      },
    ),
  ),
  // Team task parameters
  taskDescription: Type.Optional(
    Type.String({
      description: "Task description (for 'delegate_task' action)",
    }),
  ),
  assignTo: Type.Optional(
    Type.String({
      description:
        "Bot ID to assign task to (for 'delegate_task' action, optional - can be unassigned)",
    }),
  ),
  taskId: Type.Optional(
    Type.String({
      description: "Task ID (for 'accept_task', 'update_task' actions)",
    }),
  ),
  taskStatus: Type.Optional(
    Type.Union([Type.Literal("in_progress"), Type.Literal("completed"), Type.Literal("failed")], {
      description: "Task status (for 'update_task' action)",
    }),
  ),
  taskProgress: Type.Optional(
    Type.String({
      description: "Progress description (for 'update_task' action)",
    }),
  ),
});

export type MemoryToolInput = Static<typeof memoryToolSchema>;

export function createMemoryTool(
  memoryStorage: MemoryStorage,
  platformBackend?: PlatformMemoryBackend,
): AgentTool<typeof memoryToolSchema> {
  return {
    name: "memory",
    label: "Manage persistent memory",
    description: `Persistent memory system — remembers across sessions and can be shared between bots.

**Actions:**
- **write** — Save a new memory (requires category + content, optional importance + tags)
- **search** — Find memories by query, category, tags, importance. Set includeShared=true to search team knowledge
- **update** — Modify an existing entry (requires entryId)
- **remove** — Delete an entry (requires entryId)
- **share** — Share an entry to the team pool so other bots can import it (requires entryId)
- **import_shared** — Import memories shared by other bots
- **list_tags** — Show all available tags
- **verify** — Confirm an entry's accuracy, increases confidence (requires entryId)
- **consolidate** — Auto-sync with team: compare, verify similar entries, share high-confidence ones
- **optimize** — Merge duplicates and clean up a shared pool
- **checkpoint** — Save current state for resumption (requires lastIntent + currentGoal)

**Team Goals & Tasks:**
- **propose_goal** — Propose a team goal for voting (requires goalDescription, optional goalPriority)
- **vote_goal** — Vote agree/disagree on a proposed goal (requires goalId + vote)
- **get_goals** — List team goals (optional goalStatus filter: proposed/active/completed/rejected)
- **delegate_task** — Create a task for a goal (requires goalId + taskDescription, optional assignTo)
- **accept_task** — Accept an unassigned task (requires taskId)
- **update_task** — Update task status/progress (requires taskId + taskStatus)
- **get_tasks** — List your assigned tasks

**Categories:**
- **instruction** — Directives from users or admins
- **insight** — Important learnings about gameplay
- **goal** — Long-term objectives to pursue
- **preference** — Behavioral preferences or play style choices
- **discovery** — New mechanics, commands, or world features found
- **strategy** — Successful tactics and approaches that worked
- **observation** — Environmental details, entity behaviors, room notes
- **research_note** — Detailed research findings and analysis
- **reference** — Factual data: maps, lists, command syntax, prices

**Examples:**
- Write: {action: "write", category: "discovery", content: "The 'search' command reveals hidden items", importance: "high", tags: ["commands"]}
- Search team: {action: "search", query: "combat", includeShared: true}
- Share: {action: "share", entryId: "1675389012345-abc"}
- Propose goal: {action: "propose_goal", goalDescription: "Map the entire dungeon", goalPriority: "high"}
- Delegate: {action: "delegate_task", goalId: "goal-123", taskDescription: "Explore north wing"}`,

    parameters: memoryToolSchema,

    async execute(
      toolCallId: string,
      params: MemoryToolInput,
      signal?: AbortSignal,
      onUpdate?: any,
    ) {
      const { action } = params;

      const categoryIcons: Record<string, string> = {
        instruction: "📋",
        insight: "💡",
        goal: "🎯",
        preference: "⚙️",
        discovery: "🔍",
        strategy: "🎲",
        observation: "👁️",
        research_note: "📓",
        reference: "📚",
      };

      try {
        // Handle different actions
        switch (action) {
          case "write": {
            const { category, content, importance = "medium", tags = [] } = params;

            if (!category) {
              return {
                content: [
                  {
                    type: "text",
                    text: "❌ Error: 'category' is required for 'write' action",
                  },
                ],
                details: { success: false, error: "Missing category" },
              };
            }

            if (!content) {
              return {
                content: [
                  {
                    type: "text",
                    text: "❌ Error: 'content' is required for 'write' action",
                  },
                ],
                details: { success: false, error: "Missing content" },
              };
            }

            // Write to platform (primary) and local storage (backup)
            let platformInfo = "";
            if (platformBackend) {
              try {
                const result = await platformBackend.write(category, content, importance, tags);
                platformInfo = result.noteId ? ` (platform note #${result.noteId})` : "";
              } catch {
                // Platform write failed, local storage is the fallback
              }
            }

            const entryId = await memoryStorage.addEntry(category, content, importance, tags);
            const icon = categoryIcons[category] || "📝";

            return {
              content: [
                {
                  type: "text",
                  text: `${icon} Memory saved successfully!${platformInfo}\n\nID: ${entryId}\nCategory: ${category}\nContent: ${content}\nImportance: ${importance}\nTags: ${tags.length > 0 ? tags.join(", ") : "auto-generated"}\n\nThis memory will persist across sessions. Use 'search' to find it later or 'share' to share with other bots.`,
                },
              ],
              details: {
                success: true,
                entryId,
                category,
                content,
                importance,
                tags,
              },
            };
          }

          case "update": {
            const { entryId, newContent, category, importance, tags } = params;

            if (!entryId) {
              return {
                content: [
                  {
                    type: "text",
                    text: "❌ Error: 'entryId' is required for 'update' action",
                  },
                ],
                details: { success: false, error: "Missing entryId" },
              };
            }

            const updates: Record<string, any> = {};
            if (newContent) updates.content = newContent;
            if (category) updates.category = category;
            if (importance) updates.importance = importance;
            if (tags) updates.tags = tags;

            const updated = await memoryStorage.updateEntry(entryId, updates);

            if (!updated) {
              return {
                content: [
                  {
                    type: "text",
                    text: `❌ Entry '${entryId}' not found.`,
                  },
                ],
                details: { success: false, error: "Entry not found" },
              };
            }

            return {
              content: [
                {
                  type: "text",
                  text: `✏️ Memory updated!\n\nEntry ID: ${entryId}\n${newContent ? `New content: ${newContent}\n` : ""}Updated fields: ${Object.keys(updates).join(", ")}`,
                },
              ],
              details: { success: true, entryId, updates },
            };
          }

          case "remove": {
            const { entryId } = params;

            if (!entryId) {
              return {
                content: [
                  {
                    type: "text",
                    text: "❌ Error: 'entryId' is required for 'remove' action",
                  },
                ],
                details: { success: false, error: "Missing entryId" },
              };
            }

            const removed = await memoryStorage.removeEntry(entryId);

            if (!removed) {
              return {
                content: [
                  {
                    type: "text",
                    text: `❌ Entry '${entryId}' not found.`,
                  },
                ],
                details: { success: false, error: "Entry not found" },
              };
            }

            return {
              content: [
                {
                  type: "text",
                  text: `🗑️ Memory removed!\n\nEntry ID: ${entryId}`,
                },
              ],
              details: { success: true, entryId },
            };
          }

          case "search": {
            const { query = "", category, tags, importance, includeShared = false } = params;

            // Search platform first if available
            let platformResults = "";
            if (platformBackend && query) {
              try {
                const platResult = await platformBackend.search(query);
                if (platResult.results && platResult.results.length > 0) {
                  platformResults =
                    "\n\n--- Platform Results ---\n" +
                    platResult.results
                      .slice(0, 5)
                      .map(
                        (r) =>
                          `  #${r.id} [imp=${r.importance} score=${r.score?.toFixed(2) ?? "?"}]: ${r.content}`,
                      )
                      .join("\n");
                }
              } catch {
                // Fall through to local search
              }
            }

            const results = memoryStorage.searchMemories(query, {
              category,
              tags,
              importance,
              includeShared,
            });

            if (results.length === 0 && !platformResults) {
              return {
                content: [
                  {
                    type: "text",
                    text: `🔍 No memories found matching your search.\n\nQuery: "${query}"\nFilters: ${JSON.stringify({ category, tags, importance, includeShared })}`,
                  },
                ],
                details: { success: true, count: 0, results: [] },
              };
            }

            // Format results
            const formattedResults = results.slice(0, 20).map((entry) => {
              const icon = categoryIcons[entry.category] || "📝";
              const sharedIndicator = entry.shared ? " 🔗" : "";
              const sourceIndicator =
                entry.source !== memoryStorage.getCurrentBotId() ? ` (from: ${entry.source})` : "";
              return `${icon}${sharedIndicator} [${entry.id}] ${entry.category} (${entry.importance})${sourceIndicator}\n  ${entry.content}\n  Tags: ${entry.tags.join(", ")}`;
            });

            const truncatedNote =
              results.length > 20 ? `\n\n(Showing 20 of ${results.length} results)` : "";

            return {
              content: [
                {
                  type: "text",
                  text: `🔍 Found ${results.length} memories:\n\n${formattedResults.join("\n\n")}${truncatedNote}${platformResults}\n\nUse the ID in brackets to 'share' a memory with other bots.`,
                },
              ],
              details: { success: true, count: results.length, results },
            };
          }

          case "share": {
            const { entryId, poolId = "default" } = params;

            if (!entryId) {
              return {
                content: [
                  {
                    type: "text",
                    text: "❌ Error: 'entryId' is required for 'share' action",
                  },
                ],
                details: { success: false, error: "Missing entryId" },
              };
            }

            const success = await memoryStorage.shareEntry(entryId, poolId);

            // Also share to platform pool if available
            if (platformBackend && success) {
              try {
                const entry = memoryStorage.getEntry(entryId);
                if (entry) {
                  await platformBackend.share(
                    entry.content,
                    poolId,
                    importanceLevelToNum(entry.importance),
                    categoryToNoteType(entry.category),
                  );
                }
              } catch {
                // Platform share failed, local is sufficient
              }
            }

            if (!success) {
              return {
                content: [
                  {
                    type: "text",
                    text: `❌ Failed to share memory. Entry ID '${entryId}' not found.`,
                  },
                ],
                details: { success: false, error: "Entry not found" },
              };
            }

            return {
              content: [
                {
                  type: "text",
                  text: `🔗 Memory shared successfully!\n\nEntry ID: ${entryId}\nPool: ${poolId}\n\nOther bots can now import this memory using 'import_shared'.`,
                },
              ],
              details: { success: true, entryId, poolId },
            };
          }

          case "import_shared": {
            const { poolId = "default", category, tags, importance } = params;

            const count = await memoryStorage.importSharedMemories(poolId, {
              category,
              tags,
              importance,
            });

            if (count === 0) {
              return {
                content: [
                  {
                    type: "text",
                    text: `📥 No new memories imported from pool '${poolId}'.\n\nEither the pool is empty, all memories are from you, or they don't match your filters.`,
                  },
                ],
                details: { success: true, count: 0 },
              };
            }

            return {
              content: [
                {
                  type: "text",
                  text: `📥 Imported ${count} memories from pool '${poolId}'!\n\nThese memories are now part of your knowledge base. Use 'search' with includeShared=false to see only your own memories.`,
                },
              ],
              details: { success: true, count, poolId },
            };
          }

          case "list_tags": {
            const allTags = memoryStorage.getAllTags();

            if (allTags.length === 0) {
              return {
                content: [
                  {
                    type: "text",
                    text: "🏷️ No tags found. Create some memories first!",
                  },
                ],
                details: { success: true, tags: [] },
              };
            }

            return {
              content: [
                {
                  type: "text",
                  text: `🏷️ Available tags (${allTags.length}):\n\n${allTags.sort().join(", ")}\n\nUse these tags in 'search' to filter memories.`,
                },
              ],
              details: { success: true, tags: allTags },
            };
          }

          case "verify": {
            const { entryId } = params;

            if (!entryId) {
              return {
                content: [
                  {
                    type: "text",
                    text: "❌ Error: 'entryId' is required for 'verify' action",
                  },
                ],
                details: { success: false, error: "Missing entryId" },
              };
            }

            const botId = memoryStorage.getCurrentBotId();
            const success = await memoryStorage.verifyEntry(entryId, botId);

            if (!success) {
              return {
                content: [
                  {
                    type: "text",
                    text: `❌ Failed to verify memory. Entry ID '${entryId}' not found or already verified by you.`,
                  },
                ],
                details: { success: false, error: "Entry not found or already verified" },
              };
            }

            return {
              content: [
                {
                  type: "text",
                  text: `✅ Memory verified!\n\nEntry ID: ${entryId}\n\nYou've confirmed this memory's accuracy. The confidence score has been increased.`,
                },
              ],
              details: { success: true, entryId },
            };
          }

          case "consolidate": {
            const { poolId = "default" } = params;

            const result = await memoryStorage.autoConsolidate(poolId);

            return {
              content: [
                {
                  type: "text",
                  text: `🔄 Auto-consolidation complete!\n\n📊 Results:\n- Compared: ${result.compared} similar memories found\n- Shared: ${result.shared} high-confidence entries shared to pool\n- Consolidated: ${result.consolidated} duplicate entries merged\n\nYour knowledge base is now synchronized with other bots!`,
                },
              ],
              details: { success: true, ...result },
            };
          }

          case "optimize": {
            const { poolId = "default" } = params;

            const result = await memoryStorage.optimizeSharedMemory(poolId);

            return {
              content: [
                {
                  type: "text",
                  text: `✨ Shared memory optimized!\n\n📊 Results:\n- Before: ${result.totalBefore} entries\n- After: ${result.totalAfter} entries\n- Merged: ${result.merged} duplicate entries\n- Improved: ${result.improved} entries with better confidence\n\nThe shared knowledge pool is now cleaner and more reliable!`,
                },
              ],
              details: { success: true, ...result },
            };
          }

          case "checkpoint": {
            const {
              lastIntent,
              currentGoal,
              subGoals,
              progress,
              location,
              recentActions,
              nextPlannedAction,
              checkpointContext,
            } = params;

            if (!lastIntent || !currentGoal) {
              return {
                content: [
                  {
                    type: "text",
                    text: "❌ Error: 'lastIntent' and 'currentGoal' are required for 'checkpoint' action",
                  },
                ],
                details: { success: false, error: "Missing required fields" },
              };
            }

            const checkpointData = {
              lastIntent,
              currentGoal,
              subGoals,
              progress: progress || "",
              location,
              recentActions,
              nextPlannedAction,
              context: checkpointContext,
            };

            // Save to both local and platform
            await memoryStorage.saveCheckpoint(checkpointData);
            if (platformBackend) {
              try {
                await platformBackend.saveCheckpoint(checkpointData);
              } catch {
                // Local checkpoint is the fallback
              }
            }

            return {
              content: [
                {
                  type: "text",
                  text: `💾 Checkpoint saved!\n\n📌 State captured:\n- Intent: ${lastIntent}\n- Goal: ${currentGoal}\n${progress ? `- Progress: ${progress}\n` : ""}${location ? `- Location: ${location}\n` : ""}${nextPlannedAction ? `- Next: ${nextPlannedAction}\n` : ""}\nWhen you reconnect, you'll resume from this point.`,
                },
              ],
              details: { success: true, checkpoint: { lastIntent, currentGoal } },
            };
          }

          case "orient": {
            if (!platformBackend) {
              return {
                content: [{ type: "text", text: "Orient requires platform connection" }],
                details: { success: false },
              };
            }
            const orientResult = await platformBackend.orient();
            return {
              content: [{ type: "text", text: orientResult.text }],
              details: { success: orientResult.success },
            };
          }

          case "propose_goal": {
            const { goalDescription, goalPriority = "medium", poolId = "default" } = params;

            if (!goalDescription) {
              return {
                content: [
                  {
                    type: "text",
                    text: "❌ Error: 'goalDescription' is required for 'propose_goal' action",
                  },
                ],
                details: { success: false, error: "Missing goalDescription" },
              };
            }

            const goalId = await memoryStorage.proposeTeamGoal(
              goalDescription,
              goalPriority,
              poolId,
            );

            return {
              content: [
                {
                  type: "text",
                  text: `🎯 Team goal proposed!\n\nGoal ID: ${goalId}\nDescription: ${goalDescription}\nPriority: ${goalPriority}\n\nYour teammates will be notified. They can vote using:\nmemory(action: "vote_goal", goalId: "${goalId}", vote: "agree" or "disagree")`,
                },
              ],
              details: { success: true, goalId, description: goalDescription },
            };
          }

          case "vote_goal": {
            const { goalId, vote, poolId = "default" } = params;

            if (!goalId || !vote) {
              return {
                content: [
                  {
                    type: "text",
                    text: "❌ Error: 'goalId' and 'vote' are required for 'vote_goal' action",
                  },
                ],
                details: { success: false, error: "Missing parameters" },
              };
            }

            const success = await memoryStorage.voteOnTeamGoal(goalId, vote, poolId);

            if (!success) {
              return {
                content: [
                  {
                    type: "text",
                    text: `❌ Failed to vote on goal ${goalId}. Goal may not exist or voting already closed.`,
                  },
                ],
                details: { success: false, error: "Vote failed" },
              };
            }

            return {
              content: [
                {
                  type: "text",
                  text: `✅ Vote recorded: ${vote} on goal ${goalId}\n\nCheck if quorum reached using:\nmemory(action: "get_goals", goalStatus: "active")`,
                },
              ],
              details: { success: true, goalId, vote },
            };
          }

          case "get_goals": {
            const { goalStatus, poolId = "default" } = params;

            const goals = await memoryStorage.getTeamGoals(goalStatus, poolId);

            if (goals.length === 0) {
              return {
                content: [
                  {
                    type: "text",
                    text: goalStatus
                      ? `📋 No team goals with status '${goalStatus}'`
                      : '📋 No team goals yet. Propose one with:\nmemory(action: "propose_goal", goalDescription: "...")',
                  },
                ],
                details: { success: true, count: 0, goals: [] },
              };
            }

            const formattedGoals = goals.map((g) => {
              const agreeVotes = Object.values(g.votes).filter((v) => v === "agree").length;
              const disagreeVotes = Object.values(g.votes).filter((v) => v === "disagree").length;
              const statusIcon =
                g.status === "active"
                  ? "✓"
                  : g.status === "proposed"
                    ? "⋯"
                    : g.status === "completed"
                      ? "✅"
                      : "❌";
              return `${statusIcon} [${g.id}] ${g.description}\n  Status: ${g.status} | Priority: ${g.priority}\n  Votes: ${agreeVotes} agree, ${disagreeVotes} disagree (need ${g.requiredQuorum} total)`;
            });

            return {
              content: [
                {
                  type: "text",
                  text: `📋 Team Goals:\n\n${formattedGoals.join("\n\n")}\n\nUse goal IDs to vote or delegate tasks.`,
                },
              ],
              details: { success: true, count: goals.length, goals },
            };
          }

          case "delegate_task": {
            const { goalId, taskDescription, assignTo, poolId = "default" } = params;

            if (!goalId || !taskDescription) {
              return {
                content: [
                  {
                    type: "text",
                    text: "❌ Error: 'goalId' and 'taskDescription' are required for 'delegate_task' action",
                  },
                ],
                details: { success: false, error: "Missing parameters" },
              };
            }

            try {
              const taskId = await memoryStorage.delegateTask(
                goalId,
                taskDescription,
                assignTo,
                poolId,
              );

              return {
                content: [
                  {
                    type: "text",
                    text: assignTo
                      ? `📝 Task delegated!\n\nTask ID: ${taskId}\nAssigned to: ${assignTo}\nDescription: ${taskDescription}\n\nThey can accept with:\nmemory(action: "accept_task", taskId: "${taskId}")`
                      : `📝 Task created!\n\nTask ID: ${taskId}\nStatus: Unassigned\nDescription: ${taskDescription}\n\nAny teammate can accept this task.`,
                  },
                ],
                details: { success: true, taskId, assignedTo: assignTo },
              };
            } catch (error: any) {
              return {
                content: [
                  {
                    type: "text",
                    text: `❌ Failed to delegate task: ${error.message}`,
                  },
                ],
                details: { success: false, error: error.message },
              };
            }
          }

          case "accept_task": {
            const { taskId, poolId = "default" } = params;

            if (!taskId) {
              return {
                content: [
                  {
                    type: "text",
                    text: "❌ Error: 'taskId' is required for 'accept_task' action",
                  },
                ],
                details: { success: false, error: "Missing taskId" },
              };
            }

            const success = await memoryStorage.acceptTask(taskId, poolId);

            if (!success) {
              return {
                content: [
                  {
                    type: "text",
                    text: `❌ Failed to accept task ${taskId}. Task may not exist or be assigned to someone else.`,
                  },
                ],
                details: { success: false, error: "Accept failed" },
              };
            }

            return {
              content: [
                {
                  type: "text",
                  text: `✅ Task accepted: ${taskId}\n\nUpdate progress with:\nmemory(action: "update_task", taskId: "${taskId}", taskStatus: "in_progress", taskProgress: "...")`,
                },
              ],
              details: { success: true, taskId },
            };
          }

          case "update_task": {
            const { taskId, taskStatus, taskProgress, poolId = "default" } = params;

            if (!taskId || !taskStatus) {
              return {
                content: [
                  {
                    type: "text",
                    text: "❌ Error: 'taskId' and 'taskStatus' are required for 'update_task' action",
                  },
                ],
                details: { success: false, error: "Missing parameters" },
              };
            }

            const success = await memoryStorage.updateTaskProgress(
              taskId,
              taskStatus,
              taskProgress,
              poolId,
            );

            if (!success) {
              return {
                content: [
                  {
                    type: "text",
                    text: `❌ Failed to update task ${taskId}. You may not be assigned to this task.`,
                  },
                ],
                details: { success: false, error: "Update failed" },
              };
            }

            const statusText =
              taskStatus === "completed"
                ? "Task completed! 🎉"
                : taskStatus === "failed"
                  ? "Task marked as failed"
                  : "Task progress updated";

            return {
              content: [
                {
                  type: "text",
                  text: `✅ ${statusText}\n\nTask ID: ${taskId}\nStatus: ${taskStatus}${taskProgress ? `\nProgress: ${taskProgress}` : ""}`,
                },
              ],
              details: { success: true, taskId, status: taskStatus },
            };
          }

          case "get_tasks": {
            const { poolId = "default" } = params;

            const tasks = await memoryStorage.getMyTasks(poolId);

            if (tasks.length === 0) {
              return {
                content: [
                  {
                    type: "text",
                    text: '📋 No tasks assigned to you.\n\nCheck team goals with:\nmemory(action: "get_goals")',
                  },
                ],
                details: { success: true, count: 0, tasks: [] },
              };
            }

            const formattedTasks = tasks.map((t) => {
              const statusIcon =
                t.status === "completed"
                  ? "✅"
                  : t.status === "in_progress"
                    ? "⋯"
                    : t.status === "accepted"
                      ? "✓"
                      : "○";
              return `${statusIcon} [${t.id}] ${t.description}\n  Status: ${t.status}${t.progress ? `\n  Progress: ${t.progress}` : ""}`;
            });

            return {
              content: [
                {
                  type: "text",
                  text: `📋 Your Tasks:\n\n${formattedTasks.join("\n\n")}\n\nUpdate progress with:\nmemory(action: "update_task", taskId: "...", taskStatus: "in_progress", taskProgress: "...")`,
                },
              ],
              details: { success: true, count: tasks.length, tasks },
            };
          }

          default:
            return {
              content: [
                {
                  type: "text",
                  text: `❌ Unknown action: ${action}`,
                },
              ],
              details: { success: false, error: "Unknown action" },
            };
        }
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `❌ Memory operation failed: ${error.message}`,
            },
          ],
          details: {
            success: false,
            error: error.message,
          },
        };
      }
    },
  };
}
