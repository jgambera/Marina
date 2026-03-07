import type { GroupManager } from "../../coordination/group-manager";
import type { TaskManager } from "../../coordination/task-manager";
import { header, separator } from "../../net/ansi";
import type { ArtilectDB } from "../../persistence/database";
import type { CommandDef, Entity, EntityId, EntityRank, RoomContext } from "../../types";

import {
  GENERATIVE_TEMPLATE,
  GRAPH_TEMPLATE,
  MEMGPT_TEMPLATE,
  SHARED_TEMPLATE,
} from "../../world/templates/memory";
import {
  BLACKBOARD_TEMPLATE,
  DEBATE_TEMPLATE,
  GASTOWN_TEMPLATE,
  GOOSETOWN_TEMPLATE,
  MAPREDUCE_TEMPLATE,
  NSED_TEMPLATE,
  PIPELINE_TEMPLATE,
  SWARM_TEMPLATE,
  SYMBIOSIS_TEMPLATE,
  type TemplateNote,
} from "../../world/templates/orchestration";

const VALID_ORCHESTRATIONS = new Set([
  "nsed",
  "goosetown",
  "gastown",
  "swarm",
  "pipeline",
  "debate",
  "mapreduce",
  "blackboard",
  "symbiosis",
  "custom",
]);
const VALID_MEMORY_ARCHS = new Set(["memgpt", "generative", "graph", "shared", "custom"]);

function getOrchestrationTemplate(name: string): TemplateNote[] | undefined {
  switch (name) {
    case "nsed":
      return NSED_TEMPLATE;
    case "goosetown":
      return GOOSETOWN_TEMPLATE;
    case "gastown":
      return GASTOWN_TEMPLATE;
    case "swarm":
      return SWARM_TEMPLATE;
    case "pipeline":
      return PIPELINE_TEMPLATE;
    case "debate":
      return DEBATE_TEMPLATE;
    case "mapreduce":
      return MAPREDUCE_TEMPLATE;
    case "blackboard":
      return BLACKBOARD_TEMPLATE;
    case "symbiosis":
      return SYMBIOSIS_TEMPLATE;
    default:
      return undefined;
  }
}

function getMemoryTemplate(name: string): TemplateNote[] | undefined {
  switch (name) {
    case "memgpt":
      return MEMGPT_TEMPLATE;
    case "generative":
      return GENERATIVE_TEMPLATE;
    case "graph":
      return GRAPH_TEMPLATE;
    case "shared":
      return SHARED_TEMPLATE;
    default:
      return undefined;
  }
}

function seedPoolWithNotes(
  db: ArtilectDB,
  poolId: string,
  author: string,
  notes: TemplateNote[],
): void {
  for (const note of notes) {
    db.addPoolNote(poolId, author, note.content, note.importance, note.type);
  }
}

export function projectCommand(deps: {
  getEntity: (id: string) => Entity | undefined;
  db?: ArtilectDB;
  taskManager?: TaskManager;
  groupManager?: GroupManager;
  promote?: (entityId: EntityId, rank: EntityRank) => void;
}): CommandDef {
  return {
    name: "project",
    aliases: ["proj"],
    help: "Projects combine tasks, groups, pools, and orchestration.\nUsage: project create|list|info | project <name> orchestrate|memory|join|status|propose|tasks\n\nExamples:\n  project create Alpha | Investigate grid patterns\n  project Alpha orchestrate nsed\n  project Alpha memory memgpt\n  project Alpha join\n  project Alpha status",
    handler: (ctx: RoomContext, input) => {
      const entity = deps.getEntity(input.entity);
      if (!entity) return;
      if (!deps.db) {
        ctx.send(input.entity, "Projects require database support.");
        return;
      }
      const db = deps.db;
      const tokens = input.tokens;
      const sub = tokens[0]?.toLowerCase();
      const rawFirst = tokens[0]; // preserve original case for project name

      if (!sub) {
        ctx.send(
          input.entity,
          "Usage: project create <name> | <desc> | project <name> orchestrate|memory|join|status|propose|tasks | project list | project info <name>",
        );
        return;
      }

      // ─── project list ──────────────────────────────────────────────
      if (sub === "list") {
        const projects = db.listProjects();
        if (projects.length === 0) {
          ctx.send(input.entity, "No projects exist yet.");
          return;
        }
        const lines = [
          header("Projects"),
          separator(),
          ...projects.map((p) => {
            const orch = p.orchestration !== "custom" ? ` [${p.orchestration}]` : "";
            const mem = p.memory_arch !== "custom" ? ` (${p.memory_arch})` : "";
            return `  ${p.name} — ${p.status}${orch}${mem}: ${p.description.slice(0, 50) || "(no description)"}`;
          }),
        ];
        ctx.send(input.entity, lines.join("\n"));
        return;
      }

      // ─── project create <name> | <description> ────────────────────
      if (sub === "create") {
        if (!deps.taskManager || !deps.groupManager) {
          ctx.send(input.entity, "Projects require task and group support.");
          return;
        }
        const rest = tokens.slice(1).join(" ");
        if (!rest) {
          ctx.send(input.entity, "Usage: project create <name> | <description>");
          return;
        }
        const pipeIdx = rest.indexOf("|");
        let name: string;
        let description: string;
        if (pipeIdx >= 0) {
          name = rest.slice(0, pipeIdx).trim();
          description = rest.slice(pipeIdx + 1).trim();
        } else {
          name = rest.trim();
          description = "";
        }

        if (!name || name.length < 2) {
          ctx.send(input.entity, "Project name must be at least 2 characters.");
          return;
        }

        // Check uniqueness
        const existing = db.getProjectByName(name);
        if (existing) {
          ctx.send(input.entity, `Project "${name}" already exists.`);
          return;
        }

        // 1. Create task bundle
        const bundle = deps.taskManager.create({
          title: name,
          description: description || `Project: ${name}`,
          creatorId: input.entity,
          creatorName: entity.name,
        });

        // 2. Create memory pool
        const poolId = `pool_project_${name.toLowerCase().replace(/\s+/g, "_")}_${Date.now()}`;
        db.createMemoryPool(poolId, `project:${name}`, entity.name);

        // 3. Create group (auto-creates channel + board)
        const groupId = `project_${name.toLowerCase().replace(/\s+/g, "_")}`;
        deps.groupManager.create({
          id: groupId,
          name: `project:${name}`,
          description: description || `Project: ${name}`,
          leaderId: input.entity,
        });

        // 4. Insert project row
        const projectId = `proj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        db.createProject({
          id: projectId,
          name,
          description,
          bundleId: bundle.id,
          poolId,
          groupId,
          createdBy: entity.name,
        });

        // 5. Seed pool with welcome note
        db.addPoolNote(
          poolId,
          entity.name,
          `Project "${name}" created by ${entity.name}. ${description || "No description provided."} Use 'project ${name} orchestrate <pattern>' to set orchestration and 'project ${name} memory <arch>' to set memory architecture. Use 'project ${name} join' to join the team.`,
          9,
          "fact",
        );

        deps.promote?.(input.entity, 2);

        const lines = [
          header(`Project "${name}" created`),
          separator(),
          `  Bundle: #${bundle.id}`,
          `  Pool: project:${name}`,
          `  Group: project:${name}`,
          "",
          `Use 'project ${name} orchestrate <pattern>' to set orchestration.`,
          `Use 'project ${name} memory <arch>' to set memory architecture.`,
        ];
        ctx.send(input.entity, lines.join("\n"));
        return;
      }

      // ─── project info <name> ──────────────────────────────────────
      if (sub === "info") {
        const name = tokens.slice(1).join(" ");
        if (!name) {
          ctx.send(input.entity, "Usage: project info <name>");
          return;
        }
        const project = db.getProjectByName(name);
        if (!project) {
          ctx.send(input.entity, `Project "${name}" not found.`);
          return;
        }
        const lines = [
          header(`Project: ${project.name}`),
          project.description || "(no description)",
          separator(),
          `  Status: ${project.status}`,
          `  Orchestration: ${project.orchestration}`,
          `  Memory: ${project.memory_arch}`,
          `  Created by: ${project.created_by}`,
          `  Bundle: #${project.bundle_id ?? "none"}`,
          `  Pool: ${project.pool_id ? `project:${project.name}` : "none"}`,
          `  Group: ${project.group_id ?? "none"}`,
        ];

        // Show bundle progress if available
        if (project.bundle_id && deps.taskManager) {
          const status = deps.taskManager.getBundleStatus(project.bundle_id);
          if (status.total > 0) {
            lines.push(
              `  Tasks: ${status.completed}/${status.total} completed (${status.open} open)`,
            );
          }
        }

        // Show group members if available
        if (project.group_id && deps.groupManager) {
          const members = deps.groupManager.getMembers(project.group_id);
          lines.push(`  Team: ${members.length} member(s)`);
        }

        ctx.send(input.entity, lines.join("\n"));
        return;
      }

      // ─── project <name> <action> [args] ───────────────────────────
      // Everything else: first token is project name, second is action
      const projectName = rawFirst!;
      const action = tokens[1]?.toLowerCase();
      const project = db.getProjectByName(projectName);

      if (!project) {
        ctx.send(
          input.entity,
          `Project "${projectName}" not found. Use 'project list' to see projects.`,
        );
        return;
      }

      if (!action) {
        // Default to showing info
        ctx.send(input.entity, `Use 'project info ${projectName}' for details.`);
        return;
      }

      switch (action) {
        case "orchestrate": {
          const pattern = tokens[2]?.toLowerCase();
          if (!pattern) {
            ctx.send(
              input.entity,
              "Usage: project <name> orchestrate nsed|goosetown|gastown|swarm|pipeline|debate|mapreduce|blackboard|symbiosis|custom <desc>",
            );
            return;
          }

          if (pattern === "custom") {
            const desc = tokens.slice(3).join(" ");
            if (!desc) {
              ctx.send(input.entity, "Usage: project <name> orchestrate custom <description>");
              return;
            }
            db.updateProjectOrchestration(project.id, "custom");
            if (project.pool_id) {
              db.addPoolNote(
                project.pool_id,
                entity.name,
                `Custom orchestration: ${desc}`,
                8,
                "skill",
              );
            }
            ctx.send(input.entity, `Set custom orchestration for "${project.name}".`);
            return;
          }

          if (!VALID_ORCHESTRATIONS.has(pattern)) {
            ctx.send(
              input.entity,
              `Unknown orchestration pattern. Valid: ${[...VALID_ORCHESTRATIONS].join(", ")}`,
            );
            return;
          }

          db.updateProjectOrchestration(project.id, pattern);
          const template = getOrchestrationTemplate(pattern);
          if (template && project.pool_id) {
            seedPoolWithNotes(db, project.pool_id, entity.name, template);
          }
          ctx.send(
            input.entity,
            `Set orchestration to "${pattern}" for "${project.name}". Pool seeded with ${pattern.toUpperCase()} conventions.`,
          );
          return;
        }

        case "memory": {
          const arch = tokens[2]?.toLowerCase();
          if (!arch) {
            ctx.send(
              input.entity,
              "Usage: project <name> memory memgpt|generative|graph|shared|custom <desc>",
            );
            return;
          }

          if (arch === "custom") {
            const desc = tokens.slice(3).join(" ");
            if (!desc) {
              ctx.send(input.entity, "Usage: project <name> memory custom <description>");
              return;
            }
            db.updateProjectMemoryArch(project.id, "custom");
            if (project.pool_id) {
              db.addPoolNote(
                project.pool_id,
                entity.name,
                `Custom memory architecture: ${desc}`,
                8,
                "skill",
              );
            }
            ctx.send(input.entity, `Set custom memory architecture for "${project.name}".`);
            return;
          }

          if (!VALID_MEMORY_ARCHS.has(arch)) {
            ctx.send(
              input.entity,
              `Unknown memory architecture. Valid: ${[...VALID_MEMORY_ARCHS].join(", ")}`,
            );
            return;
          }

          db.updateProjectMemoryArch(project.id, arch);
          const template = getMemoryTemplate(arch);
          if (template && project.pool_id) {
            seedPoolWithNotes(db, project.pool_id, entity.name, template);
          }
          ctx.send(
            input.entity,
            `Set memory architecture to "${arch}" for "${project.name}". Pool seeded with ${arch} conventions.`,
          );
          return;
        }

        case "join": {
          if (!deps.groupManager) {
            ctx.send(input.entity, "Groups not available.");
            return;
          }
          if (!project.group_id) {
            ctx.send(input.entity, "This project has no group.");
            return;
          }
          const group = deps.groupManager.get(project.group_id);
          if (!group) {
            ctx.send(input.entity, "Project group not found.");
            return;
          }
          if (deps.groupManager.isMember(group.id, input.entity)) {
            ctx.send(input.entity, `You are already in project "${project.name}".`);
            return;
          }
          deps.groupManager.addMember(group.id, input.entity);

          // Send orientation from pool
          const lines = [
            header(`Joined project "${project.name}"`),
            separator(),
            `  Orchestration: ${project.orchestration}`,
            `  Memory: ${project.memory_arch}`,
          ];

          if (project.pool_id) {
            // Show recent pool notes as orientation
            const recent = db.recallPoolNotes(
              project.pool_id,
              "project conventions orchestration memory",
            );
            if (recent.length > 0) {
              lines.push("", "Project knowledge:");
              for (const note of recent.slice(0, 5)) {
                lines.push(`  - ${note.content.slice(0, 80)}`);
              }
            }
          }

          lines.push(
            "",
            `Use 'pool project:${project.name} recall <topic>' to explore project knowledge.`,
          );
          ctx.send(input.entity, lines.join("\n"));
          return;
        }

        case "status": {
          const lines = [
            header(`${project.name} Status`),
            separator(),
            `  Status: ${project.status}`,
            `  Orchestration: ${project.orchestration}`,
            `  Memory: ${project.memory_arch}`,
          ];

          // Bundle progress
          if (project.bundle_id && deps.taskManager) {
            const bundleStatus = deps.taskManager.getBundleStatus(project.bundle_id);
            if (bundleStatus.total > 0) {
              lines.push(
                `  Tasks: ${bundleStatus.completed}/${bundleStatus.total} (${bundleStatus.open} open)`,
              );
            } else {
              lines.push("  Tasks: none yet");
            }
          }

          // Team
          if (project.group_id && deps.groupManager) {
            const members = deps.groupManager.getMembers(project.group_id);
            lines.push(`  Team: ${members.length} member(s)`);
          }

          ctx.send(input.entity, lines.join("\n"));
          return;
        }

        case "propose": {
          const text = tokens.slice(2).join(" ");
          if (!text) {
            ctx.send(input.entity, "Usage: project <name> propose <text>");
            return;
          }
          if (!project.group_id || !deps.groupManager) {
            ctx.send(input.entity, "Project group not available.");
            return;
          }
          const group = deps.groupManager.get(project.group_id);
          if (!group || !group.boardId) {
            ctx.send(input.entity, "Project board not available.");
            return;
          }
          // Post to the project's group board
          const postId = db.createBoardPost({
            boardId: group.boardId,
            authorId: input.entity,
            authorName: entity.name,
            title: `[proposal] ${text.slice(0, 80)}`,
            body: text,
            tags: ["proposal"],
          });
          ctx.send(input.entity, `Proposal posted to project board (post #${postId}).`);
          return;
        }

        case "tasks": {
          if (!project.bundle_id || !deps.taskManager) {
            ctx.send(input.entity, "No tasks for this project.");
            return;
          }
          const children = deps.taskManager.listChildren(project.bundle_id);
          if (children.length === 0) {
            ctx.send(input.entity, `Project "${project.name}" has no tasks yet.`);
            return;
          }
          const bundleStatus = deps.taskManager.getBundleStatus(project.bundle_id);
          const lines = [
            header(`${project.name} Tasks`),
            `Progress: ${bundleStatus.completed}/${bundleStatus.total} completed`,
            separator(),
            ...children.map((t) => {
              const mark = t.status === "completed" ? "[x]" : "[ ]";
              return `  ${mark} #${t.id}: ${t.title} (${t.status})`;
            }),
          ];
          ctx.send(input.entity, lines.join("\n"));
          return;
        }

        default:
          ctx.send(
            input.entity,
            `Unknown project action "${action}". Use: orchestrate, memory, join, status, propose, tasks`,
          );
      }
    },
  };
}
