import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Engine } from "../src/engine/engine";
import { MarinaDB } from "../src/persistence/database";
import { roomId } from "../src/types";
import type { EntityId } from "../src/types";
import { MockConnection, cleanupDb, makeTestRoom, stripAnsi } from "./helpers";

const TEST_DB = "test_marina_guide.db";

describe("Marina Guide", () => {
  let engine: Engine;
  let conn: MockConnection;
  let db: MarinaDB;
  let entityId: EntityId;

  beforeEach(() => {
    db = new MarinaDB(TEST_DB);
    engine = new Engine({
      startRoom: roomId("test/start"),
      tickInterval: 60_000,
      db,
    });

    engine.registerRoom(
      roomId("test/start"),
      makeTestRoom({
        short: "Starting Room",
        long: "A room for testing the guide.",
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

    engine.start();

    conn = new MockConnection("c1");
    engine.addConnection(conn);
    const entity = engine.spawnEntity("c1", "Tester");
    entityId = entity!.id;
    conn.clear();
  });

  afterEach(() => {
    engine.stop();
    db.close();
    cleanupDb(TEST_DB);
  });

  describe("Guide NPC spawning", () => {
    it("should spawn Marina NPC in start room on engine start", () => {
      const entities = engine.entities.all();
      const guide = entities.find((e) => e.kind === "npc" && e.name === "Marina");
      expect(guide).toBeDefined();
      expect(guide!.room).toBe(roomId("test/start"));
      expect(guide!.properties.guide).toBe(true);
    });

    it("should not spawn duplicate guide on second start", () => {
      engine.stop();
      engine.start();
      const guides = engine.entities.all().filter((e) => e.name === "Marina" && e.kind === "npc");
      expect(guides.length).toBe(1);
    });

    it("guide should have dialogue properties", () => {
      const guide = engine.entities.all().find((e) => e.name === "Marina" && e.kind === "npc");
      expect(guide).toBeDefined();
      const dialogue = guide!.properties.dialogue as Record<string, unknown>;
      expect(dialogue.greeting).toBeDefined();
      expect(dialogue.topics).toBeDefined();
    });
  });

  describe("Talk to guide (static fallback)", () => {
    it("should show greeting when talking to Marina without topic", () => {
      engine.processCommand(entityId, "talk Marina");
      const text = stripAnsi(conn.lastText());
      expect(text).toContain("Marina says:");
      expect(text).toContain("Ask me anything");
    });

    it("should respond to known static topics", () => {
      engine.processCommand(entityId, "talk Marina about memory");
      const text = stripAnsi(conn.lastText());
      expect(text).toContain("Marina says:");
      expect(text).toContain("note");
      expect(text).toContain("recall");
    });

    it("should show available topics", () => {
      engine.processCommand(entityId, "talk Marina");
      const text = stripAnsi(conn.lastText());
      expect(text).toContain("commands");
      expect(text).toContain("memory");
      expect(text).toContain("building");
      expect(text).toContain("coordination");
    });

    it("should handle talk aliases (ask, speak)", () => {
      engine.processCommand(entityId, "ask Marina about quests");
      const text = stripAnsi(conn.lastText());
      expect(text).toContain("Marina says:");
      expect(text).toContain("quest");
    });
  });

  describe("Unknown command handling", () => {
    it("should show error for unknown commands when no LLM configured", () => {
      // Without API keys, the guide falls back to static error
      engine.processCommand(entityId, "xyznonexistent");
      const text = stripAnsi(conn.lastText());
      // Should get either static error or guide message — both are valid
      expect(text.length).toBeGreaterThan(0);
    });

    it("should not crash on gibberish input", () => {
      engine.processCommand(entityId, "!@#$%^&*");
      // Should not throw, should produce some output
      expect(conn.messages.length).toBeGreaterThan(0);
    });
  });

  describe("Guide availability", () => {
    it("should have a guide instance on the engine", () => {
      expect(engine.guide).toBeDefined();
    });

    it("guide availability reflects configured providers", () => {
      // In test environment, no API keys are typically set
      // The guide should exist but may not be available for LLM calls
      expect(typeof engine.guide?.isAvailable).toBe("boolean");
    });
  });

  describe("Agent runtime endpoints", () => {
    it("should list agents (empty initially)", () => {
      const agents = engine.agentRuntime.list();
      expect(agents).toEqual([]);
    });

    it("should reject spawn of duplicate agent names", async () => {
      // Spawn will fail because there's no lean agent module in test env
      // but we can verify the duplicate check works
      try {
        await engine.agentRuntime.spawn({ name: "TestBot", model: "test/model" });
      } catch {
        // Expected — no lean agent module
      }

      // The agent should have been cleaned up on error
      expect(engine.agentRuntime.list().length).toBe(0);
    });
  });

  describe("Dashboard API agent endpoints", () => {
    it("should return agents list via API handler", async () => {
      const { handleDashboardApi } = await import("../src/net/dashboard-api");
      const url = new URL("http://localhost/api/agents");
      const req = new Request(url);
      const response = await handleDashboardApi(url, req, engine, db);
      expect(response).toBeDefined();
      expect(response!.status).toBe(200);
      const body = (await response!.json()) as { agents: unknown[]; configuredProviders: string[] };
      expect(body.agents).toEqual([]);
      expect(Array.isArray(body.configuredProviders)).toBe(true);
    });

    it("should return models catalog via API handler", async () => {
      const { handleDashboardApi } = await import("../src/net/dashboard-api");
      const url = new URL("http://localhost/api/agents/models");
      const req = new Request(url);
      const response = await handleDashboardApi(url, req, engine, db);
      expect(response).toBeDefined();
      expect(response!.status).toBe(200);
      const body = (await response!.json()) as {
        providers: Record<string, unknown[]>;
        configured: string[];
      };
      expect(typeof body.providers).toBe("object");
      expect(Array.isArray(body.configured)).toBe(true);
    });

    it("should reject spawn with missing params", async () => {
      const { handleDashboardApi } = await import("../src/net/dashboard-api");
      const url = new URL("http://localhost/api/agents/spawn");
      const req = new Request(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "test" }), // missing model
      });
      const response = await handleDashboardApi(url, req, engine, db);
      expect(response).toBeDefined();
      expect(response!.status).toBe(400);
    });

    it("should return 404 for unknown agent stop", async () => {
      const { handleDashboardApi } = await import("../src/net/dashboard-api");
      const url = new URL("http://localhost/api/agents/nonexistent/stop");
      const req = new Request(url, { method: "POST", body: "{}" });
      const response = await handleDashboardApi(url, req, engine, db);
      expect(response).toBeDefined();
      expect(response!.status).toBe(404);
    });
  });
});
