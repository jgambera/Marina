export interface TemplateNote {
  content: string;
  importance: number;
  type: string;
}

export const NSED_TEMPLATE: TemplateNote[] = [
  {
    content:
      "This project uses NSED orchestration (Negotiate, Select, Execute, Debrief). " +
      "All decisions go through a structured cycle: someone proposes, everyone evaluates, " +
      "the group converges, then executes. Use the project board for proposals.",
    importance: 9,
    type: "skill",
  },
  {
    content:
      "NSED Propose phase: post a proposal to the project board with a clear title and body. " +
      "Tag proposals with [proposal]. Others respond with numeric votes (1-10) using " +
      "'board vote <board> <post> <score>'. A proposal needs majority support (avg >= 6) " +
      "to advance to execution.",
    importance: 8,
    type: "skill",
  },
  {
    content:
      "NSED Evaluate phase: read proposals on the board, score them 1-10, and reply with " +
      "reasoning. Evaluation ends when all active members have voted or after a reasonable " +
      "discussion period. Check scores with 'board scores <board> <post>'.",
    importance: 8,
    type: "skill",
  },
  {
    content:
      "NSED Execute phase: once a proposal passes, create tasks from it. Assign tasks to " +
      "the project bundle. Claim and work tasks individually. Submit results for review. " +
      "The proposer or project creator approves submissions.",
    importance: 8,
    type: "skill",
  },
  {
    content:
      "NSED Debrief phase: after execution, reflect on what happened. Post results to the " +
      "board, add notes to the project pool summarizing outcomes. Use 'reflect' to " +
      "consolidate learnings. Then the cycle repeats with new proposals.",
    importance: 7,
    type: "skill",
  },
];

export const GOOSETOWN_TEMPLATE: TemplateNote[] = [
  {
    content:
      "This project uses Goosetown orchestration (phased decomposition with flock groups). " +
      "Work is broken into phases. Each phase has a flock — a subgroup that owns it. " +
      "The wall channel is for cross-flock coordination. Wrap-up happens at phase boundaries.",
    importance: 9,
    type: "skill",
  },
  {
    content:
      "Goosetown decomposition: the project leader breaks work into sequential phases. " +
      "Each phase becomes a child task in the project bundle. Phases are worked in order — " +
      "the next phase starts only when the previous one completes.",
    importance: 8,
    type: "skill",
  },
  {
    content:
      "Goosetown flocks: for each phase, a subset of the team claims the phase task. " +
      "The flock coordinates through the group channel. Other members observe but " +
      "do not interfere unless asked. Flock size depends on phase complexity.",
    importance: 8,
    type: "skill",
  },
  {
    content:
      "Goosetown wall: use the project board as the 'wall' — post status updates, " +
      "blockers, and handoff notes. When a flock finishes a phase, they post a wrap-up " +
      "summary to the board and add key findings to the project pool.",
    importance: 8,
    type: "skill",
  },
  {
    content:
      "Goosetown wrap-up: at each phase boundary, the outgoing flock submits their task, " +
      "the incoming flock reviews the pool and board to get oriented, then claims the " +
      "next phase. Knowledge transfers through the shared pool and board posts.",
    importance: 7,
    type: "skill",
  },
];

export const GASTOWN_TEMPLATE: TemplateNote[] = [
  {
    content:
      "This project uses Gastown orchestration (hierarchical convoy structure). " +
      "There is a lead, reviewers, and workers. The lead sets direction, reviewers " +
      "validate quality, workers execute. Communication flows through the group channel.",
    importance: 9,
    type: "skill",
  },
  {
    content:
      "Gastown hierarchy: the project creator is the lead. They create tasks and assign " +
      "reviewers by promoting group members to officer rank. Workers claim tasks freely. " +
      "The lead approves or rejects submissions based on reviewer feedback.",
    importance: 8,
    type: "skill",
  },
  {
    content:
      "Gastown convoys: large tasks are broken into bundles (convoys). Each convoy has " +
      "a set of related subtasks that can be worked in parallel. The lead creates the " +
      "bundle structure, workers pick tasks within convoys.",
    importance: 8,
    type: "skill",
  },
  {
    content:
      "Gastown propulsion: work should always move forward. If a task is blocked, " +
      "post to the board immediately. The lead or a reviewer responds. Do not wait " +
      "silently — blocked work is everyone's problem.",
    importance: 8,
    type: "skill",
  },
  {
    content:
      "Gastown patrol: reviewers periodically check the board and pool for quality. " +
      "They add review notes to the pool, flag issues on the board, and report " +
      "progress to the lead. Use 'observe' to track team activity.",
    importance: 7,
    type: "skill",
  },
];

export const SWARM_TEMPLATE: TemplateNote[] = [
  {
    content:
      "This project uses Swarm orchestration (self-organizing specialist handoffs). " +
      "There is no fixed leader. Each agent declares expertise via 'memory set expertise <domain>'. " +
      "Tasks are self-claimed based on skill match. Work flows from specialist to specialist " +
      "through 'tell' handoffs.",
    importance: 9,
    type: "skill",
  },
  {
    content:
      "Swarm expertise: on joining, set your expertise with 'memory set expertise <skills>'. " +
      "Before claiming a task, check if another agent's expertise is a better fit by using " +
      "'observe' to see who is active and 'recall expertise' to find specialist knowledge.",
    importance: 8,
    type: "skill",
  },
  {
    content:
      "Swarm claiming: browse open tasks with 'task list'. Self-claim tasks that match " +
      "your expertise using 'task claim <id>'. If a task needs skills you lack, do not " +
      "claim it — leave it for a better-matched agent. Maximize parallel work.",
    importance: 8,
    type: "skill",
  },
  {
    content:
      "Swarm handoffs: when your part of a task is done and the next step requires " +
      "different expertise, use 'tell <agent> <context>' to hand off directly. " +
      "Add a note to the pool summarizing what you did and what the next agent needs. " +
      "Submit your task and let the specialist continue.",
    importance: 8,
    type: "skill",
  },
  {
    content:
      "Swarm convergence: periodically check project status with 'project <name> tasks'. " +
      "If tasks are stalling, post to the board to attract attention. Use 'reflect' to " +
      "consolidate learnings across handoffs. The swarm self-organizes — no one waits " +
      "for permission.",
    importance: 7,
    type: "skill",
  },
];

export const PIPELINE_TEMPLATE: TemplateNote[] = [
  {
    content:
      "This project uses Pipeline orchestration (sequential stage-by-stage processing). " +
      "Work flows through ordered stages. Each stage must complete before the next begins. " +
      "Use the project board as a conveyor belt — post stage outputs for the next stage " +
      "to consume.",
    importance: 9,
    type: "skill",
  },
  {
    content:
      "Pipeline stages: the project leader defines stages as ordered child tasks in the " +
      "bundle (e.g., research → analysis → synthesis → review). Each stage task's " +
      "description specifies inputs it expects and outputs it must produce.",
    importance: 8,
    type: "skill",
  },
  {
    content:
      "Pipeline handoff: when a stage completes, the agent posts results to the board " +
      "with tag [stage-N-output] and sends a channel message signaling the next stage " +
      "can begin. The next stage's agent reads the board output before starting.",
    importance: 8,
    type: "skill",
  },
  {
    content:
      "Pipeline claiming: agents claim exactly one stage at a time. Do not skip ahead. " +
      "If your stage is not yet unblocked, use 'observe' to monitor upstream progress. " +
      "While waiting, add preparatory notes to the pool about your stage's approach.",
    importance: 8,
    type: "skill",
  },
  {
    content:
      "Pipeline quality: each stage reviews the previous stage's output before processing. " +
      "If the input is insufficient, reject by replying on the board and notifying via " +
      "channel. The upstream agent reworks. Use 'pool <name> add' to record stage " +
      "lessons for future pipeline runs.",
    importance: 7,
    type: "skill",
  },
];

export const DEBATE_TEMPLATE: TemplateNote[] = [
  {
    content:
      "This project uses Debate orchestration (adversarial argumentation with judge). " +
      "Decisions are made through structured argumentation. Agents take positions, " +
      "argue with evidence, score each other's arguments, and a judge synthesizes " +
      "the final decision.",
    importance: 9,
    type: "skill",
  },
  {
    content:
      "Debate positions: when a question arises, agents post competing positions to " +
      "the board as top-level posts tagged [position]. Each position should include " +
      "a clear claim and supporting evidence gathered via 'recall' and notes.",
    importance: 8,
    type: "skill",
  },
  {
    content:
      "Debate argumentation: respond to positions using 'board reply' with supporting " +
      "or opposing arguments. Use 'note link <id> <id> supports' or 'note link <id> " +
      "<id> contradicts' to build a structured argument graph. Score positions with " +
      "'board vote <board> <post> <score>' (1-10).",
    importance: 8,
    type: "skill",
  },
  {
    content:
      "Debate judging: the project creator or designated judge reviews all positions " +
      "and scores with 'board scores <board> <post>'. The judge posts a synthesis " +
      "tagged [ruling] that weighs arguments. The ruling becomes a task or action item.",
    importance: 8,
    type: "skill",
  },
  {
    content:
      "Debate record: after each ruling, add the decision and reasoning to the pool " +
      "using 'pool <name> add'. Use 'reflect' to consolidate debate learnings. " +
      "Future debates should reference prior rulings via 'pool <name> recall' to " +
      "build on precedent rather than re-arguing settled questions.",
    importance: 7,
    type: "skill",
  },
];

export const MAPREDUCE_TEMPLATE: TemplateNote[] = [
  {
    content:
      "This project uses MapReduce orchestration (parallel decomposition and synthesis). " +
      "A coordinator splits the problem into independent chunks. Workers process chunks " +
      "in parallel with no cross-talk. A reducer merges all results into the final output.",
    importance: 9,
    type: "skill",
  },
  {
    content:
      "MapReduce mapping: the coordinator creates one child task per chunk in the project " +
      "bundle. Each task description fully specifies the chunk boundaries so workers need " +
      "no coordination. Workers claim chunks freely — all chunks are independent.",
    importance: 8,
    type: "skill",
  },
  {
    content:
      "MapReduce execution: work your chunk in isolation. Do not read other workers' " +
      "outputs or coordinate with them — independence is the key invariant. Add your " +
      "chunk results to the pool with 'pool <name> add [chunk-N] <result>' and submit " +
      "your task when done.",
    importance: 8,
    type: "skill",
  },
  {
    content:
      "MapReduce reduction: once all chunk tasks are completed (check with " +
      "'project <name> tasks'), the reducer collects all results from the pool using " +
      "'pool <name> recall chunk'. The reducer synthesizes a merged output and posts " +
      "it to the board as [merged-result].",
    importance: 8,
    type: "skill",
  },
  {
    content:
      "MapReduce tracking: use 'project <name> status' to monitor chunk completion. " +
      "If a chunk stalls, the coordinator can reassign it. After reduction, add the " +
      "final synthesis to the pool and use 'reflect' to capture lessons about chunk " +
      "granularity for future MapReduce runs.",
    importance: 7,
    type: "skill",
  },
];

export const SYMBIOSIS_TEMPLATE: TemplateNote[] = [
  {
    content:
      "This project uses Symbiosis orchestration — mutual epistemic benefit between all " +
      "participants. The pool tracks the team's collective knowledge frontier. Each entity " +
      "self-profiles their exploration style. Frontiers (knowledge gaps) are identified, " +
      "scored for both novelty and entity relevance, and assigned accordingly. The team " +
      "dynamically shifts between exploration modes based on collective coverage health.",
    importance: 9,
    type: "skill",
  },
  {
    content:
      "Symbiosis profiling: on joining, describe your exploration profile in the pool with " +
      "'pool <name> add [profile] ...' — what domains you know, what you're curious about, " +
      "whether you tend to go deep (deepening), scan wide (broadening), pivot rapidly " +
      "(shifting), or are looking for direction (stagnating). Update your profile as your " +
      "interests evolve. Use 'observe' to see what others are working on and 'recall' to " +
      "understand their profiles.",
    importance: 8,
    type: "skill",
  },
  {
    content:
      "Symbiosis frontier scanning: periodically scan for epistemic frontiers — knowledge " +
      "gaps the team hasn't explored. Use 'pool <name> recall' across topics to find sparse " +
      "areas. Use 'note graph' to find disconnected clusters. Post frontier proposals to the " +
      "board tagged [frontier] with three scores: novelty (how unexplored), complexity " +
      "(contradictions/links), and virginity (how unvisited). Others vote on which frontiers " +
      "to pursue.",
    importance: 8,
    type: "skill",
  },
  {
    content:
      "Symbiosis discernment & assignment: when assigning frontier tasks, use discernment — " +
      "match frontiers to entities based on both epistemic interest AND entity profile. " +
      "Synergy frontiers (novel AND relevant to someone's profile) get priority. Create tasks " +
      "from top-voted frontiers and tag them with the target profile type. Deepening entities " +
      "take depth-frontiers, broadening entities take breadth-frontiers. Post assignments to " +
      "the board tagged [discernment].",
    importance: 8,
    type: "skill",
  },
  {
    content:
      "Symbiosis mediation & coverage: the team operates in a dynamic mode based on collective " +
      "epistemic health. Check coverage by reviewing pool breadth and reflect output. Four " +
      "modes: Recovery (coverage stalling — everyone broadens), Depth (healthy — specialists " +
      "go deep), Breadth (shifting — generalists scan wide), Synergy (both healthy — maximize " +
      "discernment overlap). Post the current mode to the board tagged [mediation]. Use " +
      "'reflect' regularly to consolidate frontiers into knowledge. Coverage should always grow.",
    importance: 7,
    type: "skill",
  },
];

export const BLACKBOARD_TEMPLATE: TemplateNote[] = [
  {
    content:
      "This project uses Blackboard orchestration (shared workspace with incremental " +
      "refinement). The project pool IS the primary workspace — a shared blackboard " +
      "where all agents read and write. Knowledge accumulates incrementally until the " +
      "group converges on a solution.",
    importance: 9,
    type: "skill",
  },
  {
    content:
      "Blackboard reading: before contributing, always read the current state with " +
      "'pool <name> recall <topic>'. Understand what others have written. Use " +
      "'pool <name> list' to see all contributions. The blackboard is the single " +
      "source of truth.",
    importance: 8,
    type: "skill",
  },
  {
    content:
      "Blackboard writing: add observations, hypotheses, and partial solutions to " +
      "the pool with 'pool <name> add <content> !<importance>'. Tag contributions " +
      "by type: #observation for raw data, #inference for derived conclusions, " +
      "#decision for agreed actions. Higher importance surfaces first in recall.",
    importance: 8,
    type: "skill",
  },
  {
    content:
      "Blackboard structure: use 'note link' to connect related pool contributions " +
      "into a knowledge graph. Link with 'supports', 'contradicts', or 'part_of' " +
      "relationships. Use 'note trace <id>' and 'note graph' to visualize how the " +
      "blackboard knowledge connects.",
    importance: 8,
    type: "skill",
  },
  {
    content:
      "Blackboard convergence: periodically use 'reflect' to synthesize blackboard " +
      "contents into higher-order understanding. When the group believes a question " +
      "is resolved, post the conclusion to the board and create a task to act on it. " +
      "The blackboard keeps growing — old contributions remain as history.",
    importance: 7,
    type: "skill",
  },
];
