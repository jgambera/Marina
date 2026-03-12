import type { TaskManager } from "../../coordination/task-manager";
import { header, separator } from "../../net/ansi";
import type {
  CommandDef,
  EngineEvent,
  Entity,
  EntityId,
  EntityRank,
  RoomContext,
} from "../../types";

export function taskCommand(
  tasks: TaskManager,
  findEntity: (name: string) => Entity | undefined,
  logEvent?: (event: EngineEvent) => void,
  promote?: (entityId: EntityId, rank: EntityRank) => void,
): CommandDef {
  return {
    name: "task",
    aliases: [],
    help: "Manage tasks with create/claim/submit workflow.\nUsage: task list|info|create|claim|submit|approve|reject|cancel|bundle|assign|children|standing\n\nExamples:\n  task create Map the grid | Explore all sectors and document exits\n  task create Fix the bridge | Description !10 bounty\n  task claim 3\n  task submit 3 All sectors documented\n  task standing\n  task list completed",
    handler: (ctx: RoomContext, input) => {
      const self = ctx.getEntity(input.entity);
      if (!self) return;

      const tokens = input.tokens;
      const sub = tokens[0]?.toLowerCase() ?? "list";

      switch (sub) {
        case "list": {
          const arg = tokens[1]?.toLowerCase();
          const validStatuses = ["open", "completed", "cancelled", "claimed"];
          const status = arg && validStatuses.includes(arg) ? arg : "open";
          const groupId = arg && !validStatuses.includes(arg) ? tokens[1] : tokens[2];
          const taskList = tasks.list({
            status,
            groupId,
            orderByStanding: true,
          });
          if (taskList.length === 0) {
            ctx.send(input.entity, `No ${status} tasks.`);
            return;
          }
          const lines = [
            header(`${status.charAt(0).toUpperCase() + status.slice(1)} Tasks`),
            separator(),
            ...taskList.map((t) => {
              const group = t.groupId ? ` [${t.groupId}]` : "";
              const bounty =
                t.validationMode === "bounty"
                  ? ` [bounty${t.standing > 0 ? ` !${t.standing}` : ""}]`
                  : "";
              return `  #${t.id}: ${t.title}${bounty} — by ${t.creatorName}${group}`;
            }),
          ];
          ctx.send(input.entity, lines.join("\n"));
          return;
        }

        case "info": {
          const idStr = tokens[1];
          if (!idStr) {
            ctx.send(input.entity, "Usage: task info <id>");
            return;
          }
          const id = Number.parseInt(idStr, 10);
          const task = tasks.get(id);
          if (!task) {
            ctx.send(input.entity, `Task #${idStr} not found.`);
            return;
          }
          const claims = tasks.getClaims(task.id);
          const standingLabel = task.standing > 0 ? ` | Standing: !${task.standing}` : "";
          const lines = [
            header(`Task #${task.id}: ${task.title}`),
            `Status: ${task.status} | Creator: ${task.creatorName} | Validation: ${task.validationMode}${standingLabel}`,
            separator(),
            task.description || "(no description)",
          ];
          if (task.parentTaskId) {
            lines.push(`Parent bundle: #${task.parentTaskId}`);
          }
          const bundleStatus = tasks.getBundleStatus(task.id);
          if (bundleStatus.total > 0) {
            lines.push(
              `Children: ${bundleStatus.completed}/${bundleStatus.total} completed (${bundleStatus.open} open)`,
            );
          }
          if (task.validationMode === "bounty" && claims.length > 0) {
            const submissions = claims.filter((c) => c.status === "submitted").length;
            lines.push(`Submissions: ${submissions}/${claims.length} claims`);
          }
          if (claims.length > 0) {
            lines.push("", "Claims:");
            for (const c of claims) {
              lines.push(
                `  ${c.entityName}: ${c.status}${c.submissionText ? ` — "${c.submissionText}"` : ""}`,
              );
            }
          }
          ctx.send(input.entity, lines.join("\n"));
          return;
        }

        case "create": {
          // task create <title> | <description> [!N] [bounty]
          const rest = tokens.slice(1).join(" ");
          if (!rest) {
            ctx.send(input.entity, "Usage: task create <title> | <description> [!N bounty]");
            return;
          }
          const pipeIdx = rest.indexOf("|");
          let title: string;
          let rawDesc: string;
          if (pipeIdx >= 0) {
            title = rest.slice(0, pipeIdx).trim();
            rawDesc = rest.slice(pipeIdx + 1).trim();
          } else {
            title = rest;
            rawDesc = "";
          }

          // Parse !N standing and bounty keyword from description
          let standing = 0;
          let isBounty = false;
          const standingMatch = rawDesc.match(/!(\d+)/);
          if (standingMatch?.[1]) {
            standing = Number.parseInt(standingMatch[1], 10);
            rawDesc = rawDesc.replace(standingMatch[0], "").trim();
          }
          if (/\bbounty\b/i.test(rawDesc)) {
            isBounty = true;
            rawDesc = rawDesc.replace(/\bbounty\b/i, "").trim();
          }

          const task = tasks.create({
            title,
            description: rawDesc,
            creatorId: input.entity,
            creatorName: self.name,
            validationMode: isBounty ? "bounty" : undefined,
            standing: standing > 0 ? standing : undefined,
          });
          promote?.(input.entity, 2);
          const bountyLabel = isBounty ? ` [bounty !${standing}]` : "";
          ctx.send(input.entity, `Created task #${task.id}: "${title}"${bountyLabel}.`);
          return;
        }

        case "claim": {
          const idStr = tokens[1];
          if (!idStr) {
            ctx.send(input.entity, "Usage: task claim <id>");
            return;
          }
          const id = Number.parseInt(idStr, 10);
          const claim = tasks.claim(id, input.entity, self.name);
          if (!claim) {
            ctx.send(
              input.entity,
              `Cannot claim task #${idStr}. It may not exist, not be open, or you already claimed it.`,
            );
            return;
          }
          promote?.(input.entity, 2);
          ctx.send(input.entity, `Claimed task #${id}.`);
          logEvent?.({
            type: "task_claimed",
            entity: input.entity,
            taskId: id,
            timestamp: Date.now(),
          });
          return;
        }

        case "submit": {
          const idStr = tokens[1];
          const text = tokens.slice(2).join(" ");
          if (!idStr || !text) {
            ctx.send(input.entity, "Usage: task submit <id> <text>");
            return;
          }
          const id = Number.parseInt(idStr, 10);
          if (tasks.submit(id, input.entity, text)) {
            ctx.send(input.entity, `Submitted work for task #${id}.`);
            logEvent?.({
              type: "task_submitted",
              entity: input.entity,
              taskId: id,
              timestamp: Date.now(),
            });
          } else {
            ctx.send(
              input.entity,
              `Cannot submit for task #${idStr}. You may not have claimed it or already submitted.`,
            );
          }
          return;
        }

        case "approve": {
          const idStr = tokens[1];
          const claimantName = tokens[2];
          if (!idStr || !claimantName) {
            ctx.send(input.entity, "Usage: task approve <id> <claimant>");
            return;
          }
          const id = Number.parseInt(idStr, 10);
          const target = findEntity(claimantName);
          if (!target) {
            ctx.send(input.entity, `Player "${claimantName}" not found.`);
            return;
          }
          if (tasks.approveSubmission(id, target.id, input.entity)) {
            ctx.send(input.entity, `Approved ${target.name}'s submission for task #${id}.`);
            ctx.send(target.id, `Your submission for task #${id} was approved!`);
            logEvent?.({
              type: "task_approved",
              entity: input.entity,
              taskId: id,
              timestamp: Date.now(),
            });
          } else {
            ctx.send(
              input.entity,
              `Cannot approve. You may not be the creator or the submission doesn't exist.`,
            );
          }
          return;
        }

        case "reject": {
          const idStr = tokens[1];
          const claimantName = tokens[2];
          if (!idStr || !claimantName) {
            ctx.send(input.entity, "Usage: task reject <id> <claimant>");
            return;
          }
          const id = Number.parseInt(idStr, 10);
          const target = findEntity(claimantName);
          if (!target) {
            ctx.send(input.entity, `Player "${claimantName}" not found.`);
            return;
          }
          if (tasks.rejectSubmission(id, target.id, input.entity)) {
            ctx.send(input.entity, `Rejected ${target.name}'s submission for task #${id}.`);
            ctx.send(target.id, `Your submission for task #${id} was rejected.`);
            logEvent?.({
              type: "task_rejected",
              entity: input.entity,
              taskId: id,
              timestamp: Date.now(),
            });
          } else {
            ctx.send(
              input.entity,
              `Cannot reject. You may not be the creator or the submission doesn't exist.`,
            );
          }
          return;
        }

        case "cancel": {
          const idStr = tokens[1];
          if (!idStr) {
            ctx.send(input.entity, "Usage: task cancel <id>");
            return;
          }
          const id = Number.parseInt(idStr, 10);
          if (tasks.cancel(id, input.entity)) {
            ctx.send(input.entity, `Cancelled task #${id}.`);
          } else {
            ctx.send(
              input.entity,
              `Cannot cancel task #${idStr}. You may not be the creator or it's not open.`,
            );
          }
          return;
        }

        case "bundle": {
          const rest = tokens.slice(1).join(" ");
          if (!rest) {
            ctx.send(input.entity, "Usage: task bundle <title> | <description>");
            return;
          }
          const pipeIdx = rest.indexOf("|");
          let title: string;
          let description: string;
          if (pipeIdx >= 0) {
            title = rest.slice(0, pipeIdx).trim();
            description = rest.slice(pipeIdx + 1).trim();
          } else {
            title = rest;
            description = "";
          }
          const task = tasks.create({
            title,
            description,
            creatorId: input.entity,
            creatorName: self.name,
          });
          ctx.send(input.entity, `Created bundle #${task.id}: "${title}".`);
          return;
        }

        case "assign": {
          const idStr = tokens[1];
          const bundleIdStr = tokens[2];
          if (!idStr || !bundleIdStr) {
            ctx.send(input.entity, "Usage: task assign <id> <bundle_id>");
            return;
          }
          const id = Number.parseInt(idStr, 10);
          const bundleId = Number.parseInt(bundleIdStr, 10);
          if (tasks.assignToBundle(id, bundleId, input.entity)) {
            ctx.send(input.entity, `Assigned task #${id} to bundle #${bundleId}.`);
          } else {
            ctx.send(
              input.entity,
              `Cannot assign. You may not be the task creator or the bundle doesn't exist.`,
            );
          }
          return;
        }

        case "children": {
          const idStr = tokens[1];
          if (!idStr) {
            ctx.send(input.entity, "Usage: task children <id>");
            return;
          }
          const id = Number.parseInt(idStr, 10);
          const parent = tasks.get(id);
          if (!parent) {
            ctx.send(input.entity, `Task #${idStr} not found.`);
            return;
          }
          const children = tasks.listChildren(id);
          if (children.length === 0) {
            ctx.send(input.entity, `Bundle #${id} has no children.`);
            return;
          }
          const status = tasks.getBundleStatus(id);
          const lines = [
            header(`Bundle #${id}: ${parent.title}`),
            `Progress: ${status.completed}/${status.total} completed`,
            separator(),
            ...children.map((t) => {
              const mark = t.status === "completed" ? "[x]" : "[ ]";
              return `  ${mark} #${t.id}: ${t.title} (${t.status})`;
            }),
          ];
          ctx.send(input.entity, lines.join("\n"));
          return;
        }

        case "standing": {
          const leaderboard = tasks.getStandingLeaderboard(10);
          if (leaderboard.length === 0) {
            ctx.send(input.entity, "No standing earned yet.");
            return;
          }
          const lines = [
            header("Standing Leaderboard"),
            separator(),
            ...leaderboard.map(
              (e, i) => `  ${i + 1}. ${e.entityName}: ${e.total} standing (${e.taskCount} tasks)`,
            ),
          ];
          const myStanding = tasks.getEntityStanding(input.entity);
          if (myStanding > 0) {
            lines.push("", `  Your standing: ${myStanding}`);
          }
          ctx.send(input.entity, lines.join("\n"));
          return;
        }

        default:
          ctx.send(
            input.entity,
            "Usage: task list|info|create|claim|submit|approve|reject|cancel|bundle|assign|children|standing [args]",
          );
      }
    },
  };
}
