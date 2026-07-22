import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Store Google Drive token after client-side OAuth (GIS)
export const storeGoogleDriveToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({
    accessToken: z.string(),
    email: z.string(),
  }))
  .handler(async ({ data: { accessToken, email }, context }) => {
    try {
      const rootFolderId = await getOrCreateFolderPath(accessToken, []);

      const { error: dbError } = await context.supabase
        .from("system_settings")
        .upsert({
          key: "google_drive_credentials",
          value: {
            account_email: email,
            folder_id: rootFolderId,
          },
        });

      if (dbError) throw new Error(`Erro ao salvar no banco: ${dbError.message}`);

      return { success: true, folderId: rootFolderId };
    } catch (error: any) {
      console.error("storeGoogleDriveToken error:", error);
      return { success: false, error: error.message || "Erro desconhecido." };
    }
  });

// Get Google Drive connection status
export const getGoogleDriveStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
      const { data, error } = await context.supabase
        .from("system_settings")
        .select("value")
        .eq("key", "google_drive_credentials")
        .maybeSingle();

      if (error) throw error;
      if (!data?.value) {
        return { connected: false };
      }

      const val = data.value as any;
      return {
        connected: true,
        email: val.account_email || "Desconhecido",
      };
    } catch (e) {
      console.error("getGoogleDriveStatus error:", e);
      return { connected: false };
    }
  });

// Disconnect Google Drive
export const disconnectGoogleDrive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
      const { error } = await context.supabase
        .from("system_settings")
        .delete()
        .eq("key", "google_drive_credentials");

      if (error) throw error;
      return { success: true };
    } catch (e: any) {
      console.error("disconnectGoogleDrive error:", e);
      return { success: false, error: e.message || "Falha ao desconectar." };
    }
  });

// Find folder by name inside parent folder
async function findFolder(accessToken: string, name: string, parentId?: string): Promise<string | null> {
  const escapedName = name.replace(/'/g, "\\'");
  let query = `name = '${escapedName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  if (parentId) {
    query += ` and '${parentId}' in parents`;
  } else {
    query += ` and 'root' in parents`;
  }

  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!res.ok) return null;
  const data = await res.json();
  return data.files?.[0]?.id || null;
}

// Create folder inside parent
async function createFolder(accessToken: string, name: string, parentId?: string): Promise<string> {
  const body: any = {
    name,
    mimeType: "application/vnd.google-apps.folder",
  };
  if (parentId) {
    body.parents = [parentId];
  }

  const res = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Erro ao criar pasta no Drive: ${err}`);
  }

  const data = await res.json();
  return data.id;
}

// Create nested folder hierarchy on Google Drive recursively, starting from a given root folder ID if provided
export async function getOrCreateFolderPath(accessToken: string, pathParts: string[], startRootId?: string): Promise<string> {
  let currentParentId = startRootId;

  if (!currentParentId) {
    // Search/create the default root "Sparkin Hub" folder
    const rootName = "Sparkin Hub";
    currentParentId = await findFolder(accessToken, rootName);
    if (!currentParentId) {
      currentParentId = await createFolder(accessToken, rootName);
    }
  }

  for (const part of pathParts) {
    if (!part) continue;
    let folderId = await findFolder(accessToken, part, currentParentId);
    if (!folderId) {
      folderId = await createFolder(accessToken, part, currentParentId);
    }
    currentParentId = folderId;
  }

  return currentParentId;
}

// Upload file to Google Drive folder using multipart upload
export async function uploadFile(
  accessToken: string,
  fileBase64: string,
  fileName: string,
  mimeType: string,
  parentId: string
): Promise<string> {
  const boundary = "-------314159265358979323846";
  const firstDelimiter = `--${boundary}\r\n`;
  const partDelimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metadata = {
    name: fileName,
    parents: [parentId],
  };

  const metadataPart = `Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}`;
  const headerStr = `${firstDelimiter}${metadataPart}${partDelimiter}Content-Type: ${mimeType}\r\nContent-Transfer-Encoding: base64\r\n\r\n`;
  const footerStr = closeDelimiter;

  const headerBuffer = Buffer.from(headerStr, "utf8");
  const dataBuffer = Buffer.from(fileBase64, "base64");
  const footerBuffer = Buffer.from(footerStr, "utf8");

  const body = Buffer.concat([headerBuffer, dataBuffer, footerBuffer]);

  const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
      "Content-Length": String(body.length),
    },
    body,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Erro de upload de arquivo: ${err}`);
  }

  const data = await res.json();
  return data.id;
}

// Grant anyone with link read access to a file
export async function makeFilePublic(accessToken: string, fileId: string): Promise<void> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      role: "reader",
      type: "anyone",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Erro ao definir permissão pública do arquivo: ${err}`);
  }
}

export async function getRootFolderId(context: { supabase: any }): Promise<string | null> {
  const { data } = await (context.supabase as any)
    .from("system_settings")
    .select("value")
    .eq("key", "google_drive_credentials")
    .maybeSingle();
  return (data?.value as any)?.folder_id || null;
}

const uploadSchema = z.object({
  accessToken: z.string(),
  fileBase64: z.string(),
  fileName: z.string(),
  mimeType: z.string(),
  pathParts: z.array(z.string()).default([]),
});

// Server function for file upload to Google Drive using an access token from the frontend
export const uploadToGDrive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(uploadSchema)
  .handler(async ({ data: { accessToken, fileBase64, fileName, mimeType, pathParts }, context }) => {
    try {
      const rootFolderId = await getRootFolderId(context);
      const folderId = await getOrCreateFolderPath(accessToken, pathParts, rootFolderId || undefined);
      const fileId = await uploadFile(accessToken, fileBase64, fileName, mimeType, folderId);
      await makeFilePublic(accessToken, fileId);
      const viewUrl = `https://drive.google.com/uc?export=view&id=${fileId}`;

      return { success: true, fileId, url: viewUrl };
    } catch (error: any) {
      console.error("uploadToGDrive server function error:", error);
      return { success: false, error: error.message || "Erro durante o upload ao Google Drive." };
    }
  });
