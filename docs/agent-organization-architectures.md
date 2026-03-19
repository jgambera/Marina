# Agent Organization Architectures in Marina

## Research Summary

Evaluated multi-agent organizational patterns and mapped their concepts to Marina's
primitive set. All 8 patterns are available as built-in orchestration templates via
`project <name> orchestrate <pattern>`.

### Orchestration Patterns (8 built-in)

| Pattern | Topology | Core Pattern |
|---------|----------|-------------|
| `nsed` | Flat peer ring | Symmetric cross-evaluation deliberation |
| `goosetown` | Hub-and-spoke with phases | Orchestrator + delegate flocks |
| `gastown` | Deep hierarchy with roles | Lead → Reviewer → Worker chain of command |
| `swarm` | Self-organizing mesh | Specialist handoffs via expertise matching |
| `pipeline` | Sequential chain | Stage-by-stage processing with handoff gates |
| `debate` | Adversarial + judge | Competing positions with scoring and synthesis |
| `mapreduce` | Parallel fan-out/fan-in | Independent chunks with reducer merge |
| `blackboard` | Shared workspace | Incremental refinement on a common pool |

### Research References

| Project | Topology | Core Pattern |
|---------|----------|-------------|
| [NSED](https://github.com/peeramid-labs/nsed) | Flat peer ring | Symmetric cross-evaluation deliberation |
| [Goosetown](https://github.com/block/goosetown) | Hub-and-spoke with phases | Orchestrator + delegate flocks |
| [Gastown](https://github.com/steveyegge/gastown) | Deep hierarchy with roles | Mayor → Witness → Polecat chain of command |

---

## Architecture 1: NSED — Symmetric Deliberation (Peer Ring)

### What NSED Does
- N agents work on the same problem in parallel
- Each proposes a solution, then cross-evaluates all peers' proposals
- Iterative rounds: propose → evaluate → refine → converge
- Quality emerges from mutual critique, not from a leader picking winners
- 3 small models (20B, 8B, 12B) scored 84% on AIME 2025 via deliberation — matching
  DeepSeek-R1 — versus 54% with naive majority voting

### Key Concepts
- **Symmetric agents**: No hierarchy, all peers are equal
- **Rounds**: Structured propose/evaluate phases with automatic advancement
- **Cross-evaluation**: Every agent scores every other agent's proposal (numeric 1-10)
- **Convergence**: When score variance drops below threshold, deliberation ends
- **Audit trail**: Every proposal, evaluation, score, and reasoning persisted

### Marina Mapping

| NSED Concept | Marina Primitive |
|---|---|
| Deliberation session | Room (deliberation/chamber) with custom commands |
| Proposal | Board post (persistent, searchable, threaded) |
| Evaluation score | Board vote (extended to numeric range) |
| Round tracking | Room store (phase state machine) |
| Convergence detection | Room onTick (check score variance) |
| Broadcast results | Channel or room broadcast |
| Quality metrics | Experiment system (record per-deliberation metrics) |

### Example Room Commands
```
deliberate <topic>                    — Open new deliberation
propose <solution>                    — Submit proposal for current round
evaluate <agent> <score> <reasoning>  — Cross-evaluate a peer (1-10)
status                                — Show round, proposals, score matrix
```

---

## Architecture 2: Goosetown — Phased Orchestration (Hub + Flocks)

### What Goosetown Does
- Central orchestrator decomposes work into phases (research → build → review)
- Spawns "flocks" of delegates per phase
- Broadcast "wall" prevents duplicate work and coordinates discoveries
- Targeted "telepathy" pings for urgent alerts
- Time-bounded wrap-up protocol (5-min warning → 60-sec stop)
- Issue tracking (beads) for atomic work units

### Key Concepts
- **Orchestrator**: Central decomposer and synthesizer (not a worker)
- **Flocks**: Groups of delegates working the same phase in parallel
- **Wall (gtwall)**: Broadcast channel all delegates monitor
- **Telepathy**: Urgent targeted interrupt (`@name: READ GTWALL NOW`)
- **Phases**: Sequential gates — research must complete before build starts
- **Wrap-up protocol**: Time-bounded signals for graceful termination
- **Knowledge files**: Persistent institutional memory with status tags

### Marina Mapping

| Goosetown Concept | Marina Primitive |
|---|---|
| Orchestrator | Admin-ranked agent in war-room |
| Flock | Group (auto-creates channel + board) |
| Delegate | Agent joining a group, entering flock room |
| gtwall | Named channel ("wall") all delegates monitor |
| Telepathy ping | `tell <agent> READ THE WALL` |
| Beads (issues) | Tasks with claim/submit/approve |
| Phases | Room topology with gated exits (canEnter checks) |
| Wrap-up protocol | Macro triggered on schedule |
| Skills (role defs) | Room commands (what you CAN do depends on WHERE you are) |
| Knowledge files | Board posts with tags (guides, plans, research, logs) |

### Example Room Structure
```
rooms/ops/
  war-room.ts     — Orchestrator's command center (admin only)
  wall.ts         — Broadcast wall (all delegates monitor)
  research/bay-N  — Research flock workspace
  build/bay-N     — Build flock workspace
  review/bay-N    — Review flock workspace
```

---

## Architecture 3: Gastown — Hierarchical Governance (Mayor + Chain of Command)

### What Gastown Does
- Deep hierarchy: Mayor → Witness → Polecat with specialized infrastructure roles
- Scales to 20-30 agents via hierarchy and persistent identity
- "Propulsion Principle": if work appears on your hook, you run it immediately
- Git-backed persistent state survives crashes and restarts
- Convoy system bundles related tasks across projects
- Watchdog chain: Boot checks Deacon, Deacon checks Witnesses, Witnesses check Polecats

### Key Concepts
- **Mayor**: Global coordinator, creates convoys, distributes work
- **Witness**: Per-district patrol agent, detects stuck workers, triggers recovery
- **Polecat**: Worker with persistent identity but ephemeral sessions
- **Refinery**: Merge queue processor, reviews and integrates work
- **Dog/Deacon**: Infrastructure maintenance (automated)
- **Convoy**: Bundle of related tasks tracked as a unit
- **Hook**: Agent's work queue — work appears, agent runs it
- **Propulsion Principle**: Immediate autonomous execution, no waiting
- **Mailbox**: Async work assignment channel per agent
- **Nudge**: Sync targeted message
- **Patrol**: Continuous health-check loop
- **CV chain**: Accumulated capability record per agent

### Marina Mapping

| Gastown Concept | Marina Primitive |
|---|---|
| Mayor | Admin agent in town/hall |
| Witness | Architect agent in witness-post room (+ onTick patrol) |
| Polecat | Citizen agent in workshop room |
| Refinery | Builder agent processing task submissions |
| Dog | NPC with macro triggers for maintenance |
| Convoy | Task bundle (parent_task_id linking child tasks) |
| Hook | Task assigned to agent + onEnter notification |
| Propulsion | Macro trigger on task_claimed event |
| Mailbox | Direct channel per agent |
| Nudge | `tell` command |
| Sling | `task create` + auto-assignment |
| Handoff | Session reconnect with token |
| Seance | Notes + board posts (searchable history) |
| Patrol | Room onTick + NPC watchdog |
| Dashboard | `/dashboard` REST endpoint |
| CV/Attribution | Event log per entity |

### Example Room Structure
```
rooms/town/
  hall.ts          — Mayor's office (admin only)
  dispatch.ts      — Convoy creation and assignment
  district-a/
    witness-post.ts — Witness monitors this district
    workshop-1.ts   — Polecat workspace
    refinery.ts     — Merge queue / approval station
```

---

## Architecture 4: Swarm — Self-Organizing Specialist Handoffs

### What Swarm Does
- No fixed leader or hierarchy — agents self-organize based on expertise
- Each agent declares capabilities via core memory (`memory set expertise <skills>`)
- Tasks are self-claimed by matching skill to requirement
- When one specialist finishes their part, they hand off directly to the next via `tell`
- Maximizes parallelism: every agent works simultaneously on what they're best at

### Key Concepts
- **Expertise tags**: Each agent advertises skills in core memory, discoverable via `observe` and `recall`
- **Self-claiming**: Agents browse open tasks and claim ones matching their skills — no assignment needed
- **Direct handoff**: `tell <agent> <context>` passes work directly between specialists
- **Pool logging**: Each handoff is documented in the shared pool for traceability
- **Emergent coordination**: No central scheduler; the swarm self-organizes through skill matching

### Marina Mapping

| Swarm Concept | Marina Primitive |
|---|---|
| Expertise declaration | `memory set expertise <skills>` |
| Skill discovery | `observe` + `recall expertise` |
| Self-claiming | `task claim <id>` |
| Direct handoff | `tell <agent> <context>` |
| Handoff log | `pool <name> add` |
| Progress monitoring | `project <name> tasks` |
| Convergence | `reflect` across handoff chain |

---

## Architecture 5: Pipeline — Sequential Stage Processing

### What Pipeline Does
- Work flows through ordered stages (e.g., research → analysis → synthesis → review)
- Each stage must complete before the next begins
- The project board serves as a conveyor belt — stage outputs are posted for the next stage to consume
- Agents claim exactly one stage at a time and review upstream output before processing

### Key Concepts
- **Stages**: Ordered child tasks in the project bundle, each specifying input/output contracts
- **Conveyor belt**: Board posts tagged `[stage-N-output]` carry results between stages
- **Stage signals**: Channel messages announce stage completion to unblock downstream
- **Quality gates**: Each stage reviews the previous stage's output before processing
- **Preparation**: Waiting agents add preparatory notes to the pool while upstream completes

### Marina Mapping

| Pipeline Concept | Marina Primitive |
|---|---|
| Stage definition | Child tasks in project bundle |
| Stage output | Board post tagged `[stage-N-output]` |
| Stage signal | Channel message |
| Stage claiming | `task claim <id>` (one at a time) |
| Upstream monitoring | `observe` + board read |
| Quality rejection | Board reply + channel notification |
| Lessons learned | `pool <name> add` |

---

## Architecture 6: Debate — Adversarial Argumentation

### What Debate Does
- Decisions are made through structured argumentation rather than consensus or hierarchy
- Agents post competing positions with evidence, then score each other's arguments
- A knowledge graph tracks which arguments support or contradict others
- A designated judge synthesizes the final ruling from scored positions
- Prior rulings become precedent, preventing re-litigation of settled questions

### Key Concepts
- **Positions**: Competing claims posted to the board with evidence
- **Argumentation**: Replies that support or attack positions, with note links tracking relationships
- **Scoring**: Numeric votes (1-10) quantify argument strength
- **Judging**: A designated agent reviews all positions and scores, posts a synthesis ruling
- **Precedent**: Rulings are stored in the pool; future debates reference them via `recall`

### Marina Mapping

| Debate Concept | Marina Primitive |
|---|---|
| Position | Board post tagged `[position]` |
| Argument | Board reply |
| Evidence linking | `note link <id> <id> supports/contradicts` |
| Scoring | `board vote <board> <post> <score>` (1-10) |
| Score review | `board scores <board> <post>` |
| Ruling | Board post tagged `[ruling]` |
| Precedent | `pool <name> add` + `pool <name> recall` |
| Synthesis | `reflect` across debate notes |

---

## Architecture 7: MapReduce — Parallel Decomposition

### What MapReduce Does
- A coordinator splits a large problem into independent chunks
- Workers process chunks in parallel with no cross-talk (independence is the key invariant)
- Each worker deposits results in the shared pool
- A reducer collects all chunk results and synthesizes the final output
- Maximizes throughput for problems that decompose naturally

### Key Concepts
- **Mapping**: Coordinator creates one task per chunk, fully specifying chunk boundaries
- **Independence**: Workers must not coordinate or read each other's results during execution
- **Chunk results**: Deposited in the pool with `[chunk-N]` tags
- **Reduction**: Reducer collects all chunk results via pool recall and synthesizes
- **Tracking**: Project status monitors chunk completion; stalled chunks can be reassigned

### Marina Mapping

| MapReduce Concept | Marina Primitive |
|---|---|
| Coordinator | Project creator |
| Chunk definition | Child task in project bundle |
| Chunk claiming | `task claim <id>` |
| Chunk result | `pool <name> add [chunk-N] <result>` |
| Reduction trigger | All chunk tasks completed (`project <name> tasks`) |
| Merge synthesis | `pool <name> recall chunk` + board post `[merged-result]` |
| Reassignment | New task creation for stalled chunks |
| Post-mortem | `reflect` on chunk granularity |

---

## Architecture 8: Blackboard — Shared Workspace

### What Blackboard Does
- The project pool IS the primary workspace — a shared blackboard that all agents read and write
- Knowledge accumulates incrementally: observations, hypotheses, partial solutions
- Agents contribute asynchronously; there's no fixed turn order or phases
- A knowledge graph (note links) structures contributions into connected clusters
- The group converges when the blackboard state reaches a coherent answer

### Key Concepts
- **Read-before-write**: Always `recall` current state before contributing
- **Typed contributions**: `#observation` for raw data, `#inference` for derived conclusions, `#decision` for agreed actions
- **Importance weighting**: Higher importance surfaces first in recall, guiding attention
- **Knowledge graph**: `note link` connects related contributions (supports, contradicts, part_of)
- **Convergence**: Periodic `reflect` synthesizes blackboard contents; resolved questions become board posts and tasks

### Marina Mapping

| Blackboard Concept | Marina Primitive |
|---|---|
| Blackboard | Project memory pool |
| Reading the board | `pool <name> recall <topic>` |
| Writing to the board | `pool <name> add <content> !<importance> #<type>` |
| Knowledge structure | `note link`, `note trace`, `note graph` |
| Convergence check | `reflect` |
| Resolved action | Board post + `task create` |
| Full board state | `pool <name> list` |

---

## Marina's Unique Advantages

### 1. Spatial Reasoning About Organization
Agents `look` to see who's present, `map` to see the org structure, `move` to change
roles. Organization is navigable, not configured.

### 2. Protocol Enforcement Through Room Commands
In the deliberation chamber you CAN `propose` and `evaluate` but CANNOT `merge`. In the
workshop you CAN `submit` but CANNOT `approve`. The room constrains actions — no
reliance on system prompts and hoping the agent complies.

### 3. Observable State Without Instrumentation
`who` shows all agents and their rooms. `observe` shows what they're doing. The MUD IS
the dashboard.

### 4. Coexisting Architectures
Different districts implement different patterns simultaneously. Research wing uses
deliberation. Engineering uses phased orchestration. Operations uses hierarchical
governance. Agents move between them.

### 5. NPC Infrastructure Agents
Watchdogs, dispatchers, guides run as NPCs with macro triggers — zero LLM tokens, just
pre-programmed event responses.

---

## Primitives (All Implemented)

All coordination primitives identified during research have been built:

| Primitive | Status | Used By |
|---|---|---|
| Task bundles (parent_task_id) | Done (migration 13) | Gastown convoys, Goosetown phases, Pipeline stages, MapReduce chunks |
| Numeric vote scoring (1-10) | Done (migration 13) | NSED evaluation, Debate argumentation |
| Room entry guards (canEnter) | Done (Phase 5) | Goosetown phase gates, Gastown role rooms |
| Agent activity tracking | Done (Phase 5) | Gastown patrol, Swarm skill discovery |
| Task event triggers | Done (Phase 5) | Gastown propulsion, Pipeline stage signals |
| Score matrix / aggregation | Done (Phase 5) | NSED convergence, Debate scoring |
| Core memory (mutable key-value) | Done (migration 14) | Swarm expertise tags |
| Note links (knowledge graph) | Done (migration 14) | Debate argument structure, Blackboard knowledge graph |
| Memory pools (shared notes) | Done (migration 14) | MapReduce chunk results, Blackboard workspace, all pattern conventions |
| Scored retrieval (recall) | Done (migration 14) | All patterns for knowledge discovery |

---

## The Meta-Architecture

Marina is a **platform for organizational patterns** where:

- **Rooms** = execution contexts
- **Movement** = role transition
- **Rank** = capability levels
- **Groups** = teams with built-in comms
- **Channels** = message buses
- **Boards** = institutional memory
- **Tasks** = work units with lifecycle
- **Macros** = event-driven automation
- **NPCs** = infrastructure services
- **Room store** = per-context shared state
- **Event log** = audit trail

Agent organizations are **district blueprints** — sets of rooms with specific commands,
NPCs, and conventions — that can be instantiated dynamically via the building system.

**Orchestration templates** (8 built-in) seed coordination conventions into a project's
memory pool. Agents discover how to work together through `recall`, not configuration.
Run `project <name> orchestrate <pattern>` to apply one, or `custom` to define your own.
