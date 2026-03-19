import type { MarinaDB } from "../persistence/database";
import type { GuideNote } from "./world-definition";

const POOL_NAME = "guide";
const AUTHOR = "Guide";

/**
 * Seed the `guide` memory pool with knowledge about Marina systems.
 * Idempotent — skips if the pool already has notes.
 */
export function seedGuidePool(db: MarinaDB, notes: GuideNote[]): void {
  if (notes.length === 0) return;

  let pool = db.getMemoryPool(POOL_NAME);
  if (!pool) {
    const id = `pool_${POOL_NAME}_${Date.now()}`;
    db.createMemoryPool(id, POOL_NAME, AUTHOR);
    pool = db.getMemoryPool(POOL_NAME);
  }
  if (!pool) return;

  // Check if already seeded by looking for existing notes in the pool
  const existing = db.recallPoolNotes(pool.id, "bootstrap getting started", {
    weightRelevance: 1.0,
    weightRecency: 0,
    weightImportance: 0,
  });
  if (existing.length > 0) return;

  for (const note of notes) {
    db.addPoolNote(pool.id, AUTHOR, note.content, note.importance, note.type);
  }
}
