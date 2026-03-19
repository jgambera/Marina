import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { AdapterRegistry, maskToken } from "../src/engine/adapter-registry";
import { Engine } from "../src/engine/engine";
import { MarinaDB } from "../src/persistence/database";
import type { RoomId } from "../src/types";
import { cleanupDb, makeTestRoom } from "./helpers";

const TEST_DB = "test-adapter-registry.db";

describe("AdapterRegistry", () => {
  let db: MarinaDB;
  let engine: Engine;
  let registry: AdapterRegistry;

  beforeEach(() => {
    db = new MarinaDB(TEST_DB);
    engine = new Engine({
      startRoom: "test/lobby" as RoomId,
      db,
    });
    engine.registerRoom("test/lobby" as RoomId, makeTestRoom());
    registry = engine.adapterRegistry;
  });

  afterEach(() => {
    db.close();
    cleanupDb(TEST_DB);
  });

  it("creates and lists adapters", () => {
    const managed = registry.create({
      type: "telegram",
      token: "123456:ABC-DEF",
    });

    expect(managed.id).toBeTruthy();
    expect(managed.type).toBe("telegram");
    expect(managed.status).toBe("stopped");

    const list = registry.list();
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe(managed.id);
  });

  it("persists to DB and loads back", async () => {
    registry.create({
      type: "discord",
      token: "test-token-12345",
      autoStart: false,
    });

    // Create a fresh registry and load from DB
    const registry2 = new AdapterRegistry({ db });
    registry2.setEngine(engine);
    await registry2.loadFromDB();

    const list = registry2.list();
    expect(list).toHaveLength(1);
    expect(list[0]!.type).toBe("discord");
  });

  it("removes an adapter and deletes from DB", async () => {
    const managed = registry.create({
      type: "telegram",
      token: "test-token",
    });

    const removed = await registry.remove(managed.id);
    expect(removed).toBe(true);
    expect(registry.list()).toHaveLength(0);

    // Verify DB deletion
    const row = db.getPlatformAdapter(managed.id);
    expect(row).toBeUndefined();
  });

  it("returns false when removing nonexistent adapter", async () => {
    const removed = await registry.remove("nonexistent");
    expect(removed).toBe(false);
  });

  it("returns false when stopping nonexistent adapter", async () => {
    const stopped = await registry.stop("nonexistent");
    expect(stopped).toBe(false);
  });

  it("throws when starting nonexistent adapter", async () => {
    await expect(registry.start("nonexistent")).rejects.toThrow("Adapter not found");
  });

  it("throws when starting an adapter with unknown type", async () => {
    // Create directly in DB with bad type
    const id = crypto.randomUUID();
    db.createPlatformAdapter({ id, type: "nonexistent", token: "tok" });
    // Load into registry
    const registry2 = new AdapterRegistry({ db });
    registry2.setEngine(engine);
    await registry2.loadFromDB();

    await expect(registry2.start(id)).rejects.toThrow("Unknown adapter type");
  });

  it("findByTypeAndToken locates matching adapter", () => {
    registry.create({ type: "telegram", token: "my-token-1234" });
    registry.create({ type: "discord", token: "other-token" });

    const found = registry.findByTypeAndToken("telegram", "my-token-1234");
    expect(found).toBeTruthy();
    expect(found!.type).toBe("telegram");

    const notFound = registry.findByTypeAndToken("telegram", "wrong-token");
    expect(notFound).toBeUndefined();
  });

  it("shutdown stops running adapters gracefully", async () => {
    registry.create({ type: "telegram", token: "tok" });
    // Just verify shutdown doesn't throw when nothing is running
    await registry.shutdown();
    expect(registry.list()).toHaveLength(1);
    expect(registry.list()[0]!.status).toBe("stopped");
  });
});

describe("maskToken", () => {
  it("masks tokens showing last 4 chars", () => {
    expect(maskToken("abcdefgh")).toBe("····efgh");
    expect(maskToken("123456:ABC-DEF")).toBe("····-DEF");
  });

  it("fully masks short tokens", () => {
    expect(maskToken("abc")).toBe("····");
    expect(maskToken("")).toBe("····");
  });
});
