import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { Adapter, Medium } from "../src/net/adapter";
import { formatPerception } from "../src/net/formatter";
import { ArtilectDB } from "../src/persistence/database";
import type { Perception, RoomId } from "../src/types";
import { cleanupDb } from "./helpers";

describe("Adapter Interface", () => {
  it("should define correct adapter shape", () => {
    const adapter: Adapter = {
      name: "test",
      protocol: "test",
      start: () => {},
      stop: () => {},
    };
    expect(adapter.name).toBe("test");
    expect(adapter.protocol).toBe("test");
  });
});

describe("Adapter Link DB", () => {
  let db: ArtilectDB;
  const dbPath = `/tmp/artilect-adapter-db-test-${Date.now()}.db`;

  beforeEach(() => {
    db = new ArtilectDB(dbPath);
  });

  afterEach(() => {
    db.close();
    cleanupDb(dbPath);
  });

  it("should link telegram chat to user", () => {
    db.linkAdapter("telegram", "12345", "u_1");
    const link = db.getLinkedUser("telegram", "12345");
    expect(link).toBeDefined();
    expect(link!.user_id).toBe("u_1");
    expect(link!.adapter).toBe("telegram");
  });

  it("should link discord user to user", () => {
    db.linkAdapter("discord", "disc_999", "u_2");
    const link = db.getLinkedUser("discord", "disc_999");
    expect(link).toBeDefined();
    expect(link!.user_id).toBe("u_2");
  });

  it("should support multiple adapters per user", () => {
    db.linkAdapter("telegram", "tg_1", "u_1");
    db.linkAdapter("discord", "dc_1", "u_1");
    const links = db.getUserLinks("u_1");
    expect(links.length).toBe(2);
  });

  it("should unlink adapter", () => {
    db.linkAdapter("telegram", "tg_1", "u_1");
    expect(db.unlinkAdapter("telegram", "tg_1")).toBe(true);
    expect(db.getLinkedUser("telegram", "tg_1")).toBeUndefined();
  });

  it("should replace existing link on same adapter+external_id", () => {
    db.linkAdapter("telegram", "tg_1", "u_1");
    db.linkAdapter("telegram", "tg_1", "u_2"); // re-link to different user
    const link = db.getLinkedUser("telegram", "tg_1");
    expect(link!.user_id).toBe("u_2");
  });
});

describe("Formatter for adapter mediums", () => {
  const roomP: Perception = {
    kind: "room",
    timestamp: Date.now(),
    data: {
      id: "test/room" as RoomId,
      short: "Hub",
      long: "Central hub.",
      items: { fountain: "A sparkling fountain." },
      exits: ["north"],
      entities: [],
    },
  };

  const mediums: Medium[] = ["json", "ansi", "markdown", "plaintext", "html"];

  for (const medium of mediums) {
    it(`should format room perception for ${medium}`, () => {
      const result = formatPerception(roomP, medium);
      expect(result).toBeTruthy();
      expect(result.length).toBeGreaterThan(0);
      // All mediums should contain the room short description somewhere
      expect(result).toContain("Hub");
    });
  }

  it("should format different perception kinds", () => {
    const kinds = ["message", "error", "system", "broadcast"] as const;
    for (const kind of kinds) {
      const p: Perception = {
        kind,
        timestamp: Date.now(),
        data: { text: `Test ${kind}` },
      };
      for (const medium of mediums) {
        const result = formatPerception(p, medium);
        expect(result).toContain(`Test ${kind}`);
      }
    }
  });
});
