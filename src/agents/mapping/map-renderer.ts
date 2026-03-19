/**
 * Map Renderer - Generate ASCII visualization of the world map
 */

import type { MapRoom, WorldMap } from "./map-data";

export interface RenderOptions {
  /** Show room titles (default: true) */
  showTitles?: boolean;
  /** Show room IDs (default: false) */
  showIds?: boolean;
  /** Show markers (default: true) */
  showMarkers?: boolean;
  /** Maximum width in characters (default: 120) */
  maxWidth?: number;
  /** Maximum height in characters (default: 50) */
  maxHeight?: number;
  /** Floor/level to render (default: 0) */
  floor?: number;
  /** Show unexplored exits (default: true) */
  showUnexplored?: boolean;
  /** Highlight current room (default: true) */
  highlightCurrent?: boolean;
}

interface RenderCell {
  x: number;
  y: number;
  room?: MapRoom;
  connections: {
    north?: boolean;
    south?: boolean;
    east?: boolean;
    west?: boolean;
  };
  unexplored: boolean;
}

export class MapRenderer {
  /**
   * Render map as ASCII art
   */
  renderASCII(map: WorldMap, options: RenderOptions = {}): string {
    const {
      showTitles = true,
      showIds = false,
      showMarkers = true,
      maxWidth = 120,
      floor = 0,
      showUnexplored = true,
      highlightCurrent = true,
    } = options;

    const rooms = map.getAllRooms().filter((r) => r.z === floor);

    if (rooms.length === 0) {
      return `No rooms on floor ${floor}`;
    }

    // Find bounds
    const bounds = this.calculateBounds(rooms);
    const grid = this.buildGrid(rooms, bounds);

    // Render
    const lines: string[] = [];

    // Header
    lines.push("=".repeat(Math.min(maxWidth, 80)));
    lines.push(`  World Map - Floor ${floor} - ${rooms.length} rooms`);
    lines.push("=".repeat(Math.min(maxWidth, 80)));
    lines.push("");

    // Legend
    if (showMarkers) {
      lines.push("Legend: [#] Room | -- Connections | ? Unexplored | * Current | @ Start");
      lines.push("");
    }

    // Render grid
    const currentRoom = map.getCurrentRoom();
    const startRoom = map.getStartRoom();

    for (let y = bounds.minY; y <= bounds.maxY; y++) {
      // Room line
      let roomLine = "";
      let connectionLine = "";

      for (let x = bounds.minX; x <= bounds.maxX; x++) {
        const cell = grid.get(`${x},${y}`);

        if (cell?.room) {
          const room = cell.room;
          let symbol = "#";

          // Mark special rooms
          if (highlightCurrent && currentRoom && room.id === currentRoom.id) {
            symbol = "*";
          } else if (startRoom && room.id === startRoom.id) {
            symbol = "@";
          }

          // Room box
          roomLine += `[${symbol}]`;

          // East connection
          if (cell.connections.east) {
            roomLine += "--";
          } else if (showUnexplored && this.hasUnexploredExit(room, "east")) {
            roomLine += "??";
          } else {
            roomLine += "  ";
          }
        } else {
          roomLine += "   ";
          roomLine += "  ";
        }
      }

      lines.push(roomLine);

      // Connection line (south connections)
      connectionLine = "";
      for (let x = bounds.minX; x <= bounds.maxX; x++) {
        const cell = grid.get(`${x},${y}`);

        if (cell?.room) {
          if (cell.connections.south) {
            connectionLine += " | ";
          } else if (showUnexplored && this.hasUnexploredExit(cell.room, "south")) {
            connectionLine += " ? ";
          } else {
            connectionLine += "   ";
          }
          connectionLine += "  ";
        } else {
          connectionLine += "   ";
          connectionLine += "  ";
        }
      }

      lines.push(connectionLine);
    }

    // Room details
    if (showTitles) {
      lines.push("");
      lines.push("-".repeat(Math.min(maxWidth, 80)));
      lines.push("Room Details:");
      lines.push("");

      for (const room of rooms.slice(0, 20)) {
        const coords = `(${room.x},${room.y})`;
        const id = showIds ? `[${room.id}]` : "";
        const marker = highlightCurrent && currentRoom && room.id === currentRoom.id ? " *" : "";
        const markers = showMarkers && room.markers ? ` [${room.markers.join(", ")}]` : "";

        lines.push(`  ${coords} ${room.title}${marker}${markers} ${id}`);
      }

      if (rooms.length > 20) {
        lines.push(`  ... and ${rooms.length - 20} more rooms`);
      }
    }

    return lines.join("\n");
  }

  /**
   * Render compact map (just rooms and connections)
   */
  renderCompact(map: WorldMap, floor: number = 0): string {
    const rooms = map.getAllRooms().filter((r) => r.z === floor);

    if (rooms.length === 0) {
      return `No rooms on floor ${floor}`;
    }

    const bounds = this.calculateBounds(rooms);
    const lines: string[] = [];

    lines.push(`Floor ${floor} (${rooms.length} rooms)`);
    lines.push("");

    for (let y = bounds.minY; y <= bounds.maxY; y++) {
      let line = "";
      for (let x = bounds.minX; x <= bounds.maxX; x++) {
        const room = rooms.find((r) => r.x === x && r.y === y);
        if (room) {
          line += "#";
        } else {
          line += " ";
        }
      }
      lines.push(line);
    }

    return lines.join("\n");
  }

  /**
   * Render statistics
   */
  renderStats(map: WorldMap): string {
    const stats = map.getStats();
    const lines: string[] = [];

    lines.push("=".repeat(50));
    lines.push("  Exploration Statistics");
    lines.push("=".repeat(50));
    lines.push("");
    lines.push(`  Total Rooms Discovered: ${stats.totalRooms}`);
    lines.push(`  Unexplored Exits: ${stats.unexploredExits}`);
    lines.push(`  Exploration Rate: ${stats.roomsPerMinute} rooms/min`);
    lines.push(`  Current Depth: ${stats.currentDepth}`);
    lines.push(`  Maximum Depth: ${stats.maxDepth}`);
    lines.push("");

    const elapsed = (Date.now() - stats.explorationStarted) / 1000;
    const minutes = Math.floor(elapsed / 60);
    const seconds = Math.floor(elapsed % 60);
    lines.push(`  Time Elapsed: ${minutes}m ${seconds}s`);

    if (stats.unexploredExits === 0) {
      lines.push("");
      lines.push("  Exploration Complete!");
    }

    lines.push("");
    return lines.join("\n");
  }

  /**
   * Render all floors overview
   */
  renderFloors(map: WorldMap): string {
    const rooms = map.getAllRooms();
    const floors = new Map<number, number>();

    for (const room of rooms) {
      floors.set(room.z, (floors.get(room.z) || 0) + 1);
    }

    const lines: string[] = [];
    lines.push("=".repeat(50));
    lines.push("  Floor Overview");
    lines.push("=".repeat(50));
    lines.push("");

    const sortedFloors = Array.from(floors.entries()).sort((a, b) => b[0] - a[0]);

    for (const [floor, count] of sortedFloors) {
      const bar = "#".repeat(Math.min(count, 40));
      lines.push(`  Floor ${floor.toString().padStart(2)}: ${bar} (${count} rooms)`);
    }

    lines.push("");
    return lines.join("\n");
  }

  /**
   * Calculate bounds of room coordinates
   */
  private calculateBounds(rooms: MapRoom[]): {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  } {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const room of rooms) {
      if (room.x < minX) minX = room.x;
      if (room.x > maxX) maxX = room.x;
      if (room.y < minY) minY = room.y;
      if (room.y > maxY) maxY = room.y;
    }

    return { minX, maxX, minY, maxY };
  }

  /**
   * Build grid of render cells
   */
  private buildGrid(rooms: MapRoom[], _bounds: any): Map<string, RenderCell> {
    const grid = new Map<string, RenderCell>();

    for (const room of rooms) {
      const key = `${room.x},${room.y}`;

      const cell: RenderCell = {
        x: room.x,
        y: room.y,
        room,
        connections: {
          north: this.hasConnection(rooms, room, "north"),
          south: this.hasConnection(rooms, room, "south"),
          east: this.hasConnection(rooms, room, "east"),
          west: this.hasConnection(rooms, room, "west"),
        },
        unexplored: false,
      };

      grid.set(key, cell);
    }

    return grid;
  }

  /**
   * Check if room has connection in direction
   */
  private hasConnection(rooms: MapRoom[], room: MapRoom, direction: string): boolean {
    const targetId = room.exits.get(direction);
    if (!targetId) return false;

    return rooms.some((r) => r.id === targetId);
  }

  /**
   * Check if room has unexplored exit in direction
   */
  private hasUnexploredExit(room: MapRoom, direction: string): boolean {
    const targetId = room.exits.get(direction);
    return !!targetId;
  }

  /**
   * Export map to text file format
   */
  exportToFile(map: WorldMap, options: RenderOptions = {}): string {
    const lines: string[] = [];

    // Header
    lines.push("================================================================");
    lines.push("                        WORLD MAP                               ");
    lines.push("================================================================");
    lines.push("");
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push("");

    // Stats
    lines.push(this.renderStats(map));
    lines.push("");

    // Floor overview
    lines.push(this.renderFloors(map));
    lines.push("");

    // Each floor
    const rooms = map.getAllRooms();
    const floors = new Set(rooms.map((r) => r.z));
    const sortedFloors = Array.from(floors).sort((a, b) => b - a);

    for (const floor of sortedFloors) {
      lines.push("-".repeat(80));
      lines.push(this.renderASCII(map, { ...options, floor }));
      lines.push("");
    }

    // JSON export
    lines.push("-".repeat(80));
    lines.push("JSON Export (for sharing/importing):");
    lines.push("");
    lines.push(JSON.stringify(map.toJSON(), null, 2));
    lines.push("");

    return lines.join("\n");
  }
}
