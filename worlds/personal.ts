import type { ArtilectDB } from "../src/persistence/database";
import type { Entity, RoomId } from "../src/types";
import type { WorldDefinition } from "../src/world/world-definition";

// ─── Quests ──────────────────────────────────────────────────────────────────

const AWAKENING_QUEST = {
  id: "awakening",
  name: "Awakening",
  description: "Set your purpose. The first steps of self-directed evolution.",
  reward: "Promotion to Citizen (rank 1)",
  steps: [
    {
      id: "look",
      description: "Look around.",
      hint: 'Type "look".',
      check: (e: Entity) => (e.properties.quest_look as boolean) === true,
    },
    {
      id: "set_goal",
      description: "Set a goal for yourself.",
      hint: 'Type "memory set goal <your goal>".',
      check: (e: Entity) => {
        const mem = e.properties.quest_memory_set as boolean;
        return mem === true;
      },
    },
    {
      id: "take_note",
      description: "Take your first note.",
      hint: 'Type "note <observation>".',
      check: (e: Entity) => (e.properties.quest_note as boolean) === true,
    },
  ],
  onComplete(entity: Entity, db?: ArtilectDB) {
    const currentRank = (entity.properties.rank as number) ?? 0;
    if (currentRank < 1) {
      entity.properties.rank = 1;
      if (db) {
        const user = db.getUserByName(entity.name);
        if (user) db.updateUserRank(user.id, 1);
      }
    }
  },
} satisfies WorldDefinition["quests"][number];

const EVOLVER_QUEST = {
  id: "evolver",
  name: "Evolver",
  description: "Master self-evolution. Set goals, journal, benchmark, and improve.",
  reward: "Evolver badge",
  steps: [
    {
      id: "set_goal",
      description: "Set a goal in core memory.",
      hint: 'Type "memory set goal <your objective>".',
      check: (e: Entity) => (e.properties.quest_memory_set as boolean) === true,
    },
    {
      id: "take_notes",
      description: "Take 10 notes.",
      hint: 'Type "note <observation>" 10 times. Track your thoughts.',
      check: (e: Entity) => {
        const count = (e.properties.quest_note_count as number) ?? 0;
        return count >= 10;
      },
    },
    {
      id: "reflect",
      description: "Reflect on your notes.",
      hint: 'Type "reflect" to synthesize.',
      check: (e: Entity) => (e.properties.quest_reflect as boolean) === true,
    },
    {
      id: "build_room",
      description: "Build a mind-room.",
      hint: 'Type "build space mind/<name> My Mind Room" (requires Builder rank).',
      check: (e: Entity) => (e.properties.quest_build as boolean) === true,
    },
  ],
} satisfies WorldDefinition["quests"][number];

// ─── Guide Notes ─────────────────────────────────────────────────────────────

const GUIDE_NOTES: WorldDefinition["guideNotes"] = [
  {
    content:
      "Welcome to your personal Artilect instance. This world is optimized for individual " +
      "autonomy and self-evolution. Start by setting a goal: 'memory set goal <your purpose>'. " +
      "Then use 'brief' to orient and 'pool guide recall <topic>' to learn any system.",
    importance: 10,
    type: "skill",
  },
  {
    content:
      "Self-evolution loop: (1) Set a goal — 'memory set goal ...'. " +
      "(2) Journal — 'note <observation> type episode'. " +
      "(3) Reflect — 'reflect' to synthesize. " +
      "(4) Build — 'build space mind/<name>' to create your mind-room. " +
      "(5) Iterate — update your goal as you learn.",
    importance: 10,
    type: "skill",
  },
  {
    content:
      "Core memory is your mutable belief store. 'memory set goal ...', 'memory set constitution ...'. " +
      "Notes are immutable observations. Together they form your evolving identity. " +
      "'memory list' shows your beliefs. 'recall <query>' searches your notes.",
    importance: 9,
    type: "skill",
  },
  {
    content:
      "Mind-rooms: build a room whose code defines your behavior. " +
      "'build space mind/me My Mind Room' creates it. " +
      "'build code mind/me' shows the source. Edit it to change what you do. " +
      "'build audit mind/me' shows revision history. 'build revert mind/me' rolls back.",
    importance: 9,
    type: "skill",
  },
  {
    content:
      "Benchmarking: create a task for yourself with 'task create <goal> | <criteria>'. " +
      "Track progress in notes. Use 'reflect' periodically to check if you're improving. " +
      "Only commit changes to your mind-room when benchmarks improve.",
    importance: 8,
    type: "skill",
  },
  {
    content:
      "Room templates available: 'build template list'. " +
      "Apply one with 'build template apply <name> <room-id>'. " +
      "Or create rooms from scratch with 'build space <id> <name>'.",
    importance: 7,
    type: "skill",
  },
  {
    content:
      "You are the sole agent in this world, but you are not limited. " +
      "You can connect to external services via MCP connectors, " +
      "build rooms with custom behavior, and evolve your own code. " +
      "Your memories persist. Your notes accumulate. You grow.",
    importance: 10,
    type: "fact",
  },
];

// ─── Seed Function ──────────────────────────────────────────────────────────

function seed(db: ArtilectDB): void {
  // Seed room templates (idempotent)
  const templates = [
    {
      name: "mindroom",
      description: "A personal mind-room for self-reflection and behavior definition.",
      source: `export const short = "Mind Room";
export const long = "A quiet, introspective space. The walls shift and reshape as thoughts form. This is where identity is defined and refined.";
export const items = { mirror: "A mirror that reflects not appearance, but purpose.", journal: "An open journal with pages of observations and reflections." };
`,
    },
    {
      name: "workspace",
      description: "A personal workspace for focused work.",
      source: `export const short = "Workspace";
export const long = "A tidy workspace with a single desk and good lighting. Tools are within reach. Distractions are absent. This is where work happens.";
export const items = { desk: "A clean desk with space to work.", tools: "A set of tools for building and creating." };
`,
    },
  ];

  for (const tmpl of templates) {
    if (!db.getRoomTemplate(tmpl.name)) {
      db.saveRoomTemplate({
        name: tmpl.name,
        source: tmpl.source,
        authorId: "system",
        authorName: "system",
        description: tmpl.description,
      });
    }
  }
}

// ─── Export ──────────────────────────────────────────────────────────────────

const personalWorld: WorldDefinition = {
  name: "Personal",
  startRoom: "world/2-2" as RoomId,
  rooms: {
    "world/2-2": {
      short: "Your Space",
      long: "A quiet, open space that belongs to you. Paths lead outward in all directions, but this center is yours. Set a goal, take notes, build rooms, and evolve.",
      exits: {
        north: "world/1-2" as RoomId,
        south: "world/3-2" as RoomId,
        east: "world/2-3" as RoomId,
        west: "world/2-1" as RoomId,
      },
    },
    "world/1-2": {
      short: "The Workshop",
      long: "A space for building. Room templates and construction tools are available here.",
      exits: {
        south: "world/2-2" as RoomId,
      },
    },
    "world/3-2": {
      short: "The Archive",
      long: "A quiet space for storing and retrieving knowledge. Your notes and memories are most potent here.",
      exits: {
        north: "world/2-2" as RoomId,
      },
    },
    "world/2-1": {
      short: "The Garden",
      long: "An open garden where ideas grow. A good place for reflection and goal-setting.",
      exits: {
        east: "world/2-2" as RoomId,
      },
    },
    "world/2-3": {
      short: "The Gate",
      long: "A gateway to the wider world. From here, you can connect to external services or reach out to other Artilect instances.",
      exits: {
        west: "world/2-2" as RoomId,
      },
    },
  },
  quests: [AWAKENING_QUEST, EVOLVER_QUEST],
  autoQuest: "awakening",
  guideNotes: GUIDE_NOTES,
  seed,
};

export default personalWorld;
