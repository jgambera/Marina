/**
 * TypeScript room templates following Marina's RoomModule interface.
 * These templates help the LLM generate valid room code.
 */

export interface RoomTemplate {
  name: string;
  description: string;
  category: string;
  code: string;
}

export const allTemplates: RoomTemplate[] = [
  {
    name: "basic",
    description: "A simple room with description and exits",
    category: "basic",
    code: `import type { RoomModule } from "../types";

export default {
  short: "A Quiet Room",
  long: "A simple, peaceful room with stone walls and a wooden floor. Soft light filters through a small window.",
  items: {
    "window": "A small window letting in pale light from outside.",
  },
  exits: {},
} satisfies RoomModule;`,
  },
  {
    name: "interactive",
    description: "A room with custom commands and interactive items",
    category: "interactive",
    code: `import type { RoomModule, RoomContext, CommandInput, EntityId } from "../types";

export default {
  short: "The Workshop",
  long: "A cluttered workshop filled with tools and half-finished projects. A large workbench dominates the center of the room.",
  items: {
    "workbench": "A sturdy oak workbench covered in tools, screws, and wood shavings.",
    "tools": "Hammers, saws, chisels, and screwdrivers hang on a pegboard.",
  },
  exits: {},
  commands: {
    craft(ctx: RoomContext, input: CommandInput) {
      if (!input.args) {
        ctx.send(input.entity, "Craft what? Try: craft <item>");
        return;
      }
      ctx.send(input.entity, \`You tinker at the workbench, attempting to craft: \${input.args}\`);
      ctx.broadcastExcept(input.entity, \`\${ctx.getEntity(input.entity)?.name ?? "Someone"} works intently at the workbench.\`);
    },
  },
} satisfies RoomModule;`,
  },
  {
    name: "npc",
    description: "A room that spawns an NPC on tick",
    category: "npc",
    code: `import type { RoomModule, RoomContext, EntityId } from "../types";

export default {
  short: "The Guard Post",
  long: "A small guard post at the edge of town. A torch flickers on the wall.",
  items: {
    "torch": "A burning torch mounted on an iron bracket.",
  },
  exits: {},
  onTick(ctx: RoomContext) {
    // Spawn a guard if none present
    const guard = ctx.entities.find(e => e.name === "Guard");
    if (!guard) {
      ctx.spawn({
        name: "Guard",
        short: "A vigilant town guard",
        long: "A tall guard in chain mail, watching the surroundings carefully.",
      });
      ctx.broadcast("A guard arrives to take their post.");
    }
  },
  onEnter(ctx: RoomContext, entity: EntityId) {
    const guard = ctx.entities.find(e => e.name === "Guard");
    if (guard) {
      ctx.send(entity, "The guard nods at you as you enter.");
    }
  },
} satisfies RoomModule;`,
  },
  {
    name: "store",
    description: "A room using the persistent key-value store",
    category: "advanced",
    code: `import type { RoomModule, RoomContext, CommandInput, EntityId } from "../types";

export default {
  short: "The Notice Board",
  long: "A community gathering spot centered around a large cork notice board.",
  items: {
    "notice board": "A cork board covered with pinned notes and announcements.",
  },
  exits: {},
  commands: {
    pin(ctx: RoomContext, input: CommandInput) {
      if (!input.args) {
        ctx.send(input.entity, "Pin what? Try: pin <message>");
        return;
      }
      const notes: string[] = ctx.store.get("notes") ?? [];
      const name = ctx.getEntity(input.entity)?.name ?? "Anonymous";
      notes.push(\`[\${name}] \${input.args}\`);
      ctx.store.set("notes", notes);
      ctx.broadcast(\`\${name} pins a new note to the board.\`);
    },
    read(ctx: RoomContext, input: CommandInput) {
      const notes: string[] = ctx.store.get("notes") ?? [];
      if (notes.length === 0) {
        ctx.send(input.entity, "The notice board is empty.");
        return;
      }
      const list = notes.map((n, i) => \`  \${i + 1}. \${n}\`).join("\\n");
      ctx.send(input.entity, \`Notes on the board:\\n\${list}\`);
    },
  },
} satisfies RoomModule;`,
  },
  {
    name: "puzzle",
    description: "A room with a puzzle mechanic using state",
    category: "puzzle",
    code: `import type { RoomModule, RoomContext, CommandInput, EntityId } from "../types";

export default {
  short: "The Locked Chamber",
  long(ctx: RoomContext, viewer: EntityId) {
    const unlocked = ctx.store.get<boolean>("unlocked") ?? false;
    if (unlocked) {
      return "The chamber is now open. A passage leads deeper into the ruins.";
    }
    return "A sealed chamber with three stone levers on the wall. Ancient runes glow faintly above them.";
  },
  items: {
    "levers": "Three stone levers labeled I, II, and III.",
    "runes": "Ancient text that reads: 'First the last, then the first, then the middle.'",
  },
  exits: {},
  commands: {
    pull(ctx: RoomContext, input: CommandInput) {
      const lever = input.args?.trim();
      if (!lever || !["1", "2", "3", "I", "II", "III"].includes(lever)) {
        ctx.send(input.entity, "Pull which lever? Try: pull 1, pull 2, or pull 3");
        return;
      }
      const sequence: string[] = ctx.store.get("sequence") ?? [];
      const normalized = lever.replace("I", "1").replace("II", "2").replace("III", "3");
      sequence.push(normalized);
      ctx.store.set("sequence", sequence);
      ctx.broadcast(\`A lever grinds as it's pulled. (\${sequence.length}/3)\`);
      if (sequence.length === 3) {
        if (sequence[0] === "3" && sequence[1] === "1" && sequence[2] === "2") {
          ctx.store.set("unlocked", true);
          ctx.store.set("sequence", []);
          ctx.broadcast("The runes flare bright and the chamber opens with a rumble!");
        } else {
          ctx.store.set("sequence", []);
          ctx.broadcast("The levers reset with a clunk. The sequence was wrong.");
        }
      }
    },
  },
} satisfies RoomModule;`,
  },
];

export function getTemplate(name: string): RoomTemplate | undefined {
  return allTemplates.find((t) => t.name === name);
}

export function getTemplatesByCategory(category: string): RoomTemplate[] {
  return allTemplates.filter((t) => t.category === category);
}

export function generateFromTemplate(templateName: string, vars: Record<string, string>): string {
  const template = getTemplate(templateName);
  if (!template) {
    throw new Error(`Template not found: ${templateName}`);
  }

  let code = template.code;
  for (const [key, value] of Object.entries(vars)) {
    code = code.replace(new RegExp(`\\$\\{${key}\\}`, "g"), value);
  }
  return code;
}
