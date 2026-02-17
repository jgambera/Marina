import { describe, expect, it } from "bun:test";
import { formatPerception } from "../src/net/formatter";
import type { EntityId, Perception, RoomId } from "../src/types";

function roomPerception(): Perception {
  return {
    kind: "room",
    timestamp: Date.now(),
    data: {
      id: "test/room" as RoomId,
      short: "Test Room",
      long: "A room for testing.",
      items: { console: "A glowing console." },
      exits: ["north", "south"],
      entities: [{ id: "e_1" as EntityId, name: "Alice", short: "Alice is here." }],
    },
  };
}

function messagePerception(): Perception {
  return {
    kind: "message",
    timestamp: Date.now(),
    data: { text: "Hello, world!" },
  };
}

function errorPerception(): Perception {
  return {
    kind: "error",
    timestamp: Date.now(),
    data: { text: "Something went wrong." },
  };
}

function systemPerception(): Perception {
  return {
    kind: "system",
    timestamp: Date.now(),
    data: { text: "Server restarting." },
  };
}

describe("formatPerception", () => {
  describe("json medium", () => {
    it("should serialize perception as JSON", () => {
      const msg = messagePerception();
      const result = formatPerception(msg, "json");
      const parsed = JSON.parse(result);
      expect(parsed.kind).toBe("message");
      expect(parsed.data.text).toBe("Hello, world!");
    });
  });

  describe("ansi medium", () => {
    it("should format room with ANSI codes", () => {
      const result = formatPerception(roomPerception(), "ansi");
      expect(result).toContain("Test Room");
      expect(result).toContain("A room for testing.");
      expect(result).toContain("console");
      expect(result).toContain("north");
      expect(result).toContain("Alice");
    });

    it("should format messages as plain text", () => {
      const result = formatPerception(messagePerception(), "ansi");
      expect(result).toBe("Hello, world!");
    });

    it("should format errors with ANSI red", () => {
      const result = formatPerception(errorPerception(), "ansi");
      expect(result).toContain("Something went wrong.");
      expect(result).toContain("\x1b[31m"); // red
    });

    it("should format system with ANSI cyan", () => {
      const result = formatPerception(systemPerception(), "ansi");
      expect(result).toContain("Server restarting.");
      expect(result).toContain("\x1b[36m"); // cyan
    });
  });

  describe("markdown medium", () => {
    it("should format room with markdown headings", () => {
      const result = formatPerception(roomPerception(), "markdown");
      expect(result).toContain("## Test Room");
      expect(result).toContain("A room for testing.");
      expect(result).toContain("- console");
      expect(result).toContain("**Exits:**");
      expect(result).toContain("**Present:**");
    });

    it("should format errors with bold", () => {
      const result = formatPerception(errorPerception(), "markdown");
      expect(result).toContain("**Error:**");
    });

    it("should format system with italics", () => {
      const result = formatPerception(systemPerception(), "markdown");
      expect(result).toContain("*Server restarting.*");
    });
  });

  describe("plaintext medium", () => {
    it("should format room without any formatting", () => {
      const result = formatPerception(roomPerception(), "plaintext");
      expect(result).toContain("Test Room");
      expect(result).toContain("A room for testing.");
      expect(result).not.toContain("##");
      expect(result).not.toContain("**");
      expect(result).not.toContain("\x1b[");
    });
  });

  describe("html medium", () => {
    it("should format room with HTML tags", () => {
      const result = formatPerception(roomPerception(), "html");
      expect(result).toContain("<h3>Test Room</h3>");
      expect(result).toContain("<p>A room for testing.</p>");
      expect(result).toContain("<li>console</li>");
    });

    it("should escape HTML entities", () => {
      const p: Perception = {
        kind: "message",
        timestamp: Date.now(),
        data: { text: "<script>alert('xss')</script>" },
      };
      const result = formatPerception(p, "html");
      expect(result).not.toContain("<script>");
      expect(result).toContain("&lt;script&gt;");
    });

    it("should format errors with CSS class", () => {
      const result = formatPerception(errorPerception(), "html");
      expect(result).toContain('class="error"');
    });
  });
});
