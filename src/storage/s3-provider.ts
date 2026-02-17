import type { StorageProvider } from "./provider";

/**
 * S3/R2-compatible storage provider stub.
 * Configure via ASSET_S3_BUCKET, ASSET_S3_REGION, ASSET_S3_ENDPOINT env vars.
 */
export class S3StorageProvider implements StorageProvider {
  async init(): Promise<void> {
    throw new Error("S3StorageProvider is not yet implemented. Use LocalStorageProvider.");
  }

  async put(_key: string, _data: Uint8Array, _mime: string): Promise<string> {
    throw new Error("S3StorageProvider is not yet implemented.");
  }

  async get(_key: string): Promise<{ data: Uint8Array; mime: string } | null> {
    throw new Error("S3StorageProvider is not yet implemented.");
  }

  async delete(_key: string): Promise<boolean> {
    throw new Error("S3StorageProvider is not yet implemented.");
  }

  resolve(_key: string): string {
    throw new Error("S3StorageProvider is not yet implemented.");
  }
}
