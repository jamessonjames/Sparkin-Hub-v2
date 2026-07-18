import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Exchange OAuth authorization code for tokens
export const exchangeGoogleCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ code: z.string(), redirectUri: z.string() }))
  .handler(async ({ data: { code, redirectUri }, context }) => {
    const clientId = process.env.VITE_GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error("Client ID ou Client Secret do Google não configurados no servidor.");
    }

    try {
      // 1. Exchange authorization code for tokens
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }).toString(),
      });

      if (!tokenRes.ok) {
        const errorText = await tokenRes.text();
        throw new Error(`Erro ao trocar código de autorização: ${errorText}`);
      }

      const tokens = await tokenRes.json();
      const { access_token, refresh_token } = tokens;

      if (!refresh_token) {
        // Note: Google only sends refresh_token on the first consent prompt.
        // We force it in the OAuth link using prompt=consent, but we handle it just in case.
        throw new Error("Não foi recebido um Refresh Token. Se o Drive já estava conectado, desconecte e tente novamente.");
      }

      // 2. Fetch user profile to get account email
      const userinfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${access_token}` },
      });

      let email = "Desconhecido";
      if (userinfoRes.ok) {
        const userinfo = await userinfoRes.json();
        email = userinfo.email || "Desconhecido";
      }

      // 3. Create Root Folder in User's Drive
      const rootFolderId = await getOrCreateFolderPath(access_token, []);

      // 4. Save credentials to database (bypassing RLS with service_role)
      const { error: dbError } = await context.supabase
        .from("system_settings")
        .upsert({
          key: "google_drive_credentials",
          value: {
            refresh_token,
            account_email: email,
            folder_id: rootFolderId,
          },
        });

      if (dbError) {
        throw new Error(`Erro ao salvar configurações no banco de dados: ${dbError.message}`);
      }

      return {
        success: true,
        email,
      };
    } catch (error: any) {
      console.error("exchangeGoogleCode error:", error);
      return {
        success: false,
        error: error.message || "Erro desconhecido durante o intercâmbio de tokens.",
      };
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

// Helper: Refresh access token using stored refresh token
async function getAccessTokenFromRefreshToken(refreshToken: string) {
  const clientId = process.env.VITE_GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Client ID ou Client Secret do Google não configurados no servidor.");
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Erro ao renovar token do Google: ${err}`);
  }

  const data = await res.json();
  return data.access_token as string;
}

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
async function getOrCreateFolderPath(accessToken: string, pathParts: string[], startRootId?: string): Promise<string> {
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
async function uploadFile(
  accessToken: string,
  fileBase64: string,
  fileName: string,
  mimeType: string,
  parentId: string
): Promise<string> {
  const boundary = "-------314159265358979323846";
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metadata = {
    name: fileName,
    parents: [parentId],
  };

  const metadataPart = `Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}`;
  const headerStr = `${delimiter}${metadataPart}${delimiter}Content-Type: ${mimeType}\r\nContent-Transfer-Encoding: base64\r\n\r\n`;
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
async function makeFilePublic(accessToken: string, fileId: string): Promise<void> {
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

const uploadSchema = z.object({
  fileBase64: z.string(),
  fileName: z.string(),
  mimeType: z.string(),
  pathParts: z.array(z.string()).default([]),
});

// Server function for file upload to Google Drive using credentials stored in the DB
export const uploadToGDrive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(uploadSchema)
  .handler(async ({ data: { fileBase64, fileName, mimeType, pathParts }, context }) => {
    try {
      // 1. Fetch Google Drive credentials from database (bypassing RLS with service_role)
      const { data, error: dbError } = await context.supabase
        .from("system_settings")
        .select("value")
        .eq("key", "google_drive_credentials")
        .maybeSingle();

      if (dbError) throw dbError;
      if (!data?.value) {
        throw new Error("Integração do Google Drive não conectada no Painel Administrativo.");
      }

      const credentials = data.value as any;
      const { refresh_token, folder_id: rootFolderId } = credentials;

      if (!refresh_token) {
        throw new Error("Refresh Token não configurado no banco de dados.");
      }

      // 2. Refresh Access Token
      const accessToken = await getAccessTokenFromRefreshToken(refresh_token);

      // 3. Resolve/Create Subfolder Path (Starting from rootFolderId)
      const folderId = await getOrCreateFolderPath(accessToken, pathParts, rootFolderId);

      // 4. Upload File
      const fileId = await uploadFile(accessToken, fileBase64, fileName, mimeType, folderId);

      // 5. Make File Public
      await makeFilePublic(accessToken, fileId);

      // 6. Return direct view URL
      const viewUrl = `https://drive.google.com/uc?export=view&id=${fileId}`;

      return {
        success: true,
        fileId,
        url: viewUrl,
      };
    } catch (error: any) {
      console.error("uploadToGDrive server function error:", error);
      return {
        success: false,
        error: error.message || "Erro durante o upload ao Google Drive.",
      };
    }
  });
