/**
 * Platform Memory Backend — Translates memory operations to Marina platform commands.
 * Replaces local JSON file storage with server-side note/recall/reflect/pool commands.
 */

import type { MarinaClient } from "../net/marina-client";
import type { Perception } from "../net/types";
import { categoryToNoteType, importanceLevelToNum } from "../utils/memory-utils";

/** Extract text from a set of perceptions, concatenating message/broadcast/system texts */
function extractText(perceptions: Perception[]): string {
  return perceptions
    .map((p) => {
      if (p.data?.text) return p.data.text as string;
      if (p.data?.message) return p.data.message as string;
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

export interface PlatformMemoryResult {
  success: boolean;
  text: string;
  noteId?: number;
  results?: PlatformNoteResult[];
}

export interface PlatformNoteResult {
  id: string;
  content: string;
  importance: number;
  noteType: string;
  score?: number;
  age?: string;
}

/**
 * Backend that uses Marina platform commands for memory operations.
 */
export class PlatformMemoryBackend {
  private client: MarinaClient;
  private botName: string;

  constructor(client: MarinaClient, botName: string) {
    this.client = client;
    this.botName = botName;
  }

  /** Write a new note to the platform */
  async write(
    category: string,
    content: string,
    importance: "low" | "medium" | "high" = "medium",
    tags: string[] = [],
  ): Promise<PlatformMemoryResult> {
    const imp = importanceLevelToNum(importance);
    const noteType = categoryToNoteType(category);
    const tagStr = tags.length > 0 ? ` [${tags.join(", ")}]` : "";
    const cmd = `note ${content}${tagStr} importance ${imp} type ${noteType}`;
    const perceptions = await this.client.command(cmd);
    const text = extractText(perceptions);
    const idMatch = text.match(/Note #(\d+)/);
    return {
      success: !text.includes("Error"),
      text,
      noteId: idMatch ? Number.parseInt(idMatch[1]!, 10) : undefined,
    };
  }

  /** Search/recall notes from platform */
  async search(
    query: string,
    opts?: { noteType?: string; mode?: "recent" | "important" },
  ): Promise<PlatformMemoryResult> {
    let cmd = `recall ${query}`;
    if (opts?.noteType) cmd += ` type ${opts.noteType}`;
    if (opts?.mode === "recent") cmd += " recent";
    if (opts?.mode === "important") cmd += " important";

    const perceptions = await this.client.command(cmd);
    const text = extractText(perceptions);
    const results = this.parseRecallResults(text);
    return {
      success: true,
      text,
      results,
    };
  }

  /** Update (correct) an existing note */
  async update(noteId: string, newContent: string): Promise<PlatformMemoryResult> {
    const cmd = `note correct ${noteId} ${newContent}`;
    const perceptions = await this.client.command(cmd);
    const text = extractText(perceptions);
    return { success: !text.includes("not found"), text };
  }

  /** Delete a note */
  async remove(noteId: string): Promise<PlatformMemoryResult> {
    const cmd = `note delete ${noteId}`;
    const perceptions = await this.client.command(cmd);
    const text = extractText(perceptions);
    return { success: text.includes("deleted"), text };
  }

  /** Reflect on a topic */
  async reflect(topic?: string): Promise<PlatformMemoryResult> {
    const cmd = topic ? `reflect ${topic}` : "reflect";
    const perceptions = await this.client.command(cmd);
    const text = extractText(perceptions);
    const idMatch = text.match(/Note #(\d+)/);
    return {
      success: text.includes("Reflection Created"),
      text,
      noteId: idMatch ? Number.parseInt(idMatch[1]!, 10) : undefined,
    };
  }

  /** Reflect on a failure */
  async reflectFailure(description: string): Promise<PlatformMemoryResult> {
    const cmd = `reflect failure ${description}`;
    const perceptions = await this.client.command(cmd);
    const text = extractText(perceptions);
    const idMatch = text.match(/Note #(\d+)/);
    return {
      success: text.includes("Failure Reflection Created"),
      text,
      noteId: idMatch ? Number.parseInt(idMatch[1]!, 10) : undefined,
    };
  }

  /** Share a note to a pool */
  async share(
    content: string,
    poolName: string,
    importance: number = 5,
    noteType: string = "fact",
  ): Promise<PlatformMemoryResult> {
    const cmd = `pool ${poolName} add ${content} importance ${importance}`;
    const perceptions = await this.client.command(cmd);
    const text = extractText(perceptions);
    return { success: !text.includes("Error"), text };
  }

  /** Import shared memories from a pool */
  async importShared(poolName: string, query: string): Promise<PlatformMemoryResult> {
    const cmd = `pool ${poolName} recall ${query}`;
    const perceptions = await this.client.command(cmd);
    const text = extractText(perceptions);
    const results = this.parseRecallResults(text);
    return { success: true, text, results };
  }

  /** Link two notes */
  async link(id1: string, id2: string, relationship: string): Promise<PlatformMemoryResult> {
    const cmd = `note link ${id1} ${id2} ${relationship}`;
    const perceptions = await this.client.command(cmd);
    const text = extractText(perceptions);
    return { success: text.includes("Linked"), text };
  }

  /** Evolve a note */
  async evolve(noteId: string): Promise<PlatformMemoryResult> {
    const cmd = `note evolve ${noteId}`;
    const perceptions = await this.client.command(cmd);
    const text = extractText(perceptions);
    const idMatch = text.match(/Note #(\d+)/);
    return {
      success: text.includes("evolved"),
      text,
      noteId: idMatch ? Number.parseInt(idMatch[1]!, 10) : undefined,
    };
  }

  /** Save checkpoint via core memory */
  async saveCheckpoint(data: Record<string, unknown>): Promise<PlatformMemoryResult> {
    const json = JSON.stringify(data);
    const cmd = `memory set checkpoint ${json}`;
    const perceptions = await this.client.command(cmd);
    const text = extractText(perceptions);
    return { success: true, text };
  }

  /** Get checkpoint from core memory */
  async getCheckpoint(): Promise<Record<string, unknown> | null> {
    const perceptions = await this.client.command("memory get checkpoint");
    const text = extractText(perceptions);
    if (text.includes("not found") || text.includes("No entry")) return null;
    try {
      // Parse the value from the response
      // Server format: "checkpoint (vN): {json}"
      const valueMatch = text.match(/\(v\d+\):\s*(.+)/s);
      if (valueMatch?.[1]) {
        return JSON.parse(valueMatch[1].trim());
      }
      // Fallback: try parsing the entire text as JSON
      return JSON.parse(text.trim());
    } catch {
      // Ignore parse errors
    }
    return null;
  }

  /** Get memory health summary */
  async orient(): Promise<PlatformMemoryResult> {
    const perceptions = await this.client.command("orient");
    const text = extractText(perceptions);
    return { success: true, text };
  }

  /** Get novelty score */
  async getNovelty(): Promise<{ composite: number; text: string }> {
    const perceptions = await this.client.command("novelty");
    const text = extractText(perceptions);
    const compositeMatch = text.match(/Composite:\s*(\d+)/);
    return {
      composite: compositeMatch ? Number.parseInt(compositeMatch[1]!, 10) : 50,
      text,
    };
  }

  /** Get novelty suggestions */
  async getNoveltySuggestions(): Promise<string[]> {
    const perceptions = await this.client.command("novelty suggest");
    const text = extractText(perceptions);
    const suggestions: string[] = [];
    const lines = text.split("\n");
    for (const line of lines) {
      const match = line.match(/^\s*\d+\.\s*(.+)/);
      if (match?.[1]) {
        suggestions.push(match[1].trim());
      }
    }
    return suggestions;
  }

  /** Store a skill */
  async storeSkill(
    name: string,
    description: string,
    actions: string,
  ): Promise<PlatformMemoryResult> {
    const cmd = `skill store ${name} | ${description} | ${actions}`;
    const perceptions = await this.client.command(cmd);
    const text = extractText(perceptions);
    const idMatch = text.match(/Skill #(\d+)/);
    return {
      success: text.includes("stored"),
      text,
      noteId: idMatch ? Number.parseInt(idMatch[1]!, 10) : undefined,
    };
  }

  /** Search for skills */
  async searchSkills(query: string): Promise<PlatformMemoryResult> {
    const cmd = `skill search ${query}`;
    const perceptions = await this.client.command(cmd);
    const text = extractText(perceptions);
    const results = this.parseSkillResults(text);
    return { success: true, text, results };
  }

  /** Verify a skill */
  async verifySkill(skillId: string): Promise<PlatformMemoryResult> {
    const cmd = `skill verify ${skillId}`;
    const perceptions = await this.client.command(cmd);
    const text = extractText(perceptions);
    return { success: text.includes("verified"), text };
  }

  /** Store a principle */
  async storePrinciple(content: string, importance: number = 8): Promise<PlatformMemoryResult> {
    const cmd = `note ${content} importance ${importance} type principle`;
    const perceptions = await this.client.command(cmd);
    const text = extractText(perceptions);
    const idMatch = text.match(/Note #(\d+)/);
    return {
      success: !text.includes("Error"),
      text,
      noteId: idMatch ? Number.parseInt(idMatch[1]!, 10) : undefined,
    };
  }

  /** Recall principles relevant to a topic */
  async recallPrinciples(topic: string): Promise<PlatformNoteResult[]> {
    const result = await this.search(topic, { noteType: "principle" });
    return result.results ?? [];
  }

  /** Recall episode reflections relevant to a topic */
  async recallReflections(topic: string): Promise<PlatformNoteResult[]> {
    const result = await this.search(topic, { noteType: "episode" });
    return result.results ?? [];
  }

  /** Parse recall command output into structured results */
  private parseRecallResults(text: string): PlatformNoteResult[] {
    const results: PlatformNoteResult[] = [];
    const lines = text.split("\n");
    for (const line of lines) {
      const match = line.match(/\s*#(\d+)\s+\[score=([\d.]+)\s+imp=(\d+)\s+([^\]]+)\]:\s*(.+)/);
      if (match) {
        results.push({
          id: match[1]!,
          score: Number.parseFloat(match[2]!),
          importance: Number.parseInt(match[3]!, 10),
          age: match[4]!,
          content: match[5]!.trim(),
          noteType: "",
        });
      }
    }
    return results;
  }

  /** Parse skill search output */
  private parseSkillResults(text: string): PlatformNoteResult[] {
    const results: PlatformNoteResult[] = [];
    const lines = text.split("\n");
    for (const line of lines) {
      const match = line.match(/\s*#(\d+)\s+\[imp=(\d+)\s+score=([\d.]+)\]:\s*(.+)/);
      if (match) {
        results.push({
          id: match[1]!,
          importance: Number.parseInt(match[2]!, 10),
          score: Number.parseFloat(match[3]!),
          content: match[4]!.trim(),
          noteType: "skill",
        });
      }
    }
    return results;
  }
}
