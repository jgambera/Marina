import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { Engine } from "../src/engine/engine";
import { ArtilectDB } from "../src/persistence/database";
import { roomId } from "../src/types";
import { loadRooms } from "../src/world/room-loader";
import { seedGuidePool } from "../src/world/seed-guide";
import defaultWorld from "../worlds/default";
import emptyWorld from "../worlds/empty";
import { MockConnection, cleanupDb, makeTestRoom } from "./helpers";

describe("WorldDefinition: default world", () => {
  it("should have rooms loaded from files (rooms is empty, roomsDir is set)", () => {
    expect(Object.keys(defaultWorld.rooms).length).toBe(0);
    expect(defaultWorld.roomsDir).toBeDefined();
  });

  it("should load 25 rooms from roomsDir", async () => {
    const engine = new Engine({
      startRoom: roomId("world/2-2"),
      tickInterval: 60_000,
      world: defaultWorld,
    });
    await loadRooms(engine, resolve(defaultWorld.roomsDir!));
    expect(engine.rooms.size).toBe(25);
  });

  it("should have center room with 4 exits after loading", async () => {
    const engine = new Engine({
      startRoom: roomId("world/2-2"),
      tickInterval: 60_000,
      world: defaultWorld,
    });
    await loadRooms(engine, resolve(defaultWorld.roomsDir!));
    const center = engine.rooms.get(roomId("world/2-2"));
    expect(center).toBeDefined();
    expect(center!.module.exits).toBeDefined();
    expect(Object.keys(center!.module.exits!).length).toBe(4);
  });

  it("should have 3 quests", () => {
    expect(defaultWorld.quests.length).toBe(3);
    expect(defaultWorld.quests.map((q) => q.id)).toEqual(["tutorial", "explorer", "perimeter"]);
  });

  it("should have guide notes", () => {
    expect(defaultWorld.guideNotes.length).toBe(22);
  });

  it("should have autoQuest set to tutorial", () => {
    expect(defaultWorld.autoQuest).toBe("tutorial");
  });

  it("should have canvas config", () => {
    expect(defaultWorld.canvas).toBeDefined();
    expect(defaultWorld.canvas!.name).toBe("global");
  });
});

describe("WorldDefinition: empty world", () => {
  it("should have 1 room", () => {
    expect(Object.keys(emptyWorld.rooms).length).toBe(1);
  });

  it("should have 0 quests", () => {
    expect(emptyWorld.quests.length).toBe(0);
  });

  it("should have 0 guide notes", () => {
    expect(emptyWorld.guideNotes.length).toBe(0);
  });

  it("should not have autoQuest", () => {
    expect(emptyWorld.autoQuest).toBeUndefined();
  });
});

describe("WorldDefinition: registerWorldRooms", () => {
  it("should register all rooms from a world definition", () => {
    const engine = new Engine({
      startRoom: roomId("void/center"),
      tickInterval: 60_000,
      world: emptyWorld,
    });
    engine.registerWorldRooms(emptyWorld);
    expect(engine.rooms.size).toBe(1);
    expect(engine.rooms.has(roomId("void/center"))).toBe(true);
  });

  it("should register all 25 rooms from default world files", async () => {
    const engine = new Engine({
      startRoom: roomId("world/2-2"),
      tickInterval: 60_000,
      world: defaultWorld,
    });
    engine.registerWorldRooms(defaultWorld);
    await loadRooms(engine, resolve(defaultWorld.roomsDir!));
    expect(engine.rooms.size).toBe(25);
  });
});

describe("WorldDefinition: empty world engine", () => {
  let engine: Engine;
  let conn: MockConnection;

  beforeEach(() => {
    engine = new Engine({
      startRoom: roomId("void/center"),
      tickInterval: 60_000,
      world: emptyWorld,
    });
    engine.registerWorldRooms(emptyWorld);
    conn = new MockConnection("c1");
    engine.addConnection(conn);
  });

  it("should spawn in void room", () => {
    const result = engine.login("c1", "Wanderer");
    expect("entityId" in result).toBe(true);
    if ("entityId" in result) {
      const entity = engine.entities.get(result.entityId);
      expect(entity?.room).toBe(roomId("void/center"));
    }
  });

  it("should not auto-start any quest", () => {
    const result = engine.login("c1", "Wanderer");
    expect("entityId" in result).toBe(true);
    if ("entityId" in result) {
      const entity = engine.entities.get(result.entityId);
      expect(entity?.properties.active_quest).toBeUndefined();
    }
  });

  it("should have no quests available", () => {
    engine.login("c1", "Wanderer");
    conn.clear();
    engine.processCommand(conn.entity!, "quest list");
    const text = conn.lastText();
    // Should show header but no quest entries
    expect(text).toContain("Available Quests");
    expect(text).not.toContain("First Steps");
  });
});

describe("WorldDefinition: onComplete callback", () => {
  let db: ArtilectDB;
  let engine: Engine;
  let conn: MockConnection;
  const dbPath = `/tmp/artilect-oncomplete-test-${Date.now()}.db`;

  beforeEach(() => {
    db = new ArtilectDB(dbPath);
    engine = new Engine({
      startRoom: roomId("world/2-2"),
      tickInterval: 60_000,
      db,
      world: defaultWorld,
    });
    engine.registerRoom(
      roomId("world/2-2"),
      makeTestRoom({
        short: "Sector 2-2",
        items: { terminal: "A glowing terminal." },
        exits: {
          north: roomId("world/1-2"),
          east: roomId("world/2-3"),
          south: roomId("world/3-2"),
        },
      }),
    );
    engine.registerRoom(
      roomId("world/1-2"),
      makeTestRoom({ short: "Sector 1-2", exits: { south: roomId("world/2-2") } }),
    );
    engine.registerRoom(
      roomId("world/2-3"),
      makeTestRoom({ short: "Sector 2-3", exits: { west: roomId("world/2-2") } }),
    );
    engine.registerRoom(
      roomId("world/3-2"),
      makeTestRoom({ short: "Sector 3-2", exits: { north: roomId("world/2-2") } }),
    );

    conn = new MockConnection("c1");
    engine.addConnection(conn);
  });

  afterEach(() => {
    db.close();
    cleanupDb(dbPath);
  });

  it("should fire onComplete and promote to citizen on tutorial completion", () => {
    engine.login("c1", "Player");
    const entity = engine.entities.get(conn.entity!)!;

    // Complete all steps
    engine.processCommand(conn.entity!, "look");
    engine.processCommand(conn.entity!, "say hi");
    engine.processCommand(conn.entity!, "examine terminal");
    engine.processCommand(conn.entity!, "north");
    engine.processCommand(conn.entity!, "south");
    engine.processCommand(conn.entity!, "east");
    engine.processCommand(conn.entity!, "west");
    engine.processCommand(conn.entity!, "south");

    engine.processCommand(conn.entity!, "quest complete");
    expect(entity.properties.rank).toBe(1);

    // DB should also reflect the rank
    const user = db.getUserByName("Player");
    expect(user?.rank).toBe(1);
  });
});

describe("seedGuidePool with custom notes", () => {
  let db: ArtilectDB;
  const dbPath = `/tmp/artilect-guide-test-${Date.now()}.db`;

  beforeEach(() => {
    db = new ArtilectDB(dbPath);
  });

  afterEach(() => {
    db.close();
    cleanupDb(dbPath);
  });

  it("should seed notes from provided array", () => {
    const notes = [
      { content: "Test note one", importance: 8, type: "skill" },
      { content: "Test note two", importance: 5, type: "fact" },
    ];
    seedGuidePool(db, notes);

    const pool = db.getMemoryPool("guide");
    expect(pool).toBeDefined();

    const recalled = db.recallPoolNotes(pool!.id, "Test note", {
      weightRelevance: 1.0,
      weightRecency: 0,
      weightImportance: 0,
    });
    expect(recalled.length).toBeGreaterThanOrEqual(2);
  });

  it("should short-circuit on empty notes", () => {
    seedGuidePool(db, []);
    const pool = db.getMemoryPool("guide");
    // Pool should not be created if no notes provided
    expect(pool).toBeUndefined();
  });

  it("should be idempotent", () => {
    const notes = [{ content: "Idempotency test", importance: 5, type: "skill" }];
    seedGuidePool(db, notes);
    seedGuidePool(db, notes); // second call should be no-op

    const pool = db.getMemoryPool("guide");
    expect(pool).toBeDefined();
  });
});
