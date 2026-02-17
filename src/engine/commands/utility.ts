import type { CommandDef, RoomContext } from "../../types";

export function timeCommand(): CommandDef {
  return {
    name: "time",
    aliases: ["date"],
    help: "Show the current server time.",
    handler: (ctx: RoomContext, input) => {
      const now = new Date();
      const formatted = now.toUTCString();
      ctx.send(input.entity, `\x1b[1;36mServer Time\x1b[0m\n  ${formatted}`);
    },
  };
}

export function uptimeCommand(getUptime: () => number): CommandDef {
  return {
    name: "uptime",
    aliases: [],
    help: "Show how long the server has been running.",
    handler: (ctx: RoomContext, input) => {
      const ms = getUptime();
      const formatted = formatDuration(ms);
      ctx.send(input.entity, `\x1b[1;36mServer Uptime\x1b[0m\n  ${formatted}`);
    },
  };
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(" ");
}
