import { supabase } from "@/integrations/supabase/client";

export const FALLBACK_STORAGE_BUCKET = "demand-attachments";

function sanitizePathPart(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100) || "file";
}

export async function uploadToFallbackStorage(
  file: File,
  pathParts: string[] = [],
): Promise<{ success: boolean; url?: string; path?: string; error?: string }> {
  try {
    const safePath = pathParts.filter(Boolean).map(sanitizePathPart);
    const uniquePrefix = `${Date.now()}-${crypto.randomUUID()}`;
    const objectPath = [...safePath, `${uniquePrefix}-${sanitizePathPart(file.name)}`].join("/");

    const { error } = await supabase.storage
      .from(FALLBACK_STORAGE_BUCKET)
      .upload(objectPath, file, {
        cacheControl: "3600",
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (error) return { success: false, error: error.message };

    const { data } = supabase.storage
      .from(FALLBACK_STORAGE_BUCKET)
      .getPublicUrl(objectPath);

    if (!data?.publicUrl) {
      return { success: false, error: "O Supabase não retornou a URL pública do arquivo." };
    }

    return { success: true, url: data.publicUrl, path: objectPath };
  } catch (error: any) {
    return { success: false, error: error.message || "Falha no armazenamento de contingência." };
  }
}
