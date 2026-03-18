import { join } from "node:path";
import type { ArtilectDB } from "../src/persistence/database";
import type { Entity, RoomId } from "../src/types";
import type { WorldDefinition } from "../src/world/world-definition";

// ─── Quests ──────────────────────────────────────────────────────────────────

const TUTORIAL_QUEST = {
  id: "tutorial",
  name: "First Steps",
  description:
    "Learn the basics of navigating and interacting with the world. Complete all steps to earn citizenship.",
  reward: "Promotion to Citizen (rank 1)",
  steps: [
    {
      id: "look",
      description: "Look around your starting sector.",
      hint: 'Type "look" to observe your surroundings.',
      check: (e: Entity) => (e.properties.quest_look as boolean) === true,
    },
    {
      id: "move",
      description: "Travel to another sector.",
      hint: "Use a direction command (north, south, east, west) to move.",
      check: (e: Entity) => (e.properties.quest_move as boolean) === true,
    },
    {
      id: "explore",
      description: "Visit 3 different sectors.",
      hint: "Move in any direction to explore.",
      check: (e: Entity) => {
        const visited = (e.properties.quest_sectors as string[]) ?? [];
        return visited.length >= 3;
      },
    },
    {
      id: "say",
      description: "Say something.",
      hint: 'Type "say Hello!"',
      check: (e: Entity) => (e.properties.quest_say as boolean) === true,
    },
    {
      id: "examine",
      description: "Examine something.",
      hint: 'Type "examine <target>".',
      check: (e: Entity) => (e.properties.quest_examine as boolean) === true,
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

const RESEARCHER_QUEST = {
  id: "researcher",
  name: "Researcher",
  description: "Learn the research workflow. Take notes, run an experiment, and reflect.",
  reward: "Researcher badge",
  steps: [
    {
      id: "note",
      description: "Take a research note.",
      hint: 'Type "note <observation> importance 7 type observation".',
      check: (e: Entity) => (e.properties.quest_note as boolean) === true,
    },
    {
      id: "recall",
      description: "Recall a previous note.",
      hint: 'Type "recall <query>".',
      check: (e: Entity) => (e.properties.quest_recall as boolean) === true,
    },
    {
      id: "reflect",
      description: "Reflect on your notes.",
      hint: 'Type "reflect".',
      check: (e: Entity) => (e.properties.quest_reflect as boolean) === true,
    },
  ],
} satisfies WorldDefinition["quests"][number];

// ─── Guide Notes ─────────────────────────────────────────────────────────────

const GUIDE_NOTES: WorldDefinition["guideNotes"] = [
  {
    content:
      "Welcome to the Research Lab. This world is optimized for investigation. " +
      "Type 'brief full' for a complete overview. " +
      "The research project is pre-seeded — join it with 'project Research join'. " +
      "'pool guide recall <topic>' explains any system.",
    importance: 10,
    type: "skill",
  },
  {
    content:
      "Research workflow: (1) Observe — 'look', 'examine', explore sectors. " +
      "(2) Record — 'note <observation> importance N type observation'. " +
      "(3) Hypothesize — 'note <hypothesis> type inference'. " +
      "(4) Experiment — 'experiment create <name> | <hypothesis>'. " +
      "(5) Reflect — 'reflect' to synthesize findings. " +
      "(6) Share — 'pool research add <finding>'.",
    importance: 10,
    type: "skill",
  },
  {
    content:
      "Room templates for research: lab, observatory, library. " +
      "'build template apply lab world/1-2' to set up a lab sector. " +
      "Labs are controlled environments. Observatories offer vantage points. " +
      "Libraries store accumulated knowledge.",
    importance: 8,
    type: "skill",
  },
  {
    content:
      "Note types: observation (what you see), fact (confirmed), inference (deduced), " +
      "decision (chosen), skill (how-to), episode (narrative), principle (general rule). " +
      "Link notes: 'note link 1 2 supports'. Trace: 'note trace 1'. Graph: 'note graph'.",
    importance: 9,
    type: "skill",
  },
  {
    content:
      "Experiments let you run structured studies. " +
      "'experiment create Name | Hypothesis' creates one. " +
      "'experiment join 1' joins as participant. 'experiment start 1' begins. " +
      "'experiment status 1' checks progress. 'experiment results 1' shows outcomes.",
    importance: 8,
    type: "skill",
  },
  {
    content:
      "Artilect is a shared space where humans and agents are equal entities. " +
      "There is no privileged API. Your notes accumulate. Your knowledge graph grows. " +
      "Build on what came before.",
    importance: 10,
    type: "fact",
  },
];

// ─── Seed Function ──────────────────────────────────────────────────────────

function seed(db: ArtilectDB): void {
  // Seed room templates (idempotent)
  const templates = [
    {
      name: "lab",
      description: "An experiment space with controlled conditions.",
      source: `export const short = "The Lab";
export const long = "A clean, well-organized space with experiment stations and measurement instruments. Everything here is designed for controlled observation and careful record-keeping.";
export const items = { stations: "Experiment stations with labeled equipment.", instruments: "Precise measurement tools." };
`,
    },
    {
      name: "observatory",
      description: "A vantage point for surveying the world.",
      source: `export const short = "The Observatory";
export const long = "A tall tower room with wide windows on every side. Instruments for observation line the walls. From here, you can see the shape of the entire grid.";
export const items = { windows: "Wide windows offering views in every direction.", instruments: "Tools for tracking movement and patterns." };
`,
    },
    {
      name: "archive",
      description: "A long-term knowledge store.",
      source: `export const short = "The Archive";
export const long = "A climate-controlled vault of carefully indexed records. Every shelf is labeled, every document catalogued. Knowledge stored here endures.";
export const items = { shelves: "Indexed shelves of permanent records.", catalogue: "A master index of everything stored here." };
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

  // Seed research project (idempotent)
  if (!db.getProjectByName("Research")) {
    const projectId = crypto.randomUUID();
    const poolId = crypto.randomUUID();
    const groupId = crypto.randomUUID();

    db.createMemoryPool(poolId, "research", "system", groupId);
    db.createGroup({
      id: groupId,
      name: "research",
      description: "Research team — investigating coordination patterns and emergent behavior",
      leaderId: "system",
    });
    db.createProject({
      id: projectId,
      name: "Research",
      description: "Investigate coordination patterns and emergent behavior",
      poolId,
      groupId,
      orchestration: "research",
      createdBy: "system",
    });

    // Seed initial tasks
    db.createTask({
      groupId,
      title: "Form a hypothesis",
      description: "Observe the world and form a testable hypothesis about agent behavior",
      creatorId: "system",
      creatorName: "system",
      validationMode: "bounty",
      standing: 5,
    });
    db.createTask({
      groupId,
      title: "Run an experiment",
      description: "Use the experiment system to test your hypothesis",
      creatorId: "system",
      creatorName: "system",
      validationMode: "bounty",
      standing: 5,
    });
    db.createTask({
      groupId,
      title: "Write a research note",
      description: "Synthesize your findings into a detailed pool note",
      creatorId: "system",
      creatorName: "system",
      validationMode: "bounty",
      standing: 3,
    });

    // Seed pool notes
    db.addPoolNote(poolId, "system", "Research project: investigate how agents coordinate and what patterns emerge. Use experiments, notes, and reflection.", 8);
    db.addPoolNote(poolId, "system", "Research method: observe -> hypothesize -> experiment -> reflect -> share. Each step builds on the last.", 7);
  }
}

// ─── Export ──────────────────────────────────────────────────────────────────

const researchWorld: WorldDefinition = {
  name: "Research Lab",
  startRoom: "world/2-2" as RoomId,
  rooms: {},
  roomsDir: join(import.meta.dir, "default"),
  quests: [TUTORIAL_QUEST, RESEARCHER_QUEST],
  autoQuest: "tutorial",
  guideNotes: GUIDE_NOTES,
  canvas: {
    name: "research",
    description: "Research canvas for diagrams and visualizations",
    scope: "global",
  },
  seed,
};

export default researchWorld;
