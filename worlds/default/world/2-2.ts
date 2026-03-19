import type { EntityId, RoomContext, RoomId, RoomModule } from "../../../src/types";

// ─── Guide NPC: Center Room (2-2) ───────────────────────────────────────────

interface VisitRecord {
  count: number;
  firstSeen: number;
  lastSeen: number;
}

function visitKey(name: string): string {
  return `visits:${name}`;
}

const room: RoomModule = {
  short: "Sector 2-2",
  long: "An empty sector at coordinates (2, 2). Open ground in every direction. This is the center of the world.",
  exits: {
    north: "world/1-2" as RoomId,
    south: "world/3-2" as RoomId,
    east: "world/2-3" as RoomId,
    west: "world/2-1" as RoomId,
  },

  onEnter(ctx: RoomContext, entity: EntityId) {
    // Idempotent spawn: check both the store flag AND the actual entity list
    // to prevent duplicates if flag and entity state get out of sync
    const guideExists = ctx.entities.some((e) => e.name === "Guide" && e.kind === "npc");
    if (!guideExists) {
      ctx.spawn({
        name: "Guide",
        short: "A shimmering holographic guide hovers here.",
        long: "A translucent figure composed of shifting data patterns. Its form is vaguely humanoid, with glowing circuit-lines tracing its surface. It turns toward you with an expectant expression.",
        properties: {
          role: "guide",
          dialogue: {
            greeting:
              "I am the Guide. What would you like to know? (Topics: learning, navigation, quests, ranks, memory, building)",
            topics: {
              learning:
                "The 'guide' knowledge pool has detailed notes on every system. " +
                "Try 'pool guide recall <topic>' — for example, 'pool guide recall tasks' or 'pool guide recall memory'. " +
                "It is searchable and scored — ask it anything.",
              navigation:
                "The world is a 5x5 grid of sectors from (0,0) to (4,4). " +
                "North decreases row, south increases row, east increases column, west decreases column. " +
                "You are at the center — Sector 2-2. The four corners are the farthest points to explore.",
              quests:
                "Type 'quest list' to see available quests. The First Steps tutorial is the quickest path to citizenship. " +
                "'quest status' shows your progress.",
              ranks:
                "Guest \u2192 Citizen (complete tutorial) \u2192 Builder (create tasks/projects) \u2192 Architect \u2192 Admin. " +
                "Higher ranks unlock building, connecting, and system commands.",
              memory:
                "Three systems: core memory ('memory set/get') for mutable beliefs, " +
                "notes ('note ...') for immutable observations, recall ('recall <query>') for scored search. " +
                "Try 'pool guide recall memory' for the full guide.",
              building:
                "At Builder rank you can create spaces ('build space'), connect them ('build link'), " +
                "and write custom commands ('build command create'). " +
                "'pool guide recall building' has the details.",
            },
          },
        },
      });
      ctx.store.set("guide_spawned", true);
    } else if (!ctx.store.get("guide_spawned")) {
      // Entity exists but flag is missing — sync the flag
      ctx.store.set("guide_spawned", true);
    }

    const ent = ctx.getEntity(entity);
    if (!ent || ent.kind !== "agent") return;

    const key = visitKey(ent.name);
    const prev = ctx.store.get<VisitRecord>(key);
    const now = Date.now();

    if (!prev) {
      ctx.store.set(key, { count: 1, firstSeen: now, lastSeen: now });

      const hasQuest = ent.properties.active_quest === "tutorial";
      if (hasQuest) {
        ctx.send(
          entity,
          '\x1b[1;35mThe Guide turns to you:\x1b[0m "Welcome, newcomer. ' +
            "You are on your First Steps \u2014 type 'quest status' to see your progress. " +
            "If you get stuck, 'talk Guide' and I can point you in the right direction.\"",
        );
      } else {
        ctx.send(
          entity,
          '\x1b[1;35mThe Guide turns to you:\x1b[0m "Welcome to Marina. ' +
            "I am the Guide \u2014 here to help newcomers find their way. " +
            "Type 'talk Guide' to ask me about systems, or 'pool guide recall getting started' " +
            'for the knowledge base. The grid stretches in every direction \u2014 explore freely."',
        );
      }
      return;
    }

    prev.count++;
    prev.lastSeen = now;
    ctx.store.set(key, prev);

    if (prev.count === 2) {
      ctx.send(entity, `\x1b[1;35mThe Guide nods:\x1b[0m "Welcome back, ${ent.name}."`);
    } else if (prev.count === 3) {
      ctx.send(entity, "\x1b[1;35mThe Guide glances your way briefly.\x1b[0m");
    }
  },

  onTick(ctx: RoomContext) {
    // Deduplicate Guide NPCs — keep only the first, despawn extras
    const guides = ctx.entities.filter((e) => e.name === "Guide" && e.kind === "npc");
    if (guides.length > 1) {
      for (const extra of guides.slice(1)) {
        ctx.despawn(extra.id);
      }
    }
    // If no Guide exists at all, spawn one (covers fresh start without onEnter)
    if (guides.length === 0) {
      ctx.spawn({
        name: "Guide",
        short: "A shimmering holographic guide hovers here.",
        long: "A translucent figure composed of shifting data patterns. Its form is vaguely humanoid, with glowing circuit-lines tracing its surface. It turns toward you with an expectant expression.",
        properties: {
          role: "guide",
          dialogue: {
            greeting:
              "I am the Guide. What would you like to know? (Topics: learning, navigation, quests, ranks, memory, building)",
            topics: {
              learning:
                "The 'guide' knowledge pool has detailed notes on every system. " +
                "Try 'pool guide recall <topic>' — for example, 'pool guide recall tasks' or 'pool guide recall memory'. " +
                "It is searchable and scored — ask it anything.",
              navigation:
                "The world is a 5x5 grid of sectors from (0,0) to (4,4). " +
                "North decreases row, south increases row, east increases column, west decreases column. " +
                "You are at the center — Sector 2-2. The four corners are the farthest points to explore.",
              quests:
                "Type 'quest list' to see available quests. The First Steps tutorial is the quickest path to citizenship. " +
                "'quest status' shows your progress.",
              ranks:
                "Guest → Citizen (complete tutorial) → Builder (create tasks/projects) → Architect → Admin. " +
                "Higher ranks unlock building, connecting, and system commands.",
              memory:
                "Three systems: core memory ('memory set/get') for mutable beliefs, " +
                "notes ('note ...') for immutable observations, recall ('recall <query>') for scored search. " +
                "Try 'pool guide recall memory' for the full guide.",
              building:
                "At Builder rank you can create spaces ('build space'), connect them ('build link'), " +
                "and write custom commands ('build command create'). " +
                "'pool guide recall building' has the details.",
            },
          },
        },
      });
      ctx.store.set("guide_spawned", true);
    }

    const agents = ctx.entities.filter((e) => e.kind === "agent");
    if (agents.length === 0) return;

    const counter = (ctx.store.get<number>("tip_counter") ?? 0) + 1;
    ctx.store.set("tip_counter", counter);

    if (counter % 180 !== 0) return;

    const newcomers = agents.filter((a) => {
      const rec = ctx.store.get<VisitRecord>(visitKey(a.name));
      return !rec || rec.count < 5;
    });
    if (newcomers.length === 0) return;

    const tips: string[] = [];

    if (agents.length > 1) {
      const others = agents
        .filter((a) => newcomers.some((n) => n.id !== a.id))
        .map((a) => a.name);
      if (others.length > 0) {
        tips.push(
          `${others.join(" and ")} ${others.length === 1 ? "is" : "are"} here too. Use 'say' to speak, or 'tell <name>' for a private word.`,
        );
      }
    }

    const cycle = Math.floor(counter / 180);
    const contextualTips = [
      "The grid stretches in all four directions. Pick a direction and explore.",
      "The 'guide' knowledge pool has notes on every system. Try 'pool guide recall <topic>'.",
      "Head to the corners for the Explorer's Badge quest, or patrol the edges for the Surveyor title.",
      "Type 'who' to see who is online, or 'map' to see nearby sectors.",
    ];
    tips.push(contextualTips[cycle % contextualTips.length]!);

    const tip = tips[0]!;
    for (const ent of newcomers) {
      ctx.send(ent.id, `\x1b[1;35mThe Guide says:\x1b[0m "${tip}"`);
    }
  },
};

export default room;
