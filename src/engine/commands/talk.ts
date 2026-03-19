import { bold, dim, npcSays } from "../../net/ansi";
import type { CommandDef, EntityId, RoomContext } from "../../types";
import type { MarinaGuide } from "../marina-guide";

interface DialogueEntry {
  greeting: string;
  topics: Record<string, string>;
  farewell?: string;
}

interface TalkDeps {
  guide?: MarinaGuide;
}

export function talkCommand(deps?: TalkDeps): CommandDef {
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
        topic = input.args.slice(aboutIdx + 7).trim();
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

      // LLM-backed guide NPC — dynamic conversation
      if (npc.properties.guide && deps?.guide?.isAvailable) {
        const caller = ctx.entities.find((e) => e.id === input.entity);

        deps.guide
          .converse(topic ?? "", {
            entityName: caller?.name ?? "someone",
            roomId: input.room,
            roomShort: input.room,
          })
          .then((response) => {
            if (response) {
              ctx.send(input.entity, npcSays(npc.name, response));
            } else {
              // Fall through to static dialogue
              sendStaticDialogue(ctx, input.entity, npc, topic);
            }
          })
          .catch(() => {
            sendStaticDialogue(ctx, input.entity, npc, topic);
          });
        return;
      }

      // Static dialogue NPC
      sendStaticDialogue(ctx, input.entity, npc, topic);
    },
  };
}

function sendStaticDialogue(
  ctx: RoomContext,
  entityId: EntityId,
  npc: { name: string; properties: Record<string, unknown> },
  topic: string | undefined,
): void {
  const dialogue = npc.properties.dialogue as DialogueEntry | undefined;

  if (!dialogue) {
    ctx.send(entityId, `${npc.name} doesn't seem interested in conversation.`);
    return;
  }

  if (!topic) {
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

    ctx.send(entityId, lines.join("\n"));
    return;
  }

  const lowerTopic = topic.toLowerCase();
  const response = dialogue.topics[lowerTopic];
  if (response) {
    ctx.send(entityId, npcSays(npc.name, response));
  } else {
    const match = Object.keys(dialogue.topics).find((k) => k.toLowerCase().startsWith(lowerTopic));
    if (match) {
      ctx.send(entityId, npcSays(npc.name, dialogue.topics[match]!));
    } else {
      ctx.send(
        entityId,
        npcSays(npc.name, "I don't know much about that. Try asking about something else."),
      );
    }
  }
}
