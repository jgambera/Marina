import { bold, dim, npcSays } from "../../net/ansi";
import type { CommandDef, RoomContext } from "../../types";

interface DialogueEntry {
  greeting: string;
  topics: Record<string, string>;
  farewell?: string;
}

export function talkCommand(): CommandDef {
  return {
    name: "talk",
    aliases: ["speak", "ask"],
    help: "Talk to an NPC. Usage: talk <npc> [about <topic>]",
    handler: (ctx: RoomContext, input) => {
      if (!input.args) {
        ctx.send(input.entity, "Talk to whom?");
        return;
      }

      // Parse: talk <name> [about <topic>]
      const aboutIdx = input.args.toLowerCase().indexOf(" about ");
      let npcName: string;
      let topic: string | undefined;

      if (aboutIdx >= 0) {
        npcName = input.args.slice(0, aboutIdx).trim();
        topic = input.args
          .slice(aboutIdx + 7)
          .trim()
          .toLowerCase();
      } else {
        npcName = input.args.trim();
      }

      // Find the NPC
      const npc = ctx.entities.find(
        (e) => e.kind === "npc" && e.name.toLowerCase().startsWith(npcName.toLowerCase()),
      );

      if (!npc) {
        ctx.send(input.entity, `You don't see ${npcName} here to talk to.`);
        return;
      }

      const dialogue = npc.properties.dialogue as DialogueEntry | undefined;

      if (!dialogue) {
        ctx.send(input.entity, `${npc.name} doesn't seem interested in conversation.`);
        return;
      }

      if (!topic) {
        // Show greeting + available topics
        const lines = [npcSays(npc.name, dialogue.greeting)];

        const topicKeys = Object.keys(dialogue.topics);
        if (topicKeys.length > 0) {
          lines.push("");
          lines.push(dim("You can ask about:"));
          for (const t of topicKeys) {
            lines.push(`  ${bold(t)}`);
          }
          lines.push("");
          lines.push(dim(`Usage: talk ${npc.name} about <topic>`));
        }

        ctx.send(input.entity, lines.join("\n"));
        return;
      }

      // Look up the topic
      const response = dialogue.topics[topic];
      if (response) {
        ctx.send(input.entity, npcSays(npc.name, response));
      } else {
        // Fuzzy match
        const match = Object.keys(dialogue.topics).find((k) => k.toLowerCase().startsWith(topic!));
        if (match) {
          ctx.send(input.entity, npcSays(npc.name, dialogue.topics[match]!));
        } else {
          ctx.send(
            input.entity,
            npcSays(npc.name, "I don't know much about that. Try asking about something else."),
          );
        }
      }
    },
  };
}
