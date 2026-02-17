import { beforeEach, describe, expect, it } from "bun:test";
import { RateLimiter } from "../src/auth/rate-limiter";

describe("RateLimiter", () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter({ maxTokens: 5, refillRate: 2, refillInterval: 1000 });
  });

  it("should allow requests within capacity", () => {
    expect(limiter.consume("user1")).toBe(true);
    expect(limiter.consume("user1")).toBe(true);
    expect(limiter.consume("user1")).toBe(true);
    expect(limiter.consume("user1")).toBe(true);
    expect(limiter.consume("user1")).toBe(true);
  });

  it("should reject when tokens exhausted", () => {
    for (let i = 0; i < 5; i++) {
      limiter.consume("user1");
    }
    expect(limiter.consume("user1")).toBe(false);
  });

  it("should track keys independently", () => {
    for (let i = 0; i < 5; i++) {
      limiter.consume("user1");
    }
    expect(limiter.consume("user1")).toBe(false);
    expect(limiter.consume("user2")).toBe(true);
  });

  it("should support variable cost", () => {
    expect(limiter.consume("user1", 3)).toBe(true);
    expect(limiter.consume("user1", 3)).toBe(false); // only 2 tokens left
    expect(limiter.consume("user1", 2)).toBe(true);
  });

  it("should refill tokens over time", async () => {
    for (let i = 0; i < 5; i++) {
      limiter.consume("user1");
    }
    expect(limiter.consume("user1")).toBe(false);

    // Wait for refill
    await Bun.sleep(1100);

    // Should have 2 tokens refilled
    expect(limiter.consume("user1")).toBe(true);
    expect(limiter.consume("user1")).toBe(true);
    expect(limiter.consume("user1")).toBe(false);
  });

  it("should reset a key", () => {
    for (let i = 0; i < 5; i++) {
      limiter.consume("user1");
    }
    expect(limiter.consume("user1")).toBe(false);
    limiter.reset("user1");
    expect(limiter.consume("user1")).toBe(true);
  });

  it("should report remaining tokens", () => {
    expect(limiter.getRemaining("user1")).toBe(5);
    limiter.consume("user1");
    limiter.consume("user1");
    expect(limiter.getRemaining("user1")).toBe(3);
  });

  it("should not exceed max tokens on refill", async () => {
    // Don't consume anything, wait for multiple refills
    limiter.consume("user1"); // trigger bucket creation
    await Bun.sleep(3100);
    expect(limiter.getRemaining("user1")).toBeLessThanOrEqual(5);
  });

  it("should use default config when none provided", () => {
    const defaultLimiter = new RateLimiter();
    expect(defaultLimiter.getRemaining("test")).toBe(30);
  });
});
