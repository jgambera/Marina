/**
 * Credentials Storage - Save and load Marina bot credentials
 */

import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface BotCredentials {
  characterName: string;
  token?: string;
  wsUrl: string;
  mcpUrl?: string;
  model?: string;
  role?: string;
  agentType?: string;
  systemPrompt?: string;
  lastConnected?: number;
}

export interface SavedCredential {
  id: string;
  name: string;
  credentials: BotCredentials;
}

export class CredentialsStorage {
  private storageDir: string;
  private credentialsFile: string;

  constructor(customDir?: string) {
    this.storageDir = customDir || join(homedir(), ".marina", "credentials");
    this.credentialsFile = join(this.storageDir, "saved-bots.json");
  }

  /**
   * Initialize storage directory
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.storageDir, { recursive: true });
    } catch (error) {
      // Directory already exists, ignore
    }
  }

  /**
   * Save credentials for a bot
   */
  async saveCredentials(id: string, name: string, credentials: BotCredentials): Promise<void> {
    await this.initialize();

    // Load existing credentials
    const allCredentials = await this.loadAllCredentials();

    // Update or add
    const existing = allCredentials.find((c) => c.id === id);
    if (existing) {
      existing.name = name;
      existing.credentials = {
        ...credentials,
        lastConnected: Date.now(),
      };
    } else {
      allCredentials.push({
        id,
        name,
        credentials: {
          ...credentials,
          lastConnected: Date.now(),
        },
      });
    }

    // Write back
    await fs.writeFile(this.credentialsFile, JSON.stringify(allCredentials, null, 2), "utf-8");
  }

  /**
   * Load credentials by ID
   */
  async loadCredentials(id: string): Promise<BotCredentials | null> {
    const allCredentials = await this.loadAllCredentials();
    const found = allCredentials.find((c) => c.id === id);
    return found ? found.credentials : null;
  }

  /**
   * Load credentials by character name
   */
  async loadCredentialsByName(characterName: string): Promise<BotCredentials | null> {
    const allCredentials = await this.loadAllCredentials();
    const found = allCredentials.find((c) => c.credentials.characterName === characterName);
    return found ? found.credentials : null;
  }

  /**
   * Load all saved credentials
   */
  async loadAllCredentials(): Promise<SavedCredential[]> {
    try {
      const data = await fs.readFile(this.credentialsFile, "utf-8");
      const credentials: SavedCredential[] = JSON.parse(data);

      // Migrate old personality/mode fields to role
      let migrated = false;
      for (const entry of credentials) {
        const creds = entry.credentials as any;
        if (creds.personality !== undefined || creds.mode !== undefined) {
          if (!creds.role) {
            if (creds.mode === "builder") {
              creds.role = "architect";
            } else if (creds.personality === "friendly") {
              creds.role = "diplomat";
            } else if (creds.personality === "helpful") {
              creds.role = "mentor";
            } else if (creds.personality === "explorer") {
              creds.role = "scholar";
            } else {
              creds.role = "general";
            }
          }
          delete creds.personality;
          delete creds.mode;
          migrated = true;
        }
      }

      // Persist migration
      if (migrated) {
        await fs
          .writeFile(this.credentialsFile, JSON.stringify(credentials, null, 2), "utf-8")
          .catch(() => {});
      }

      return credentials;
    } catch (error) {
      // File doesn't exist yet
      return [];
    }
  }

  /**
   * Delete credentials by ID
   */
  async deleteCredentials(id: string): Promise<void> {
    const allCredentials = await this.loadAllCredentials();
    const filtered = allCredentials.filter((c) => c.id !== id);
    await fs.writeFile(this.credentialsFile, JSON.stringify(filtered, null, 2), "utf-8");
  }

  /**
   * List all saved bot names
   */
  async listSavedBots(): Promise<
    { id: string; name: string; wsUrl: string; lastConnected?: number }[]
  > {
    const allCredentials = await this.loadAllCredentials();
    return allCredentials.map((c) => ({
      id: c.id,
      name: c.name,
      wsUrl: c.credentials.wsUrl,
      lastConnected: c.credentials.lastConnected,
    }));
  }

  /**
   * Update last connected timestamp
   */
  async updateLastConnected(id: string): Promise<void> {
    const allCredentials = await this.loadAllCredentials();
    const found = allCredentials.find((c) => c.id === id);
    if (found) {
      found.credentials.lastConnected = Date.now();
      await fs.writeFile(this.credentialsFile, JSON.stringify(allCredentials, null, 2), "utf-8");
    }
  }

  /**
   * Get storage directory path
   */
  getStorageDir(): string {
    return this.storageDir;
  }
}

// Singleton instance
let globalStorage: CredentialsStorage | null = null;

export function getCredentialsStorage(): CredentialsStorage {
  if (!globalStorage) {
    globalStorage = new CredentialsStorage();
  }
  return globalStorage;
}
