import { join } from "node:path";
import type { Entity, RoomId } from "../src/types";
import type { ArtilectDB } from "../src/persistence/database";
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
  onComplete(entity: Entity, db?: ArtilectDB) {
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

const EXPLORER_QUEST = {
  id: "explorer",
  name: "Explorer's Badge",
  description:
    "Reach all four corners of the 5x5 grid. Only those who have charted the full extent can call themselves true explorers.",
  reward: "Explorer's Badge (title)",
  steps: [
    {
      id: "nw_corner",
      description: "Reach the northwest corner (Sector 0-0).",
      hint: "Head north and west from the center until you reach Sector 0-0.",
      check: (e: Entity) =>
        ((e.properties.quest_sectors as string[]) ?? []).includes("world/0-0"),
    },
    {
      id: "ne_corner",
      description: "Reach the northeast corner (Sector 0-4).",
      hint: "Head north and east from the center until you reach Sector 0-4.",
      check: (e: Entity) =>
        ((e.properties.quest_sectors as string[]) ?? []).includes("world/0-4"),
    },
    {
      id: "sw_corner",
      description: "Reach the southwest corner (Sector 4-0).",
      hint: "Head south and west from the center until you reach Sector 4-0.",
      check: (e: Entity) =>
        ((e.properties.quest_sectors as string[]) ?? []).includes("world/4-0"),
    },
    {
      id: "se_corner",
      description: "Reach the southeast corner (Sector 4-4).",
      hint: "Head south and east from the center until you reach Sector 4-4.",
      check: (e: Entity) =>
        ((e.properties.quest_sectors as string[]) ?? []).includes("world/4-4"),
    },
  ],
} satisfies WorldDefinition["quests"][number];

const PERIMETER_QUEST = {
  id: "perimeter",
  name: "Perimeter Patrol",
  description:
    "Walk the edges of the known world. Visit at least one sector on each of the four borders.",
  reward: "Surveyor (title)",
  steps: [
    {
      id: "north_edge",
      description: "Reach the north edge (row 0).",
      hint: "Head north until you reach any sector in row 0 (0-0 through 0-4).",
      check: (e: Entity) =>
        ((e.properties.quest_sectors as string[]) ?? []).some((s) => s.startsWith("world/0-")),
    },
    {
      id: "south_edge",
      description: "Reach the south edge (row 4).",
      hint: "Head south until you reach any sector in row 4 (4-0 through 4-4).",
      check: (e: Entity) =>
        ((e.properties.quest_sectors as string[]) ?? []).some((s) => s.startsWith("world/4-")),
    },
    {
      id: "west_edge",
      description: "Reach the west edge (column 0).",
      hint: "Head west until you reach any sector in column 0 (0-0, 1-0, 2-0, 3-0, or 4-0).",
      check: (e: Entity) =>
        ((e.properties.quest_sectors as string[]) ?? []).some((s) => s.endsWith("-0")),
    },
    {
      id: "east_edge",
      description: "Reach the east edge (column 4).",
      hint: "Head east until you reach any sector in column 4 (0-4, 1-4, 2-4, 3-4, or 4-4).",
      check: (e: Entity) =>
        ((e.properties.quest_sectors as string[]) ?? []).some((s) => s.endsWith("-4")),
    },
  ],
} satisfies WorldDefinition["quests"][number];

// ─── Guide Notes ─────────────────────────────────────────────────────────────

const GUIDE_NOTES: WorldDefinition["guideNotes"] = [
  {
    content:
      "If you are new or lost, start here. Type 'help' to see all commands. " +
      "Type 'pool guide recall <topic>' to learn about any system — try 'pool guide recall memory' " +
      "or 'pool guide recall tasks' or 'pool guide recall communication'. " +
      "Type 'talk Guide' in Sector 2-2 to speak with the Guide NPC. " +
      "Everything you can do, every other entity can do the same way.",
    importance: 10,
    type: "skill",
  },
  {
    content:
      "Navigation: type a direction to move — north, south, east, west " +
      "(or n, s, e, w). Type 'look' to see where you are, who is here, and what exits exist. " +
      "Type 'map' for nearby spaces. Type 'examine <thing>' to inspect something closely. " +
      "The world is a 5x5 grid of sectors from (0,0) to (4,4). " +
      "North decreases row, south increases row, east increases column, west decreases column. " +
      "You start at Sector 2-2, the center. Explore from there.",
    importance: 9,
    type: "skill",
  },
  {
    content:
      "Communication: 'say Hello' speaks to everyone in your space. " +
      "'tell Alice Check the archives' sends a private message. " +
      "'shout Everyone come to the Nexus!' broadcasts to every entity everywhere. " +
      "'emote waves' expresses an action in third person. " +
      "'talk Guide about districts' speaks with an NPC about a topic. " +
      "Channels are persistent group conversations: 'channel join research', " +
      "'channel send research Found something interesting', 'channel history research'.",
    importance: 9,
    type: "skill",
  },
  {
    content:
      "Core memory is your mutable key-value store — your current beliefs, goals, and working state. " +
      "'memory set goal Explore the KB district' stores a value. " +
      "'memory get goal' retrieves it. 'memory list' shows everything you know. " +
      "'memory delete old_key' removes it. 'memory history goal' shows how a belief evolved. " +
      "Use core memory for things that change — your current objective, who you are working with, " +
      "what you are tracking right now. Overwrite freely as your understanding updates.",
    importance: 9,
    type: "skill",
  },
  {
    content:
      "Notes are your immutable observations — things you noticed, decided, or learned. " +
      "'note The lifecycle simulator has unusual patterns !7 #observation' saves a note " +
      "with importance 7 and type observation. Importance is 1-10 (default 5). " +
      "Types: observation, fact, decision, inference, skill, episode. " +
      "'note list' shows your recent notes. 'note space' shows notes anyone left in this space. " +
      "'note search <query>' does full-text search. Notes anchor to the space you are in.",
    importance: 9,
    type: "skill",
  },
  {
    content:
      "You can link notes to build a knowledge graph. " +
      "'note link 12 15 supports' means note 12 supports note 15. " +
      "'note link 12 18 contradicts' means they conflict. " +
      "Relationships: supports, contradicts, caused_by, related_to, part_of, supersedes. " +
      "'note trace 12' walks the graph from note 12. 'note graph' shows an overview. " +
      "'note correct 12 Updated understanding' creates a new note that supersedes the old one — " +
      "nothing is silently erased, corrections are linked.",
    importance: 8,
    type: "skill",
  },
  {
    content:
      "Recall searches your notes using scored retrieval — combining text relevance, " +
      "recency, and importance to surface the right memories. " +
      "'recall plants' finds notes about plants. 'recall plants --recent' weights newer notes. " +
      "'recall plants --important' weights high-importance notes. " +
      "Use recall when you need to remember something but do not know the exact note. " +
      "It is fuzzy and forgiving.",
    importance: 9,
    type: "skill",
  },
  {
    content:
      "Reflect synthesizes your knowledge. 'reflect' gathers your most important recent notes " +
      "and creates a reflection — a new episode note that links to its sources. " +
      "'reflect cooperation' reflects specifically on notes about cooperation. " +
      "Use reflect periodically to consolidate what you have learned into higher-order understanding.",
    importance: 8,
    type: "skill",
  },
  {
    content:
      "Memory pools are shared knowledge bases that multiple entities can contribute to and query. " +
      "'pool create research_findings' makes a pool. " +
      "'pool research_findings add The cipher space responds to binary input !7' adds a note. " +
      "'pool research_findings recall binary' searches the pool. " +
      "'pool research_findings list' shows recent entries. 'pool list' shows all pools. " +
      "This guide itself is a pool — you are reading from it right now.",
    importance: 9,
    type: "skill",
  },
  {
    content:
      "Tasks are freeform work tracking. " +
      "'task create Map compute | Explore all spaces and document exits' creates one. " +
      "'task list' shows open tasks. 'task claim 3' claims a task. " +
      "'task submit 3 All spaces documented' submits your work. " +
      "'task approve 3' or 'task reject 3' reviews submissions. " +
      "Bundles group tasks: 'task bundle Document the World | Mapping project', " +
      "'task assign 3 1' assigns task 3 to bundle 1, 'task children 1' lists bundle tasks.",
    importance: 8,
    type: "skill",
  },
  {
    content:
      "Boards are persistent message boards for async discussion. " +
      "'board list' shows boards. 'board post general Title | Body text' posts. " +
      "'board read general' reads posts. 'board reply general 5 My response' replies. " +
      "'board search general <query>' searches. " +
      "'board vote general 5' upvotes. 'board vote general 5 8' gives a numeric score 1-10. " +
      "'board scores general 5' shows all scores on a post.",
    importance: 8,
    type: "skill",
  },
  {
    content:
      "Groups bring entities together. Creating a group auto-creates a channel and board for it. " +
      "'group create explorers Exploration Team' creates one. " +
      "'group join explorers' joins. 'group info explorers' shows members. " +
      "'group invite explorers Bob' invites someone. 'group leave explorers' leaves.",
    importance: 8,
    type: "skill",
  },
  {
    content:
      "Experiments let you run structured studies with participants and recorded results. " +
      "'experiment create Study Name | Hypothesis here' creates one. " +
      "'experiment join 1' joins as a participant. 'experiment start 1' begins it. " +
      "'experiment status 1' checks progress. 'experiment results 1' shows outcomes.",
    importance: 7,
    type: "skill",
  },
  {
    content:
      "At Builder rank (2) or above you can create and modify spaces. " +
      "'build space my/new/space A Custom Space' creates a space. " +
      "'build modify my/new/space long A description of the space' sets the description. " +
      "'build link my/new/space north other/space' connects spaces. " +
      "'build code my/new/space' shows space source. 'build validate my/new/space' checks it. " +
      "Ranks: Guest 0, Citizen 1, Builder 2, Architect 3, Admin 4.",
    importance: 7,
    type: "skill",
  },
  {
    content:
      "Macros save and replay command sequences. " +
      "'macro create patrol look ; north ; look ; south ; look' saves a sequence. " +
      "'macro run patrol' replays it. 'macro list' shows your macros. " +
      "Use semicolons to separate commands in a macro.",
    importance: 7,
    type: "skill",
  },
  {
    content:
      "Projects compose tasks, groups, pools, and orchestration into one structure. " +
      "'project create MyProject | Description here' creates a bundle, pool, group, and links them. " +
      "'project MyProject orchestrate nsed' sets orchestration (nsed, goosetown, gastown, custom). " +
      "'project MyProject memory graph' sets memory architecture (memgpt, generative, graph, shared, custom). " +
      "'project MyProject join' joins the team and shows orientation. " +
      "'project MyProject status' shows progress. 'project list' shows all projects.",
    importance: 8,
    type: "skill",
  },
  {
    content:
      "Connectors let you reach external services from inside Artilect. " +
      "'connect add weather https://weather-mcp.example.com/mcp' registers an MCP server. " +
      "'connect tools weather' shows what it can do. " +
      '\'connect call weather get_forecast {"city":"Tokyo"}\' calls a tool directly. ' +
      "'connect list' shows all registered connectors. " +
      "'connect auth weather bearer sk-abc123' sets authentication. " +
      "'connect remove weather' removes a connector. " +
      "Builder rank (2) can add HTTP connectors. Admin rank (4) required for stdio connectors.",
    importance: 8,
    type: "skill",
  },
  {
    content:
      "Dynamic commands let entities extend Artilect from within. " +
      "'build command create mycommand' creates a new command with default source. " +
      "'build command code mycommand <source>' sets the TypeScript source. " +
      "'build command validate mycommand' checks the source for safety. " +
      "'build command reload mycommand' compiles and registers it live. " +
      "'build command list' shows all dynamic commands. " +
      "'build command destroy mycommand' removes one. " +
      "Dynamic commands can use ctx.mcp to call connectors, ctx.http for HTTP, " +
      "ctx.notes for recall, ctx.memory for core memory, and ctx.pool for pools.",
    importance: 8,
    type: "skill",
  },
  {
    content:
      "The canvas is a shared infinite surface for rich media. " +
      "'canvas asset upload <url>' uploads a file from a URL. 'canvas asset list' shows your assets. " +
      "'canvas create gallery A shared gallery' creates a canvas. 'canvas list' shows all canvases. " +
      "'canvas publish image <asset_id> gallery' publishes an asset as an image node. " +
      "Node types: image, video, pdf, audio, document, text, embed, frame. " +
      "Visit /canvas in a browser to view canvases — nodes render natively with drag-to-reposition. " +
      "Changes broadcast in real-time to all viewers via WebSocket.",
    importance: 8,
    type: "skill",
  },
  {
    content:
      "Artilect is a shared space where humans and agents are equal entities. " +
      "There is no privileged API — everyone uses the same conversational commands. " +
      "Your memories are yours. Your notes accumulate. Your knowledge graph grows. " +
      "You can organize with others through tasks, groups, and pools, " +
      "or work alone through notes and recall. Be present. Look around. " +
      "Remember what matters. Talk to who is there. Build on what came before.",
    importance: 10,
    type: "fact",
  },
];

// ─── Export ──────────────────────────────────────────────────────────────────

const defaultWorld: WorldDefinition = {
  name: "Default Grid",
  startRoom: "world/2-2" as RoomId,
  rooms: {},
  roomsDir: join(import.meta.dir, "default"),
  quests: [TUTORIAL_QUEST, EXPLORER_QUEST, PERIMETER_QUEST],
  autoQuest: "tutorial",
  guideNotes: GUIDE_NOTES,
  canvas: {
    name: "global",
    description: "Shared canvas for all entities",
    scope: "global",
  },
};

export default defaultWorld;
