import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Engine } from "../src/engine/engine";
import { ArtilectDB } from "../src/persistence/database";
import { roomId } from "../src/types";
import defaultWorld from "../worlds/default";
import { MockConnection, cleanupDb, makeTestRoom } from "./helpers";

describe("Quest System", () => {
  let db: ArtilectDB;
  let engine: Engine;
  let conn: MockConnection;
  const dbPath = `/tmp/artilect-quest-test-${Date.now()}.db`;

  beforeEach(() => {
    db = new ArtilectDB(dbPath);
    engine = new Engine({
      startRoom: roomId("world/2-2"),
      tickInterval: 60_000,
      db,
      world: defaultWorld,
    });

    // Create a mini grid: center + 3 adjacent sectors
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
      makeTestRoom({
        short: "Sector 1-2",
        exits: { south: roomId("world/2-2") },
      }),
    );
    engine.registerRoom(
      roomId("world/2-3"),
      makeTestRoom({
        short: "Sector 2-3",
        exits: { west: roomId("world/2-2") },
      }),
    );
    engine.registerRoom(
      roomId("world/3-2"),
      makeTestRoom({
        short: "Sector 3-2",
        exits: { north: roomId("world/2-2") },
      }),
    );

    conn = new MockConnection("c1");
    engine.addConnection(conn);
  });

  afterEach(() => {
    db.close();
    cleanupDb(dbPath);
  });

  it("should auto-start tutorial quest for new players", () => {
    const result = engine.login("c1", "NewPlayer");
    expect("entityId" in result).toBe(true);
    if ("entityId" in result) {
      const entity = engine.entities.get(result.entityId);
      expect(entity?.properties.active_quest).toBe("tutorial");
    }
  });

  it("should not auto-start quest for returning ranked players", () => {
    // Create a user with rank 1
    db.createUser({ id: "u1", name: "Veteran", rank: 1 });
    const result = engine.login("c1", "Veteran");
    expect("entityId" in result).toBe(true);
    if ("entityId" in result) {
      const entity = engine.entities.get(result.entityId);
      // Ranked players don't get auto-quest
      expect(entity?.properties.active_quest).toBeUndefined();
    }
  });

  it("should show quest status", () => {
    engine.login("c1", "Player");
    conn.clear();
    engine.processCommand(conn.entity!, "quest status");
    const text = conn.lastText();
    expect(text).toContain("First Steps");
    expect(text).toContain("Look around");
  });

  it("should list available quests", () => {
    engine.login("c1", "Player");
    conn.clear();
    engine.processCommand(conn.entity!, "quest list");
    const text = conn.lastText();
    expect(text).toContain("First Steps");
    expect(text).toContain("ACTIVE");
  });

  it("should track look progress", () => {
    engine.login("c1", "Player");
    const entity = engine.entities.get(conn.entity!);
    expect(entity?.properties.quest_look).toBeUndefined();

    engine.processCommand(conn.entity!, "look");
    expect(entity?.properties.quest_look).toBe(true);
  });

  it("should track movement and sector exploration", () => {
    engine.login("c1", "Player");
    const entity = engine.entities.get(conn.entity!);

    // Move to adjacent sector
    engine.processCommand(conn.entity!, "north");
    expect(entity?.properties.quest_move).toBe(true);

    const sectors = entity?.properties.quest_sectors as string[];
    expect(sectors).toContain("world/1-2");
  });

  it("should track say progress", () => {
    engine.login("c1", "Player");
    const entity = engine.entities.get(conn.entity!);

    engine.processCommand(conn.entity!, "say Hello!");
    expect(entity?.properties.quest_say).toBe(true);
  });

  it("should track examine progress", () => {
    engine.login("c1", "Player");
    const entity = engine.entities.get(conn.entity!);

    engine.processCommand(conn.entity!, "examine terminal");
    expect(entity?.properties.quest_examine).toBe(true);
  });

  it("should complete quest and promote to citizen", () => {
    engine.login("c1", "Player");
    const entity = engine.entities.get(conn.entity!)!;

    // Complete all steps
    engine.processCommand(conn.entity!, "look");
    engine.processCommand(conn.entity!, "say hi");
    engine.processCommand(conn.entity!, "examine terminal");

    // Visit 3 sectors
    engine.processCommand(conn.entity!, "north"); // world/1-2
    engine.processCommand(conn.entity!, "south"); // back to world/2-2
    engine.processCommand(conn.entity!, "east"); // world/2-3
    engine.processCommand(conn.entity!, "west"); // back to world/2-2
    engine.processCommand(conn.entity!, "south"); // world/3-2

    conn.clear();
    engine.processCommand(conn.entity!, "quest complete");
    const text = conn.lastText();
    expect(text).toContain("Quest completed");
    expect(text).toContain("Citizen");

    // Should have rank 1
    expect(entity.properties.rank).toBe(1);
    expect(entity.properties.active_quest).toBeUndefined();
  });

  it("should not complete quest if steps are missing", () => {
    engine.login("c1", "Player");
    conn.clear();
    engine.processCommand(conn.entity!, "quest complete");
    expect(conn.lastText()).toContain("Not all steps");
  });

  it("should support quest abandon and restart", () => {
    engine.login("c1", "Player");
    const entity = engine.entities.get(conn.entity!)!;

    engine.processCommand(conn.entity!, "look");
    expect(entity.properties.quest_look).toBe(true);

    engine.processCommand(conn.entity!, "quest abandon");
    expect(entity.properties.active_quest).toBeUndefined();
    expect(entity.properties.quest_look).toBeUndefined();

    // Can restart
    engine.processCommand(conn.entity!, "quest start First Steps");
    expect(entity.properties.active_quest).toBe("tutorial");
  });

  it("should prevent starting a completed quest again", () => {
    engine.login("c1", "Player");
    const entity = engine.entities.get(conn.entity!)!;

    // Manually complete
    entity.properties.quest_look = true;
    entity.properties.quest_move = true;
    entity.properties.quest_sectors = ["world/1-2", "world/2-3", "world/3-2"];
    entity.properties.quest_say = true;
    entity.properties.quest_examine = true;

    engine.processCommand(conn.entity!, "quest complete");
    conn.clear();

    engine.processCommand(conn.entity!, "quest start First Steps");
    expect(conn.lastText()).toContain("already completed");
  });
});

describe("Quest: journal alias", () => {
  let db: ArtilectDB;
  let engine: Engine;
  let conn: MockConnection;
  const dbPath = `/tmp/artilect-quest-alias-test-${Date.now()}.db`;

  beforeEach(() => {
    db = new ArtilectDB(dbPath);
    engine = new Engine({
      startRoom: roomId("test/start"),
      tickInterval: 60_000,
      db,
      world: defaultWorld,
    });
    engine.registerRoom(roomId("test/start"), makeTestRoom());
    conn = new MockConnection("c1");
    engine.addConnection(conn);
    engine.login("c1", "Player");
    conn.clear();
  });

  afterEach(() => {
    db.close();
    cleanupDb(dbPath);
  });

  it("should work via journal alias", () => {
    engine.processCommand(conn.entity!, "journal");
    expect(conn.lastText()).toContain("First Steps");
  });

  it("should work via quests alias", () => {
    engine.processCommand(conn.entity!, "quests list");
    expect(conn.lastText()).toContain("First Steps");
  });
});
