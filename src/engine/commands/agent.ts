import type { CommandDef, EntityId, EntityRank, RoomContext } from "../../types";
import type { AgentRoleId, AgentRuntime, ManagedAgent } from "../agent-runtime";

interface AgentDeps {
  agentRuntime: AgentRuntime;
  wsPort: number;
}

interface Ctx {
  send: (id: EntityId, msg: string) => void;
}

export function agentCommand(deps: AgentDeps): CommandDef {
  return {
    name: "agent",
    aliases: [],
    help: "Manage agents. Usage: agent spawn|stop|list|status [args]",
    minRank: 3 as EntityRank, // architect+
    handler(ctx, input) {
      const tokens = input.tokens;
      const sub = tokens[0];

      if (!sub) {
        ctx.send(input.entity, formatHelp());
        return;
      }

      switch (sub) {
        case "spawn":
          handleSpawn(ctx, input.entity, deps, tokens.slice(1));
          break;
        case "stop":
          handleStop(ctx, input.entity, deps, tokens.slice(1));
          break;
        case "list":
        case "ls":
          handleList(ctx, input.entity, deps);
          break;
        case "status":
          handleStatus(ctx, input.entity, deps, tokens.slice(1));
          break;
        default:
          ctx.send(input.entity, `Unknown subcommand: ${sub}\n${formatHelp()}`);
      }
    },
  };
}

function formatHelp(): string {
  return [
    "Usage: agent <subcommand>",
    "",
    "  spawn --name <name> --model <provider/model> [--role <role>]",
    "  stop <name>",
    "  list",
    "  status <name>",
    "",
    "Roles: general, architect, scholar, diplomat, mentor, merchant",
    "Models: anthropic/claude-sonnet-4-5, google/gemini-2.5-flash, etc.",
  ].join("\n");
}

function parseFlags(tokens: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t.startsWith("--") && i + 1 < tokens.length) {
      flags[t.slice(2)] = tokens[i + 1]!;
      i++;
    }
  }
  return flags;
}

function handleSpawn(ctx: Ctx, entity: EntityId, deps: AgentDeps, tokens: string[]): void {
  const flags = parseFlags(tokens);
  const name = flags.name;
  const model = flags.model;
  const role = flags.role ?? "general";

  if (!name || !model) {
    ctx.send(entity, "Usage: agent spawn --name <name> --model <provider/model> [--role <role>]");
    return;
  }

  ctx.send(entity, `Spawning agent "${name}" with model ${model} (role: ${role})...`);

  deps.agentRuntime
    .spawn({
      name,
      model,
      role: role as AgentRoleId,
      wsUrl: `ws://localhost:${deps.wsPort}`,
    })
    .then((managed) => {
      ctx.send(
        entity,
        `Agent "${name}" is now running (entity: ${managed.entityId ?? "pending"}).`,
      );
    })
    .catch((err: unknown) => {
      ctx.send(
        entity,
        `Failed to spawn "${name}": ${err instanceof Error ? err.message : String(err)}`,
      );
    });
}

function handleStop(ctx: Ctx, entity: EntityId, deps: AgentDeps, tokens: string[]): void {
  const name = tokens[0];
  if (!name) {
    ctx.send(entity, "Usage: agent stop <name>");
    return;
  }

  deps.agentRuntime
    .stop(name)
    .then((ok) => {
      if (ok) {
        ctx.send(entity, `Agent "${name}" stopped.`);
      } else {
        ctx.send(entity, `No running agent named "${name}".`);
      }
    })
    .catch((err: unknown) => {
      ctx.send(
        entity,
        `Error stopping "${name}": ${err instanceof Error ? err.message : String(err)}`,
      );
    });
}

function handleList(ctx: Ctx, entity: EntityId, deps: AgentDeps): void {
  const agents = deps.agentRuntime.list();
  if (agents.length === 0) {
    ctx.send(entity, "No managed agents running.");
    return;
  }

  const lines = agents.map((a) => formatAgentLine(a));
  ctx.send(entity, `Managed agents (${agents.length}):\n${lines.join("\n")}`);
}

function handleStatus(ctx: Ctx, entity: EntityId, deps: AgentDeps, tokens: string[]): void {
  const name = tokens[0];
  if (!name) {
    ctx.send(entity, "Usage: agent status <name>");
    return;
  }

  const managed = deps.agentRuntime.get(name);
  if (!managed) {
    ctx.send(entity, `No agent named "${name}".`);
    return;
  }

  const uptime = Math.floor((Date.now() - managed.startedAt) / 1000);
  const lines = [
    `Name: ${managed.name}`,
    `Model: ${managed.model}`,
    `Role: ${managed.role}`,
    `Status: ${managed.status}`,
    `Entity: ${managed.entityId ?? "none"}`,
    `Uptime: ${uptime}s`,
    ...(managed.error ? [`Error: ${managed.error}`] : []),
  ];
  ctx.send(entity, lines.join("\n"));
}

function formatAgentLine(a: ManagedAgent): string {
  const uptime = Math.floor((Date.now() - a.startedAt) / 1000);
  return `  ${a.name} (${a.model}, ${a.role}) — ${a.status} [${uptime}s]`;
}
