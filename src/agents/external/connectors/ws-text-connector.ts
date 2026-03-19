/**
 * WebSocket Text Connector — Pipes real-time Marina perceptions to child stdin
 * and reads commands from child stdout.
 *
 * Best for: claw agent OSes, custom scripts, anything that benefits from
 * real-time text perceptions (the richest, most autonomous path).
 *
 * Architecture:
 * - Bridge owns WebSocket, receives perceptions in real-time
 * - Perceptions forwarded as text lines to child stdin
 * - Commands read line-by-line from child stdout, forwarded to Marina
 */

import type { MarinaClient } from "../net/marina-client";
import { formatPerception } from "../net/formatter";
import type { Perception } from "../net/types";
import type { ProcessManager } from "../process-manager";

export interface WsTextConnectorOptions {
  client: MarinaClient;
  process: ProcessManager;
  /** Format perceptions as ANSI (default) or JSON. */
  format?: "text" | "json";
  /** Callback when command is sent to Marina. */
  onCommand?: (cmd: string) => void;
}

/**
 * Wire up bidirectional text flow between Marina and a child process.
 * Returns an unsubscribe function.
 */
export function connectWsText(opts: WsTextConnectorOptions): () => void {
  const { client, process: proc, format = "text" } = opts;

  // Marina → child stdin
  const perceptionHandler = (perception: Perception) => {
    if (format === "json") {
      proc.write(`${JSON.stringify(perception)}\n`);
    } else {
      const text = formatPerception(perception, "plaintext");
      if (text) {
        proc.write(`${text}\n`);
      }
    }
  };
  client.onPerception(perceptionHandler);

  // child stdout → Marina commands
  let buffer = "";
  const stdoutHandler = (data: string) => {
    buffer += data;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) {
        opts.onCommand?.(trimmed);
        client.command(trimmed).catch(() => {
          // Command failed — non-fatal
        });
      }
    }
  };
  proc.on("stdout", stdoutHandler);

  return () => {
    client.offPerception(perceptionHandler);
    proc.removeListener("stdout", stdoutHandler);
  };
}
