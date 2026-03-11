import { bold, category, dim, rank as fmtRank, header, separator } from "../../net/ansi";
import type { CommandDef, RoomContext } from "../../types";

const COMMAND_CATEGORIES: Record<string, string[]> = {
  Movement: ["look", "move", "map"],
  Communication: ["say", "shout", "tell", "emote", "talk"],
  Items: ["get", "drop", "give", "inventory", "examine"],
  Information: ["who", "score", "help", "time", "uptime"],
  Social: ["ignore", "rank", "quest", "link"],
  Knowledge: ["note", "search", "bookmark", "export"],
  Memory: ["memory", "recall", "reflect", "pool", "novelty", "skill", "orient"],
  Coordination: ["channel", "board", "group", "task", "macro", "project"],
  Experiments: ["experiment", "observe"],
  Building: ["build", "connect"],
  Admin: ["admin"],
};

function categorize(cmd: CommandDef): string {
  for (const [cat, names] of Object.entries(COMMAND_CATEGORIES)) {
    if (names.includes(cmd.name)) return cat;
  }
  return "Other";
}

export function helpCommand(getAllCommands: () => CommandDef[]): CommandDef {
  return {
    name: "help",
    aliases: ["?", "commands"],
    help: "Show available commands. Usage: help [command]",
    handler: (ctx: RoomContext, input) => {
      const all = getAllCommands();

      if (input.args) {
        const target = input.args.toLowerCase();
        const cmd = all.find((c) => c.name === target || c.aliases?.includes(target));
        if (cmd) {
          const aliases = cmd.aliases?.length
            ? ` ${dim(`(aliases: ${cmd.aliases.join(", ")})`)}`
            : "";
          const cat = categorize(cmd);
          ctx.send(
            input.entity,
            `${header(cmd.name)}${aliases}\n${dim(`Category: ${cat}`)}\n${cmd.help}`,
          );
        } else {
          ctx.send(input.entity, `Unknown command: ${input.args}`);
        }
        return;
      }

      // Group commands by category
      const grouped = new Map<string, CommandDef[]>();
      for (const cmd of all) {
        const cat = categorize(cmd);
        if (!grouped.has(cat)) grouped.set(cat, []);
        grouped.get(cat)!.push(cmd);
      }

      const lines: string[] = [header("Available Commands"), separator()];

      // Render in category order
      const order = [...Object.keys(COMMAND_CATEGORIES), "Other"];
      for (const cat of order) {
        const cmds = grouped.get(cat);
        if (!cmds || cmds.length === 0) continue;
        lines.push(`\n${category(cat)}`);
        for (const c of cmds) {
          const aliases = c.aliases?.length ? ` ${dim(`(${c.aliases.join(", ")})`)}` : "";
          const rankTag = c.minRank && c.minRank > 0 ? ` ${fmtRank(c.minRank)}` : "";
          lines.push(`  ${bold(c.name)}${aliases}${rankTag} \u2014 ${c.help.split(".")[0]}`);
        }
      }

      lines.push("", dim('Type "help <command>" for details.'));
      ctx.send(input.entity, lines.join("\n"));
    },
  };
}
