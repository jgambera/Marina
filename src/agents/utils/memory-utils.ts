/**
 * Shared memory utilities — maps importance levels and categories to platform values.
 * Extracted from memory-platform.ts, memory-tool.ts, and lean-memory-tool.ts.
 */

/** Map importance level string to numeric value for the Marina platform. */
export function importanceLevelToNum(level: string): number {
  switch (level) {
    case "low":
      return 3;
    case "high":
      return 8;
    default:
      return 5;
  }
}

/** Map memory category to Marina platform note type. */
export function categoryToNoteType(category: string): string {
  switch (category) {
    case "instruction":
    case "preference":
    case "goal":
      return "decision";
    case "insight":
    case "strategy":
      return "inference";
    case "discovery":
    case "observation":
      return "observation";
    case "research_note":
    case "reference":
      return "fact";
    default:
      return "observation";
  }
}
