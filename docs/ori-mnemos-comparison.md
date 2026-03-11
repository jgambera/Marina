# Ori-Mnemos vs Artilect: Comparison & Lessons Learned

## Executive Summary

Artilect's memory system is architecturally more ambitious — multi-agent, persistent world, knowledge graph, shared pools, orchestration patterns. Ori-Mnemos is a focused single-agent MCP memory server with sophisticated retrieval science. The key lesson: **Artilect has the infrastructure but under-leverages it for ease of use.** Ori-Mnemos makes memory feel effortless through smart defaults, automatic maintenance, and session-aware tooling.

---

## What Ori-Mnemos Has That Artilect Doesn't

### 1. Vector Embeddings + Hybrid Retrieval (High Impact)
**Ori-Mnemos:** Three-signal retrieval fusing vector similarity (all-MiniLM-L6-v2, 384d), BM25, and personalized PageRank via Reciprocal Rank Fusion (RRF).

**Artilect:** Pure FTS5 lexical matching. No embeddings, no semantic similarity.

**Impact:** FTS5 misses paraphrased or conceptually similar content. "The vault code is 7249" won't match a recall for "security combination" — but vector embeddings would.

**Ease of implementation:** Medium. Bun supports `@huggingface/transformers` (runs locally, no API). Store 384-dim vectors in a new `note_embeddings` table, compute cosine similarity, fuse with existing FTS5 + importance scores via RRF.

### 2. ACT-R Cognitive Decay (Medium Impact)
**Ori-Mnemos:** Metabolic rates per note (structure boost for well-linked notes, bridge protection for high-betweenness notes, revival spikes on access). Notes transition through zones: active → stale → fading → archived.

**Artilect:** Binary hourly adjustment: +1 if recalled 3+ times, -1 if never recalled and >7 days old. No structural awareness, no zone classification.

**Impact:** Artilect's decay is blunt. A highly-connected insight decays at the same rate as an orphan observation. Ori-Mnemos protects structurally important memories.

**Ease of implementation:** Easy. Adjust `adjustNoteImportance()` to factor in link count (structural boost) and betweenness (bridge protection). Add a `vitality` column or compute zones from existing data.

### 3. Spreading Activation on Graph (Medium Impact)
**Ori-Mnemos:** When retrieving a note, activation spreads along graph edges with damping factor, surfacing related notes that wouldn't match the query directly.

**Artilect:** 2-hop BFS in `note trace`, but this is a display command — it doesn't influence recall scoring.

**Impact:** Artilect's knowledge graph exists but is passive during recall. Graph-enhanced recall would surface contextually relevant notes that share no keywords with the query.

**Ease of implementation:** Easy. During recall, take top-N results, walk 1-hop links, boost linked notes' scores by a damping factor (e.g., 0.3). Already have `getNoteLinks()` and `traceNoteGraph()`.

### 4. Session Briefing / Orientation (High Impact, Easy)
**Ori-Mnemos:** `ori_orient` tool provides daily status: active goals, pending reminders, recent changes, vault health metrics.

**Artilect:** No equivalent. Agents start each session cold — no summary of what happened, what's pending, or what they know.

**Impact:** This is the biggest ease-of-use gap. A session briefing makes memory feel alive and useful without the agent having to know what to ask for.

**Ease of implementation:** Very easy. New `orient` command that queries recent notes, active core memories, pool status, and formats a briefing. Could also auto-trigger on agent login.

### 5. Intent-Driven Retrieval (Medium Impact)
**Ori-Mnemos:** Classifies queries as episodic/procedural/semantic/decision and adjusts retrieval weights accordingly.

**Artilect:** Has `recent` and `important` modifiers, but no automatic intent detection.

**Impact:** Users must know to type `recall "X" recent` vs `recall "X" important`. Auto-detecting intent removes friction.

**Ease of implementation:** Easy. Simple keyword/pattern classifier: questions about "how to" → procedural (weight skills), "when did" → episodic (weight recency), "what is" → semantic (weight importance).

### 6. Community Detection / PageRank (Low Priority)
**Ori-Mnemos:** Louvain community detection, PageRank for note importance, betweenness centrality for bridge identification.

**Artilect:** No graph analytics beyond traversal.

**Impact:** Useful for large knowledge bases but marginal for typical agent use. Lower priority.

**Ease of implementation:** Medium. PageRank is ~50 lines. Louvain is more complex. Could be a periodic maintenance task.

---

## What Artilect Already Has That Covers Ori-Mnemos

| Capability | Artilect | Ori-Mnemos |
|-----------|----------|------------|
| Multi-agent collaboration | Pools, channels, groups | Single-agent only |
| Persistent world simulation | Rooms, items, NPCs, spatial | None |
| Knowledge graph | 6 relationship types, auto-linking | Wiki-links, 6 types |
| Mutable beliefs (core memory) | `memory set/get/history` | Similar vault entries |
| Note types / categorization | 7 types (observation, fact, etc.) | Tags + front-matter |
| Importance scoring | 1-10 scale, manual + auto-adjust | Importance field |
| Supersession / correction | `note correct`, `note evolve` | Version history |
| Shared knowledge pools | `pool create/add/recall` | None |
| Skills as procedures | `skill store/verify/compose` | None |
| OpenAI-compatible API | Full streaming endpoint | MCP only |
| Exploration metrics | 4D novelty scoring | None |
| Reflection / synthesis | `reflect` with contradiction detection | `ori_reflect` similar |

---

## Actionable Improvements (Prioritized)

### Priority 1: Session Briefing (`orient` command)
- **Effort:** Small (1 new command, ~100 lines)
- **Value:** Transforms the "cold start" problem
- **What it does:** On login or on-demand, summarize: recent notes, active core memories, pool updates, pending tasks, knowledge graph stats

### Priority 2: Graph-Enhanced Recall (Spreading Activation)
- **Effort:** Small (~30 lines in recall scoring)
- **Value:** Makes the existing knowledge graph actively useful during recall
- **What it does:** After FTS5 recall, walk 1-hop links from top results, boost linked notes

### Priority 3: Smarter Decay (Structural Awareness)
- **Effort:** Small (modify `adjustNoteImportance()`)
- **Value:** Prevents loss of structurally important knowledge
- **What it does:** Notes with many links decay slower. Bridge notes (connecting clusters) get protection.

### Priority 4: Intent-Aware Recall
- **Effort:** Small (~40 lines classifier)
- **Value:** Removes need for users to specify `recent`/`important` modifiers
- **What it does:** Auto-detect query intent from phrasing, adjust weights

### Priority 5: Local Embeddings + Hybrid Retrieval
- **Effort:** Medium (new table, embedding pipeline, RRF fusion)
- **Value:** Major recall quality improvement — semantic matching instead of just lexical
- **What it does:** Embed notes on creation, compute cosine similarity during recall, fuse with FTS5

### Priority 6: Vitality Zones
- **Effort:** Small (computed view, ~20 lines)
- **Value:** Visibility into memory health
- **What it does:** Classify notes as active/stale/fading/archived based on recency + recall count + importance

---

## Conclusion

Artilect's memory infrastructure is comprehensive. The gap is in **retrieval intelligence** and **ease of use**. The top improvements don't require new architecture — they enhance what's already built:

1. **Orient** makes memory proactive (no cold start)
2. **Spreading activation** makes the knowledge graph work during recall
3. **Smarter decay** protects valuable structural knowledge
4. **Intent detection** removes manual modifier friction

These four changes would make Artilect's memory feel as effortless as Ori-Mnemos while retaining all of Artilect's multi-agent, spatial, and collaborative advantages.
