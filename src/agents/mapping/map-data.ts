/**
 * Map Data Structures - Represent the world as a graph
 *
 * Marina uses string-based directions (not a fixed enum).
 * Room IDs are path-based strings like "hub/plaza", "market/bazaar".
 */

export interface MapRoom {
  /** Unique room ID (path-based, e.g. "hub/plaza") */
  id: string;
  /** Room title/short description */
  title: string;
  /** Full room description */
  description?: string;
  /** Available exits: direction string -> target room ID */
  exits: Map<string, string>;
  /** Coordinates in 2D space (for rendering) */
  x: number;
  y: number;
  z: number; // Floor/level
  /** When this room was discovered */
  discoveredAt: number;
  /** Number of times visited */
  visitCount: number;
  /** Items in room (optional) */
  items?: string[];
  /** NPCs/entities in room (optional) */
  npcs?: string[];
  /** Special markers */
  markers?: string[]; // e.g., ["shop", "quest", "dangerous"]
}

export interface MapStats {
  totalRooms: number;
  unexploredExits: number;
  explorationStarted: number;
  explorationCompleted?: number;
  roomsPerMinute: number;
  currentDepth: number;
  maxDepth: number;
}

export class WorldMap {
  private rooms: Map<string, MapRoom> = new Map();
  private currentRoomId: string | null = null;
  private startRoomId: string | null = null;
  private explorationStarted: number = Date.now();

  /**
   * Add or update a room in the map
   */
  addRoom(room: Partial<MapRoom> & { id: string; title: string }): MapRoom {
    const existing = this.rooms.get(room.id);

    if (existing) {
      // Update existing room
      if (room.description) existing.description = room.description;
      if (room.exits) existing.exits = new Map([...existing.exits, ...room.exits]);
      if (room.items) existing.items = room.items;
      if (room.npcs) existing.npcs = room.npcs;
      if (room.markers) existing.markers = [...(existing.markers || []), ...room.markers];
      existing.visitCount++;
      return existing;
    }

    // Create new room
    const newRoom: MapRoom = {
      id: room.id,
      title: room.title,
      description: room.description,
      exits: room.exits || new Map(),
      x: room.x ?? 0,
      y: room.y ?? 0,
      z: room.z ?? 0,
      discoveredAt: Date.now(),
      visitCount: 1,
      items: room.items,
      npcs: room.npcs,
      markers: room.markers,
    };

    this.rooms.set(room.id, newRoom);

    // Set as start room if first room
    if (!this.startRoomId) {
      this.startRoomId = room.id;
    }

    return newRoom;
  }

  /**
   * Get a room by ID
   */
  getRoom(roomId: string): MapRoom | undefined {
    return this.rooms.get(roomId);
  }

  /**
   * Get all rooms
   */
  getAllRooms(): MapRoom[] {
    return Array.from(this.rooms.values());
  }

  /**
   * Set current room
   */
  setCurrentRoom(roomId: string): void {
    this.currentRoomId = roomId;
  }

  /**
   * Get current room
   */
  getCurrentRoom(): MapRoom | undefined {
    return this.currentRoomId ? this.rooms.get(this.currentRoomId) : undefined;
  }

  /**
   * Get start room
   */
  getStartRoom(): MapRoom | undefined {
    return this.startRoomId ? this.rooms.get(this.startRoomId) : undefined;
  }

  /**
   * Add exit to a room
   */
  addExit(fromRoomId: string, direction: string, toRoomId: string): void {
    const room = this.rooms.get(fromRoomId);
    if (room) {
      room.exits.set(direction, toRoomId);
    }
  }

  /**
   * Get all unexplored exits
   */
  getUnexploredExits(): Array<{ roomId: string; direction: string; targetRoomId: string }> {
    const unexplored: Array<{ roomId: string; direction: string; targetRoomId: string }> = [];

    for (const room of this.rooms.values()) {
      for (const [direction, targetId] of room.exits.entries()) {
        if (!this.rooms.has(targetId)) {
          unexplored.push({
            roomId: room.id,
            direction,
            targetRoomId: targetId,
          });
        }
      }
    }

    return unexplored;
  }

  /**
   * Get unexplored exits from current room
   */
  getUnexploredExitsFromCurrentRoom(): string[] {
    const currentRoom = this.getCurrentRoom();
    if (!currentRoom) return [];

    const unexplored: string[] = [];
    for (const [direction, targetId] of currentRoom.exits.entries()) {
      if (!this.rooms.has(targetId)) {
        unexplored.push(direction);
      }
    }

    return unexplored;
  }

  /**
   * Calculate room coordinates based on movement direction.
   * Maps common cardinal directions to coordinate offsets.
   * Non-standard directions are placed at (0,0,0) offset.
   */
  calculateCoordinates(fromRoom: MapRoom, direction: string): { x: number; y: number; z: number } {
    let { x, y, z } = fromRoom;

    switch (direction.toLowerCase()) {
      case "north":
      case "n":
        y--;
        break;
      case "south":
      case "s":
        y++;
        break;
      case "east":
      case "e":
        x++;
        break;
      case "west":
      case "w":
        x--;
        break;
      case "northeast":
      case "ne":
        x++;
        y--;
        break;
      case "northwest":
      case "nw":
        x--;
        y--;
        break;
      case "southeast":
      case "se":
        x++;
        y++;
        break;
      case "southwest":
      case "sw":
        x--;
        y++;
        break;
      case "up":
      case "u":
        z++;
        break;
      case "down":
      case "d":
        z--;
        break;
      // Non-standard directions don't change coordinates
    }

    return { x, y, z };
  }

  /**
   * Get map statistics
   */
  getStats(): MapStats {
    const unexploredExits = this.getUnexploredExits().length;
    const elapsed = (Date.now() - this.explorationStarted) / 1000 / 60; // minutes
    const roomsPerMinute = elapsed > 0 ? this.rooms.size / elapsed : 0;

    // Calculate depths
    let maxDepth = 0;
    let currentDepth = 0;

    if (this.startRoomId && this.currentRoomId) {
      currentDepth = this.calculateDepth(this.startRoomId, this.currentRoomId);
    }

    for (const room of this.rooms.values()) {
      if (this.startRoomId) {
        const depth = this.calculateDepth(this.startRoomId, room.id);
        if (depth > maxDepth) maxDepth = depth;
      }
    }

    return {
      totalRooms: this.rooms.size,
      unexploredExits,
      explorationStarted: this.explorationStarted,
      roomsPerMinute: Math.round(roomsPerMinute * 10) / 10,
      currentDepth,
      maxDepth,
    };
  }

  /**
   * Calculate depth from start room (BFS)
   */
  private calculateDepth(fromRoomId: string, toRoomId: string): number {
    if (fromRoomId === toRoomId) return 0;

    const visited = new Set<string>();
    const queue: Array<{ roomId: string; depth: number }> = [{ roomId: fromRoomId, depth: 0 }];

    while (queue.length > 0) {
      const { roomId, depth } = queue.shift()!;

      if (roomId === toRoomId) return depth;
      if (visited.has(roomId)) continue;

      visited.add(roomId);

      const room = this.rooms.get(roomId);
      if (room) {
        for (const targetId of room.exits.values()) {
          if (!visited.has(targetId)) {
            queue.push({ roomId: targetId, depth: depth + 1 });
          }
        }
      }
    }

    return -1; // Not connected
  }

  /**
   * Find shortest path between two rooms (BFS)
   */
  findPath(fromRoomId: string, toRoomId: string): string[] | null {
    if (fromRoomId === toRoomId) return [];

    const visited = new Set<string>();
    const queue: Array<{ roomId: string; path: string[] }> = [{ roomId: fromRoomId, path: [] }];

    while (queue.length > 0) {
      const { roomId, path } = queue.shift()!;

      if (roomId === toRoomId) return path;
      if (visited.has(roomId)) continue;

      visited.add(roomId);

      const room = this.rooms.get(roomId);
      if (room) {
        for (const [direction, targetId] of room.exits.entries()) {
          if (!visited.has(targetId) && this.rooms.has(targetId)) {
            queue.push({
              roomId: targetId,
              path: [...path, direction],
            });
          }
        }
      }
    }

    return null; // No path found
  }

  /**
   * Export map to JSON
   */
  toJSON(): any {
    return {
      rooms: Array.from(this.rooms.entries()).map(([id, room]) => ({
        id,
        title: room.title,
        description: room.description,
        exits: Array.from(room.exits.entries()),
        x: room.x,
        y: room.y,
        z: room.z,
        discoveredAt: room.discoveredAt,
        visitCount: room.visitCount,
        items: room.items,
        npcs: room.npcs,
        markers: room.markers,
      })),
      currentRoomId: this.currentRoomId,
      startRoomId: this.startRoomId,
      explorationStarted: this.explorationStarted,
    };
  }

  /**
   * Import map from JSON
   */
  static fromJSON(data: any): WorldMap {
    const map = new WorldMap();
    map.currentRoomId = data.currentRoomId;
    map.startRoomId = data.startRoomId;
    map.explorationStarted = data.explorationStarted;

    for (const roomData of data.rooms) {
      const room: MapRoom = {
        id: roomData.id,
        title: roomData.title,
        description: roomData.description,
        exits: new Map(roomData.exits),
        x: roomData.x,
        y: roomData.y,
        z: roomData.z,
        discoveredAt: roomData.discoveredAt,
        visitCount: roomData.visitCount,
        items: roomData.items,
        npcs: roomData.npcs,
        markers: roomData.markers,
      };
      map.rooms.set(room.id, room);
    }

    return map;
  }
}
