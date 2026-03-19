import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Engine } from "../src/engine/engine";
import { WebSocketServer } from "../src/net/websocket-server";
import { MarinaDB } from "../src/persistence/database";
import { MarinaAgent, MarinaClient } from "../src/sdk/client";
import { roomId } from "../src/types";
import { cleanupDb, makeTestRoom } from "./helpers";

const TEST_PORT = 13399;
const TEST_URL = `ws://localhost:${TEST_PORT}`;

describe("MarinaClient SDK", () => {
  let db: MarinaDB;
  let engine: Engine;
  let wsServer: WebSocketServer;
  const dbPath = `/tmp/marina-sdk-test-${Date.now()}.db`;

  beforeEach(() => {
    db = new MarinaDB(dbPath);
    engine = new Engine({ startRoom: roomId("test/start"), tickInterval: 60_000, db });
    engine.registerRoom(
      roomId("test/start"),
      makeTestRoom({
        short: "Starting Room",
        long: "A room for SDK testing.",
        exits: { north: roomId("test/north") },
        items: { console: "A glowing console." },
      }),
    );
    engine.registerRoom(
      roomId("test/north"),
      makeTestRoom({
        short: "North Room",
        long: "North of start.",
        exits: { south: roomId("test/start") },
      }),
    );
    wsServer = new WebSocketServer(engine, TEST_PORT);
    wsServer.start();
    engine.start();
  });

  afterEach(async () => {
    wsServer.stop();
    await Bun.sleep(50); // Let WS close events drain
    engine.stop();
    db.close();
    cleanupDb(dbPath);
  });

  it("should connect and login", async () => {
    const client = new MarinaClient(TEST_URL, { autoReconnect: false });
    const session = await client.connect("SDKUser");
    expect(session.entityId).toBeTruthy();
    expect(session.name).toBe("SDKUser");
    expect(session.token).toBeTruthy();
    client.disconnect();
  });

  it("should send commands and receive perceptions", async () => {
    const client = new MarinaClient(TEST_URL, { autoReconnect: false });
    await client.connect("CmdUser");

    const perceptions = await client.command("look");
    expect(perceptions.length).toBeGreaterThan(0);

    // At least one perception should contain room info
    const hasRoom = perceptions.some(
      (p) => p.kind === "room" || (p.data?.text as string)?.includes("Starting Room"),
    );
    expect(hasRoom).toBe(true);

    client.disconnect();
  });

  it("should receive perceptions via handler", async () => {
    const client = new MarinaClient(TEST_URL, { autoReconnect: false });
    await client.connect("HandlerUser");

    const received: string[] = [];
    client.onPerception((p) => {
      if (p.data?.text) received.push(p.data.text as string);
    });

    await client.command("say hello from SDK");
    await Bun.sleep(100);

    expect(received.some((t) => t.includes("hello from SDK"))).toBe(true);
    client.disconnect();
  });

  it("should reject invalid login", async () => {
    const client = new MarinaClient(TEST_URL, { autoReconnect: false });
    try {
      await client.connect("a"); // too short
      expect(true).toBe(false); // should not reach here
    } catch (err) {
      expect((err as Error).message).toBeTruthy();
    }
    client.disconnect();
  });
});

describe("MarinaAgent SDK", () => {
  let db: MarinaDB;
  let engine: Engine;
  let wsServer: WebSocketServer;
  const dbPath = `/tmp/marina-agent-sdk-test-${Date.now()}.db`;

  beforeEach(() => {
    db = new MarinaDB(dbPath);
    engine = new Engine({ startRoom: roomId("test/start"), tickInterval: 60_000, db });
    engine.registerRoom(
      roomId("test/start"),
      makeTestRoom({
        short: "Starting Room",
        long: "A room for agent testing.",
        exits: { north: roomId("test/north") },
      }),
    );
    engine.registerRoom(
      roomId("test/north"),
      makeTestRoom({
        short: "North Room",
        long: "North of start.",
        exits: { south: roomId("test/start") },
      }),
    );
    wsServer = new WebSocketServer(engine, TEST_PORT);
    wsServer.start();
    engine.start();
  });

  afterEach(() => {
    engine.stop();
    wsServer.stop();
    db.close();
    cleanupDb(dbPath);
  });

  it("should look and get room view", async () => {
    const agent = new MarinaAgent(TEST_URL, { autoReconnect: false });
    await agent.connect("LookAgent");

    const view = await agent.look();
    if ("short" in view) {
      expect(view.short).toBe("Starting Room");
      expect(view.exits).toContain("north");
    }
    agent.disconnect();
  });

  it("should move between rooms", async () => {
    const agent = new MarinaAgent(TEST_URL, { autoReconnect: false });
    await agent.connect("MoveAgent");

    await agent.move("north");
    // After moving, look should show the north room
    const view = await agent.look();
    if ("short" in view) {
      expect(view.short).toBe("North Room");
    }
    agent.disconnect();
  });

  it("should say and get confirmation", async () => {
    const agent = new MarinaAgent(TEST_URL, { autoReconnect: false });
    await agent.connect("SayAgent");

    const received: string[] = [];
    agent.onPerception((p) => {
      if (p.data?.text) received.push(p.data.text as string);
    });

    await agent.say("hello world");
    await Bun.sleep(100);
    expect(received.some((t) => t.includes("hello world"))).toBe(true);
    agent.disconnect();
  });
});
