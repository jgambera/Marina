import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";

export interface AppPaths {
  /** OS-appropriate application data directory */
  dataDir: string;
  /** Default database path */
  defaultDb: string;
  /** Preferences JSON file */
  prefsFile: string;
  /** Room definitions directory */
  roomsDir: string;
  /** Log directory */
  logDir: string;
}

/**
 * Resolve OS-appropriate paths for application data.
 *
 * - macOS:  ~/Library/Application Support/Artilect/
 * - Windows: %APPDATA%/Artilect/
 * - Linux:  ~/.local/share/artilect/
 *
 * Room directory resolution order:
 * 1. Bundled Electrobun app: Contents/Resources/app/resources/rooms/
 *    (cwd is Contents/MacOS/, so ../Resources/app/resources/rooms)
 * 2. Dev mode from desktop/: ../../rooms relative to this file
 * 3. Dev mode from repo root: ./rooms
 */
export function getAppPaths(): AppPaths {
  const home = homedir();
  const platform = process.platform;

  let dataDir: string;
  if (platform === "darwin") {
    dataDir = join(home, "Library", "Application Support", "Artilect");
  } else if (platform === "win32") {
    dataDir = join(
      process.env.APPDATA || join(home, "AppData", "Roaming"),
      "Artilect",
    );
  } else {
    dataDir = join(home, ".local", "share", "artilect");
  }

  // Ensure data directory exists
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  const logDir = join(dataDir, "logs");
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }

  // Room directory resolution — try multiple strategies:
  const roomsCandidates = [
    // Bundled Electrobun app: cwd is Contents/MacOS/
    // Rooms copied to Contents/Resources/app/resources/rooms/
    resolve("../Resources/app/resources/rooms"),
    // Dev mode: import.meta.dir is artilect-desktop/src/bun/, go up to repo root
    join(import.meta.dir, "../../../rooms"),
    // Fallback: cwd-relative
    resolve("rooms"),
  ];

  let roomsDir = roomsCandidates[roomsCandidates.length - 1]!;
  for (const candidate of roomsCandidates) {
    if (existsSync(candidate)) {
      roomsDir = candidate;
      break;
    }
  }

  return {
    dataDir,
    defaultDb: join(dataDir, "artilect.db"),
    prefsFile: join(dataDir, "preferences.json"),
    roomsDir,
    logDir,
  };
}
