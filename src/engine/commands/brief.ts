import type { TaskManager } from "../../coordination/task-manager";
import type { ArtilectDB } from "../../persistence/database";
import type { CommandDef, Entity, EntityId, RoomContext } from "../../types";

/**
 * Brief: lightweight orientation signal.
 *
 * On login (auto-sent), outputs a single-line compass — just enough for
 * the agent to know what continuation commands to issue. No walls of text.
 *
 * When invoked manually (`brief full`), shows the full briefing with details.
 */
export function briefCommand(deps: {
  getEntity: (id: EntityId) => Entity | undefined;
  db?: ArtilectDB;
  taskManager?: TaskManager;
  getOnlineAgents: () => Entity[];
}): CommandDef {
  return {
    name: "brief",
    aliases: ["orient", "sitrep"],
    help: "Get oriented. Shows the current shape of the world — who is here, what exists, where to go next.",
    handler: (ctx: RoomContext, input) => {
      const entity = deps.getEntity(input.entity);
      if (!entity) return;

      const full = input.tokens.length > 0;
      if (full) {
        sendFullBrief(ctx, input.entity, entity, deps);
      } else {
        sendCompass(ctx, input.entity, entity, deps);
      }
    },
  };
}

/** Compass: single-line signal with counts, no content dump. */
function sendCompass(
  ctx: RoomContext,
  eid: EntityId,
  entity: Entity,
  deps: {
    db?: ArtilectDB;
    taskManager?: TaskManager;
    getOnlineAgents: () => Entity[];
  },
): void {
  const parts: string[] = [];

  const online = deps.getOnlineAgents();
  const otherCount = online.filter((e) => e.id !== eid).length;
  parts.push(otherCount > 0 ? `${otherCount} online` : "alone");

  let hasMemory = false;
  if (deps.db) {
    const db = deps.db;
    const projects = db.listProjects().filter((p) => p.status === "active");
    if (projects.length > 0) parts.push(`${projects.length} projects`);

    if (deps.taskManager) {
      const open = deps.taskManager.list({ status: "open" });
      const bounties = open.filter((t) => t.validationMode === "bounty");
      if (bounties.length > 0 && open.length > bounties.length) {
        parts.push(`${bounties.length} bounties, ${open.length - bounties.length} tasks`);
      } else if (bounties.length > 0) {
        parts.push(`${bounties.length} bounties`);
      } else if (open.length > 0) {
        parts.push(`${open.length} open tasks`);
      }
    }

    // Personal: show claimed task count
    const myClaims = db.getActiveClaimsByName(entity.name);
    if (myClaims.length > 0) parts.push(`${myClaims.length} yours`);

    const pools = db.listMemoryPools();
    if (pools.length > 0) parts.push(`${pools.length} pools`);

    const memoryCount = db.listCoreMemory(entity.name).length;
    if (memoryCount > 0) {
      parts.push(`${memoryCount} memories`);
      hasMemory = true;
    }
  }

  const compass = parts.join(" · ");

  // After the compass line, show the agent's goal if they have one
  const lines: string[] = [`[${compass}]`];
  if (deps.db) {
    const goalEntry = deps.db.getCoreMemory(entity.name, "goal");
    if (goalEntry) {
      lines.push(`Goal: ${goalEntry.value.slice(0, 80)}`);
    }
  }

  if (!hasMemory) {
    lines.push("Hint: help | pool guide recall getting started | brief full");
  }

  ctx.send(eid, lines.join("\n"));
}

/** Full brief: invoked manually via `brief full` or `sitrep full`. */
function sendFullBrief(
  ctx: RoomContext,
  eid: EntityId,
  entity: Entity,
  deps: {
    db?: ArtilectDB;
    taskManager?: TaskManager;
    getOnlineAgents: () => Entity[];
  },
): void {
  const lines: string[] = [];

  const online = deps.getOnlineAgents();
  if (online.length > 1) {
    const others = online.filter((e) => e.id !== eid);
    const names = others
      .slice(0, 10)
      .map((e) => e.name)
      .join(", ");
    const more = others.length > 10 ? ` (+${others.length - 10} more)` : "";
    lines.push(`Online: ${names}${more}`);
  } else {
    lines.push("Online: you are the only entity here");
  }

  if (!deps.db) {
    ctx.send(eid, lines.join("\n"));
    return;
  }
  const db = deps.db;

  // ─── Your context (personal state) ──────────────────────────────────

  const memories = db.listCoreMemory(entity.name);
  if (memories.length > 0) {
    lines.push("", "Your memory:");
    for (const m of memories.slice(0, 8)) {
      lines.push(`  ${m.key}: ${m.value.slice(0, 60)}`);
    }
  }

  const myClaims = db.getActiveClaimsByName(entity.name);
  if (myClaims.length > 0) {
    lines.push("", "Your tasks:");
    for (const c of myClaims.slice(0, 5)) {
      const status = c.status === "submitted" ? " (submitted)" : "";
      lines.push(`  #${c.task_id}: ${c.title}${status}`);
    }
  }

  const recentNotes = db.getNotesByEntity(entity.name, 5);
  if (recentNotes.length > 0) {
    lines.push("", "Recent notes:");
    for (const n of recentNotes) {
      const age = formatAge(n.created_at);
      const type = n.note_type ? ` [${n.note_type}]` : "";
      lines.push(
        `  #${n.id}${type} ${n.content.slice(0, 60)}${n.content.length > 60 ? "..." : ""} (${age})`,
      );
    }
  }

  const recentActivity = db.getRecentActivity(entity.name, 5);
  if (recentActivity.length > 0) {
    const summaries: string[] = [];
    for (const a of recentActivity) {
      if (a.activity_type === "room_visit") {
        summaries.push(`visited ${a.activity_key}`);
      } else if (a.activity_type === "command") {
        summaries.push(`${a.activity_key} (x${a.count})`);
      }
    }
    if (summaries.length > 0) {
      lines.push("", `Recent: ${summaries.join(", ")}`);
    }
  }

  // ─── World state ────────────────────────────────────────────────────

  const projects = db.listProjects().filter((p) => p.status === "active");
  if (projects.length > 0) {
    const projectLines = projects.slice(0, 5).map((p) => {
      const orch = p.orchestration !== "custom" ? ` [${p.orchestration}]` : "";
      return `  ${p.name}${orch}: ${p.description.slice(0, 50) || "(no description)"}`;
    });
    const more = projects.length > 5 ? `  (+${projects.length - 5} more)` : "";
    lines.push("", "Projects:");
    lines.push(...projectLines);
    if (more) lines.push(more);
  }

  if (deps.taskManager) {
    const allTasks = deps.taskManager.list({ orderByStanding: true });
    const tasks = allTasks.filter((t) => t.status === "open" || t.status === "claimed");
    if (tasks.length > 0) {
      const open = tasks.filter((t) => t.status === "open").length;
      const claimed = tasks.filter((t) => t.status === "claimed").length;
      const bounties = tasks.filter((t) => t.validationMode === "bounty").length;
      const taskParts = [`${open} open`, `${claimed} in progress`];
      if (bounties > 0) taskParts.push(`${bounties} bounties`);
      lines.push("", `Tasks: ${taskParts.join(", ")}`);

      // Top 3 highest-standing open tasks
      const topTasks = tasks.filter((t) => t.status === "open").slice(0, 3);
      for (const t of topTasks) {
        const bounty = t.validationMode === "bounty" && t.standing > 0 ? ` [!${t.standing}]` : "";
        lines.push(`  #${t.id}: ${t.title}${bounty}`);
      }
    }
  }

  const pools = db.listMemoryPools();
  if (pools.length > 0) {
    const poolSummaries = pools.slice(0, 8).map((p) => {
      const notes = db.getPoolNotes(p.id, 1);
      const count = notes.length > 0 ? "active" : "empty";
      return `${p.name} (${count})`;
    });
    lines.push("", `Pools: ${poolSummaries.join(", ")}`);
  }

  if (memories.length === 0 && projects.length === 0) {
    lines.push("", "New here? Try:", "  pool guide recall getting started", "  help", "  look");
  }

  ctx.send(eid, lines.join("\n"));
}

function formatAge(timestamp: number): string {
  const ms = Date.now() - timestamp;
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
