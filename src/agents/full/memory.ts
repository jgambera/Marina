/**
 * Agent Memory System - Persistent memory for long-term learning
 */

import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface MemoryEntry {
  id: string; // Unique identifier
  timestamp: number;
  category:
    | "instruction"
    | "insight"
    | "goal"
    | "preference"
    | "discovery"
    | "strategy"
    | "observation"
    | "research_note"
    | "reference";
  content: string;
  importance: "low" | "medium" | "high";
  tags: string[]; // Searchable tags
  source: string; // Bot that created this memory
  shared: boolean; // Whether this is shared with other bots
  confidence?: number; // 0-100: How confident/verified this knowledge is
  verifiedBy?: string[]; // Bot IDs that have confirmed this memory
  consolidatedFrom?: string[]; // Entry IDs that were merged into this one
}

export interface AgentCheckpoint {
  timestamp: number;
  lastIntent: string; // What the agent was trying to do
  currentGoal: string; // Main objective at checkpoint
  subGoals?: string[]; // Smaller steps toward main goal
  progress: string; // Description of current progress
  location?: string; // Current in-game location
  recentActions?: string[]; // Last few actions taken
  nextPlannedAction?: string; // What to do next
  context?: string; // Additional context for resumption
}

export interface AgentMemory {
  botId: string;
  botName: string;
  createdAt: number;
  lastUpdated: number;
  version: number; // Schema version for migrations
  entries: MemoryEntry[]; // Unified storage with metadata
  checkpoint?: AgentCheckpoint; // Last saved state for resumption

  // Backward compatibility (deprecated, will be migrated)
  instructions?: string[];
  insights?: string[];
  goals?: string[];
  preferences?: string[];
  discoveries?: string[];
  strategies?: string[];
}

export interface TeamGoal {
  id: string;
  proposedBy: string; // Bot ID that proposed the goal
  proposedAt: number;
  description: string;
  priority: "low" | "medium" | "high";
  status: "proposed" | "active" | "completed" | "rejected";
  votes: Record<string, "agree" | "disagree">; // Bot ID -> vote
  requiredQuorum: number; // Number of votes needed (default: majority)
  tasks?: string[]; // Task IDs associated with this goal
}

export interface TeamTask {
  id: string;
  goalId: string; // Associated team goal
  description: string;
  assignedTo?: string; // Bot ID of assignee
  assignedBy: string; // Bot ID that assigned the task
  assignedAt: number;
  status: "unassigned" | "assigned" | "accepted" | "in_progress" | "completed" | "failed";
  progress?: string; // Progress description
  completedAt?: number;
}

export interface SharedMemory {
  id: string;
  createdAt: number;
  lastUpdated: number;
  lastConsolidated?: number; // When consolidation last ran
  entries: MemoryEntry[]; // Shared knowledge pool
  contributors: Set<string>; // Bot IDs that contributed
  consolidationLog?: Array<{
    timestamp: number;
    merged: number; // Number of entries merged
    improved: number; // Number of entries improved
  }>;
  teamGoals?: TeamGoal[]; // Shared team goals
  teamTasks?: TeamTask[]; // Shared team tasks
}

export class MemoryStorage {
  private memoryDir: string;
  private sharedMemoryDir: string;
  private currentMemory: AgentMemory | null = null;
  private sharedMemory: SharedMemory | null = null;

  constructor(customDir?: string) {
    const baseDir = customDir || join(homedir(), ".marina");
    this.memoryDir = join(baseDir, "memories");
    this.sharedMemoryDir = join(baseDir, "shared-memories");
  }

  /**
   * Initialize storage directory
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.memoryDir, { recursive: true });
      await fs.mkdir(this.sharedMemoryDir, { recursive: true });
    } catch (error) {
      // Directory already exists, ignore
    }
  }

  /**
   * Load or create memory for a bot
   */
  async loadMemory(botId: string, botName: string): Promise<AgentMemory> {
    await this.initialize();

    const memoryFile = join(this.memoryDir, `${botId}.json`);

    try {
      const content = await fs.readFile(memoryFile, "utf-8");
      const memory = JSON.parse(content) as AgentMemory;

      // Migrate old format if needed
      const migratedMemory = this.migrateMemory(memory, botId, botName);

      this.currentMemory = migratedMemory;

      // Save migrated version
      if (migratedMemory.version > (memory.version || 0)) {
        await this.saveMemory(migratedMemory);
      }

      return migratedMemory;
    } catch (error) {
      // Try loading old markdown format
      const mdFile = join(this.memoryDir, `${botId}.md`);
      try {
        const mdContent = await fs.readFile(mdFile, "utf-8");
        const oldMemory = this.parseMemoryMarkdown(mdContent, botId, botName);
        const migratedMemory = this.migrateMemory(oldMemory, botId, botName);
        this.currentMemory = migratedMemory;
        await this.saveMemory(migratedMemory);
        // Delete old file
        await fs.unlink(mdFile);
        return migratedMemory;
      } catch {
        // File doesn't exist - create new memory
        const newMemory: AgentMemory = {
          botId,
          botName,
          createdAt: Date.now(),
          lastUpdated: Date.now(),
          version: 2,
          entries: [],
        };
        this.currentMemory = newMemory;
        await this.saveMemory(newMemory);
        return newMemory;
      }
    }
  }

  /**
   * Migrate old memory format to new format
   */
  private migrateMemory(memory: AgentMemory, botId: string, botName: string): AgentMemory {
    if (memory.version === 2) {
      return memory; // Already migrated
    }

    // Convert old array-based format to new entry-based format
    const entries: MemoryEntry[] = [];

    const categories: Array<{
      key: keyof AgentMemory;
      category: MemoryEntry["category"];
    }> = [
      { key: "instructions", category: "instruction" },
      { key: "insights", category: "insight" },
      { key: "goals", category: "goal" },
      { key: "preferences", category: "preference" },
      { key: "discoveries", category: "discovery" },
      { key: "strategies", category: "strategy" },
    ];

    for (const { key, category } of categories) {
      const items = memory[key] as string[] | undefined;
      if (items && Array.isArray(items)) {
        for (const content of items) {
          entries.push({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
            timestamp: Date.now(),
            category,
            content,
            importance: "medium",
            tags: this.extractTags(content),
            source: botId,
            shared: false,
          });
        }
      }
    }

    return {
      botId,
      botName,
      createdAt: memory.createdAt,
      lastUpdated: Date.now(),
      version: 2,
      entries,
    };
  }

  /**
   * Extract tags from content
   */
  private extractTags(content: string): string[] {
    const tags: string[] = [];
    const words = content.toLowerCase().split(/\s+/);

    // Common important keywords
    const keywords = [
      "combat",
      "quest",
      "npc",
      "item",
      "skill",
      "level",
      "explore",
      "boss",
      "dungeon",
      "magic",
      "spell",
      "room",
      "channel",
      "board",
      "group",
      "task",
      "build",
      "entity",
      "command",
      "exit",
      "area",
      "map",
      "inventory",
      "social",
      "research",
    ];

    for (const keyword of keywords) {
      if (words.includes(keyword) || content.toLowerCase().includes(keyword)) {
        tags.push(keyword);
      }
    }

    return [...new Set(tags)]; // Remove duplicates
  }

  /**
   * Save memory to JSON file
   */
  async saveMemory(memory: AgentMemory): Promise<void> {
    await this.initialize();

    const memoryFile = join(this.memoryDir, `${memory.botId}.json`);
    await fs.writeFile(memoryFile, JSON.stringify(memory, null, 2), "utf-8");
    this.currentMemory = memory;
  }

  /**
   * Add an entry to memory
   */
  async addEntry(
    category: MemoryEntry["category"],
    content: string,
    importance: MemoryEntry["importance"] = "medium",
    tags: string[] = [],
  ): Promise<string> {
    if (!this.currentMemory) {
      throw new Error("No memory loaded. Call loadMemory first.");
    }

    const memory = this.currentMemory;

    // Check for duplicates
    const exists = memory.entries.some((e) => e.content === content && e.category === category);
    if (exists) {
      throw new Error("Duplicate memory entry");
    }

    const entryId = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    const autoTags = this.extractTags(content);
    const allTags = [...new Set([...tags, ...autoTags])];

    const entry: MemoryEntry = {
      id: entryId,
      timestamp: Date.now(),
      category,
      content,
      importance,
      tags: allTags,
      source: memory.botId,
      shared: false,
    };

    memory.entries.push(entry);
    memory.lastUpdated = Date.now();

    await this.saveMemory(memory);
    return entryId;
  }

  /**
   * Remove an entry from memory
   */
  async removeEntry(entryId: string): Promise<boolean> {
    if (!this.currentMemory) {
      throw new Error("No memory loaded. Call loadMemory first.");
    }

    const memory = this.currentMemory;
    const index = memory.entries.findIndex((e) => e.id === entryId);

    if (index === -1) {
      return false;
    }

    memory.entries.splice(index, 1);
    memory.lastUpdated = Date.now();

    await this.saveMemory(memory);
    return true;
  }

  /**
   * Update an entry
   */
  async updateEntry(
    entryId: string,
    updates: Partial<Omit<MemoryEntry, "id" | "timestamp" | "source">>,
  ): Promise<boolean> {
    if (!this.currentMemory) {
      throw new Error("No memory loaded. Call loadMemory first.");
    }

    const memory = this.currentMemory;
    const entry = memory.entries.find((e) => e.id === entryId);

    if (!entry) {
      return false;
    }

    if (updates.content) entry.content = updates.content;
    if (updates.importance) entry.importance = updates.importance;
    if (updates.category) entry.category = updates.category;
    if (updates.tags) entry.tags = updates.tags;
    if (updates.shared !== undefined) entry.shared = updates.shared;

    memory.lastUpdated = Date.now();
    await this.saveMemory(memory);
    return true;
  }

  /**
   * Search memories by query
   */
  searchMemories(
    query: string,
    options?: {
      category?: MemoryEntry["category"];
      tags?: string[];
      importance?: MemoryEntry["importance"];
      includeShared?: boolean;
    },
  ): MemoryEntry[] {
    if (!this.currentMemory) {
      return [];
    }

    let results = [...this.currentMemory.entries];

    // Add shared memories if requested
    if (options?.includeShared && this.sharedMemory) {
      results.push(...this.sharedMemory.entries);
    }

    // Filter by category
    if (options?.category) {
      results = results.filter((e) => e.category === options.category);
    }

    // Filter by importance
    if (options?.importance) {
      results = results.filter((e) => e.importance === options.importance);
    }

    // Filter by tags
    if (options?.tags && options.tags.length > 0) {
      results = results.filter((e) => options.tags!.some((tag) => e.tags.includes(tag)));
    }

    // Search content
    if (query) {
      const lowerQuery = query.toLowerCase();
      results = results.filter((e) => e.content.toLowerCase().includes(lowerQuery));
    }

    // Sort by importance and recency
    const importanceScore = { high: 3, medium: 2, low: 1 };
    results.sort((a, b) => {
      const scoreA = importanceScore[a.importance] * 1000000 + a.timestamp;
      const scoreB = importanceScore[b.importance] * 1000000 + b.timestamp;
      return scoreB - scoreA;
    });

    return results;
  }

  /**
   * Load shared memory pool
   */
  async loadSharedMemory(poolId: string = "default"): Promise<SharedMemory> {
    await this.initialize();

    const sharedFile = join(this.sharedMemoryDir, `${poolId}.json`);

    try {
      const content = await fs.readFile(sharedFile, "utf-8");
      const data = JSON.parse(content);
      const shared: SharedMemory = {
        ...data,
        contributors: new Set(data.contributors || []),
      };
      this.sharedMemory = shared;
      return shared;
    } catch (error) {
      // Create new shared memory
      const newShared: SharedMemory = {
        id: poolId,
        createdAt: Date.now(),
        lastUpdated: Date.now(),
        entries: [],
        contributors: new Set(),
      };
      this.sharedMemory = newShared;
      await this.saveSharedMemory(newShared);
      return newShared;
    }
  }

  /**
   * Save shared memory
   */
  private async saveSharedMemory(shared: SharedMemory): Promise<void> {
    await this.initialize();

    const sharedFile = join(this.sharedMemoryDir, `${shared.id}.json`);
    const data = {
      ...shared,
      contributors: Array.from(shared.contributors),
    };
    await fs.writeFile(sharedFile, JSON.stringify(data, null, 2), "utf-8");
  }

  /**
   * Share a memory entry with other bots
   */
  async shareEntry(entryId: string, poolId: string = "default"): Promise<boolean> {
    if (!this.currentMemory) {
      throw new Error("No memory loaded.");
    }

    const entry = this.currentMemory.entries.find((e) => e.id === entryId);
    if (!entry) {
      return false;
    }

    // Load shared memory
    const shared = await this.loadSharedMemory(poolId);

    // Check if already shared
    const exists = shared.entries.some(
      (e) => e.content === entry.content && e.category === entry.category,
    );
    if (exists) {
      return false;
    }

    // Add to shared pool
    shared.entries.push({ ...entry, shared: true });
    shared.contributors.add(this.currentMemory.botId);
    shared.lastUpdated = Date.now();

    await this.saveSharedMemory(shared);

    // Mark as shared in current memory
    entry.shared = true;
    this.currentMemory.lastUpdated = Date.now();
    await this.saveMemory(this.currentMemory);

    return true;
  }

  /**
   * Import shared memories into current bot
   */
  async importSharedMemories(
    poolId: string = "default",
    filters?: {
      category?: MemoryEntry["category"];
      tags?: string[];
      importance?: MemoryEntry["importance"];
    },
  ): Promise<number> {
    if (!this.currentMemory) {
      throw new Error("No memory loaded.");
    }

    const shared = await this.loadSharedMemory(poolId);
    let imported = 0;

    for (const entry of shared.entries) {
      // Skip if from same bot
      if (entry.source === this.currentMemory.botId) {
        continue;
      }

      // Apply filters
      if (filters?.category && entry.category !== filters.category) {
        continue;
      }

      if (filters?.tags && !filters.tags.some((tag) => entry.tags.includes(tag))) {
        continue;
      }

      if (filters?.importance) {
        const importanceLevels = { low: 1, medium: 2, high: 3 };
        if (importanceLevels[entry.importance] < importanceLevels[filters.importance]) {
          continue;
        }
      }

      // Check for duplicates
      const exists = this.currentMemory.entries.some(
        (e) => e.content === entry.content && e.category === entry.category,
      );
      if (exists) {
        continue;
      }

      // Import entry
      this.currentMemory.entries.push({
        ...entry,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
        timestamp: Date.now(), // Mark import time
      });
      imported++;
    }

    if (imported > 0) {
      this.currentMemory.lastUpdated = Date.now();
      await this.saveMemory(this.currentMemory);
    }

    return imported;
  }

  /**
   * Get memory summary for system prompt
   */
  getMemorySummary(includeShared: boolean = false): string {
    if (!this.currentMemory) {
      return "";
    }

    const memory = this.currentMemory;
    const sections: string[] = [];

    // Get entries by category
    const byCategory: Record<MemoryEntry["category"], MemoryEntry[]> = {
      instruction: memory.entries.filter((e) => e.category === "instruction"),
      goal: memory.entries.filter((e) => e.category === "goal"),
      preference: memory.entries.filter((e) => e.category === "preference"),
      insight: memory.entries.filter((e) => e.category === "insight"),
      discovery: memory.entries.filter((e) => e.category === "discovery"),
      strategy: memory.entries.filter((e) => e.category === "strategy"),
      observation: memory.entries.filter((e) => e.category === "observation"),
      research_note: memory.entries.filter((e) => e.category === "research_note"),
      reference: memory.entries.filter((e) => e.category === "reference"),
    };

    // Add shared memories if requested
    if (includeShared && this.sharedMemory) {
      for (const entry of this.sharedMemory.entries) {
        // Skip if from same bot (already in personal memory)
        if (entry.source === memory.botId) {
          continue;
        }
        byCategory[entry.category].push(entry);
      }
    }

    if (byCategory.instruction.length > 0) {
      const total = byCategory.instruction.length;
      const shown = byCategory.instruction.slice(-10);
      const truncNote = total > 10 ? ` (showing last 10 of ${total})` : "";
      sections.push(
        `**Administrative Instructions${truncNote}:**\n${shown.map((e) => `- ${e.content}`).join("\n")}`,
      );
    }

    if (byCategory.goal.length > 0) {
      const total = byCategory.goal.length;
      const shown = byCategory.goal.slice(-10);
      const truncNote = total > 10 ? ` (showing last 10 of ${total})` : "";
      sections.push(
        `**Long-term Goals${truncNote}:**\n${shown.map((e) => `- ${e.content}`).join("\n")}`,
      );
    }

    if (byCategory.preference.length > 0) {
      const total = byCategory.preference.length;
      const shown = byCategory.preference.slice(-10);
      const truncNote = total > 10 ? ` (showing last 10 of ${total})` : "";
      sections.push(
        `**Behavioral Preferences${truncNote}:**\n${shown.map((e) => `- ${e.content}`).join("\n")}`,
      );
    }

    if (byCategory.insight.length > 0) {
      const recentInsights = byCategory.insight.slice(-5); // Last 5 insights
      sections.push(
        `**Recent Insights:**\n${recentInsights.map((e) => `- ${e.content}`).join("\n")}`,
      );
    }

    if (byCategory.discovery.length > 0) {
      const recentDiscoveries = byCategory.discovery.slice(-5);
      sections.push(
        `**World Discoveries:**\n${recentDiscoveries.map((e) => `- ${e.content}${e.source !== memory.botId ? " (shared)" : ""}`).join("\n")}`,
      );
    }

    if (byCategory.strategy.length > 0) {
      const recentStrategies = byCategory.strategy.slice(-3);
      sections.push(
        `**Successful Strategies:**\n${recentStrategies.map((e) => `- ${e.content}`).join("\n")}`,
      );
    }

    if (sections.length === 0) {
      return "";
    }

    return `\n# Your Persistent Memory\n\n${sections.join("\n\n")}\n`;
  }

  /**
   * Get current memory
   */
  getCurrentMemory(): AgentMemory | null {
    return this.currentMemory;
  }

  /**
   * Get current bot ID
   */
  getCurrentBotId(): string {
    return this.currentMemory?.botId || "";
  }

  /**
   * Get a specific entry by ID
   */
  getEntry(entryId: string): MemoryEntry | undefined {
    return this.currentMemory?.entries.find((e) => e.id === entryId);
  }

  /**
   * Get all unique tags from current memory
   */
  getAllTags(): string[] {
    if (!this.currentMemory) {
      return [];
    }

    const tagSet = new Set<string>();
    for (const entry of this.currentMemory.entries) {
      for (const tag of entry.tags) {
        tagSet.add(tag);
      }
    }

    return Array.from(tagSet);
  }

  /**
   * Format memory as markdown (for backward compatibility or export)
   */
  private formatMemoryMarkdown(memory: AgentMemory): string {
    const lines: string[] = [];

    lines.push(`# Agent Memory: ${memory.botName}`);
    lines.push("");
    lines.push(`**Bot ID:** ${memory.botId}`);
    lines.push(`**Created:** ${new Date(memory.createdAt).toISOString()}`);
    lines.push(`**Last Updated:** ${new Date(memory.lastUpdated).toISOString()}`);
    lines.push(`**Version:** ${memory.version || 1}`);
    lines.push("");
    lines.push("---");
    lines.push("");

    // Get entries by category
    const byCategory = {
      instruction: memory.entries.filter((e) => e.category === "instruction"),
      goal: memory.entries.filter((e) => e.category === "goal"),
      preference: memory.entries.filter((e) => e.category === "preference"),
      insight: memory.entries.filter((e) => e.category === "insight"),
      discovery: memory.entries.filter((e) => e.category === "discovery"),
      strategy: memory.entries.filter((e) => e.category === "strategy"),
    };

    // Administrative Instructions
    lines.push("## 📋 Administrative Instructions");
    lines.push("");
    if (byCategory.instruction.length === 0) {
      lines.push("*No instructions yet.*");
    } else {
      for (const entry of byCategory.instruction) {
        lines.push(`- ${entry.content} [${entry.importance}] {${entry.tags.join(", ")}}`);
      }
    }
    lines.push("");

    // Long-term Goals
    lines.push("## 🎯 Long-term Goals");
    lines.push("");
    if (byCategory.goal.length === 0) {
      lines.push("*No goals recorded yet.*");
    } else {
      for (const entry of byCategory.goal) {
        lines.push(`- ${entry.content} [${entry.importance}] {${entry.tags.join(", ")}}`);
      }
    }
    lines.push("");

    // Behavioral Preferences
    lines.push("## ⚙️ Behavioral Preferences");
    lines.push("");
    if (byCategory.preference.length === 0) {
      lines.push("*No preferences recorded yet.*");
    } else {
      for (const entry of byCategory.preference) {
        lines.push(`- ${entry.content} [${entry.importance}] {${entry.tags.join(", ")}}`);
      }
    }
    lines.push("");

    // Insights
    lines.push("## 💡 Insights & Learnings");
    lines.push("");
    if (byCategory.insight.length === 0) {
      lines.push("*No insights yet.*");
    } else {
      for (const entry of byCategory.insight) {
        lines.push(`- ${entry.content} [${entry.importance}] {${entry.tags.join(", ")}}`);
      }
    }
    lines.push("");

    // World Discoveries
    lines.push("## 🔍 World Discoveries");
    lines.push("");
    if (byCategory.discovery.length === 0) {
      lines.push("*No discoveries yet.*");
    } else {
      for (const entry of byCategory.discovery) {
        lines.push(`- ${entry.content} [${entry.importance}] {${entry.tags.join(", ")}}`);
      }
    }
    lines.push("");

    // Strategies
    lines.push("## 🎲 Successful Strategies");
    lines.push("");
    if (byCategory.strategy.length === 0) {
      lines.push("*No strategies recorded yet.*");
    } else {
      for (const entry of byCategory.strategy) {
        lines.push(`- ${entry.content} [${entry.importance}] {${entry.tags.join(", ")}}`);
      }
    }
    lines.push("");

    return lines.join("\n");
  }

  /**
   * Parse markdown memory file (old format)
   */
  private parseMemoryMarkdown(content: string, botId: string, botName: string): AgentMemory {
    const memory: AgentMemory = {
      botId,
      botName,
      createdAt: Date.now(),
      lastUpdated: Date.now(),
      version: 1, // Old format
      entries: [],
      instructions: [],
      insights: [],
      goals: [],
      preferences: [],
      discoveries: [],
      strategies: [],
    };

    const lines = content.split("\n");
    let currentSection:
      | "instructions"
      | "insights"
      | "goals"
      | "preferences"
      | "discoveries"
      | "strategies"
      | null = null;

    for (const line of lines) {
      const trimmed = line.trim();

      // Parse metadata
      if (trimmed.startsWith("**Created:**")) {
        const dateStr = trimmed.replace("**Created:**", "").trim();
        memory.createdAt = new Date(dateStr).getTime();
      } else if (trimmed.startsWith("**Last Updated:**")) {
        const dateStr = trimmed.replace("**Last Updated:**", "").trim();
        memory.lastUpdated = new Date(dateStr).getTime();
      }

      // Parse sections
      if (trimmed.includes("Administrative Instructions")) {
        currentSection = "instructions";
      } else if (trimmed.includes("Long-term Goals")) {
        currentSection = "goals";
      } else if (trimmed.includes("Behavioral Preferences")) {
        currentSection = "preferences";
      } else if (trimmed.includes("Insights & Learnings")) {
        currentSection = "insights";
      } else if (
        trimmed.includes("World Discoveries") ||
        trimmed.includes("MUD Mechanics Discoveries")
      ) {
        currentSection = "discoveries";
      } else if (trimmed.includes("Successful Strategies")) {
        currentSection = "strategies";
      }

      // Parse list items
      if (trimmed.startsWith("- ") && currentSection) {
        const content = trimmed.substring(2).trim();
        if (content && content !== "*No" && !content.startsWith("*")) {
          const section = memory[currentSection];
          if (section && Array.isArray(section)) {
            section.push(content);
          }
        }
      }
    }

    return memory;
  }

  /**
   * Delete memory file
   */
  async deleteMemory(botId: string): Promise<void> {
    // Try both JSON and markdown
    const jsonFile = join(this.memoryDir, `${botId}.json`);
    const mdFile = join(this.memoryDir, `${botId}.md`);

    try {
      await fs.unlink(jsonFile);
    } catch (error) {
      // File doesn't exist, ignore
    }

    try {
      await fs.unlink(mdFile);
    } catch (error) {
      // File doesn't exist, ignore
    }
  }

  /**
   * List all memory files
   */
  async listMemories(): Promise<Array<{ botId: string; botName: string; lastUpdated: number }>> {
    await this.initialize();

    try {
      const files = await fs.readdir(this.memoryDir);
      const memories: Array<{ botId: string; botName: string; lastUpdated: number }> = [];
      const processed = new Set<string>();

      for (const file of files) {
        // Handle JSON files (new format)
        if (file.endsWith(".json")) {
          const botId = file.replace(".json", "");
          if (processed.has(botId)) continue;
          processed.add(botId);

          try {
            const content = await fs.readFile(join(this.memoryDir, file), "utf-8");
            const memory = JSON.parse(content) as AgentMemory;
            memories.push({
              botId: memory.botId,
              botName: memory.botName,
              lastUpdated: memory.lastUpdated,
            });
          } catch (error) {
            // Skip invalid files
          }
        }
        // Handle old markdown files
        else if (file.endsWith(".md")) {
          const botId = file.replace(".md", "");
          if (processed.has(botId)) continue;
          processed.add(botId);

          try {
            const content = await fs.readFile(join(this.memoryDir, file), "utf-8");
            const lines = content.split("\n");

            let botName = botId;
            let lastUpdated = Date.now();

            for (const line of lines) {
              if (line.includes("# Agent Memory:")) {
                botName = line.replace("# Agent Memory:", "").trim();
              }
              if (line.includes("**Last Updated:**")) {
                const dateStr = line.replace("**Last Updated:**", "").trim();
                lastUpdated = new Date(dateStr).getTime();
              }
            }

            memories.push({ botId, botName, lastUpdated });
          } catch (error) {
            // Skip invalid files
          }
        }
      }

      return memories.sort((a, b) => b.lastUpdated - a.lastUpdated);
    } catch (error) {
      return [];
    }
  }

  /**
   * Calculate similarity between two memory entries (0-100)
   */
  private calculateSimilarity(entry1: MemoryEntry, entry2: MemoryEntry): number {
    // Must be same category to be similar
    if (entry1.category !== entry2.category) {
      return 0;
    }

    let score = 0;

    // Content similarity (using simple word overlap)
    const words1 = new Set(entry1.content.toLowerCase().split(/\s+/));
    const words2 = new Set(entry2.content.toLowerCase().split(/\s+/));
    const intersection = new Set([...words1].filter((w) => words2.has(w)));
    const union = new Set([...words1, ...words2]);
    const contentSimilarity = (intersection.size / union.size) * 100;
    score += contentSimilarity * 0.6; // 60% weight

    // Tag similarity
    const tags1 = new Set(entry1.tags);
    const tags2 = new Set(entry2.tags);
    const tagIntersection = new Set([...tags1].filter((t) => tags2.has(t)));
    const tagUnion = new Set([...tags1, ...tags2]);
    const tagSimilarity = tagUnion.size > 0 ? (tagIntersection.size / tagUnion.size) * 100 : 0;
    score += tagSimilarity * 0.3; // 30% weight

    // Importance similarity
    const importanceMatch = entry1.importance === entry2.importance ? 100 : 0;
    score += importanceMatch * 0.1; // 10% weight

    return Math.round(score);
  }

  /**
   * Consolidate similar entries into a unified version
   */
  private consolidateEntries(entries: MemoryEntry[]): MemoryEntry {
    if (entries.length === 0) {
      throw new Error("Cannot consolidate empty entry list");
    }

    if (entries.length === 1) {
      return entries[0];
    }

    // Sort by confidence (if available) and timestamp
    const sorted = [...entries].sort((a, b) => {
      const confA = a.confidence || 50;
      const confB = b.confidence || 50;
      if (confA !== confB) return confB - confA;
      return b.timestamp - a.timestamp;
    });

    // Use the best entry as base
    const base = sorted[0];

    // Merge tags from all entries
    const allTags = new Set<string>();
    for (const entry of entries) {
      for (const tag of entry.tags) {
        allTags.add(tag);
      }
    }

    // Collect all verifiers
    const verifiedBy = new Set<string>();
    for (const entry of entries) {
      verifiedBy.add(entry.source);
      if (entry.verifiedBy) {
        for (const bot of entry.verifiedBy) {
          verifiedBy.add(bot);
        }
      }
    }

    // Calculate confidence based on number of verifiers
    const confidence = Math.min(100, 50 + verifiedBy.size * 10);

    // Determine highest importance
    const importanceLevels = { low: 1, medium: 2, high: 3 };
    let highestImportance: MemoryEntry["importance"] = "low";
    for (const entry of entries) {
      if (importanceLevels[entry.importance] > importanceLevels[highestImportance]) {
        highestImportance = entry.importance;
      }
    }

    // Create consolidated entry
    const consolidated: MemoryEntry = {
      ...base,
      tags: Array.from(allTags),
      importance: highestImportance,
      confidence,
      verifiedBy: Array.from(verifiedBy),
      consolidatedFrom: entries.map((e) => e.id),
      timestamp: Date.now(), // Update timestamp
    };

    return consolidated;
  }

  /**
   * Optimize shared memory by consolidating similar entries
   */
  async optimizeSharedMemory(
    poolId: string = "default",
    similarityThreshold: number = 70,
  ): Promise<{
    merged: number;
    improved: number;
    totalBefore: number;
    totalAfter: number;
  }> {
    const shared = await this.loadSharedMemory(poolId);
    const totalBefore = shared.entries.length;

    if (totalBefore === 0) {
      return { merged: 0, improved: 0, totalBefore: 0, totalAfter: 0 };
    }

    // Group entries by category for faster comparison
    const byCategory: Record<string, MemoryEntry[]> = {
      instruction: [],
      insight: [],
      goal: [],
      preference: [],
      discovery: [],
      strategy: [],
    };

    for (const entry of shared.entries) {
      byCategory[entry.category].push(entry);
    }

    const newEntries: MemoryEntry[] = [];
    const processed = new Set<string>();
    let merged = 0;
    let improved = 0;

    // Process each category
    for (const category of Object.keys(byCategory)) {
      const entries = byCategory[category];

      for (let i = 0; i < entries.length; i++) {
        const entry1 = entries[i];
        if (processed.has(entry1.id)) continue;

        // Find similar entries
        const similar: MemoryEntry[] = [entry1];
        processed.add(entry1.id);

        for (let j = i + 1; j < entries.length; j++) {
          const entry2 = entries[j];
          if (processed.has(entry2.id)) continue;

          const similarity = this.calculateSimilarity(entry1, entry2);
          if (similarity >= similarityThreshold) {
            similar.push(entry2);
            processed.add(entry2.id);
          }
        }

        // Consolidate if we found similar entries
        if (similar.length > 1) {
          const consolidated = this.consolidateEntries(similar);
          newEntries.push(consolidated);
          merged += similar.length - 1;
          improved++;
        } else {
          // Keep original entry but update confidence if multiple sources exist
          const entry = similar[0];
          if (!entry.confidence || !entry.verifiedBy || entry.verifiedBy.length === 0) {
            entry.confidence = entry.confidence || 50;
            entry.verifiedBy = [entry.source];
            improved++;
          }
          newEntries.push(entry);
        }
      }
    }

    // Update shared memory
    shared.entries = newEntries;
    shared.lastUpdated = Date.now();
    shared.lastConsolidated = Date.now();

    // Add consolidation log entry
    if (!shared.consolidationLog) {
      shared.consolidationLog = [];
    }
    shared.consolidationLog.push({
      timestamp: Date.now(),
      merged,
      improved,
    });

    // Keep only last 10 consolidation log entries
    if (shared.consolidationLog.length > 10) {
      shared.consolidationLog = shared.consolidationLog.slice(-10);
    }

    await this.saveSharedMemory(shared);

    return {
      merged,
      improved,
      totalBefore,
      totalAfter: newEntries.length,
    };
  }

  /**
   * Verify a memory entry (increase confidence)
   */
  async verifyEntry(entryId: string, verifierBotId: string): Promise<boolean> {
    if (!this.currentMemory) {
      throw new Error("No memory loaded.");
    }

    const entry = this.currentMemory.entries.find((e) => e.id === entryId);
    if (!entry) {
      return false;
    }

    // Initialize verification fields
    if (!entry.verifiedBy) {
      entry.verifiedBy = [entry.source];
    }

    // Add verifier if not already present
    if (!entry.verifiedBy.includes(verifierBotId)) {
      entry.verifiedBy.push(verifierBotId);

      // Update confidence based on number of verifiers
      entry.confidence = Math.min(100, 50 + entry.verifiedBy.length * 10);

      // Save changes
      this.currentMemory.lastUpdated = Date.now();
      await this.saveMemory(this.currentMemory);

      return true;
    }

    return false;
  }

  /**
   * Compare memories with another bot and find similar entries
   */
  async compareWithBot(
    otherBotId: string,
    similarityThreshold: number = 70,
  ): Promise<
    Array<{
      myEntry: MemoryEntry;
      theirEntry: MemoryEntry;
      similarity: number;
    }>
  > {
    if (!this.currentMemory) {
      throw new Error("No memory loaded.");
    }

    // Load other bot's memory
    const otherMemoryFile = join(this.memoryDir, `${otherBotId}.json`);
    let otherMemory: AgentMemory;

    try {
      const content = await fs.readFile(otherMemoryFile, "utf-8");
      otherMemory = JSON.parse(content) as AgentMemory;
    } catch (error) {
      return []; // Other bot has no memory
    }

    const matches: Array<{
      myEntry: MemoryEntry;
      theirEntry: MemoryEntry;
      similarity: number;
    }> = [];

    // Compare entries
    for (const myEntry of this.currentMemory.entries) {
      for (const theirEntry of otherMemory.entries) {
        const similarity = this.calculateSimilarity(myEntry, theirEntry);
        if (similarity >= similarityThreshold) {
          matches.push({
            myEntry,
            theirEntry,
            similarity,
          });
        }
      }
    }

    // Sort by similarity (highest first)
    return matches.sort((a, b) => b.similarity - a.similarity);
  }

  /**
   * Auto-consolidate: Compare with all bots and consolidate to shared memory
   */
  async autoConsolidate(poolId: string = "default"): Promise<{
    compared: number;
    shared: number;
    consolidated: number;
  }> {
    if (!this.currentMemory) {
      throw new Error("No memory loaded.");
    }

    // Get all bot memories
    const allMemories = await this.listMemories();
    let compared = 0;
    let shared = 0;

    // Compare with each bot
    for (const botInfo of allMemories) {
      if (botInfo.botId === this.currentMemory.botId) continue;

      const matches = await this.compareWithBot(botInfo.botId, 70);
      compared += matches.length;

      // Share highly similar entries (80%+)
      for (const match of matches) {
        if (match.similarity >= 80) {
          // Verify the entry
          await this.verifyEntry(match.myEntry.id, botInfo.botId);

          // Share if not already shared
          if (!match.myEntry.shared) {
            await this.shareEntry(match.myEntry.id, poolId);
            shared++;
          }
        }
      }
    }

    // Optimize shared memory
    const result = await this.optimizeSharedMemory(poolId, 70);

    return {
      compared,
      shared,
      consolidated: result.merged,
    };
  }

  /**
   * Save a checkpoint of agent's current state
   */
  async saveCheckpoint(checkpoint: Omit<AgentCheckpoint, "timestamp">): Promise<void> {
    if (!this.currentMemory) {
      throw new Error("No memory loaded. Call loadMemory first.");
    }

    const fullCheckpoint: AgentCheckpoint = {
      ...checkpoint,
      timestamp: Date.now(),
    };

    this.currentMemory.checkpoint = fullCheckpoint;
    this.currentMemory.lastUpdated = Date.now();

    await this.saveMemory(this.currentMemory);
  }

  /**
   * Get the last saved checkpoint
   */
  getCheckpoint(): AgentCheckpoint | undefined {
    return this.currentMemory?.checkpoint;
  }

  /**
   * Get checkpoint summary for system prompt
   */
  getCheckpointSummary(): string {
    const checkpoint = this.getCheckpoint();

    if (!checkpoint) {
      return "";
    }

    const age = Math.floor((Date.now() - checkpoint.timestamp) / 1000 / 60); // minutes
    const ageStr = age < 60 ? `${age}m ago` : `${Math.floor(age / 60)}h ago`;

    const sections: string[] = [];

    sections.push(`**Last Session** (${ageStr}):`);
    sections.push(`- Intent: ${checkpoint.lastIntent}`);
    sections.push(`- Goal: ${checkpoint.currentGoal}`);

    if (checkpoint.progress) {
      sections.push(`- Progress: ${checkpoint.progress}`);
    }

    if (checkpoint.location) {
      sections.push(`- Location: ${checkpoint.location}`);
    }

    if (checkpoint.subGoals && checkpoint.subGoals.length > 0) {
      sections.push(`- Sub-goals:\n  ${checkpoint.subGoals.map((g) => `• ${g}`).join("\n  ")}`);
    }

    if (checkpoint.recentActions && checkpoint.recentActions.length > 0) {
      const recent = checkpoint.recentActions.slice(-3);
      sections.push(`- Recent actions: ${recent.join(", ")}`);
    }

    if (checkpoint.nextPlannedAction) {
      sections.push(`- Next: ${checkpoint.nextPlannedAction}`);
    }

    if (checkpoint.context) {
      sections.push(`- Context: ${checkpoint.context}`);
    }

    return sections.join("\n");
  }

  /**
   * Clear checkpoint (for fresh start)
   */
  async clearCheckpoint(): Promise<void> {
    if (!this.currentMemory) {
      throw new Error("No memory loaded.");
    }

    this.currentMemory.checkpoint = undefined;
    this.currentMemory.lastUpdated = Date.now();

    await this.saveMemory(this.currentMemory);
  }

  // ============================================================================
  // TEAM GOAL & TASK MANAGEMENT
  // ============================================================================

  /**
   * Propose a new team goal
   */
  async proposeTeamGoal(
    description: string,
    priority: "low" | "medium" | "high" = "medium",
    poolId: string = "default",
  ): Promise<string> {
    if (!this.currentMemory) {
      throw new Error("No memory loaded.");
    }

    const shared = await this.loadSharedMemory(poolId);

    if (!shared.teamGoals) {
      shared.teamGoals = [];
    }

    const goalId = `goal-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const proposerId = this.currentMemory.botId;

    // Calculate required quorum (majority of known contributors)
    const totalAgents = shared.contributors.size;
    const requiredQuorum = Math.ceil(totalAgents / 2);

    const goal: TeamGoal = {
      id: goalId,
      proposedBy: proposerId,
      proposedAt: Date.now(),
      description,
      priority,
      status: "proposed",
      votes: { [proposerId]: "agree" }, // Proposer auto-votes yes
      requiredQuorum: Math.max(requiredQuorum, 2), // At least 2 votes needed
      tasks: [],
    };

    shared.teamGoals.push(goal);
    shared.lastUpdated = Date.now();

    await this.saveSharedMemory(shared);

    return goalId;
  }

  /**
   * Vote on a team goal
   */
  async voteOnTeamGoal(
    goalId: string,
    vote: "agree" | "disagree",
    poolId: string = "default",
  ): Promise<boolean> {
    if (!this.currentMemory) {
      throw new Error("No memory loaded.");
    }

    const shared = await this.loadSharedMemory(poolId);

    if (!shared.teamGoals) {
      return false;
    }

    const goal = shared.teamGoals.find((g) => g.id === goalId);
    if (!goal || goal.status !== "proposed") {
      return false;
    }

    const voterId = this.currentMemory.botId;

    // Record vote
    goal.votes[voterId] = vote;

    // Check if quorum reached
    const agreeVotes = Object.values(goal.votes).filter((v) => v === "agree").length;
    const disagreeVotes = Object.values(goal.votes).filter((v) => v === "disagree").length;
    const totalVotes = agreeVotes + disagreeVotes;

    if (totalVotes >= goal.requiredQuorum) {
      // Quorum reached, determine outcome
      if (agreeVotes > disagreeVotes) {
        goal.status = "active";
      } else {
        goal.status = "rejected";
      }
    }

    shared.lastUpdated = Date.now();
    await this.saveSharedMemory(shared);

    return true;
  }

  /**
   * Get all team goals (optionally filtered by status)
   */
  async getTeamGoals(
    status?: "proposed" | "active" | "completed" | "rejected",
    poolId: string = "default",
  ): Promise<TeamGoal[]> {
    const shared = await this.loadSharedMemory(poolId);

    if (!shared.teamGoals) {
      return [];
    }

    if (status) {
      return shared.teamGoals.filter((g) => g.status === status);
    }

    return shared.teamGoals;
  }

  /**
   * Delegate a task to a specific agent
   */
  async delegateTask(
    goalId: string,
    description: string,
    assignTo?: string,
    poolId: string = "default",
  ): Promise<string> {
    if (!this.currentMemory) {
      throw new Error("No memory loaded.");
    }

    const shared = await this.loadSharedMemory(poolId);

    if (!shared.teamTasks) {
      shared.teamTasks = [];
    }

    if (!shared.teamGoals) {
      shared.teamGoals = [];
    }

    // Verify goal exists
    const goal = shared.teamGoals.find((g) => g.id === goalId);
    if (!goal) {
      throw new Error(`Goal ${goalId} not found`);
    }

    const taskId = `task-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const assignerId = this.currentMemory.botId;

    const task: TeamTask = {
      id: taskId,
      goalId,
      description,
      assignedBy: assignerId,
      assignedAt: Date.now(),
      status: assignTo ? "assigned" : "unassigned",
      assignedTo: assignTo,
    };

    shared.teamTasks.push(task);

    // Link task to goal
    if (!goal.tasks) {
      goal.tasks = [];
    }
    goal.tasks.push(taskId);

    shared.lastUpdated = Date.now();
    await this.saveSharedMemory(shared);

    return taskId;
  }

  /**
   * Accept a task assignment
   */
  async acceptTask(taskId: string, poolId: string = "default"): Promise<boolean> {
    if (!this.currentMemory) {
      throw new Error("No memory loaded.");
    }

    const shared = await this.loadSharedMemory(poolId);

    if (!shared.teamTasks) {
      return false;
    }

    const task = shared.teamTasks.find((t) => t.id === taskId);
    if (!task) {
      return false;
    }

    const agentId = this.currentMemory.botId;

    // Check if task is assigned to this agent
    if (task.assignedTo && task.assignedTo !== agentId) {
      return false; // Can't accept someone else's task
    }

    // Accept task
    if (!task.assignedTo) {
      task.assignedTo = agentId;
    }
    task.status = "accepted";

    shared.lastUpdated = Date.now();
    await this.saveSharedMemory(shared);

    return true;
  }

  /**
   * Update task progress
   */
  async updateTaskProgress(
    taskId: string,
    status: "in_progress" | "completed" | "failed",
    progress?: string,
    poolId: string = "default",
  ): Promise<boolean> {
    if (!this.currentMemory) {
      throw new Error("No memory loaded.");
    }

    const shared = await this.loadSharedMemory(poolId);

    if (!shared.teamTasks) {
      return false;
    }

    const task = shared.teamTasks.find((t) => t.id === taskId);
    if (!task) {
      return false;
    }

    const agentId = this.currentMemory.botId;

    // Only assignee can update progress
    if (task.assignedTo !== agentId) {
      return false;
    }

    task.status = status;
    if (progress) {
      task.progress = progress;
    }
    if (status === "completed") {
      task.completedAt = Date.now();

      // Check if all tasks for goal are completed
      if (shared.teamGoals) {
        const goal = shared.teamGoals.find((g) => g.id === task.goalId);
        if (goal && goal.tasks) {
          const allTasksCompleted = goal.tasks.every((tid) => {
            const t = shared.teamTasks?.find((task) => task.id === tid);
            return t && t.status === "completed";
          });

          if (allTasksCompleted && goal.status === "active") {
            goal.status = "completed";
          }
        }
      }
    }

    shared.lastUpdated = Date.now();
    await this.saveSharedMemory(shared);

    return true;
  }

  /**
   * Get tasks assigned to current agent
   */
  async getMyTasks(poolId: string = "default"): Promise<TeamTask[]> {
    if (!this.currentMemory) {
      throw new Error("No memory loaded.");
    }

    const shared = await this.loadSharedMemory(poolId);

    if (!shared.teamTasks) {
      return [];
    }

    const agentId = this.currentMemory.botId;

    return shared.teamTasks.filter(
      (t) => t.assignedTo === agentId && t.status !== "completed" && t.status !== "failed",
    );
  }

  /**
   * Get all tasks for a goal
   */
  async getGoalTasks(goalId: string, poolId: string = "default"): Promise<TeamTask[]> {
    const shared = await this.loadSharedMemory(poolId);

    if (!shared.teamTasks) {
      return [];
    }

    return shared.teamTasks.filter((t) => t.goalId === goalId);
  }

  /**
   * Get team goal and task summary for system prompt
   */
  async getTeamGoalSummary(poolId: string = "default"): Promise<string> {
    const activeGoals = await this.getTeamGoals("active", poolId);
    const proposedGoals = await this.getTeamGoals("proposed", poolId);
    const myTasks = await this.getMyTasks(poolId);

    const lines: string[] = [];

    if (activeGoals.length > 0) {
      lines.push("**ACTIVE TEAM GOALS:**");
      for (const goal of activeGoals) {
        const votes = Object.values(goal.votes).filter((v) => v === "agree").length;
        lines.push(`- [${goal.priority.toUpperCase()}] ${goal.description} (${votes} votes)`);

        // Show tasks for this goal
        const tasks = await this.getGoalTasks(goal.id, poolId);
        if (tasks.length > 0) {
          for (const task of tasks) {
            const statusIcon =
              task.status === "completed" ? "✓" : task.status === "in_progress" ? "⋯" : "○";
            const assignee = task.assignedTo || "unassigned";
            lines.push(`  ${statusIcon} ${task.description} (${assignee})`);
          }
        }
      }
      lines.push("");
    }

    if (proposedGoals.length > 0) {
      lines.push("**PROPOSED TEAM GOALS (Need Votes):**");
      for (const goal of proposedGoals) {
        const agreeVotes = Object.values(goal.votes).filter((v) => v === "agree").length;
        const disagreeVotes = Object.values(goal.votes).filter((v) => v === "disagree").length;
        lines.push(
          `- ${goal.description} (${agreeVotes} agree, ${disagreeVotes} disagree, need ${goal.requiredQuorum} total)`,
        );
      }
      lines.push("");
    }

    if (myTasks.length > 0) {
      lines.push("**YOUR ASSIGNED TASKS:**");
      for (const task of myTasks) {
        const statusText =
          task.status === "accepted"
            ? "Accepted"
            : task.status === "in_progress"
              ? "In Progress"
              : "Assigned";
        lines.push(`- [${statusText}] ${task.description}`);
        if (task.progress) {
          lines.push(`  Progress: ${task.progress}`);
        }
      }
      lines.push("");
    }

    if (lines.length === 0) {
      return "**No active team goals yet.** Propose a goal to coordinate with your teammates!";
    }

    return lines.join("\n");
  }
}

// Singleton instance
let globalMemoryStorage: MemoryStorage | null = null;

export function getMemoryStorage(): MemoryStorage {
  if (!globalMemoryStorage) {
    globalMemoryStorage = new MemoryStorage();
  }
  return globalMemoryStorage;
}
