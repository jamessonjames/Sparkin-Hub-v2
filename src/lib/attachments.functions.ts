import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getOrCreateFolderPath, uploadFile, makeFilePublic, getRootFolderId, getServerGDriveAccessToken } from "@/lib/gdrive.functions";

// ── Upload a file attachment to Google Drive and save record ──
export const uploadAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({
    accessToken: z.string().optional().nullable(),
    entityType: z.enum(["client", "demand"]),
    entityId: z.string().uuid(),
    fileBase64: z.string(),
    fileName: z.string(),
    mimeType: z.string(),
  }))
  .handler(async ({ data: { accessToken: providedToken, entityType, entityId, fileBase64, fileName, mimeType }, context }) => {
    try {
      const accessToken = providedToken || (await getServerGDriveAccessToken(context));
      const rootFolderId = await getRootFolderId(context);
      if (!rootFolderId) {
        throw new Error("Google Drive não conectado. Conecte em Admin > Integrações.");
      }

      const folderPath = ["Attachments", `${entityType}s`, entityId];
      const folderId = await getOrCreateFolderPath(accessToken, folderPath, rootFolderId);
      const fileId = await uploadFile(accessToken, fileBase64, fileName, mimeType, folderId);
      await makeFilePublic(accessToken, fileId);
      const viewUrl = mimeType.startsWith("image/")
        ? `https://lh3.googleusercontent.com/d/${fileId}`
        : `https://drive.google.com/file/d/${fileId}/view?usp=sharing`;

      const { error: insErr } = await context.supabase
        .from("file_attachments" as any)
        .insert({
          entity_type: entityType,
          entity_id: entityId,
          file_name: fileName,
          file_type: mimeType,
          file_size: Math.ceil(Buffer.byteLength(fileBase64, "base64")),
          drive_file_id: fileId,
          drive_url: viewUrl,
          uploaded_by: context.userId,
          file_path: fileName, // fallback
        } as any);

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
      .from("file_attachments" as any)
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
      .from("file_attachments" as any)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);

    if (error) throw new Error(error.message);
    return { success: true };
  });
