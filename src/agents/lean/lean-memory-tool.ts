/**
 * Lean Memory Tool — Platform-only memory that writes exclusively to Marina.
 *
 * Drops all local JSON storage, dual-write fallback, and local-only operations.
 * All state lives on the Marina server (notes, recall, reflect, skills, pools).
 */

import type { AgentTool } from "@mariozechner/pi-agent-core";
import { type Static, Type } from "@sinclair/typebox";
import type { PlatformMemoryBackend } from "../agent/memory-platform";
import { importanceLevelToNum } from "../utils/memory-utils";

const leanMemorySchema = Type.Object({
  action: Type.Union(
    [
      Type.Literal("write"),
      Type.Literal("search"),
      Type.Literal("reflect"),
      Type.Literal("orient"),
      Type.Literal("skill_store"),
      Type.Literal("skill_search"),
    ],
    {
      description:
        "Action: write (save note), search (recall), reflect (synthesize), orient (memory health summary), skill_store (save skill), skill_search (find skills)",
    },
  ),
  content: Type.Optional(
    Type.String({
      description: "Content to write or reflect on (required for write/reflect)",
    }),
  ),
  query: Type.Optional(
    Type.String({
      description: "Search query (required for search/skill_search)",
    }),
  ),
  category: Type.Optional(
    Type.Union(
      [
        Type.Literal("observation"),
        Type.Literal("inference"),
        Type.Literal("decision"),
        Type.Literal("fact"),
        Type.Literal("principle"),
        Type.Literal("episode"),
      ],
      {
        description: "Note type (for write). Maps to Marina note types.",
      },
    ),
  ),
  importance: Type.Optional(
    Type.Union([Type.Literal("low"), Type.Literal("medium"), Type.Literal("high")], {
      description: "Importance level (default: medium, for write)",
    }),
  ),
  tags: Type.Optional(
    Type.Array(Type.String(), {
      description: "Tags for the note (for write)",
    }),
  ),
  // Skill store params
  skill_name: Type.Optional(
    Type.String({
      description: "Skill name (for skill_store)",
    }),
  ),
  skill_description: Type.Optional(
    Type.String({
      description: "Skill description (for skill_store)",
    }),
  ),
  skill_actions: Type.Optional(
    Type.String({
      description: "Skill actions/steps (for skill_store)",
    }),
  ),
});

export type LeanMemoryInput = Static<typeof leanMemorySchema>;

export function createLeanMemoryTool(
  platformMemory: PlatformMemoryBackend,
): AgentTool<typeof leanMemorySchema> {
  return {
    name: "memory",
    label: "Platform Memory",
    description: `Platform memory — all data lives on Marina's server, persists across sessions.

**Actions:**
- **write** — Save a note: category + content, optional importance + tags
- **search** — Recall notes by query (scored retrieval with graph spreading + intent detection)
- **reflect** — Synthesize notes on a topic into an episode reflection
- **orient** — Memory health summary: recent notes, vitality zones, knowledge graph stats
- **skill_store** — Save a reusable skill (name + description + actions)
- **skill_search** — Find relevant skills by query

**Categories (note types):**
- **observation** — Environmental details, entity behaviors, room notes
- **inference** — Learnings, strategies, conclusions drawn from evidence
- **decision** — Directives, preferences, goals, choices made
- **fact** — Verified data: maps, prices, command syntax, item stats
- **principle** — Distilled strategic principles (high importance)
- **episode** — Narrative summaries of significant experiences

**Examples:**
- Write: {action: "write", category: "observation", content: "Library has a hidden exit behind bookshelf", importance: "high", tags: ["secrets"]}
- Search: {action: "search", query: "hidden exits"}
- Reflect: {action: "reflect", content: "my exploration strategy"}
- Skill store: {action: "skill_store", skill_name: "map_area", skill_description: "Systematically map a new area", skill_actions: "look; note exits; move to each exit; repeat"}
- Skill search: {action: "skill_search", query: "mapping"}

**Tip:** For other memory operations (linking, evolving, pools, tasks), use marina_command directly:
- \`note link <id1> <id2> <relationship>\`
- \`note evolve <id>\`
- \`pool <name> add <content>\`
- \`pool <name> recall <query>\``,

    parameters: leanMemorySchema,

    async execute(_toolCallId: string, params: LeanMemoryInput) {
      const { action } = params;

      try {
        switch (action) {
          case "write": {
            const { category = "observation", content, importance = "medium", tags = [] } = params;
            if (!content) {
              return {
                content: [{ type: "text", text: "Error: 'content' is required for write action" }],
                details: { success: false },
              };
            }

            const imp = importanceLevelToNum(importance);
            const result = await platformMemory.write(category, content, importance, tags);
            const noteInfo = result.noteId ? `Note #${result.noteId}` : "Note saved";

            return {
              content: [
                {
                  type: "text",
                  text: `${noteInfo} | ${category} !${imp} | ${content.slice(0, 80)}${content.length > 80 ? "..." : ""}`,
                },
              ],
              details: { success: result.success, noteId: result.noteId },
            };
          }

          case "search": {
            const { query } = params;
            if (!query) {
              return {
                content: [{ type: "text", text: "Error: 'query' is required for search action" }],
                details: { success: false },
              };
            }

            const result = await platformMemory.search(query);
            if (!result.results || result.results.length === 0) {
              return {
                content: [{ type: "text", text: `No notes found for "${query}"` }],
                details: { success: true, count: 0 },
              };
            }

            const lines = result.results
              .slice(0, 10)
              .map(
                (r) =>
                  `#${r.id} [imp=${r.importance} score=${r.score?.toFixed(2) ?? "?"}]: ${r.content}`,
              );

            return {
              content: [
                {
                  type: "text",
                  text: `Found ${result.results.length} notes:\n${lines.join("\n")}`,
                },
              ],
              details: { success: true, count: result.results.length },
            };
          }

          case "reflect": {
            const { content } = params;
            const result = await platformMemory.reflect(content);
            const noteInfo = result.noteId ? ` (Note #${result.noteId})` : "";

            return {
              content: [
                {
                  type: "text",
                  text: `Reflection created${noteInfo}\n${result.text.slice(0, 200)}`,
                },
              ],
              details: { success: result.success, noteId: result.noteId },
            };
          }

          case "orient": {
            const result = await platformMemory.orient();
            return {
              content: [{ type: "text", text: result.text }],
              details: { success: result.success },
            };
          }

          case "skill_store": {
            const { skill_name, skill_description, skill_actions } = params;
            if (!skill_name || !skill_description || !skill_actions) {
              return {
                content: [
                  {
                    type: "text",
                    text: "Error: skill_name, skill_description, and skill_actions are all required",
                  },
                ],
                details: { success: false },
              };
            }

            const result = await platformMemory.storeSkill(
              skill_name,
              skill_description,
              skill_actions,
            );
            const skillInfo = result.noteId ? `Skill #${result.noteId}` : "Skill stored";

            return {
              content: [
                { type: "text", text: `${skillInfo}: ${skill_name} — ${skill_description}` },
              ],
              details: { success: result.success, noteId: result.noteId },
            };
          }

          case "skill_search": {
            const { query } = params;
            if (!query) {
              return {
                content: [
                  { type: "text", text: "Error: 'query' is required for skill_search action" },
                ],
                details: { success: false },
              };
            }

            const result = await platformMemory.searchSkills(query);
            if (!result.results || result.results.length === 0) {
              return {
                content: [{ type: "text", text: `No skills found for "${query}"` }],
                details: { success: true, count: 0 },
              };
            }

            const lines = result.results
              .slice(0, 5)
              .map(
                (r) =>
                  `#${r.id} [imp=${r.importance} score=${r.score?.toFixed(2) ?? "?"}]: ${r.content}`,
              );

            return {
              content: [
                {
                  type: "text",
                  text: `Found ${result.results.length} skills:\n${lines.join("\n")}`,
                },
              ],
              details: { success: true, count: result.results.length },
            };
          }

          default:
            return {
              content: [{ type: "text", text: `Unknown action: ${action}` }],
              details: { success: false },
            };
        }
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Memory operation failed: ${error.message}` }],
          details: { success: false, error: error.message },
        };
      }
    },
  };
}
