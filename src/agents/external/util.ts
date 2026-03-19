/**
 * Utility functions for external agent adapters.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { DetectionResult } from "../agent/agent-registry";

const execFileAsync = promisify(execFile);

/**
 * Check if a binary is installed and get its version.
 * Uses `which` to find the binary, then runs the version flag.
 */
export async function checkBinary(
  command: string,
  versionFlag = "--version",
): Promise<DetectionResult> {
  try {
    // First check if the command exists
    const { stdout: whichOut } = await execFileAsync("which", [command], { timeout: 5000 });
    const path = whichOut.trim();

    // Try to get version
    let version: string | undefined;
    try {
      const { stdout: versionOut } = await execFileAsync(command, [versionFlag], {
        timeout: 10000,
      });
      // Extract first line, trim
      version = versionOut.trim().split("\n")[0];
    } catch {
      // Version flag failed, but binary exists
    }

    return { installed: true, version, path };
  } catch {
    return { installed: false };
  }
}
