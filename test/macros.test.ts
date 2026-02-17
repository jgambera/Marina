import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Engine } from "../src/engine/engine";
import { ArtilectDB } from "../src/persistence/database";
import { roomId } from "../src/types";
import { MockConnection, cleanupDb, makeTestRoom, stripAnsi } from "./helpers";

const TEST_DB = "test_macros.db";

describe("Macros", () => {
  let db: ArtilectDB;
  let engine: Engine;
  let conn1: MockConnection;

  beforeEach(() => {
    db = new ArtilectDB(TEST_DB);
    engine = new Engine({ startRoom: roomId("test/start"), tickInterval: 60_000, db });
    engine.registerRoom(
      roomId("test/start"),
      makeTestRoom({
        short: "Starting Room",
        long: "You are in the starting room.",
        exits: { north: roomId("test/north") },
      }),
    );
    engine.registerRoom(
      roomId("test/north"),
      makeTestRoom({
        short: "Northern Room",
        long: "A room to the north.",
        exits: { south: roomId("test/start") },
      }),
    );

    conn1 = new MockConnection("c1");
    engine.addConnection(conn1);
    engine.spawnEntity("c1", "Alice");
    conn1.clear();
  });

  afterEach(() => {
    db.close();
    cleanupDb(TEST_DB);
  });

  it("should create a macro", () => {
    engine.processCommand(conn1.entity!, "macro create patrol look");
    expect(conn1.lastText()).toContain('Created macro "patrol"');
  });

  it("should list macros", () => {
    engine.processCommand(conn1.entity!, "macro create patrol look");
    conn1.clear();
    engine.processCommand(conn1.entity!, "macro list");
    const text = conn1.lastText();
    expect(text).toContain("patrol");
    expect(text).toContain("look");
  });

  it("should run a macro by name", () => {
    engine.processCommand(conn1.entity!, "macro create greet say Hello everyone!");
    conn1.clear();
    engine.processCommand(conn1.entity!, "macro greet");
    const texts = conn1.allText();
    expect(texts.some((t) => stripAnsi(t).includes("You say: Hello everyone!"))).toBe(true);
  });

  it("should delete a macro", () => {
    engine.processCommand(conn1.entity!, "macro create deleteme say bye");
    conn1.clear();
    engine.processCommand(conn1.entity!, "macro delete deleteme");
    expect(conn1.lastText()).toContain('Deleted macro "deleteme"');

    conn1.clear();
    engine.processCommand(conn1.entity!, "macro deleteme");
    expect(conn1.lastText()).toContain("Usage:");
  });

  it("should prevent duplicate macro names per author", () => {
    engine.processCommand(conn1.entity!, "macro create dup say one");
    conn1.clear();
    engine.processCommand(conn1.entity!, "macro create dup say two");
    expect(conn1.lastText()).toContain("already exists");
  });

  it("should show empty list message", () => {
    engine.processCommand(conn1.entity!, "macro list");
    expect(conn1.lastText()).toContain("You have no macros");
  });

  it("macro manager should create and run macros", () => {
    const mm = engine.macroManager!;
    const macro = mm.create("test", conn1.entity!, "say hi");
    expect(macro.name).toBe("test");
    expect(macro.command).toBe("say hi");

    conn1.clear();
    mm.run(macro, conn1.entity!);
    const texts = conn1.allText();
    expect(texts.some((t) => stripAnsi(t).includes("You say: hi"))).toBe(true);
  });

  it("macro manager should list and delete", () => {
    const mm = engine.macroManager!;
    mm.create("a", conn1.entity!, "say a");
    mm.create("b", conn1.entity!, "say b");
    expect(mm.list(conn1.entity!).length).toBe(2);

    const macro = mm.getByName("a", conn1.entity!)!;
    mm.delete(macro.id, conn1.entity!);
    expect(mm.list(conn1.entity!).length).toBe(1);
  });
});
