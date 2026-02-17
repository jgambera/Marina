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
