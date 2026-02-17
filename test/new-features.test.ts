import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Engine } from "../src/engine/engine";
import { ArtilectDB } from "../src/persistence/database";
import { roomId } from "../src/types";
import type { EntityId, RoomId } from "../src/types";
import defaultWorld from "../worlds/default";
import { MockConnection, cleanupDb, makeTestRoom, stripAnsi } from "./helpers";

// ─── Ignore Command ─────────────────────────────────────────────────────────

describe("Ignore Command", () => {
  let engine: Engine;
  let conn1: MockConnection;
  let conn2: MockConnection;
  let conn3: MockConnection;
  let e1: EntityId;
  let e2: EntityId;
  let e3: EntityId;

  beforeEach(() => {
    engine = new Engine({ startRoom: roomId("test/start"), tickInterval: 60_000 });
    engine.registerRoom(
      roomId("test/start"),
      makeTestRoom({ exits: { north: "test/other" as RoomId } }),
    );
    engine.registerRoom(roomId("test/other") as RoomId, makeTestRoom());
    conn1 = new MockConnection("c1");
    conn2 = new MockConnection("c2");
    conn3 = new MockConnection("c3");
    engine.addConnection(conn1);
    engine.addConnection(conn2);
    engine.addConnection(conn3);
    const r1 = engine.login("c1", "Alice");
    const r2 = engine.login("c2", "Bob");
    const r3 = engine.login("c3", "Charlie");
    if ("entityId" in r1) e1 = r1.entityId;
    if ("entityId" in r2) e2 = r2.entityId;
    if ("entityId" in r3) e3 = r3.entityId;
    conn1.clear();
    conn2.clear();
    conn3.clear();
  });

  it("adds a player to ignore list", () => {
    engine.processCommand(e1, "ignore Bob");
    expect(conn1.lastText()).toContain("Now ignoring Bob");
  });

  it("shows empty ignore list", () => {
    engine.processCommand(e1, "ignore list");
    expect(conn1.lastText()).toContain("not ignoring anyone");
  });

  it("shows populated ignore list", () => {
    engine.processCommand(e1, "ignore Bob");
    conn1.clear();
    engine.processCommand(e1, "ignore list");
    expect(conn1.lastText()).toContain("Bob");
  });

  it("removes from ignore list", () => {
    engine.processCommand(e1, "ignore Bob");
    conn1.clear();
    engine.processCommand(e1, "ignore remove Bob");
    expect(conn1.lastText()).toContain("No longer ignoring Bob");
  });

  it("reports already ignored", () => {
    engine.processCommand(e1, "ignore Bob");
    conn1.clear();
    engine.processCommand(e1, "ignore Bob");
    expect(conn1.lastText()).toContain("already ignoring Bob");
  });

  it("prevents ignoring yourself", () => {
    engine.processCommand(e1, "ignore Alice");
    expect(conn1.lastText()).toContain("cannot ignore yourself");
  });

  it("reports unknown player", () => {
    engine.processCommand(e1, "ignore Nobody");
    expect(conn1.lastText()).toContain("found");
  });

  it("shows usage with no arguments", () => {
    engine.processCommand(e1, "ignore");
    expect(conn1.lastText()).toContain("Usage:");
  });

  it("blocks say messages from ignored player", () => {
    engine.processCommand(e1, "ignore Bob");
    conn1.clear();
    engine.processCommand(e2, "say Hello everyone!");
    // Alice should NOT see Bob's message
    expect(conn1.messages.length).toBe(0);
    // Charlie should still see it
    expect(stripAnsi(conn3.lastText())).toContain("Bob says:");
  });

  it("blocks shout messages from ignored player", () => {
    // Move Charlie to another room
    engine.processCommand(e3, "north");
    conn1.clear();
    conn3.clear();

    engine.processCommand(e1, "ignore Bob");
    conn1.clear();
    engine.processCommand(e2, "shout Hey everyone!");
    // Alice ignores Bob, should not see it
    expect(conn1.messages.length).toBe(0);
    // Charlie does not ignore Bob, should see it
    expect(conn3.lastText()).toContain("Bob shouts:");
  });

  it("blocks tell messages from ignored player", () => {
    engine.processCommand(e1, "ignore Bob");
    conn1.clear();
    engine.processCommand(e2, "tell Alice Secret message");
    // Alice should NOT see Bob's tell
    expect(conn1.messages.length).toBe(0);
    // Bob still sees their own confirmation
    expect(stripAnsi(conn2.lastText())).toContain("You tell Alice:");
  });

  it("blocks emote messages from ignored player", () => {
    engine.processCommand(e1, "ignore Bob");
    conn1.clear();
    engine.processCommand(e2, "emote dances around");
    // Alice should NOT see Bob's emote
    expect(conn1.messages.length).toBe(0);
    // Charlie should still see it
    expect(conn3.lastText()).toContain("Bob dances around");
  });

  it("works with block alias", () => {
    engine.processCommand(e1, "block Bob");
    expect(conn1.lastText()).toContain("Now ignoring Bob");
  });
});

// ─── Shout Command ──────────────────────────────────────────────────────────

describe("Shout Command", () => {
  let engine: Engine;
  let conn1: MockConnection;
  let conn2: MockConnection;
  let conn3: MockConnection;
  let e1: EntityId;
  let e2: EntityId;

  beforeEach(() => {
    engine = new Engine({ startRoom: roomId("test/start"), tickInterval: 60_000 });
    engine.registerRoom(
      roomId("test/start"),
      makeTestRoom({ exits: { north: "test/other" as RoomId } }),
    );
    engine.registerRoom(roomId("test/other") as RoomId, makeTestRoom());
    conn1 = new MockConnection("c1");
    conn2 = new MockConnection("c2");
    conn3 = new MockConnection("c3");
    engine.addConnection(conn1);
    engine.addConnection(conn2);
    engine.addConnection(conn3);
    const r1 = engine.login("c1", "Alice");
    const r2 = engine.login("c2", "Bob");
    const r3 = engine.login("c3", "Charlie");
    if ("entityId" in r1) e1 = r1.entityId;
    if ("entityId" in r2) e2 = r2.entityId;
    // Move Charlie to a different room
    if ("entityId" in r3) engine.processCommand(r3.entityId, "north");
    conn1.clear();
    conn2.clear();
    conn3.clear();
  });

  it("sends message to all players globally", () => {
    engine.processCommand(e1, "shout Hello world!");
    expect(conn1.lastText()).toContain("You shout: Hello world!");
    expect(conn2.lastText()).toContain("Alice shouts: Hello world!");
    // Charlie is in a different room but still receives the shout
    expect(conn3.lastText()).toContain("Alice shouts: Hello world!");
  });

  it("shows error with no message", () => {
    engine.processCommand(e1, "shout");
    expect(conn1.lastText()).toContain("Shout what?");
  });

  it("works with yell alias", () => {
    engine.processCommand(e1, "yell Fire!");
    expect(conn1.lastText()).toContain("You shout: Fire!");
    expect(conn2.lastText()).toContain("Alice shouts: Fire!");
  });

  it("does not echo back to the shouter via broadcast", () => {
    engine.processCommand(e1, "shout Testing");
    // Sender should only get "You shout:", not "Alice shouts:"
    const aliceTexts = conn1.allText();
    expect(aliceTexts.some((t) => t.includes("You shout:"))).toBe(true);
    expect(aliceTexts.some((t) => t.includes("Alice shouts:"))).toBe(false);
  });
});

// ─── Emote Command ───────────────────────────────────────────────────────────

describe("Emote Command", () => {
  let engine: Engine;
  let conn1: MockConnection;
  let conn2: MockConnection;

  beforeEach(() => {
    engine = new Engine({ startRoom: roomId("test/start"), tickInterval: 60_000 });
    engine.registerRoom(roomId("test/start"), makeTestRoom());
    conn1 = new MockConnection("c1");
    conn2 = new MockConnection("c2");
    engine.addConnection(conn1);
    engine.addConnection(conn2);
    engine.login("c1", "Alice");
    engine.login("c2", "Bob");
    conn1.clear();
    conn2.clear();
  });

  it("should broadcast emote to room", () => {
    engine.processCommand(conn1.entity!, "emote waves cheerfully");
    expect(conn1.lastText()).toContain("Alice waves cheerfully");
    expect(conn2.lastText()).toContain("Alice waves cheerfully");
  });

  it("should require emote text", () => {
    engine.processCommand(conn1.entity!, "emote");
    expect(conn1.lastText()).toContain("what");
  });

  it("should work with me alias", () => {
    engine.processCommand(conn1.entity!, "me dances");
    expect(conn1.lastText()).toContain("Alice dances");
  });
});

// ─── Score Command ───────────────────────────────────────────────────────────

describe("Score Command", () => {
  let engine: Engine;
  let conn: MockConnection;

  beforeEach(() => {
    engine = new Engine({ startRoom: roomId("test/start"), tickInterval: 60_000 });
    engine.registerRoom(roomId("test/start"), makeTestRoom({ short: "Starting Room" }));
    conn = new MockConnection("c1");
    engine.addConnection(conn);
    engine.login("c1", "Tester");
    conn.clear();
  });

  it("should show player score", () => {
    engine.processCommand(conn.entity!, "score");
    const text = conn.lastText();
    expect(text).toContain("Tester");
    expect(text).toContain("Guest");
  });

  it("should work with stats alias", () => {
    engine.processCommand(conn.entity!, "stats");
    expect(conn.lastText()).toContain("Tester");
  });
});

// ─── Talk Command ────────────────────────────────────────────────────────────

describe("Talk Command", () => {
  let engine: Engine;
  let conn: MockConnection;

  beforeEach(() => {
    engine = new Engine({ startRoom: roomId("test/start"), tickInterval: 60_000 });
    engine.registerRoom(roomId("test/start"), makeTestRoom());
    conn = new MockConnection("c1");
    engine.addConnection(conn);
    engine.login("c1", "Player");

    // Spawn NPCs via the engine
    engine.spawnNpc(roomId("test/start"), {
      name: "Merchant",
      short: "A merchant stands here.",
      long: "A portly merchant with a friendly smile.",
      properties: {
        dialogue: {
          greeting: "Welcome to my shop! How can I help you?",
          topics: {
            wares: "I sell data crystals, encryption keys, and signal boosters.",
            prices: "My prices are fair. Quality comes at a cost.",
          },
        },
      },
    });
    engine.spawnNpc(roomId("test/start"), {
      name: "Statue",
      short: "A stone statue.",
      long: "A statue with no voice.",
      properties: {},
    });

    conn.clear();
  });

  it("should show NPC greeting when no topic given", () => {
    engine.processCommand(conn.entity!, "talk merchant");
    const text = conn.lastText();
    expect(text).toContain("Welcome to my shop");
    expect(text).toContain("wares");
    expect(text).toContain("prices");
  });

  it("should respond to specific topic", () => {
    engine.processCommand(conn.entity!, "talk merchant about wares");
    expect(conn.lastText()).toContain("data crystals");
  });

  it("should fuzzy match topics", () => {
    engine.processCommand(conn.entity!, "talk merchant about war");
    expect(conn.lastText()).toContain("data crystals");
  });

  it("should handle unknown topic", () => {
    engine.processCommand(conn.entity!, "talk merchant about weather");
    expect(conn.lastText()).toContain("don't know much about that");
  });

  it("should handle NPC without dialogue", () => {
    engine.processCommand(conn.entity!, "talk statue");
    expect(conn.lastText()).toContain("doesn't seem interested");
  });

  it("should handle unknown NPC", () => {
    engine.processCommand(conn.entity!, "talk ghost");
    expect(conn.lastText()).toContain("don't see");
  });

  it("should require target", () => {
    engine.processCommand(conn.entity!, "talk");
    expect(conn.lastText()).toContain("Talk to whom");
  });

  it("should work with speak alias", () => {
    engine.processCommand(conn.entity!, "speak merchant");
    expect(conn.lastText()).toContain("Welcome to my shop");
  });
});

// ─── Item System (get/drop/give) ─────────────────────────────────────────────

describe("Item System", () => {
  let engine: Engine;
  let conn1: MockConnection;
  let conn2: MockConnection;
  let itemId: EntityId;

  beforeEach(() => {
    engine = new Engine({ startRoom: roomId("test/start"), tickInterval: 60_000 });
    engine.registerRoom(roomId("test/start"), makeTestRoom());
    conn1 = new MockConnection("c1");
    conn2 = new MockConnection("c2");
    engine.addConnection(conn1);
    engine.addConnection(conn2);
    engine.login("c1", "Alice");
    engine.login("c2", "Bob");

    // Spawn an object in the room
    const item = engine.entities.create({
      name: "Crystal Key",
      short: "A glowing crystal key lies here.",
      long: "A crystal key that pulses with inner light.",
      room: roomId("test/start"),
      kind: "object",
    });
    itemId = item.id;

    conn1.clear();
    conn2.clear();
  });

  it("should pick up items with get", () => {
    engine.processCommand(conn1.entity!, "get crystal");
    expect(conn1.lastText()).toContain("pick up Crystal Key");
    expect(conn2.lastText()).toContain("picks up Crystal Key");

    // Item should be in inventory
    const alice = engine.entities.get(conn1.entity!);
    expect(alice?.inventory).toContain(itemId);
  });

  it("should work with take alias", () => {
    engine.processCommand(conn1.entity!, "take crystal");
    expect(conn1.lastText()).toContain("pick up Crystal Key");
  });

  it("should drop items", () => {
    engine.processCommand(conn1.entity!, "get crystal");
    conn1.clear();
    conn2.clear();

    engine.processCommand(conn1.entity!, "drop crystal");
    expect(conn1.lastText()).toContain("drop Crystal Key");
    expect(conn2.lastText()).toContain("drops Crystal Key");

    const alice = engine.entities.get(conn1.entity!);
    expect(alice?.inventory).not.toContain(itemId);
  });

  it("should not pick up non-existent items", () => {
    engine.processCommand(conn1.entity!, "get sword");
    expect(conn1.lastText()).toContain("don't see that");
  });

  it("should not drop items you don't have", () => {
    engine.processCommand(conn1.entity!, "drop crystal");
    expect(conn1.lastText()).toContain("don't have that");
  });

  it("should give items to other players", () => {
    engine.processCommand(conn1.entity!, "get crystal");
    conn1.clear();
    conn2.clear();

    engine.processCommand(conn1.entity!, "give crystal to Bob");
    expect(conn1.lastText()).toContain("give Crystal Key to Bob");
    expect(conn2.allText().some((t) => t.includes("gives you Crystal Key"))).toBe(true);

    const alice = engine.entities.get(conn1.entity!);
    const bob = engine.entities.get(conn2.entity!);
    expect(alice?.inventory).not.toContain(itemId);
    expect(bob?.inventory).toContain(itemId);
  });

  it("should require give syntax", () => {
    engine.processCommand(conn1.entity!, "give crystal");
    expect(conn1.lastText()).toContain("Usage");
  });

  it("should require argument for get", () => {
    engine.processCommand(conn1.entity!, "get");
    expect(conn1.lastText()).toContain("Get what");
  });

  it("should require argument for drop", () => {
    engine.processCommand(conn1.entity!, "drop");
    expect(conn1.lastText()).toContain("Drop what");
  });
});

// ─── Map Command ─────────────────────────────────────────────────────────────

describe("Map Command", () => {
  let engine: Engine;
  let conn: MockConnection;

  beforeEach(() => {
    engine = new Engine({ startRoom: roomId("test/start"), tickInterval: 60_000 });
    engine.registerRoom(
      roomId("test/start"),
      makeTestRoom({
        short: "Center",
        exits: {
          north: roomId("test/north"),
          south: roomId("test/south"),
          east: roomId("test/east"),
        },
      }),
    );
    engine.registerRoom(roomId("test/north"), makeTestRoom({ short: "Northern Room" }));
    engine.registerRoom(roomId("test/south"), makeTestRoom({ short: "Southern Room" }));
    engine.registerRoom(roomId("test/east"), makeTestRoom({ short: "Eastern Room" }));
    conn = new MockConnection("c1");
    engine.addConnection(conn);
    engine.login("c1", "Player");
    conn.clear();
  });

  it("should show nearby rooms", () => {
    engine.processCommand(conn.entity!, "map");
    const text = conn.lastText();
    expect(text).toContain("Nearby Rooms");
    expect(text).toContain("Center");
    expect(text).toContain("Northern Room");
    expect(text).toContain("Southern Room");
    expect(text).toContain("Eastern Room");
  });

  it("should handle room with no exits", () => {
    engine.registerRoom(roomId("test/isolated"), makeTestRoom({ short: "Isolated" }));
    const entity = engine.entities.get(conn.entity!);
    if (entity) entity.room = roomId("test/isolated");
    conn.clear();

    engine.processCommand(conn.entity!, "map");
    expect(conn.lastText()).toContain("No exits");
  });
});

// ─── Explorer's Badge Quest ──────────────────────────────────────────────────

describe("Explorer's Badge Quest", () => {
  let db: ArtilectDB;
  let engine: Engine;
  let conn: MockConnection;
  const dbPath = `/tmp/artilect-explorer-test-${Date.now()}.db`;

  beforeEach(() => {
    db = new ArtilectDB(dbPath);
    engine = new Engine({
      startRoom: roomId("world/2-2"),
      tickInterval: 60_000,
      db,
      world: defaultWorld,
    });

    // Create a path from center to all four corners via edge rooms
    engine.registerRoom(
      roomId("world/2-2"),
      makeTestRoom({
        short: "Sector 2-2",
        exits: {
          north: roomId("world/1-2"),
          south: roomId("world/3-2"),
          east: roomId("world/2-3"),
          west: roomId("world/2-1"),
        },
      }),
    );
    // Path to NW corner (0-0)
    engine.registerRoom(
      roomId("world/1-2"),
      makeTestRoom({
        short: "Sector 1-2",
        exits: { north: roomId("world/0-2"), south: roomId("world/2-2") },
      }),
    );
    engine.registerRoom(
      roomId("world/0-2"),
      makeTestRoom({
        short: "Sector 0-2",
        exits: { west: roomId("world/0-0"), east: roomId("world/0-4"), south: roomId("world/1-2") },
      }),
    );
    engine.registerRoom(
      roomId("world/0-0"),
      makeTestRoom({ short: "Sector 0-0", exits: { east: roomId("world/0-2") } }),
    );
    // NE corner (0-4)
    engine.registerRoom(
      roomId("world/0-4"),
      makeTestRoom({ short: "Sector 0-4", exits: { west: roomId("world/0-2") } }),
    );
    // Path to SW corner (4-0)
    engine.registerRoom(
      roomId("world/3-2"),
      makeTestRoom({
        short: "Sector 3-2",
        exits: { south: roomId("world/4-2"), north: roomId("world/2-2") },
      }),
    );
    engine.registerRoom(
      roomId("world/4-2"),
      makeTestRoom({
        short: "Sector 4-2",
        exits: { west: roomId("world/4-0"), east: roomId("world/4-4"), north: roomId("world/3-2") },
      }),
    );
    engine.registerRoom(
      roomId("world/4-0"),
      makeTestRoom({ short: "Sector 4-0", exits: { east: roomId("world/4-2") } }),
    );
    // SE corner (4-4)
    engine.registerRoom(
      roomId("world/4-4"),
      makeTestRoom({ short: "Sector 4-4", exits: { west: roomId("world/4-2") } }),
    );
    // Extra rooms for path navigation
    engine.registerRoom(
      roomId("world/2-3"),
      makeTestRoom({ short: "Sector 2-3", exits: { west: roomId("world/2-2") } }),
    );
    engine.registerRoom(
      roomId("world/2-1"),
      makeTestRoom({ short: "Sector 2-1", exits: { east: roomId("world/2-2") } }),
    );

    conn = new MockConnection("c1");
    engine.addConnection(conn);
  });

  afterEach(() => {
    db.close();
    cleanupDb(dbPath);
  });

  it("should list explorer quest", () => {
    engine.login("c1", "Explorer");
    conn.clear();
    engine.processCommand(conn.entity!, "quest list");
    expect(conn.lastText()).toContain("Explorer's Badge");
  });

  it("should start and track corner visits", () => {
    engine.login("c1", "Explorer");
    const entity = engine.entities.get(conn.entity!)!;

    // Abandon tutorial first, then start explorer
    engine.processCommand(conn.entity!, "quest abandon");
    engine.processCommand(conn.entity!, "quest start Explorer's Badge");
    expect(entity.properties.active_quest).toBe("explorer");

    // Visit NW corner: center → 1-2 → 0-2 → 0-0
    engine.processCommand(conn.entity!, "north");
    engine.processCommand(conn.entity!, "north");
    engine.processCommand(conn.entity!, "west");
    // Visit NE corner: 0-0 → 0-2 → 0-4
    engine.processCommand(conn.entity!, "east");
    engine.processCommand(conn.entity!, "east");
    // Back to center via south: 0-4 → 0-2 → 1-2 → 2-2
    engine.processCommand(conn.entity!, "west");
    engine.processCommand(conn.entity!, "south");
    engine.processCommand(conn.entity!, "south");
    // Visit SW corner: 2-2 → 3-2 → 4-2 → 4-0
    engine.processCommand(conn.entity!, "south");
    engine.processCommand(conn.entity!, "south");
    engine.processCommand(conn.entity!, "west");
    // Visit SE corner: 4-0 → 4-2 → 4-4
    engine.processCommand(conn.entity!, "east");
    engine.processCommand(conn.entity!, "east");

    const visited = entity.properties.quest_sectors as string[];
    expect(visited).toContain("world/0-0");
    expect(visited).toContain("world/0-4");
    expect(visited).toContain("world/4-0");
    expect(visited).toContain("world/4-4");

    conn.clear();
    engine.processCommand(conn.entity!, "quest complete");
    expect(conn.lastText()).toContain("Quest completed");
    expect(conn.lastText()).toContain("Explorer's Badge");
  });

  it("should not complete with missing corners", () => {
    engine.login("c1", "Explorer");
    engine.processCommand(conn.entity!, "quest abandon");
    engine.processCommand(conn.entity!, "quest start Explorer's Badge");

    // Only visit one corner
    engine.processCommand(conn.entity!, "north"); // 1-2
    engine.processCommand(conn.entity!, "north"); // 0-2
    engine.processCommand(conn.entity!, "west"); // 0-0

    conn.clear();
    engine.processCommand(conn.entity!, "quest complete");
    expect(conn.lastText()).toContain("Not all steps");
  });
});

// ─── Perimeter Patrol Quest ─────────────────────────────────────────────────

describe("Perimeter Patrol Quest", () => {
  let db: ArtilectDB;
  let engine: Engine;
  let conn: MockConnection;
  const dbPath = `/tmp/artilect-perimeter-test-${Date.now()}.db`;

  beforeEach(() => {
    db = new ArtilectDB(dbPath);
    engine = new Engine({
      startRoom: roomId("world/2-2"),
      tickInterval: 60_000,
      db,
      world: defaultWorld,
    });

    // Center + paths to each edge
    engine.registerRoom(
      roomId("world/2-2"),
      makeTestRoom({
        short: "Sector 2-2",
        exits: {
          north: roomId("world/1-2"),
          south: roomId("world/3-2"),
          east: roomId("world/2-3"),
          west: roomId("world/2-1"),
        },
      }),
    );
    engine.registerRoom(
      roomId("world/1-2"),
      makeTestRoom({
        short: "Sector 1-2",
        exits: { north: roomId("world/0-2"), south: roomId("world/2-2") },
      }),
    );
    engine.registerRoom(
      roomId("world/0-2"),
      makeTestRoom({ short: "Sector 0-2", exits: { south: roomId("world/1-2") } }),
    );
    engine.registerRoom(
      roomId("world/3-2"),
      makeTestRoom({
        short: "Sector 3-2",
        exits: { south: roomId("world/4-2"), north: roomId("world/2-2") },
      }),
    );
    engine.registerRoom(
      roomId("world/4-2"),
      makeTestRoom({ short: "Sector 4-2", exits: { north: roomId("world/3-2") } }),
    );
    engine.registerRoom(
      roomId("world/2-1"),
      makeTestRoom({
        short: "Sector 2-1",
        exits: { west: roomId("world/2-0"), east: roomId("world/2-2") },
      }),
    );
    engine.registerRoom(
      roomId("world/2-0"),
      makeTestRoom({ short: "Sector 2-0", exits: { east: roomId("world/2-1") } }),
    );
    engine.registerRoom(
      roomId("world/2-3"),
      makeTestRoom({
        short: "Sector 2-3",
        exits: { east: roomId("world/2-4"), west: roomId("world/2-2") },
      }),
    );
    engine.registerRoom(
      roomId("world/2-4"),
      makeTestRoom({ short: "Sector 2-4", exits: { west: roomId("world/2-3") } }),
    );

    conn = new MockConnection("c1");
    engine.addConnection(conn);
  });

  afterEach(() => {
    db.close();
    cleanupDb(dbPath);
  });

  it("should track perimeter quest progress", () => {
    engine.login("c1", "Patrol");
    const entity = engine.entities.get(conn.entity!)!;

    engine.processCommand(conn.entity!, "quest abandon");
    engine.processCommand(conn.entity!, "quest start Perimeter Patrol");
    expect(entity.properties.active_quest).toBe("perimeter");

    // Visit north edge: center → 1-2 → 0-2
    engine.processCommand(conn.entity!, "north");
    engine.processCommand(conn.entity!, "north");
    // Back to center
    engine.processCommand(conn.entity!, "south");
    engine.processCommand(conn.entity!, "south");
    // Visit south edge: center → 3-2 → 4-2
    engine.processCommand(conn.entity!, "south");
    engine.processCommand(conn.entity!, "south");
    // Back to center
    engine.processCommand(conn.entity!, "north");
    engine.processCommand(conn.entity!, "north");
    // Visit west edge: center → 2-1 → 2-0
    engine.processCommand(conn.entity!, "west");
    engine.processCommand(conn.entity!, "west");
    // Back to center
    engine.processCommand(conn.entity!, "east");
    engine.processCommand(conn.entity!, "east");
    // Visit east edge: center → 2-3 → 2-4
    engine.processCommand(conn.entity!, "east");
    engine.processCommand(conn.entity!, "east");

    conn.clear();
    engine.processCommand(conn.entity!, "quest complete");
    expect(conn.lastText()).toContain("Quest completed");
    expect(conn.lastText()).toContain("Perimeter Patrol");
  });

  it("should show perimeter quest status with progress", () => {
    engine.login("c1", "Patrol");
    engine.processCommand(conn.entity!, "quest abandon");
    engine.processCommand(conn.entity!, "quest start Perimeter Patrol");

    conn.clear();
    engine.processCommand(conn.entity!, "quest status");
    const text = conn.lastText();
    expect(text).toContain("Perimeter Patrol");
    expect(text).toContain("north edge");
    expect(text).toContain("south edge");
    expect(text).toContain("west edge");
    expect(text).toContain("east edge");
  });
});

// ─── Who Command (enriched) ──────────────────────────────────────────────────

describe("Who Command (enriched)", () => {
  let engine: Engine;
  let conn1: MockConnection;
  let conn2: MockConnection;

  beforeEach(() => {
    engine = new Engine({ startRoom: roomId("test/start"), tickInterval: 60_000 });
    engine.registerRoom(roomId("test/start"), makeTestRoom({ short: "Hub" }));
    conn1 = new MockConnection("c1");
    conn2 = new MockConnection("c2");
    engine.addConnection(conn1);
    engine.addConnection(conn2);
    engine.login("c1", "Admin");
    engine.login("c2", "Player");

    // Set admin rank
    const admin = engine.entities.get(conn1.entity!);
    if (admin) admin.properties.rank = 4;

    conn1.clear();
  });

  it("should show all online players", () => {
    engine.processCommand(conn1.entity!, "who");
    const text = conn1.lastText();
    expect(text).toContain("Admin");
    expect(text).toContain("Player");
    expect(text).toContain("Online Entities");
  });

  it("should show rank names", () => {
    engine.processCommand(conn1.entity!, "who");
    const text = conn1.lastText();
    expect(text).toContain("Admin");
  });

  it("should show room location", () => {
    engine.processCommand(conn1.entity!, "who");
    const text = conn1.lastText();
    expect(text).toContain("Hub");
  });
});

// ─── Help Command (categorized) ──────────────────────────────────────────────

describe("Help Command (categorized)", () => {
  let engine: Engine;
  let conn: MockConnection;

  beforeEach(() => {
    engine = new Engine({ startRoom: roomId("test/start"), tickInterval: 60_000 });
    engine.registerRoom(roomId("test/start"), makeTestRoom());
    conn = new MockConnection("c1");
    engine.addConnection(conn);
    engine.login("c1", "Player");
    conn.clear();
  });

  it("should group commands by category", () => {
    engine.processCommand(conn.entity!, "help");
    const text = conn.lastText();
    expect(text).toContain("Movement");
    expect(text).toContain("Communication");
    expect(text).toContain("Items");
    expect(text).toContain("Information");
  });

  it("should show category in help detail", () => {
    engine.processCommand(conn.entity!, "help say");
    const text = conn.lastText();
    expect(text).toContain("say");
    expect(text).toContain("Category: Communication");
  });

  it("should show aliases in muted color", () => {
    engine.processCommand(conn.entity!, "help look");
    const text = conn.lastText();
    expect(text).toContain("aliases:");
  });

  it("should work with ? alias", () => {
    engine.processCommand(conn.entity!, "?");
    const text = conn.lastText();
    expect(text).toContain("Available Commands");
  });
});

// ─── Time Command ───────────────────────────────────────────────────────────

describe("Time Command", () => {
  let engine: Engine;
  let conn: MockConnection;

  beforeEach(() => {
    engine = new Engine({ startRoom: roomId("test/start"), tickInterval: 60_000 });
    engine.registerRoom(roomId("test/start"), makeTestRoom());
    conn = new MockConnection("c1");
    engine.addConnection(conn);
    engine.login("c1", "Player");
    conn.clear();
  });

  it("should show server time", () => {
    engine.processCommand(conn.entity!, "time");
    const text = conn.lastText();
    expect(text).toContain("Server Time");
    // Should contain a GMT/UTC reference
    expect(text).toContain("GMT");
  });

  it("should work with date alias", () => {
    engine.processCommand(conn.entity!, "date");
    expect(conn.lastText()).toContain("Server Time");
  });
});

// ─── Uptime Command ─────────────────────────────────────────────────────────

describe("Uptime Command", () => {
  let engine: Engine;
  let conn: MockConnection;

  beforeEach(() => {
    engine = new Engine({ startRoom: roomId("test/start"), tickInterval: 60_000 });
    engine.registerRoom(roomId("test/start"), makeTestRoom());
    conn = new MockConnection("c1");
    engine.addConnection(conn);
    engine.login("c1", "Player");
    conn.clear();
  });

  it("should show server uptime", () => {
    engine.processCommand(conn.entity!, "uptime");
    const text = conn.lastText();
    expect(text).toContain("Server Uptime");
    expect(text).toContain("s");
  });
});

// ─── Macro Cycle Detection ──────────────────────────────────────────────────

describe("Macro Cycle Detection", () => {
  let db: ArtilectDB;
  let engine: Engine;
  let conn: MockConnection;
  const dbPath = `/tmp/artilect-macro-cycle-${Date.now()}.db`;

  beforeEach(() => {
    db = new ArtilectDB(dbPath);
    engine = new Engine({ startRoom: roomId("test/start"), tickInterval: 60_000, db });
    engine.registerRoom(roomId("test/start"), makeTestRoom());
    conn = new MockConnection("c1");
    engine.addConnection(conn);
    engine.login("c1", "Tester");
    conn.clear();
  });

  afterEach(() => {
    db.close();
    cleanupDb(dbPath);
  });

  it("should create and run a macro by name", () => {
    engine.processCommand(conn.entity!, "macro create greet say hello");
    conn.clear();
    engine.processCommand(conn.entity!, "macro greet");
    const allTexts = conn.allText();
    expect(allTexts.some((t) => t.includes("hello"))).toBe(true);
  });
});

// ─── Cross-District Room Connections ─────────────────────────────────────────

import room_0_0 from "../worlds/default/world/0-0";
import room_0_2 from "../worlds/default/world/0-2";
import room_2_0 from "../worlds/default/world/2-0";
import room_2_2 from "../worlds/default/world/2-2";
import room_4_4 from "../worlds/default/world/4-4";

describe("5x5 Grid World Connections", () => {
  it("center room 2-2 should have all four exits", () => {
    expect(room_2_2.exits?.north as string).toBe("world/1-2");
    expect(room_2_2.exits?.south as string).toBe("world/3-2");
    expect(room_2_2.exits?.east as string).toBe("world/2-3");
    expect(room_2_2.exits?.west as string).toBe("world/2-1");
  });

  it("corner room 0-0 should only have south and east exits", () => {
    expect(room_0_0.exits?.south as string).toBe("world/1-0");
    expect(room_0_0.exits?.east as string).toBe("world/0-1");
    expect(room_0_0.exits?.north).toBeUndefined();
    expect(room_0_0.exits?.west).toBeUndefined();
  });

  it("corner room 4-4 should only have north and west exits", () => {
    expect(room_4_4.exits?.north as string).toBe("world/3-4");
    expect(room_4_4.exits?.west as string).toBe("world/4-3");
    expect(room_4_4.exits?.south).toBeUndefined();
    expect(room_4_4.exits?.east).toBeUndefined();
  });

  it("edge room 0-2 should omit north exit", () => {
    expect(room_0_2.exits?.south as string).toBe("world/1-2");
    expect(room_0_2.exits?.east as string).toBe("world/0-3");
    expect(room_0_2.exits?.west as string).toBe("world/0-1");
    expect(room_0_2.exits?.north).toBeUndefined();
  });

  it("edge room 2-0 should omit west exit", () => {
    expect(room_2_0.exits?.north as string).toBe("world/1-0");
    expect(room_2_0.exits?.south as string).toBe("world/3-0");
    expect(room_2_0.exits?.east as string).toBe("world/2-1");
    expect(room_2_0.exits?.west).toBeUndefined();
  });
});
