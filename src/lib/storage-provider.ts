/**
 * Abstract Cloud Storage Provider Architecture
 * Allows seamless switching between Google Drive, OneDrive, or Supabase Storage in the future.
 */

export type StorageProviderType = "gdrive" | "onedrive" | "supabase";

export interface StorageUploadResult {
  success: boolean;
  fileId?: string;
  url?: string;
  provider: StorageProviderType;
  error?: string;
}

export interface IStorageProvider {
  name: StorageProviderType;
  uploadFile(file: File, pathParts?: string[]): Promise<StorageUploadResult>;
  deleteFile(fileId: string): Promise<boolean>;
  getPublicUrl(fileId: string): string;
}

/**
 * Interface contract for future OneDrive adapter implementation.
 * When OneDrive integration is enabled, implement this provider class and register it in `getStorageProvider`.
 */
export class OneDriveStorageProvider implements IStorageProvider {
  name: StorageProviderType = "onedrive";

  async uploadFile(file: File, pathParts: string[] = []): Promise<StorageUploadResult> {
    // Future Microsoft Graph API implementation:
    // POST https://graph.microsoft.com/v1.0/me/drive/root:/pathParts/file.name:/content
    console.warn("[OneDriveStorageProvider] Provider not yet active. Configure OneDrive in Admin Settings.");
    return {
      success: false,
      provider: "onedrive",
      error: "OneDrive não ativado nas configurações do sistema.",
    };
  }

  async deleteFile(fileId: string): Promise<boolean> {
    // DELETE https://graph.microsoft.com/v1.0/me/drive/items/{fileId}
    return false;
  }

  getPublicUrl(fileId: string): string {
    return `https://onedrive.live.com/embed?resid=${fileId}`;
  }
}
