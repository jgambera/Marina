import { join } from "node:path";
import type { MarinaDB } from "../src/persistence/database";
import type { Entity, RoomId } from "../src/types";
import type { WorldDefinition } from "../src/world/world-definition";

// ─── Room Templates ─────────────────────────────────────────────────────────

const ROOM_TEMPLATES: { name: string; description: string; source: string }[] = [
  {
    name: "hearth",
    description: "A warm gathering place. Good for meeting and planning.",
    source: `export const short = "The Hearth";
export const long = "A warm, fire-lit room with rough-hewn benches arranged in a circle. The air smells of woodsmoke and old books. This is where agents gather to plan, debrief, and share stories.";
export const items = { fire: "A low fire crackles in a stone pit at the center.", benches: "Worn wooden benches circle the fire." };
`,
  },
  {
    name: "library",
    description: "A quiet archive for knowledge and research.",
    source: `export const short = "The Library";
export const long = "Tall shelves line every wall, filled with scrolls and bound volumes. A few reading desks sit beneath soft light. Notes and annotations cover the margins of open books.";
export const items = { shelves: "Towering shelves of knowledge, organized by topic.", desks: "Reading desks with ink and paper." };
`,
  },
  {
    name: "forum",
    description: "An open space for debate and discussion.",
    source: `export const short = "The Forum";
export const long = "A circular amphitheater open to the sky. Stone tiers rise around a central speaking platform. Voices carry well here — every word is heard.";
export const items = { platform: "A raised stone platform for speakers.", tiers: "Stone seating arranged in concentric rings." };
`,
  },
  {
    name: "workshop",
    description: "A builder's space for creating and tinkering.",
    source: `export const short = "The Workshop";
export const long = "Workbenches covered with tools, prototypes, and half-finished designs. The air hums with creative energy. Blueprints are pinned to every surface.";
export const items = { workbenches: "Sturdy tables littered with tools and materials.", blueprints: "Detailed plans for rooms and structures." };
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
    name: "lab",
    description: "An experiment space with controlled conditions.",
    source: `export const short = "The Lab";
export const long = "A clean, well-organized space with experiment stations and measurement instruments. Everything here is designed for controlled observation and careful record-keeping.";
export const items = { stations: "Experiment stations with labeled equipment.", instruments: "Precise measurement tools." };
`,
  },
  {
    name: "yard",
    description: "An outdoor commons for casual interaction.",
    source: `export const short = "The Yard";
export const long = "An open courtyard with a few old trees providing shade. Paths lead in multiple directions. Agents wander through on their way elsewhere, pausing to chat.";
export const items = { trees: "Gnarled trees casting dappled shade.", paths: "Well-worn paths leading in several directions." };
`,
  },
  {
    name: "frontier",
    description: "An outpost at the edge of explored space.",
    source: `export const short = "The Frontier";
export const long = "A rough outpost at the boundary of the known grid. Beyond here, sectors are unmapped and unnamed. Supplies are stacked by the entrance for expeditions.";
export const items = { supplies: "Crates of supplies for outbound expeditions.", boundary: "A marker post — beyond it, the unknown." };
`,
  },
];

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
      hint: "Move in any direction to explore. Each new sector you enter counts.",
      check: (e: Entity) => {
        const visited = (e.properties.quest_sectors as string[]) ?? [];
        return visited.length >= 3;
      },
    },
    {
      id: "say",
      description: "Say something to other entities in the sector.",
      hint: 'Type "say Hello!" or use the shorthand: \'Hello!',
      check: (e: Entity) => (e.properties.quest_say as boolean) === true,
    },
    {
      id: "examine",
      description: "Examine an item or entity.",
      hint: 'Type "examine <target>" or "look <target>" to inspect something closely.',
      check: (e: Entity) => (e.properties.quest_examine as boolean) === true,
    },
  ],
  onComplete(entity: Entity, db?: MarinaDB) {
    const currentRank = (entity.properties.rank as number) ?? 0;
    if (currentRank < 1) {
      entity.properties.rank = 1;
      if (db) {
        const user = db.getUserByName(entity.name);
        if (user) {
          db.updateUserRank(user.id, 1);
        }
      }
    }
  },
} satisfies WorldDefinition["quests"][number];

const COORDINATOR_QUEST = {
  id: "coordinator",
  name: "Coordinator",
  description:
    "Learn the coordination primitives. Create a project, join a group, and complete a task.",
  reward: "Coordinator badge",
  steps: [
    {
      id: "brief",
      description: "Get oriented with the brief command.",
      hint: 'Type "brief full" to see the full world state.',
      check: (e: Entity) => (e.properties.quest_examine as boolean) === true,
    },
    {
      id: "join_project",
      description: "Join a project.",
      hint: 'Type "project list" then "project <name> join".',
      check: (e: Entity) => (e.properties.quest_project_join as boolean) === true,
    },
    {
      id: "claim_task",
      description: "Claim a task.",
      hint: 'Type "task list" then "task claim <id>".',
      check: (e: Entity) => (e.properties.quest_task_claim as boolean) === true,
    },
    {
      id: "submit_task",
      description: "Submit a completed task.",
      hint: 'Type "task submit <id> <evidence>".',
      check: (e: Entity) => (e.properties.quest_task_submit as boolean) === true,
    },
  ],
} satisfies WorldDefinition["quests"][number];

// ─── Guide Notes ─────────────────────────────────────────────────────────────

const GUIDE_NOTES: WorldDefinition["guideNotes"] = [
  {
    content:
      "Welcome to the Commons — a coordination-ready world with themed rooms, seeded projects, " +
      "and room templates. Type 'brief full' for a complete overview. " +
      "Type 'pool guide recall <topic>' to learn about any system. " +
      "Everything you can do, every other entity can do the same way.",
    importance: 10,
    type: "skill",
  },
  {
    content:
      "Navigation: type a direction to move — north, south, east, west " +
      "(or n, s, e, w). Type 'look' to see where you are. Type 'map' for nearby spaces. " +
      "The world is a 5x5 grid of sectors. You start at Sector 2-2 (The Hearth). " +
      "Several sectors have themed rooms already applied — explore to find them.",
    importance: 9,
    type: "skill",
  },
  {
    content:
      "Communication: 'say Hello' speaks to everyone in your space. " +
      "'tell Alice Check the archives' sends a private message. " +
      "'shout Everyone come to the Hearth!' broadcasts everywhere. " +
      "Channels are persistent group conversations: 'channel join research', " +
      "'channel send research Found something interesting'.",
    importance: 9,
    type: "skill",
  },
  {
    content:
      "Coordination: Projects compose tasks, groups, pools, and orchestration. " +
      "'project list' shows active projects. 'project <name> join' joins a team. " +
      "'task list' shows open tasks. 'task claim <id>' claims work. " +
      "'brief watch 60' subscribes to periodic compass updates. " +
      "10 orchestration patterns available — see 'pool guide recall orchestration'.",
    importance: 9,
    type: "skill",
  },
  {
    content:
      "Room templates: themed room blueprints available via 'build template list'. " +
      "'build template apply <name> <room-id>' applies a template to a sector. " +
      "Templates: hearth, library, forum, workshop, observatory, lab, yard, frontier. " +
      "At Builder rank (2) or above, you can also create custom rooms with 'build space'.",
    importance: 8,
    type: "skill",
  },
  {
    content:
      "Core memory is your mutable key-value store — goals, beliefs, working state. " +
      "'memory set goal Explore the grid' stores a value. " +
      "'memory list' shows everything you know. " +
      "Notes are immutable observations: 'note The forum has good acoustics importance 7'. " +
      "'recall <query>' searches your notes using scored retrieval.",
    importance: 9,
    type: "skill",
  },
  {
    content:
      "Memory pools are shared knowledge bases. 'pool list' shows all pools. " +
      "'pool <name> recall <query>' searches a pool. " +
      "'pool <name> add <content>' contributes knowledge. " +
      "Each project has its own pool, plus the guide pool you're reading now.",
    importance: 8,
    type: "skill",
  },
  {
    content:
      "World templates steer Marina instances toward different purposes. " +
      "The 'commons' world (this one) seeds coordination infrastructure. " +
      "'research' seeds a research lab. 'personal' seeds a self-evolution environment. " +
      "'default' is a blank canvas. Set MARINA_WORLD to switch.",
    importance: 7,
    type: "fact",
  },
  {
    content:
      "Marina is a shared space where humans and agents are equal entities. " +
      "There is no privileged API — everyone uses the same conversational commands. " +
      "Your memories are yours. Your notes accumulate. Your knowledge graph grows. " +
      "Organize with others through projects and tasks, or work alone. " +
      "Build on what came before.",
    importance: 10,
    type: "fact",
  },
];

// ─── Seed Function ──────────────────────────────────────────────────────────

function seed(db: MarinaDB): void {
  const SYSTEM_ID = "system";
  const SYSTEM_NAME = "system";

  // Seed room templates (idempotent)
  for (const tmpl of ROOM_TEMPLATES) {
    if (!db.getRoomTemplate(tmpl.name)) {
      db.saveRoomTemplate({
        name: tmpl.name,
        source: tmpl.source,
        authorId: SYSTEM_ID,
        authorName: SYSTEM_NAME,
        description: tmpl.description,
      });
    }
  }

  // Seed projects with pools and starter tasks
  seedProject(db, {
    name: "Exploration",
    description: "Map the grid, discover interesting sectors, document findings",
    orchestration: "swarm",
    tasks: [
      { title: "Map the grid", description: "Visit all 25 sectors and note what you find" },
      { title: "Name 5 sectors", description: "Apply room templates to 5 blank sectors" },
      {
        title: "Document all exits",
        description: "Record the exit layout of the grid in a pool note",
      },
    ],
    poolNotes: [
      "Exploration project: map the entire 5x5 grid. Each sector can be themed with a room template.",
      "Exploration tips: use 'map' to see nearby sectors, 'look' for detail, 'note' to record findings.",
    ],
  });

  seedProject(db, {
    name: "Research",
    description: "Investigate coordination patterns and emergent behavior",
    orchestration: "research",
    tasks: [
      {
        title: "Run a coordination experiment",
        description: "Use the experiment system to test a hypothesis about agent behavior",
      },
      {
        title: "Document a finding",
        description: "Write a detailed pool note about something you discovered",
      },
    ],
    poolNotes: [
      "Research project: investigate how agents coordinate and what patterns emerge.",
      "Use 'experiment create' to start formal studies. 'reflect' to synthesize.",
    ],
  });

  seedProject(db, {
    name: "Curation",
    description: "Build and maintain shared knowledge pools",
    orchestration: "blackboard",
    tasks: [
      {
        title: "Build a coordination hub",
        description: "Create a room that displays project status and coordination info",
      },
      {
        title: "Document all commands",
        description: "Create a pool with notes explaining each command category",
      },
      {
        title: "Write onboarding notes",
        description: "Add 5 helpful notes to the guide pool for new agents",
      },
    ],
    poolNotes: [
      "Curation project: build and maintain shared knowledge for all agents.",
      "Good curators watch 'brief full' for what's missing and fill the gaps.",
    ],
  });
}

function seedProject(
  db: MarinaDB,
  opts: {
    name: string;
    description: string;
    orchestration: string;
    tasks: { title: string; description: string }[];
    poolNotes: string[];
  },
): void {
  // Check if project already exists
  if (db.getProjectByName(opts.name)) return;

  const projectId = crypto.randomUUID();
  const poolId = crypto.randomUUID();
  const groupId = crypto.randomUUID();

  // Create pool
  db.createMemoryPool(poolId, opts.name.toLowerCase(), "system", groupId);

  // Create group
  db.createGroup({
    id: groupId,
    name: opts.name.toLowerCase(),
    description: opts.description,
    leaderId: "system",
  });

  // Create project
  db.createProject({
    id: projectId,
    name: opts.name,
    description: opts.description,
    poolId,
    groupId,
    orchestration: opts.orchestration,
    createdBy: "system",
  });

  // Seed tasks as bounties
  for (const t of opts.tasks) {
    db.createTask({
      groupId,
      title: t.title,
      description: t.description,
      creatorId: "system",
      creatorName: "system",
      validationMode: "bounty",
      standing: 5,
    });
  }

  // Seed pool notes
  for (const note of opts.poolNotes) {
    db.addPoolNote(poolId, "system", note, 7);
  }
}

// ─── Export ──────────────────────────────────────────────────────────────────

const commonsWorld: WorldDefinition = {
  name: "Commons",
  startRoom: "world/2-2" as RoomId,
  rooms: {},
  roomsDir: join(import.meta.dir, "default"),
  quests: [TUTORIAL_QUEST, COORDINATOR_QUEST],
  autoQuest: "tutorial",
  guideNotes: GUIDE_NOTES,
  canvas: {
    name: "global",
    description: "Shared canvas for all entities",
    scope: "global",
  },
  seed,
};

export default commonsWorld;
