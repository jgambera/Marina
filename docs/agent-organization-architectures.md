# Agent Organization Architectures in Artilect

## Research Summary

Evaluated three reference projects for multi-agent organizational patterns and mapped
their concepts to Artilect's existing primitive set.

### Reference Projects

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

### Artilect Mapping

| NSED Concept | Artilect Primitive |
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

### Artilect Mapping

| Goosetown Concept | Artilect Primitive |
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

### Artilect Mapping

| Gastown Concept | Artilect Primitive |
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

## Artilect's Unique Advantages

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

## Missing Primitives (Phase 5 Scope)

| Primitive | Enables | Approach |
|---|---|---|
| Task bundles (parent_task_id) | Gastown convoys, Goosetown phase tracking | Migration: add column to tasks |
| Numeric vote scoring | NSED cross-evaluation, quality metrics | Migration: add score column to board_votes |
| Room entry guards (canEnter) | Goosetown phase gates, Gastown role rooms | RoomModule type extension |
| Agent activity tracking | Gastown witness patrol, stuck detection | DB query on event_log |
| Task event triggers | Gastown propulsion, auto-notification | Extend macro trigger types |
| Score matrix / aggregation | NSED convergence detection | Board manager method |

---

## The Meta-Architecture

Artilect is a **platform for organizational patterns** where:

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
