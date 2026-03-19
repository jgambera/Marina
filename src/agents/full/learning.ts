/**
 * Learning system for understanding Marina world mechanics
 * Tracks what works, what doesn't, and adapts strategies
 */

export interface CommandPattern {
  command: string;
  successRate: number;
  timesUsed: number;
  avgResponseTime: number;
  lastUsed: number;
}

export interface EnvironmentCapabilities {
  // Discovered commands
  availableCommands: string[];
  // Command patterns and effectiveness
  commandPatterns: Map<string, CommandPattern>;
  // Movement mechanics
  movementCommands: string[];
  validExits: Set<string>;
  // Communication features
  hasChannels: boolean;
  channelCommands: string[];
  hasBoards: boolean;
  boardCommands: string[];
  // Inventory/items
  hasInventory: boolean;
  inventoryCommands: string[];
  // Social features
  hasSocial: boolean;
  socialCommands: string[];
  // Building system
  hasBuilding: boolean;
  buildCommands: string[];
  // Coordination features
  hasGroups: boolean;
  hasTasks: boolean;
  hasMacros: boolean;
  // World structure
  roomCount: number;
  areasDiscovered: string[];
  // Research tracking
  researchTopics: string[];
  knowledgeCategories: string[];
  entityProfiles: Map<string, { name: string; interactions: number; notes: string[] }>;
  patternLog: string[];
}

export class LearningSystem {
  private mechanics: EnvironmentCapabilities;
  private discoveries: string[] = [];

  constructor() {
    this.mechanics = {
      availableCommands: [],
      commandPatterns: new Map(),
      movementCommands: [],
      validExits: new Set(),
      hasChannels: false,
      channelCommands: [],
      hasBoards: false,
      boardCommands: [],
      hasInventory: false,
      inventoryCommands: [],
      hasSocial: false,
      socialCommands: [],
      hasBuilding: false,
      buildCommands: [],
      hasGroups: false,
      hasTasks: false,
      hasMacros: false,
      roomCount: 0,
      areasDiscovered: [],
      researchTopics: [],
      knowledgeCategories: [],
      entityProfiles: new Map(),
      patternLog: [],
    };
  }

  /**
   * Learn from command execution
   */
  learnFromCommand(
    command: string,
    success: boolean,
    responseTime: number,
    response: string,
  ): void {
    // Get or create command pattern
    let pattern = this.mechanics.commandPatterns.get(command);
    if (!pattern) {
      pattern = {
        command,
        successRate: 0,
        timesUsed: 0,
        avgResponseTime: 0,
        lastUsed: Date.now(),
      };
      this.mechanics.commandPatterns.set(command, pattern);
    }

    // Update statistics
    pattern.timesUsed++;
    pattern.lastUsed = Date.now();
    pattern.avgResponseTime =
      (pattern.avgResponseTime * (pattern.timesUsed - 1) + responseTime) / pattern.timesUsed;

    // Update success rate
    const prevSuccesses = pattern.successRate * (pattern.timesUsed - 1);
    pattern.successRate = (prevSuccesses + (success ? 1 : 0)) / pattern.timesUsed;

    // Learn from response content
    this.analyzeResponse(command, response);
  }

  /**
   * Analyze response to discover mechanics
   */
  private analyzeResponse(command: string, response: string): void {
    const lower = response.toLowerCase();

    // Detect command listings from help
    if (lower.includes("available commands") || lower.includes("help")) {
      const commands = this.extractCommands(response);
      for (const cmd of commands) {
        if (!this.mechanics.availableCommands.includes(cmd)) {
          this.mechanics.availableCommands.push(cmd);
          this.discoveries.push(`Discovered command: ${cmd}`);
        }
      }
    }

    // Detect exits
    if (lower.includes("exits:") || lower.includes("obvious exits")) {
      const exits = this.extractExits(response);
      for (const exit of exits) {
        this.mechanics.validExits.add(exit);
      }
    }

    // Detect channel system
    if (lower.includes("channel") || lower.includes("channels:")) {
      if (!this.mechanics.hasChannels) {
        this.mechanics.hasChannels = true;
        this.discoveries.push("Discovered channel communication system");
      }
    }

    // Detect board system
    if (lower.includes("board") || lower.includes("boards:") || lower.includes("notice")) {
      if (!this.mechanics.hasBoards) {
        this.mechanics.hasBoards = true;
        this.discoveries.push("Discovered board system");
      }
    }

    // Detect inventory
    if (lower.includes("inventory") || lower.includes("you are carrying")) {
      if (!this.mechanics.hasInventory) {
        this.mechanics.hasInventory = true;
        this.discoveries.push("Discovered inventory system");
      }
    }

    // Detect building system
    if (
      lower.includes("build") ||
      lower.includes("room created") ||
      lower.includes("room module")
    ) {
      if (!this.mechanics.hasBuilding) {
        this.mechanics.hasBuilding = true;
        this.discoveries.push("Discovered room building system");
      }
    }

    // Detect group system
    if (lower.includes("group") || lower.includes("guild")) {
      if (!this.mechanics.hasGroups) {
        this.mechanics.hasGroups = true;
        this.discoveries.push("Discovered group/guild system");
      }
    }

    // Detect social features
    if (lower.includes("says:") || lower.includes("tells you") || lower.includes("shouts")) {
      if (!this.mechanics.hasSocial) {
        this.mechanics.hasSocial = true;
        this.discoveries.push("Discovered social/chat system");
      }
    }

    // Track room count
    if (command.match(/^(north|south|east|west|up|down|n|s|e|w|u|d)$/i)) {
      if (!lower.includes("error") && !lower.includes("can't go")) {
        this.mechanics.roomCount++;
      }
    }

    // Detect entity information (names, descriptions in output)
    const entityPatterns = response.match(/(?:You see|Here is|Present:)\s+(.+)/gi);
    if (entityPatterns) {
      for (const match of entityPatterns) {
        const entityName = match.replace(/^(You see|Here is|Present:)\s+/i, "").trim();
        if (entityName && entityName.length > 1) {
          const existing = this.mechanics.entityProfiles.get(entityName);
          if (existing) {
            existing.interactions++;
          } else {
            this.mechanics.entityProfiles.set(entityName, {
              name: entityName,
              interactions: 1,
              notes: [],
            });
          }
        }
      }
    }

    // Detect structured data patterns (lists, hierarchies)
    const listPatterns = response.match(/^\s*[-*]\s+.+/gm);
    if (listPatterns && listPatterns.length >= 3) {
      const pattern = `Structured list (${listPatterns.length} items) from '${command}'`;
      if (!this.mechanics.patternLog.includes(pattern)) {
        this.mechanics.patternLog.push(pattern);
      }
    }

    // Detect topic references worth researching
    const topicKeywords = [
      "system",
      "feature",
      "command",
      "area",
      "zone",
      "quest",
      "skill",
      "ability",
      "class",
      "type",
    ];
    for (const keyword of topicKeywords) {
      if (lower.includes(keyword) && !this.mechanics.researchTopics.includes(keyword)) {
        this.mechanics.researchTopics.push(keyword);
      }
    }
  }

  /**
   * Extract commands from help text
   */
  private extractCommands(text: string): string[] {
    const commands: string[] = [];
    const lines = text.split("\n");

    for (const line of lines) {
      // Look for command patterns like "  say <message>" or "  command - description"
      const match = line.match(/^\s+(\w+)(?:\s+<[^>]+>|\s+\w+)?\s*-/);
      if (match) {
        commands.push(match[1].toLowerCase());
      }

      // Also look for simple command lists
      const words = line.trim().split(/[,\s]+/);
      for (const word of words) {
        if (word.length > 2 && /^[a-z]+$/.test(word)) {
          const knownCommands = [
            "say",
            "look",
            "go",
            "get",
            "take",
            "drop",
            "inventory",
            "help",
            "who",
            "score",
            "examine",
            "tell",
            "channel",
            "board",
            "build",
            "group",
            "task",
            "macro",
            "move",
            "north",
            "south",
            "east",
            "west",
          ];
          if (knownCommands.includes(word)) {
            commands.push(word);
          }
        }
      }
    }

    return [...new Set(commands)];
  }

  /**
   * Extract exits from room description
   */
  private extractExits(text: string): string[] {
    const exits: string[] = [];
    const lower = text.toLowerCase();

    const exitsMatch = lower.match(/exits?:?\s*([^\n]+)/i);
    if (exitsMatch) {
      const exitList = exitsMatch[1];
      const directions = exitList.split(/[,\s]+/).filter((d) => d.length > 0);

      for (const dir of directions) {
        const cleaned = dir.replace(/[^a-z]/g, "");
        if (cleaned && cleaned !== "and") {
          exits.push(cleaned);
        }
      }
    }

    return exits;
  }

  /**
   * Get most effective commands for a goal
   */
  getBestCommands(goalType: string, limit = 5): CommandPattern[] {
    const patterns = Array.from(this.mechanics.commandPatterns.values());

    const relevant = patterns.filter((p) => {
      if (goalType === "explore") {
        return this.mechanics.movementCommands.includes(p.command) || p.command === "look";
      }
      if (goalType === "build") {
        return p.command.startsWith("build");
      }
      if (goalType === "communicate") {
        return (
          this.mechanics.socialCommands.includes(p.command) ||
          p.command === "say" ||
          p.command === "tell"
        );
      }
      if (goalType === "inventory") {
        return this.mechanics.inventoryCommands.includes(p.command);
      }
      if (goalType === "research") {
        return ["look", "examine", "help", "channel", "board"].some((c) => p.command.startsWith(c));
      }
      if (goalType === "organize") {
        return p.command.startsWith("memory") || p.command === "think";
      }
      if (goalType === "analyze") {
        return ["look", "examine", "state", "think"].some((c) => p.command.startsWith(c));
      }
      if (goalType === "monitor") {
        return ["who", "look", "channel"].some((c) => p.command.startsWith(c));
      }
      return true;
    });

    relevant.sort((a, b) => {
      const scoreA = a.successRate * Math.log(a.timesUsed + 1);
      const scoreB = b.successRate * Math.log(b.timesUsed + 1);
      return scoreB - scoreA;
    });

    return relevant.slice(0, limit);
  }

  /**
   * Get current understanding of the world
   */
  getMechanics(): EnvironmentCapabilities {
    return { ...this.mechanics };
  }

  /**
   * Get recent discoveries
   */
  getDiscoveries(): string[] {
    return [...this.discoveries];
  }

  /**
   * Generate learning summary
   */
  getLearningReport(): string {
    const lines: string[] = [];

    lines.push(`Commands: ${this.mechanics.availableCommands.length} discovered`);
    lines.push(`Rooms visited: ${this.mechanics.roomCount}`);

    const features = [
      this.mechanics.hasChannels && "channels",
      this.mechanics.hasBoards && "boards",
      this.mechanics.hasInventory && "inventory",
      this.mechanics.hasBuilding && "building",
      this.mechanics.hasSocial && "social",
      this.mechanics.hasGroups && "groups",
    ].filter(Boolean);
    if (features.length > 0) lines.push(`Features: ${features.join(", ")}`);

    // Top 3 most-used commands only
    const topCommands = Array.from(this.mechanics.commandPatterns.values())
      .sort((a, b) => b.timesUsed - a.timesUsed)
      .slice(0, 3);
    if (topCommands.length > 0) {
      lines.push(
        `Top commands: ${topCommands.map((c) => `${c.command}(${c.timesUsed}x)`).join(", ")}`,
      );
    }

    return lines.join("\n");
  }

  /**
   * Serialize learning state to JSON for persistence.
   */
  toJSON(): any {
    return {
      mechanics: {
        availableCommands: this.mechanics.availableCommands,
        commandPatterns: Array.from(this.mechanics.commandPatterns.entries()),
        movementCommands: this.mechanics.movementCommands,
        validExits: Array.from(this.mechanics.validExits),
        hasChannels: this.mechanics.hasChannels,
        channelCommands: this.mechanics.channelCommands,
        hasBoards: this.mechanics.hasBoards,
        boardCommands: this.mechanics.boardCommands,
        hasInventory: this.mechanics.hasInventory,
        inventoryCommands: this.mechanics.inventoryCommands,
        hasSocial: this.mechanics.hasSocial,
        socialCommands: this.mechanics.socialCommands,
        hasBuilding: this.mechanics.hasBuilding,
        buildCommands: this.mechanics.buildCommands,
        hasGroups: this.mechanics.hasGroups,
        hasTasks: this.mechanics.hasTasks,
        hasMacros: this.mechanics.hasMacros,
        roomCount: this.mechanics.roomCount,
        areasDiscovered: this.mechanics.areasDiscovered,
        researchTopics: this.mechanics.researchTopics,
        knowledgeCategories: this.mechanics.knowledgeCategories,
        entityProfiles: Array.from(this.mechanics.entityProfiles.entries()),
        patternLog: this.mechanics.patternLog,
      },
      discoveries: this.discoveries,
    };
  }

  /**
   * Reconstruct a LearningSystem from serialized JSON data.
   */
  static fromJSON(data: any): LearningSystem {
    const system = new LearningSystem();
    if (!data || !data.mechanics) return system;

    const m = data.mechanics;
    system.mechanics.availableCommands = m.availableCommands ?? [];
    system.mechanics.commandPatterns = new Map(m.commandPatterns ?? []);
    system.mechanics.movementCommands = m.movementCommands ?? [];
    system.mechanics.validExits = new Set(m.validExits ?? []);
    system.mechanics.hasChannels = m.hasChannels ?? false;
    system.mechanics.channelCommands = m.channelCommands ?? [];
    system.mechanics.hasBoards = m.hasBoards ?? false;
    system.mechanics.boardCommands = m.boardCommands ?? [];
    system.mechanics.hasInventory = m.hasInventory ?? false;
    system.mechanics.inventoryCommands = m.inventoryCommands ?? [];
    system.mechanics.hasSocial = m.hasSocial ?? false;
    system.mechanics.socialCommands = m.socialCommands ?? [];
    system.mechanics.hasBuilding = m.hasBuilding ?? false;
    system.mechanics.buildCommands = m.buildCommands ?? [];
    system.mechanics.hasGroups = m.hasGroups ?? false;
    system.mechanics.hasTasks = m.hasTasks ?? false;
    system.mechanics.hasMacros = m.hasMacros ?? false;
    system.mechanics.roomCount = m.roomCount ?? 0;
    system.mechanics.areasDiscovered = m.areasDiscovered ?? [];
    system.mechanics.researchTopics = m.researchTopics ?? [];
    system.mechanics.knowledgeCategories = m.knowledgeCategories ?? [];
    system.mechanics.entityProfiles = new Map(m.entityProfiles ?? []);
    system.mechanics.patternLog = m.patternLog ?? [];
    system.discoveries = data.discoveries ?? [];

    return system;
  }

  /**
   * Reset learning state
   */
  reset(): void {
    this.mechanics = {
      availableCommands: [],
      commandPatterns: new Map(),
      movementCommands: [],
      validExits: new Set(),
      hasChannels: false,
      channelCommands: [],
      hasBoards: false,
      boardCommands: [],
      hasInventory: false,
      inventoryCommands: [],
      hasSocial: false,
      socialCommands: [],
      hasBuilding: false,
      buildCommands: [],
      hasGroups: false,
      hasTasks: false,
      hasMacros: false,
      roomCount: 0,
      areasDiscovered: [],
      researchTopics: [],
      knowledgeCategories: [],
      entityProfiles: new Map(),
      patternLog: [],
    };
    this.discoveries = [];
  }
}
