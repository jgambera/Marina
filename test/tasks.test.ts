import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Engine } from "../src/engine/engine";
import { ArtilectDB } from "../src/persistence/database";
import { roomId } from "../src/types";
import { MockConnection, cleanupDb, makeTestRoom } from "./helpers";

const TEST_DB = "test_tasks.db";

describe("Tasks", () => {
  let db: ArtilectDB;
  let engine: Engine;
  let conn1: MockConnection;
  let conn2: MockConnection;

  beforeEach(() => {
    db = new ArtilectDB(TEST_DB);
    engine = new Engine({ startRoom: roomId("test/start"), tickInterval: 60_000, db });
    engine.registerRoom(roomId("test/start"), makeTestRoom({ short: "Start" }));

    conn1 = new MockConnection("c1");
    conn2 = new MockConnection("c2");
    engine.addConnection(conn1);
    engine.addConnection(conn2);
    engine.spawnEntity("c1", "Alice");
    engine.spawnEntity("c2", "Bob");
    conn1.clear();
    conn2.clear();
  });

  afterEach(() => {
    db.close();
    cleanupDb(TEST_DB);
  });

  it("should create a task", () => {
    engine.processCommand(conn1.entity!, "task create Fix the bug | The login page is broken");
    expect(conn1.lastText()).toContain("Created task #");
    expect(conn1.lastText()).toContain("Fix the bug");
  });

  it("should list tasks", () => {
    engine.processCommand(conn1.entity!, "task create Task One | Desc one");
    engine.processCommand(conn1.entity!, "task create Task Two | Desc two");
    conn1.clear();
    engine.processCommand(conn1.entity!, "task list");
    const text = conn1.lastText();
    expect(text).toContain("Task One");
    expect(text).toContain("Task Two");
  });

  it("should show task info", () => {
    engine.processCommand(conn1.entity!, "task create Detailed Task | This has details");
    conn1.clear();
    engine.processCommand(conn1.entity!, "task info 1");
    const text = conn1.lastText();
    expect(text).toContain("Detailed Task");
    expect(text).toContain("This has details");
    expect(text).toContain("Alice");
  });

  it("should claim a task", () => {
    engine.processCommand(conn1.entity!, "task create Fix it | Fix the thing");
    conn2.clear();
    engine.processCommand(conn2.entity!, "task claim 1");
    expect(conn2.lastText()).toContain("Claimed task #1");
  });

  it("should submit work for a task", () => {
    engine.processCommand(conn1.entity!, "task create Fix it | Fix the thing");
    engine.processCommand(conn2.entity!, "task claim 1");
    conn2.clear();
    engine.processCommand(conn2.entity!, "task submit 1 I fixed the thing");
    expect(conn2.lastText()).toContain("Submitted work for task #1");
  });

  it("should approve a submission", () => {
    engine.processCommand(conn1.entity!, "task create Fix it | Fix the thing");
    engine.processCommand(conn2.entity!, "task claim 1");
    engine.processCommand(conn2.entity!, "task submit 1 Done");
    conn1.clear();
    conn2.clear();
    engine.processCommand(conn1.entity!, "task approve 1 Bob");
    expect(conn1.lastText()).toContain("Approved Bob's submission");
    expect(conn2.lastText()).toContain("approved");
  });

  it("should reject a submission", () => {
    engine.processCommand(conn1.entity!, "task create Fix it | Fix the thing");
    engine.processCommand(conn2.entity!, "task claim 1");
    engine.processCommand(conn2.entity!, "task submit 1 Bad fix");
    conn1.clear();
    conn2.clear();
    engine.processCommand(conn1.entity!, "task reject 1 Bob");
    expect(conn1.lastText()).toContain("Rejected Bob's submission");
    expect(conn2.lastText()).toContain("rejected");
  });

  it("should cancel a task", () => {
    engine.processCommand(conn1.entity!, "task create Cancel me | To be cancelled");
    conn1.clear();
    engine.processCommand(conn1.entity!, "task cancel 1");
    expect(conn1.lastText()).toContain("Cancelled task #1");
  });

  it("should prevent non-creator from cancelling", () => {
    engine.processCommand(conn1.entity!, "task create No cancel | Not yours");
    conn2.clear();
    engine.processCommand(conn2.entity!, "task cancel 1");
    expect(conn2.lastText()).toContain("Cannot cancel");
  });

  it("should prevent double claiming", () => {
    engine.processCommand(conn1.entity!, "task create Unique | Only one claim");
    engine.processCommand(conn2.entity!, "task claim 1");
    conn2.clear();
    engine.processCommand(conn2.entity!, "task claim 1");
    expect(conn2.lastText()).toContain("Cannot claim");
  });

  it("task manager should work directly", () => {
    const tm = engine.taskManager!;
    const task = tm.create({
      title: "Direct Task",
      description: "Created directly",
      creatorId: conn1.entity!,
      creatorName: "Alice",
    });
    expect(task.title).toBe("Direct Task");
    expect(task.status).toBe("open");

    const claim = tm.claim(task.id, conn2.entity!, "Bob");
    expect(claim).not.toBeNull();
    expect(claim!.status).toBe("claimed");

    expect(tm.submit(task.id, conn2.entity!, "My work")).toBe(true);
    expect(tm.approveSubmission(task.id, conn2.entity!, conn1.entity!)).toBe(true);

    const completed = tm.get(task.id);
    expect(completed!.status).toBe("completed");
  });

  it("should show claims in task info", () => {
    engine.processCommand(conn1.entity!, "task create Viewable | View claims");
    engine.processCommand(conn2.entity!, "task claim 1");
    engine.processCommand(conn2.entity!, "task submit 1 My submission text");
    conn1.clear();
    engine.processCommand(conn1.entity!, "task info 1");
    const text = conn1.lastText();
    expect(text).toContain("Claims:");
    expect(text).toContain("Bob");
    expect(text).toContain("My submission text");
  });
});
