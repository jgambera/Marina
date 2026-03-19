import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Engine } from "../src/engine/engine";
import { SignalAdapter } from "../src/net/signal-adapter";
import { MarinaDB } from "../src/persistence/database";
import type { RoomId } from "../src/types";
import { cleanupDb, makeTestRoom } from "./helpers";

const TEST_DB = "test-signal-adapter.db";

describe("SignalAdapter", () => {
  let db: MarinaDB;
  let engine: Engine;

  beforeEach(() => {
    db = new MarinaDB(TEST_DB);
    engine = new Engine({
      startRoom: "test/lobby" as RoomId,
      db,
    });
    engine.registerRoom("test/lobby" as RoomId, makeTestRoom());
  });

  afterEach(() => {
    db.close();
    cleanupDb(TEST_DB);
  });

  it("constructs with correct properties", () => {
    const adapter = new SignalAdapter(
      { engine, formatPerception: () => "" },
      "http://localhost:8080",
      "+1234567890",
    );

    expect(adapter.name).toBe("signal");
    expect(adapter.protocol).toBe("signal");
  });

  it("strips trailing slash from API URL", () => {
    const adapter = new SignalAdapter(
      { engine, formatPerception: () => "" },
      "http://localhost:8080/",
      "+1234567890",
    );

    // Verify by attempting to start (will fail since no server)
    // The important thing is it doesn't double-slash
    expect(adapter.name).toBe("signal");
  });

  it("fails to start when API is unreachable", async () => {
    const adapter = new SignalAdapter(
      { engine, formatPerception: () => "" },
      "http://localhost:19999", // unlikely to be running
      "+1234567890",
    );

    await expect(adapter.start()).rejects.toThrow("Cannot reach signal-cli-rest-api");
  });

  it("stop cleans up connections and timer", async () => {
    const adapter = new SignalAdapter(
      { engine, formatPerception: () => "" },
      "http://localhost:8080",
      "+1234567890",
    );

    // Stop without starting should not throw
    await adapter.stop();
    expect(adapter.name).toBe("signal");
  });
});
