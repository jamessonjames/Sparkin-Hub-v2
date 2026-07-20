import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ── Upload a file attachment to Google Drive and save record ──
export const uploadAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({
    entityType: z.enum(["client", "demand"]),
    entityId: z.string().uuid(),
    fileBase64: z.string(),
    fileName: z.string(),
    mimeType: z.string(),
  }))
  .handler(async ({ data: { entityType, entityId, fileBase64, fileName, mimeType }, context }) => {
    try {
      // 1. Get Google Drive credentials
      const { data: settings, error: dbError } = await context.supabase
        .from("system_settings")
        .select("value")
        .eq("key", "google_drive_credentials")
        .maybeSingle();

      if (dbError) throw dbError;
      if (!settings?.value) {
        throw new Error("Google Drive não conectado. Conecte em Admin > Integrações.");
      }

      const credentials = settings.value as any;
      const { refresh_token, folder_id: rootFolderId } = credentials;
      if (!refresh_token) throw new Error("Refresh Token não configurado.");

      // 2. Refresh access token
      const clientId = process.env.VITE_GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      if (!clientId || !clientSecret) {
        throw new Error("Credenciais do Google não configuradas no servidor.");
      }

      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token,
          grant_type: "refresh_token",
        }).toString(),
      });
      if (!tokenRes.ok) {
        const err = await tokenRes.text();
        throw new Error(`Erro ao renovar token: ${err}`);
      }
      const tokenData = await tokenRes.json();
      const accessToken = tokenData.access_token as string;

      // 3. Resolve folder: "Sparkin Hub / Attachments / {entityType}s / {entityId}"
      async function findFolder(name: string, parentId?: string): Promise<string | null> {
        const escaped = name.replace(/'/g, "\\'");
        let query = `name = '${escaped}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
        if (parentId) {
          query += ` and '${parentId}' in parents`;
        } else {
          query += ` and 'root' in parents`;
        }
        const res = await fetch(
          `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!res.ok) return null;
        const data = await res.json();
        return data.files?.[0]?.id || null;
      }

      async function createFolder(name: string, parentId?: string): Promise<string> {
        const body: any = { name, mimeType: "application/vnd.google-apps.folder" };
        if (parentId) body.parents = [parentId];
        const res = await fetch("https://www.googleapis.com/drive/v3/files", {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const err = await res.text();
          throw new Error(`Erro ao criar pasta no Drive: ${err}`);
        }
        const data = await res.json();
        return data.id;
      }

      async function resolvePath(parts: string[], startId?: string): Promise<string> {
        let current = startId;
        if (!current) {
          const rootName = "Sparkin Hub";
          current = await findFolder(rootName) || await createFolder(rootName);
        }
        for (const part of parts) {
          if (!part) continue;
          let id = await findFolder(part, current);
          if (!id) id = await createFolder(part, current);
          current = id;
        }
        return current;
      }

      const folderPath = ["Attachments", `${entityType}s`, entityId];
      const folderId = await resolvePath(folderPath, rootFolderId);

      // 4. Upload file
      const boundary = "-------314159265358979323846";
      const delimiter = `\r\n--${boundary}\r\n`;
      const closeDelimiter = `\r\n--${boundary}--`;

      const metadata = { name: fileName, parents: [folderId] };
      const metadataPart = `Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}`;
      const headerStr = `${delimiter}${metadataPart}${delimiter}Content-Type: ${mimeType}\r\nContent-Transfer-Encoding: base64\r\n\r\n`;
      const footerStr = closeDelimiter;

      const headerBuffer = Buffer.from(headerStr, "utf8");
      const dataBuffer = Buffer.from(fileBase64, "base64");
      const footerBuffer = Buffer.from(footerStr, "utf8");
      const body = Buffer.concat([headerBuffer, dataBuffer, footerBuffer]);

      const uploadRes = await fetch(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": `multipart/related; boundary=${boundary}`,
            "Content-Length": String(body.length),
          },
          body,
        }
      );
      if (!uploadRes.ok) {
        const err = await uploadRes.text();
        throw new Error(`Erro de upload: ${err}`);
      }
      const uploadData = await uploadRes.json();
      const fileId = uploadData.id;

      // 5. Make public
      await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ role: "reader", type: "anyone" }),
      });

      const viewUrl = `https://drive.google.com/uc?export=view&id=${fileId}`;

      // 6. Save record to DB
      const { error: insErr } = await context.supabase
        .from("file_attachments")
        .insert({
          entity_type: entityType,
          entity_id: entityId,
          file_name: fileName,
          file_type: mimeType,
          file_size: Math.ceil(Buffer.byteLength(fileBase64, "base64")),
          drive_file_id: fileId,
          drive_url: viewUrl,
          uploaded_by: context.userId,
        });

      if (insErr) throw insErr;

      return { success: true, fileId, url: viewUrl, fileName };
    } catch (e: any) {
      console.error("uploadAttachment error:", e);
      return { success: false, error: e.message || "Erro ao fazer upload do anexo." };
    }
  });

// ── List attachments for an entity ──
export const listAttachments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({
    entityType: z.enum(["client", "demand"]),
    entityId: z.string().uuid(),
  }))
  .handler(async ({ data: { entityType, entityId }, context }) => {
    const { data, error } = await context.supabase
      .from("file_attachments")
      .select("id, file_name, file_type, file_size, drive_url, created_at, uploaded_by")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return data ?? [];
  });

// ── Delete an attachment (soft delete) ──
export const deleteAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data: { id }, context }) => {
    const { error } = await context.supabase
      .from("file_attachments")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);

    if (error) throw new Error(error.message);
    return { success: true };
  });
