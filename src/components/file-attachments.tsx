import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  uploadAttachment,
  listAttachments,
  deleteAttachment,
  createAttachmentRecord,
} from "@/lib/attachments.functions";
import { getGDriveClientToken } from "@/lib/gdrive.functions";
import { uploadDirectToGDrive } from "@/lib/gdrive-client-upload";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Upload, Trash2, File, FileText, Image, Download, Loader2 } from "lucide-react";
import { getGoogleDriveViewUrl } from "@/lib/gdrive-token";
import { uploadToFallbackStorage } from "@/lib/supabase-storage";

const FILE_ICONS: Record<string, typeof File> = {
  "image/": Image,
  "application/pdf": FileText,
  "text/": FileText,
};

function getFileIcon(mimeType: string) {
  const key = Object.keys(FILE_ICONS).find((k) => mimeType.startsWith(k));
  return key ? FILE_ICONS[key] : File;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileAttachments({
  entityType,
  entityId,
  disabled,
  hideUploadButton,
}: {
  entityType: "client" | "demand";
  entityId: string;
  disabled?: boolean;
  hideUploadButton?: boolean;
}) {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<any[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const uploadFn = useServerFn(uploadAttachment);
  const createRecordFn = useServerFn(createAttachmentRecord);
  const getGDriveTokenFn = useServerFn(getGDriveClientToken);
  const listFn = useServerFn(listAttachments);
  const deleteFn = useServerFn(deleteAttachment);

  const { data: files = [] } = useQuery({
    queryKey: ["attachments", entityType, entityId],
    queryFn: () => listFn({ data: { entityType, entityId } }),
  });

  async function handleUpload(file: File) {
    const tempId = Math.random().toString();
    const newUpload = { id: tempId, name: file.name, size: file.size, progress: 10 };
    setUploadingFiles((prev) => [...prev, newUpload]);

    // Simulate progress
    const progressInterval = setInterval(() => {
      setUploadingFiles((prev) =>
        prev.map((item) =>
          item.id === tempId
            ? { ...item, progress: Math.min(item.progress + Math.floor(Math.random() * 15) + 5, 90) }
            : item
        )
      );
    }, 350);

    setUploading(true);
    try {
      const pathParts = ["Attachments", `${entityType}s`, entityId];

      // 1. Direct Client-side upload to Google Drive (5TB capacity)
      let res = await uploadDirectToGDrive(file, pathParts, getGDriveTokenFn);

      // 2. Server-side fallback to Google Drive using server refresh token
      if (!res.success) {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve((e.target?.result as string).split(",")[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        const serverRes = await uploadFn({
          data: {
            entityType,
            entityId,
            fileBase64: base64,
            fileName: file.name,
            mimeType: file.type || "application/octet-stream",
          },
        });

        if (serverRes.success && serverRes.fileId && serverRes.url) {
          res = { success: true, fileId: serverRes.fileId, url: serverRes.url };
        } else {
          // 3. Fallback to Supabase Storage
          const fallback = await uploadToFallbackStorage(file, pathParts);
          if (fallback.success && fallback.url) {
            res = { success: true, fileId: "supabase", url: fallback.url };
          } else {
            throw new Error(fallback.error || serverRes.error || res.error || "Erro ao fazer upload do arquivo.");
          }
        }
      }

      if (res.success && res.fileId && res.url) {
        await createRecordFn({
          data: {
            entityType,
            entityId,
            fileName: file.name,
            fileType: file.type || "application/octet-stream",
            fileSize: file.size,
            driveFileId: res.fileId,
            driveUrl: res.url,
          },
        });
        toast.success(`"${file.name}" anexado com sucesso!`);
        qc.invalidateQueries({ queryKey: ["attachments", entityType, entityId] });
      }
    } catch (err: any) {
      console.error("Erro no upload para o Google Drive:", err);
      toast.error(err.message || "Erro ao anexar arquivo no Google Drive.");
    } finally {
      clearInterval(progressInterval);
      setUploadingFiles((prev) => prev.filter((item) => item.id !== tempId));
      setUploading(false);
    }
  }

  async function handleDelete(id: string, fileName: string) {
    if (!confirm(`Remover "${fileName}"?`)) return;
    try {
      await deleteFn({ data: { id } });
      qc.invalidateQueries({ queryKey: ["attachments", entityType, entityId] });
      toast.success("Anexo removido.");
    } catch {
      toast.error("Erro ao remover anexo.");
    }
  }

  return (
    <div 
      className={cn(
        "flex flex-col gap-3 p-3 rounded-xl border border-dashed transition-all duration-250 relative",
        isDragging ? "border-primary bg-primary/5 shadow-inner scale-[1.01]" : "border-transparent"
      )}
      onDragOver={(e) => {
        if (disabled) return;
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
      }}
      onDrop={async (e) => {
        if (disabled) return;
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        const droppedFiles = Array.from(e.dataTransfer.files);
        if (droppedFiles.length > 0) {
          for (const file of droppedFiles) {
            await handleUpload(file);
          }
        }
      }}
    >
      {isDragging && (
        <div className="absolute inset-0 bg-background/85 backdrop-blur-xs z-10 flex flex-col items-center justify-center border-2 border-dashed border-primary rounded-xl pointer-events-none animate-in fade-in duration-200">
          <Upload className="h-5 w-5 text-primary mb-1 animate-bounce" />
          <p className="text-[10px] font-bold text-foreground">Solte para anexar</p>
        </div>
      )}
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
          Anexos ({files.length})
        </h4>
        {!disabled && !hideUploadButton && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUpload(file);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="text-xs h-7 px-2.5 rounded-lg cursor-pointer"
            >
              {uploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
              ) : (
                <Upload className="h-3.5 w-3.5 mr-1" />
              )}
              {uploading ? "Enviando..." : "Anexar arquivo"}
            </Button>
          </>
        )}
      </div>

      {files.length === 0 && uploadingFiles.length === 0 ? (
        <p className="text-[11px] text-muted-foreground/60 italic">Nenhum anexo.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {/* Uploading Files list */}
          {uploadingFiles.map((file) => (
            <div
              key={file.id}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-border bg-muted/5 relative overflow-hidden animate-pulse"
            >
              <Loader2 className="h-4 w-4 shrink-0 text-primary animate-spin" />
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline mb-1">
                  <p className="text-xs font-medium text-foreground truncate">{file.name}</p>
                  <span className="text-[10px] text-primary font-bold">{file.progress}%</span>
                </div>
                <div className="w-full bg-muted h-1 rounded-full overflow-hidden">
                  <div 
                    className="bg-primary h-full transition-all duration-300"
                    style={{ width: `${file.progress}%` }}
                  />
                </div>
                <p className="text-[9px] text-muted-foreground mt-0.5">
                  {formatFileSize(file.size)} • Enviando para o Google Drive...
                </p>
              </div>
            </div>
          ))}

          {/* Completed Files list */}
          {files.map((file: any) => {
            const Icon = getFileIcon(file.file_type);
            const isSupabase = file.drive_file_id === "supabase" || Boolean(file.drive_url && (file.drive_url.includes("supabase.co") || file.drive_url.includes("demand-attachments")));
            return (
              <div
                key={file.id}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-colors group",
                  isSupabase
                    ? "border-amber-500/50 bg-amber-950/20 hover:bg-amber-950/30"
                    : "border-border bg-muted/10 hover:bg-muted/20"
                )}
              >
                <Icon className={cn("h-4 w-4 shrink-0", isSupabase ? "text-amber-400" : "text-muted-foreground")} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{file.file_name}</p>
                    {isSupabase && (
                      <span className="text-[9px] font-extrabold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 shrink-0">
                        ⚡ CONTINGÊNCIA
                      </span>
                    )}
                  </div>
                  <p className={cn("text-[10px] font-medium flex items-center gap-1 mt-0.5", isSupabase ? "text-amber-400" : "text-muted-foreground")}>
                    <span>{formatFileSize(file.file_size)}</span>
                    <span>•</span>
                    <span>{isSupabase ? "⚡ Salvo no Supabase (Contingência)" : "Google Drive"}</span>
                  </p>
                </div>
                <a
                  href={getGoogleDriveViewUrl(file.drive_url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn("transition-colors cursor-pointer", isSupabase ? "text-amber-400 hover:text-amber-300" : "text-muted-foreground hover:text-foreground")}
                  title="Abrir arquivo"
                >
                  <Download className="h-3.5 w-3.5" />
                </a>
                {!disabled && (
                  <button
                    onClick={() => handleDelete(file.id, file.file_name)}
                    className="text-muted-foreground hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                    title="Remover anexo"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
