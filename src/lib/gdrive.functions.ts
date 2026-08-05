import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function parseDriveError(resStatus: number, resText: string): string {
  if (resStatus === 401 || resText.includes("UNAUTHENTICATED") || resText.includes("invalid authentication credentials") || resText.includes("Invalid Credentials")) {
    return "A sessão do Google Drive expirou (token de 1 hora). Acesse Admin > Integrações para reconectar a conta.";
  }
  try {
    const parsed = JSON.parse(resText);
    if (parsed.error?.message) return parsed.error.message;
  } catch (e) {}
  return resText;
}

// Helper to get or refresh valid Google Drive access token on the server
export async function getServerGDriveAccessToken(context: { supabase: any }): Promise<string> {
  const { data } = await (context.supabase as any)
    .from("system_settings")
    .select("value")
    .eq("key", "google_drive_credentials")
    .maybeSingle();

  const creds = data?.value as any;
  if (!creds) {
    throw new Error("Google Drive não configurado no sistema. Conecte sua conta em Admin > Integrações.");
  }

  // 1. If active access_token is valid (not expiring in next 60s)
  if (creds.access_token && creds.expires_at && Date.now() < creds.expires_at - 60000) {
    return creds.access_token;
  }

  // 2. If refresh_token is present, exchange for a new access token
  if (creds.refresh_token) {
    try {
      const GOOGLE_CLIENT_ID = (typeof import.meta !== "undefined" && import.meta?.env?.VITE_GOOGLE_CLIENT_ID) || "794191743424-c912rov9fp3d14kahf5vtau5pef9fcmm.apps.googleusercontent.com";
      const GOOGLE_CLIENT_SECRET = creds.client_secret || (typeof import.meta !== "undefined" && import.meta?.env?.VITE_GOOGLE_CLIENT_SECRET) || "";
      const params = new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        grant_type: "refresh_token",
        refresh_token: creds.refresh_token,
      });
      if (GOOGLE_CLIENT_SECRET) params.set("client_secret", GOOGLE_CLIENT_SECRET);

      const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });

      if (res.ok) {
        const tokenData = await res.json();
        const newAccessToken = tokenData.access_token;
        const expiresIn = tokenData.expires_in || 3600;
        const newExpiresAt = Date.now() + expiresIn * 1000;
        const newRefreshToken = tokenData.refresh_token || creds.refresh_token;

        await (context.supabase as any)
          .from("system_settings")
          .update({
            value: {
              ...creds,
              access_token: newAccessToken,
              refresh_token: newRefreshToken,
              expires_at: newExpiresAt,
            },
          })
          .eq("key", "google_drive_credentials");

        return newAccessToken;
      }
    } catch (err) {
      console.error("[getServerGDriveAccessToken] refresh token error:", err);
    }
  }

  // 3. Check if access_token is expired and cannot be refreshed
  if (creds.expires_at && Date.now() >= creds.expires_at - 60000) {
    const accountEmail = creds.account_email && creds.account_email !== "Desconhecido" ? ` (${creds.account_email})` : "";
    throw new Error(
      `A sessão do Google Drive${accountEmail} expirou. Acesse Admin > Integrações para reconectar a conta.`
    );
  }

  // 4. Fallback to existing access_token if present
  if (creds.access_token) {
    return creds.access_token;
  }

  throw new Error("Sessão do Google Drive não conectada. Conecte sua conta em Admin > Integrações.");
}

// Store Google Drive token after client-side OAuth (GIS)
export const storeGoogleDriveToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({
    accessToken: z.string(),
    email: z.string(),
    refreshToken: z.string().optional().nullable(),
    expiresIn: z.number().optional().nullable(),
  }))
  .handler(async ({ data: { accessToken, email, refreshToken, expiresIn }, context }) => {
    try {
      const rootFolderId = await getOrCreateFolderPath(accessToken, []);
      const expiresAt = Date.now() + (expiresIn || 3600) * 1000;

      let finalEmail = email;
      if (!finalEmail || finalEmail === "Desconhecido") {
        try {
          const driveAboutRes = await fetch("https://www.googleapis.com/drive/v3/about?fields=user", {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (driveAboutRes.ok) {
            const driveAbout = await driveAboutRes.json();
            if (driveAbout?.user?.emailAddress) {
              finalEmail = driveAbout.user.emailAddress;
            }
          }
        } catch (e) {
          console.error("Error fetching email in storeGoogleDriveToken:", e);
        }
      }

      const { error: dbError } = await context.supabase
        .from("system_settings")
        .upsert({
          key: "google_drive_credentials",
          value: {
            account_email: finalEmail,
            folder_id: rootFolderId,
            access_token: accessToken,
            refresh_token: refreshToken || null,
            expires_at: expiresAt,
          },
        });

      if (dbError) throw new Error(`Erro ao salvar no banco: ${dbError.message}`);

      return { success: true, folderId: rootFolderId };
    } catch (error: any) {
      console.error("storeGoogleDriveToken error:", error);
      return { success: false, error: error.message || "Erro desconhecido." };
    }
  });

// Store Google Drive authorization code after GIS popup authorization code flow
export const storeGoogleDriveCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({
    code: z.string(),
    clientSecret: z.string().optional().nullable(),
  }))
  .handler(async ({ data: { code, clientSecret }, context }) => {
    try {
      const GOOGLE_CLIENT_ID = (typeof import.meta !== "undefined" && import.meta?.env?.VITE_GOOGLE_CLIENT_ID) || "794191743424-c912rov9fp3d14kahf5vtau5pef9fcmm.apps.googleusercontent.com";
      const GOOGLE_CLIENT_SECRET = clientSecret || (typeof import.meta !== "undefined" && import.meta?.env?.VITE_GOOGLE_CLIENT_SECRET) || "";

      const params = new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        grant_type: "authorization_code",
        redirect_uri: "postmessage",
      });
      if (GOOGLE_CLIENT_SECRET) params.set("client_secret", GOOGLE_CLIENT_SECRET);

      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });

      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        console.error("Token exchange failed:", errText);
        throw new Error(`Erro ao trocar código com o Google: ${errText}`);
      }

      const tokenData = await tokenRes.json();
      const accessToken = tokenData.access_token;
      const refreshToken = tokenData.refresh_token || null;
      const expiresIn = tokenData.expires_in || 3600;
      const expiresAt = Date.now() + expiresIn * 1000;

      if (!accessToken) {
        throw new Error("O Google não forneceu um token de acesso válido.");
      }

      // Fetch user email from Google Drive API
      let userEmail = "Desconhecido";
      try {
        const driveAboutRes = await fetch("https://www.googleapis.com/drive/v3/about?fields=user", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (driveAboutRes.ok) {
          const driveAbout = await driveAboutRes.json();
          if (driveAbout?.user?.emailAddress) {
            userEmail = driveAbout.user.emailAddress;
          }
        }
        if (userEmail === "Desconhecido") {
          const infoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (infoRes.ok) {
            const info = await infoRes.json();
            if (info?.email) userEmail = info.email;
          }
        }
      } catch (e) {
        console.error("Error fetching email in storeGoogleDriveCode:", e);
      }

      // Read existing credentials to preserve root folder ID or existing refresh token if not re-issued
      const { data: existingData } = await context.supabase
        .from("system_settings")
        .select("value")
        .eq("key", "google_drive_credentials")
        .maybeSingle();

      const existingVal = (existingData?.value as any) || {};
      const finalRefreshToken = refreshToken || existingVal.refresh_token || null;

      let rootFolderId = existingVal.folder_id;
      if (!rootFolderId) {
        rootFolderId = await getOrCreateFolderPath(accessToken, []);
      }

      const { error: dbError } = await context.supabase
        .from("system_settings")
        .upsert({
          key: "google_drive_credentials",
          value: {
            account_email: userEmail !== "Desconhecido" ? userEmail : existingVal.account_email || "Conectado",
            folder_id: rootFolderId,
            access_token: accessToken,
            refresh_token: finalRefreshToken,
            client_secret: GOOGLE_CLIENT_SECRET,
            expires_at: expiresAt,
          },
        });

      if (dbError) throw new Error(`Erro ao salvar no banco de dados: ${dbError.message}`);

      return { success: true, email: userEmail, hasRefreshToken: !!finalRefreshToken };
    } catch (error: any) {
      console.error("storeGoogleDriveCode error:", error);
      return { success: false, error: error.message || "Erro desconhecido ao vincular conta." };
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

      if (error || !data?.value) {
        return { connected: false, email: "" };
      }

      const val = data.value as any;
      let email = val.account_email || "";

      // If email is missing or Desconhecido, attempt safe background auto-heal if access_token is present
      if ((!email || email === "Desconhecido") && val.access_token) {
        try {
          const driveAboutRes = await fetch("https://www.googleapis.com/drive/v3/about?fields=user", {
            headers: { Authorization: `Bearer ${val.access_token}` },
          });
          if (driveAboutRes.ok) {
            const driveAbout = await driveAboutRes.json();
            if (driveAbout?.user?.emailAddress) {
              email = driveAbout.user.emailAddress;
              // Silently update database
              context.supabase
                .from("system_settings")
                .update({
                  value: {
                    ...val,
                    account_email: email,
                  },
                })
                .eq("key", "google_drive_credentials")
                .then(() => {})
            }
          }
        } catch (healErr) {
          console.error("Auto-heal Google email error:", healErr);
        }
      }

      return {
        connected: true,
        email: email || "Conectado",
      };
    } catch (e) {
      console.error("getGoogleDriveStatus error:", e);
      return { connected: false, email: "" };
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
    throw new Error(parseDriveError(res.status, err));
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
    currentParentId = (await findFolder(accessToken, rootName)) || undefined;
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
  const headerStr = `${firstDelimiter}${metadataPart}${partDelimiter}Content-Type: ${mimeType}\r\n\r\n`;
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
    throw new Error(parseDriveError(res.status, err));
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
    throw new Error(parseDriveError(res.status, err));
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
  accessToken: z.string().optional().nullable(),
  fileBase64: z.string(),
  fileName: z.string(),
  mimeType: z.string(),
  pathParts: z.array(z.string()).default([]),
});

// Server function for file upload to Google Drive using system token or provided token
export const uploadToGDrive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(uploadSchema)
  .handler(async ({ data: { accessToken: providedToken, fileBase64, fileName, mimeType, pathParts }, context }) => {
    try {
      const accessToken = providedToken || (await getServerGDriveAccessToken(context));
      const rootFolderId = await getRootFolderId(context);
      const folderId = await getOrCreateFolderPath(accessToken, pathParts, rootFolderId || undefined);
      const fileId = await uploadFile(accessToken, fileBase64, fileName, mimeType, folderId);
      await makeFilePublic(accessToken, fileId);
      const viewUrl = mimeType.startsWith("image/")
        ? `https://lh3.googleusercontent.com/d/${fileId}`
        : `https://drive.google.com/file/d/${fileId}/view?usp=sharing`;

      return { success: true, fileId, url: viewUrl };
    } catch (error: any) {
      console.error("uploadToGDrive server function error:", error);
      return { success: false, error: error.message || "Erro durante o upload ao Google Drive." };
    }
  });

// Server function to delete a file from Google Drive
export const deleteFromGDrive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({
    accessToken: z.string().optional().nullable(),
    fileId: z.string(),
  }))
  .handler(async ({ data: { accessToken: providedToken, fileId }, context }) => {
    try {
      const accessToken = providedToken || (await getServerGDriveAccessToken(context));
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Erro ao deletar arquivo do Drive: ${err}`);
      }
      return { success: true };
    } catch (error: any) {
      console.error("deleteFromGDrive error:", error);
      return { success: false, error: error.message || "Erro ao deletar do Google Drive." };
    }
  });

// Server function to get valid server-side access token & root folder for direct client uploads
export const getGDriveClientToken = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
      const accessToken = await getServerGDriveAccessToken(context);
      const rootFolderId = await getRootFolderId(context);
      return { success: true, accessToken, rootFolderId };
    } catch (e: any) {
      return { success: false, error: e.message || "Erro ao obter token do Google Drive." };
    }
  });
