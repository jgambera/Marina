#!/usr/bin/env bun
/**
 * Artilect Connect — single-command agent bridge
 *
 * Usage:
 *   bun run scripts/connect.ts <name>                            # interactive REPL
 *   bun run scripts/connect.ts <name> -c "look"                  # one-shot
 *   echo "look\nsay hello" | bun run scripts/connect.ts <name>   # pipe mode
 *
 * Environment:
 *   ARTILECT_URL — WebSocket server URL (default: ws://localhost:3300)
 */

import { createInterface } from "node:readline";
import { ArtilectAgent } from "../src/sdk/client";
import { formatPerception } from "../src/net/formatter";

const URL = process.env.ARTILECT_URL ?? "ws://localhost:3300";

const args = process.argv.slice(2);
const dashC = args.indexOf("-c");
let name: string | undefined;
let oneShot: string | undefined;

if (dashC !== -1) {
  oneShot = args[dashC + 1];
  const rest = args.filter((_, i) => i !== dashC && i !== dashC + 1);
  name = rest[0];
} else {
  name = args[0];
}

if (!name) {
  console.error("Usage: bun run scripts/connect.ts <name> [-c \"command\"]");
  process.exit(1);
}

const agent = new ArtilectAgent(URL, { autoReconnect: false });

// Print async perceptions (broadcasts, arrivals, messages)
agent.onPerception((p) => {
  const text = formatPerception(p, "plaintext");
  if (text) process.stdout.write(`${text}\n`);
});

try {
  const session = await agent.connect(name);
  console.error(`Connected as ${session.name} (${session.entityId})`);
} catch (err) {
  console.error(`Failed to connect: ${(err as Error).message}`);
  process.exit(1);
}

// ── One-shot mode ────────────────────────────────────────────────────────────

if (oneShot) {
  const perceptions = await agent.command(oneShot);
  for (const p of perceptions) {
    const text = formatPerception(p, "plaintext");
    if (text) console.log(text);
  }
  agent.disconnect();
  process.exit(0);
}

// ── Pipe mode (stdin is not a TTY) ───────────────────────────────────────────

const isTTY = process.stdin.isTTY;

if (!isTTY) {
  const rl = createInterface({ input: process.stdin });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const perceptions = await agent.command(trimmed);
    for (const p of perceptions) {
      const text = formatPerception(p, "plaintext");
      if (text) console.log(text);
    }
  }
  agent.disconnect();
  process.exit(0);
}

// ── REPL mode (interactive TTY) ──────────────────────────────────────────────

const rl = createInterface({
  input: process.stdin,
  output: process.stderr,
  prompt: "> ",
});

rl.prompt();

rl.on("line", async (line) => {
  const trimmed = line.trim();
  if (!trimmed) {
    rl.prompt();
    return;
  }
  const perceptions = await agent.command(trimmed);
  for (const p of perceptions) {
    const text = formatPerception(p, "plaintext");
    if (text) console.log(text);
  }
  rl.prompt();
});

rl.on("close", () => {
  agent.disconnect();
  process.exit(0);
});
