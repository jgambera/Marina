/**
 * Process Manager — Spawn, monitor, and restart child processes for external agents.
 */

import { type ChildProcess, spawn } from "node:child_process";
import { EventEmitter } from "node:events";

export interface ProcessConfig {
  /** Command to run (e.g. "claude", "goose", "codex") */
  command: string;
  /** Arguments to pass */
  args?: string[];
  /** Additional env vars (merged with process.env) */
  env?: Record<string, string>;
  /** Working directory */
  cwd?: string;
  /** Auto-restart on crash */
  autoRestart?: boolean;
  /** Max restart attempts */
  maxRestarts?: number;
  /** Restart delay in ms */
  restartDelay?: number;
}

export interface ProcessManagerEvents {
  stdout: (data: string) => void;
  stderr: (data: string) => void;
  exit: (code: number | null, signal: string | null) => void;
  error: (error: Error) => void;
  restart: (attempt: number) => void;
}

export class ProcessManager extends EventEmitter {
  private config: ProcessConfig;
  private child: ChildProcess | null = null;
  private restartCount = 0;
  private stopped = false;

  constructor(config: ProcessConfig) {
    super();
    this.config = config;
  }

  /** Spawn the child process. */
  start(): void {
    this.stopped = false;
    this.restartCount = 0;
    this.spawnChild();
  }

  /** Send data to the child's stdin. */
  write(data: string): void {
    if (this.child?.stdin?.writable) {
      this.child.stdin.write(data);
    }
  }

  /** Kill the child process. */
  stop(): void {
    this.stopped = true;
    if (this.child) {
      this.child.kill("SIGTERM");
      // Force-kill after 5s if still alive
      const forceKill = setTimeout(() => {
        if (this.child && !this.child.killed) {
          this.child.kill("SIGKILL");
        }
      }, 5000);
      this.child.once("exit", () => clearTimeout(forceKill));
    }
  }

  /** Whether the child process is running. */
  isRunning(): boolean {
    return this.child !== null && !this.child.killed;
  }

  /** Get the child process PID. */
  getPid(): number | undefined {
    return this.child?.pid;
  }

  private spawnChild(): void {
    const env = { ...process.env, ...this.config.env };

    try {
      this.child = spawn(this.config.command, this.config.args ?? [], {
        env,
        cwd: this.config.cwd,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (error: any) {
      this.emit("error", new Error(`Failed to spawn "${this.config.command}": ${error.message}`));
      return;
    }

    this.child.stdout?.on("data", (chunk: Buffer) => {
      this.emit("stdout", chunk.toString());
    });

    this.child.stderr?.on("data", (chunk: Buffer) => {
      this.emit("stderr", chunk.toString());
    });

    this.child.on("error", (error) => {
      this.emit("error", error);
    });

    this.child.on("exit", (code, signal) => {
      this.emit("exit", code, signal);
      this.child = null;

      if (!this.stopped && this.config.autoRestart) {
        const maxRestarts = this.config.maxRestarts ?? 3;
        if (this.restartCount < maxRestarts) {
          this.restartCount++;
          this.emit("restart", this.restartCount);
          setTimeout(() => {
            if (!this.stopped) {
              this.spawnChild();
            }
          }, this.config.restartDelay ?? 2000);
        }
      }
    });
  }
}
