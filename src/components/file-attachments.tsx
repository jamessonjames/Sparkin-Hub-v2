import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  uploadAttachment,
  listAttachments,
  deleteAttachment,
} from "@/lib/attachments.functions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Upload, Trash2, File, FileText, Image, Download, Loader2 } from "lucide-react";

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
}: {
  entityType: "client" | "demand";
  entityId: string;
  disabled?: boolean;
}) {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const uploadFn = useServerFn(uploadAttachment);
  const listFn = useServerFn(listAttachments);
  const deleteFn = useServerFn(deleteAttachment);

  const { data: files = [] } = useQuery({
    queryKey: ["attachments", entityType, entityId],
    queryFn: () => listFn({ data: { entityType, entityId } }),
  });

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = (e.target?.result as string).split(",")[1];
        const res = await uploadFn({
          data: {
            entityType,
            entityId,
            fileBase64: base64,
            fileName: file.name,
            mimeType: file.type || "application/octet-stream",
          },
        });
        if (res.success) {
          toast.success(`"${file.name}" anexado!`);
          qc.invalidateQueries({ queryKey: ["attachments", entityType, entityId] });
        } else {
          toast.error(res.error || "Erro ao anexar arquivo.");
        }
        setUploading(false);
      };
      reader.onerror = () => {
        toast.error("Erro ao ler o arquivo.");
        setUploading(false);
      };
      reader.readAsDataURL(file);
    } catch {
      toast.error("Erro ao anexar arquivo.");
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
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
          Anexos ({files.length})
        </h4>
        {!disabled && (
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

      {files.length === 0 ? (
        <p className="text-[11px] text-muted-foreground/60 italic">Nenhum anexo.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {files.map((file: any) => {
            const Icon = getFileIcon(file.file_type);
            return (
              <div
                key={file.id}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-border bg-muted/10 hover:bg-muted/20 transition-colors group"
              >
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">{file.file_name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {formatFileSize(file.file_size)}
                  </p>
                </div>
                <a
                  href={file.drive_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  title="Abrir no Google Drive"
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
