"use client";
import { useEditor as useTiptapEditor, EditorContent as TiptapEditorContent } from "@tiptap/react";
import { BubbleMenu as TiptapBubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Image from "@tiptap/extension-image";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableCell } from "@tiptap/extension-table-cell";
import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { uploadToGDrive, deleteFromGDrive, getGDriveClientToken } from "@/lib/gdrive.functions";
import { getFileIdFromUrl, getGoogleDriveViewUrl } from "@/lib/gdrive-token";
import { uploadDirectToGDrive } from "@/lib/gdrive-client-upload";
import { Node, mergeAttributes } from "@tiptap/core";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

const uploadToSupabaseStorage = async (file: File): Promise<string | null> => {
  try {
    const ext = (file.name.split(".").pop() || "png").replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "png";
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
    const { error } = await supabase.storage
      .from("demand-attachments")
      .upload(fileName, file, { upsert: true });

    if (error) {
      console.warn("Supabase storage upload notice:", error.message);
      return null;
    }

    const { data: publicData } = supabase.storage
      .from("demand-attachments")
      .getPublicUrl(fileName);

    return publicData?.publicUrl || null;
  } catch (err) {
    console.warn("Supabase storage error:", err);
    return null;
  }
};

const fetchUrlAsFile = async (url: string, defaultName = "imagem_colada.png"): Promise<File | null> => {
  try {
    if (!url) return null;
    if (url.startsWith("data:")) {
      const arr = url.split(",");
      const mimeMatch = arr[0].match(/:(.*?);/);
      const mime = mimeMatch ? mimeMatch[1] : "image/png";
      const bstr = atob(arr[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      const ext = mime.split("/")[1] || "png";
      return new File([u8arr], `imagem_${Date.now()}.${ext}`, { type: mime });
    }

    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const mime = blob.type || "image/png";
    const ext = mime.split("/")[1] || "png";
    const fileName = defaultName.includes(".") ? defaultName : `${defaultName}.${ext}`;
    return new File([blob], fileName, { type: mime });
  } catch (e) {
    console.warn("Could not fetch external image as file:", url, e);
    return null;
  }
};

const compressImageToWebP = async (
  file: File | Blob,
  quality = 0.75,
  maxDimension = 1600
): Promise<File> => {
  return new Promise((resolve) => {
    if (!file.type || !file.type.startsWith("image/") || file.type === "image/svg+xml" || file.type === "image/gif") {
      if (file instanceof File) return resolve(file);
      return resolve(new File([file], `imagem_${Date.now()}.gif`, { type: file.type || "image/gif" }));
    }

    const img = typeof window !== "undefined" ? new window.Image() : document.createElement("img");
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      let width = img.width;
      let height = img.height;

      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        if (file instanceof File) return resolve(file);
        return resolve(new File([file], `imagem_${Date.now()}.webp`, { type: "image/webp" }));
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            if (file instanceof File) return resolve(file);
            return resolve(new File([file], `imagem_${Date.now()}.webp`, { type: "image/webp" }));
          }
          const compressedFile = new File([blob], `imagem_${Date.now()}.webp`, { type: "image/webp" });
          resolve(compressedFile);
        },
        "image/webp",
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      if (file instanceof File) return resolve(file);
      return resolve(new File([file], `imagem_${Date.now()}.png`, { type: "image/png" }));
    };

    img.src = url;
  });
};

export const AttachmentCardExtension = Node.create({
  name: "attachmentCard",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      src: { default: null },
      fileName: { default: "" },
      fileSize: { default: "" },
      fileExt: { default: "" },
      isUploading: { default: "false" },
      uploadId: { default: "" },
      progress: { default: 0 },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="attachment-card"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const ext = (HTMLAttributes.fileExt || "FILE").toUpperCase();
    const isUploading = HTMLAttributes.isUploading === true || HTMLAttributes.isUploading === "true";
    const uploadId = HTMLAttributes.uploadId || "";

    if (isUploading) {
      return [
        "div",
        mergeAttributes(HTMLAttributes, {
          "data-type": "attachment-card",
          class: "attachment-card-box not-prose my-2.5 p-3 rounded-xl border border-zinc-700/80 bg-zinc-900/60 flex items-center justify-between gap-3 shadow-sm select-none animate-pulse",
        }),
        [
          "div",
          { class: "flex items-center gap-3 min-w-0" },
          [
            "div",
            { class: "h-9 w-9 rounded-lg bg-zinc-800 text-zinc-400 flex items-center justify-center font-extrabold text-[11px] tracking-wider uppercase shrink-0 border border-zinc-700" },
            ext,
          ],
          [
            "div",
            { class: "min-w-0 flex flex-col justify-center" },
            [
              "span",
              { class: "text-xs font-bold text-zinc-200 truncate" },
              HTMLAttributes.fileName || "Enviando arquivo...",
            ],
            [
              "span",
              {
                id: `upload-status-${uploadId}`,
                class: "text-[10px] text-zinc-400 font-medium mt-0.5",
              },
              `Fazendo upload (${HTMLAttributes.progress || 10}%)...`,
            ],
          ],
        ],
        [
          "div",
          { class: "flex items-center gap-2 shrink-0" },
          [
            "span",
            {
              id: `upload-percent-${uploadId}`,
              class: "px-2.5 py-1 text-xs font-bold text-zinc-300 bg-zinc-800 rounded-lg border border-zinc-700",
            },
            `${HTMLAttributes.progress || 10}%`,
          ],
        ],
      ];
    }

    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "attachment-card",
        class: "attachment-card-box not-prose my-2.5 p-3 rounded-xl border border-zinc-700/80 bg-zinc-900/80 backdrop-blur-sm flex items-center justify-between gap-3 shadow-sm group transition-all hover:border-zinc-500 select-none",
      }),
      [
        "div",
        {
          class: "flex items-center gap-3 min-w-0 cursor-pointer hover:opacity-80 transition-opacity",
          "data-action": "download-attachment",
        },
        [
          "div",
          { class: "h-9 w-9 rounded-lg bg-zinc-800 text-zinc-300 flex items-center justify-center font-extrabold text-[11px] tracking-wider uppercase shrink-0 border border-zinc-700" },
          ext,
        ],
        [
          "div",
          { class: "min-w-0 flex flex-col justify-center" },
          [
            "span",
            {
              class: "text-xs font-bold text-zinc-200 truncate hover:underline transition-colors cursor-pointer",
            },
            HTMLAttributes.fileName || "Arquivo",
          ],
          [
            "span",
            { class: "text-[10px] text-zinc-400 font-medium mt-0.5" },
            HTMLAttributes.fileSize ? `${HTMLAttributes.fileSize} • Google Drive` : "Google Drive",
          ],
        ],
      ],
      [
        "div",
        { class: "flex items-center gap-1.5 shrink-0" },
        [
          "button",
          {
            type: "button",
            "data-action": "download-attachment",
            title: "Baixar anexo",
            class: "h-8 w-8 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white transition-all flex items-center justify-center cursor-pointer border border-zinc-700 shadow-sm",
          },
          [
            "span",
            { class: "text-[13px] font-extrabold text-zinc-300 pointer-events-none leading-none select-none" },
            "↓",
          ],
        ],
        [
          "button",
          {
            type: "button",
            "data-action": "delete-attachment",
            title: "Excluir anexo permanentemente",
            class: "h-8 w-8 rounded-lg bg-zinc-800/80 text-zinc-400 hover:bg-rose-950/60 hover:text-rose-400 hover:border-rose-800/50 transition-all flex items-center justify-center cursor-pointer border border-zinc-700/80 font-bold text-xs shadow-sm",
          },
          "✕",
        ],
      ],
    ];
  },
});
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  CheckSquare,
  ImageIcon,
  Send,
  List,
  ListOrdered,
  Table as TableIcon,
  Rows3,
  Columns3,
  Trash,
  Loader2,
  Paperclip,
} from "lucide-react";

interface RichEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  isChatInput?: boolean;
  onSubmitChat?: () => void;
  borderless?: boolean;
  readOnly?: boolean;
  enableTables?: boolean;
  gDrivePath?: string[];
  onAttachFile?: (file: File) => Promise<void> | void;
}

function ToolbarBtn({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      className={cn(
        "h-7 w-7 flex items-center justify-center rounded text-sm transition-colors cursor-pointer",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:text-foreground hover:bg-accent/60",
      )}
    >
      {children}
    </button>
  );
}

export function RichEditor({
  content,
  onChange,
  placeholder = "Adicione uma descrição...",
  isChatInput = false,
  onSubmitChat,
  borderless = false,
  readOnly = false,
  enableTables = false,
  gDrivePath = [],
  onAttachFile,
}: RichEditorProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const attachmentFileRef = useRef<HTMLInputElement>(null);

  const editor = useTiptapEditor({
    extensions: [
      StarterKit.configure({ strike: false }),
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Image.configure({ inline: false, allowBase64: true }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: {
          class: "text-primary underline font-semibold hover:text-primary/80 cursor-pointer decoration-primary/60 underline-offset-2",
          target: "_blank",
          rel: "noopener noreferrer",
        },
      }),
      AttachmentCardExtension,
      ...(enableTables
        ? [
            Table.configure({ resizable: true, HTMLAttributes: { class: "rich-table" } }),
            TableRow,
            TableHeader,
            TableCell,
          ]
        : []),
    ],
    content: content || "",
    editable: !readOnly,
    onUpdate: ({ editor }) => {
      if (!readOnly) {
        onChange(editor.getHTML());
      }
    },
    editorProps: {
      attributes: {
        class: cn(
          "prose dark:prose-invert prose-sm max-w-none outline-none text-foreground w-full",
          isChatInput
            ? "min-h-[20px] max-h-[140px] overflow-y-auto text-xs py-0.5 [&_p]:m-0"
            : readOnly
            ? "min-h-[40px] p-4 text-sm cursor-default"
            : "min-h-[180px] p-4 text-sm",
        ),
      },
      handleClickOn: (view, pos, node, nodePos, event) => {
        const target = event.target as HTMLElement;

        if (target.closest("[data-action='delete-attachment']")) {
          if (!view.editable) return false;
          event.preventDefault();
          event.stopPropagation();
          view.dispatch(view.state.tr.delete(nodePos, nodePos + node.nodeSize));
          toast.success("Anexo removido da demanda.");
          return true;
        }

        if (target.closest("[data-action='download-attachment']")) {
          event.preventDefault();
          event.stopPropagation();
          const src = node.attrs?.src;
          if (src && !src.startsWith("#")) {
            window.open(getGoogleDriveViewUrl(src), "_blank");
          }
          return true;
        }

        const linkEl = target.closest("a[href]") as HTMLAnchorElement | null;
        if (linkEl && linkEl.href && !linkEl.href.startsWith("#")) {
          event.preventDefault();
          event.stopPropagation();
          window.open(getGoogleDriveViewUrl(linkEl.href), "_blank");
          return true;
        }

        return false;
      },
      handleDrop: (view, event, slice, moved) => {
        if (moved) return false;

        // 1. Files dropped directly from local machine
        if (event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files.length > 0) {
          event.preventDefault();
          event.stopPropagation();
          const files = Array.from(event.dataTransfer.files);
          for (const file of files) {
            handleEditorFileDropOrUpload(file);
          }
          return true;
        }

        // 2. Dragged image from another web page or browser tab
        const html = event.dataTransfer ? event.dataTransfer.getData("text/html") : "";
        const uriList = event.dataTransfer ? event.dataTransfer.getData("text/uri-list") : "";

        if (html && html.includes("<img")) {
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, "text/html");
          const img = doc.querySelector("img");
          const src = img?.getAttribute("src");
          if (src && !src.includes("lh3.googleusercontent.com/d/") && !src.includes("drive.google.com")) {
            event.preventDefault();
            event.stopPropagation();
            fetchUrlAsFile(src, `imagem_arrastada_${Date.now()}.png`).then((file) => {
              if (file) handleEditorFileDropOrUpload(file);
            });
            return true;
          }
        } else if (uriList && (uriList.startsWith("http://") || uriList.startsWith("https://") || uriList.startsWith("data:image/"))) {
          if (!uriList.includes("lh3.googleusercontent.com/d/") && !uriList.includes("drive.google.com")) {
            event.preventDefault();
            event.stopPropagation();
            fetchUrlAsFile(uriList, `imagem_arrastada_${Date.now()}.png`).then((file) => {
              if (file) handleEditorFileDropOrUpload(file);
            });
            return true;
          }
        }

        return false;
      },
      handlePaste: (view, event) => {
        const text = event.clipboardData ? event.clipboardData.getData("text/plain") : "";
        const html = event.clipboardData ? event.clipboardData.getData("text/html") : "";
        
        const containsGDriveFile = 
          text.includes("lh3.googleusercontent.com/d/") || 
          text.includes("drive.google.com/uc") || 
          text.includes("drive.google.com/file/d/") ||
          html.includes("lh3.googleusercontent.com/d/") || 
          html.includes("drive.google.com/uc") || 
          html.includes("drive.google.com/file/d/");

        if (containsGDriveFile) {
          event.preventDefault();
          toast.warning("Não é permitido copiar e colar anexos do Google Drive para evitar links duplicados. Faça o upload novamente se precisar do arquivo.");
          return true;
        }

        // 1. Files in clipboard (e.g. copied files)
        if (event.clipboardData && event.clipboardData.files && event.clipboardData.files.length > 0) {
          event.preventDefault();
          event.stopPropagation();
          const files = Array.from(event.clipboardData.files);
          for (const file of files) {
            handleEditorFileDropOrUpload(file);
          }
          return true;
        }

        // 2. Clipboard items (e.g. Snipping Tool, PrintScreen, copied image from Mac/Windows clipboard)
        if (event.clipboardData && event.clipboardData.items && event.clipboardData.items.length > 0) {
          const imageItems: File[] = [];
          for (let i = 0; i < event.clipboardData.items.length; i++) {
            const item = event.clipboardData.items[i];
            if (item.type.startsWith("image/")) {
              const blobFile = item.getAsFile();
              if (blobFile) {
                const ext = item.type.split("/")[1] || "png";
                const namedFile = new File([blobFile], blobFile.name || `imagem_colada_${Date.now()}_${i}.${ext}`, { type: item.type });
                imageItems.push(namedFile);
              }
            }
          }
          if (imageItems.length > 0) {
            event.preventDefault();
            event.stopPropagation();
            for (const file of imageItems) {
              handleEditorFileDropOrUpload(file);
            }
            return true;
          }
        }

        // 3. HTML paste containing <img> tags with temporary/external URLs
        if (html && html.includes("<img")) {
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, "text/html");
          const imgs = Array.from(doc.querySelectorAll("img"));
          const externalImgSrcs: string[] = [];

          for (const img of imgs) {
            const src = img.getAttribute("src");
            if (
              src &&
              !src.includes("lh3.googleusercontent.com/d/") &&
              !src.includes("drive.google.com")
            ) {
              externalImgSrcs.push(src);
            }
          }

          if (externalImgSrcs.length > 0) {
            event.preventDefault();
            event.stopPropagation();
            (async () => {
              for (const imgSrc of externalImgSrcs) {
                const file = await fetchUrlAsFile(imgSrc, `imagem_colada_${Date.now()}.png`);
                if (file) {
                  await handleEditorFileDropOrUpload(file);
                }
              }
            })();
            return true;
          }
        }

        return false;
      },
    },
    immediatelyRender: false,
  });

  // Sync content from prop to editor (only if editor is not focused to prevent cursor jumping)
  if (editor && editor.getHTML() !== content && !editor.isFocused) {
    editor.commands.setContent(content || "");
  }

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const uploadFn = useServerFn(uploadToGDrive);
  const getGDriveTokenFn = useServerFn(getGDriveClientToken);
  const deleteFromGDriveFn = useServerFn(deleteFromGDrive);

  const knownFileIdsRef = useRef<string[]>([]);
  const isInitializedRef = useRef(false);

  const extractFileIds = (html: string): string[] => {
    if (!html) return [];
    const ids: string[] = [];
    const matches = html.match(/(https:\/\/lh3\.googleusercontent\.com\/d\/[a-zA-Z0-9_-]+|https:\/\/drive\.google\.com\/uc\?[^"'\s<>]+|https:\/\/drive\.google\.com\/file\/d\/[a-zA-Z0-9_-]+)/g);
    if (matches) {
      for (const match of matches) {
        const id = getFileIdFromUrl(match.replace(/&amp;/g, "&"));
        if (id) ids.push(id);
      }
    }
    return Array.from(new Set(ids));
  };

  if (!isInitializedRef.current && content) {
    knownFileIdsRef.current = extractFileIds(content);
    isInitializedRef.current = true;
  }

  useEffect(() => {
    if (!isInitializedRef.current && content) {
      knownFileIdsRef.current = extractFileIds(content);
      isInitializedRef.current = true;
    }

    const timer = setTimeout(async () => {
      const currentIds = extractFileIds(content);
      const deletedIds = knownFileIdsRef.current.filter((id) => !currentIds.includes(id));

      if (deletedIds.length > 0) {
        try {
          for (const fileId of deletedIds) {
            await deleteFromGDriveFn({ data: { fileId } });
            console.log("Auto-deleted from GDrive:", fileId);
          }
          knownFileIdsRef.current = currentIds;
        } catch (err) {
          console.error("Auto-delete error:", err);
        }
      } else {
        knownFileIdsRef.current = currentIds;
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      const currentIds = extractFileIds(content);
      const deletedIds = knownFileIdsRef.current.filter((id) => !currentIds.includes(id));
      if (deletedIds.length > 0) {
        for (const fileId of deletedIds) {
          deleteFromGDriveFn({ data: { fileId } }).catch(console.error);
        }
      }
    };
  }, [content, deleteFromGDriveFn]);

  const formatFileSizeLocal = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const insertImage = useCallback(
    async (rawFile: File) => {
      // Compress image to WebP with 75% quality to keep file size minimal (95%+ lighter)
      const file = rawFile.type.startsWith("image/")
        ? await compressImageToWebP(rawFile, 0.75, 1600)
        : rawFile;

      const tempId = Math.random().toString(36).substring(2, 9);
      editor?.chain().focus().insertContent(`<a href="#upload-${tempId}" class="text-primary animate-pulse font-medium">⏳ Enviando "${file.name}" (10%)...</a> `).run();

      setUploading(true);
      setUploadProgress(10);
      
      let currentProgress = 10;
      const progressInterval = setInterval(() => {
        currentProgress = Math.min(currentProgress + Math.floor(Math.random() * 15) + 5, 90);
        setUploadProgress(currentProgress);
        const el = document.querySelector(`a[href="#upload-${tempId}"]`);
        if (el) {
          el.innerHTML = `⏳ Enviando "${file.name}" (${currentProgress}%)...`;
        }
      }, 300);

      try {
        let response = await uploadDirectToGDrive(file, gDrivePath, getGDriveTokenFn);

        if (!response.success) {
          const fullBase64 = await new Promise<string>((res) => {
            const r = new FileReader();
            r.onload = (e) => res(e.target?.result as string);
            r.readAsDataURL(file);
          });
          const base64 = fullBase64.split(",")[1];
          const serverRes = await uploadFn({
            data: {
              fileBase64: base64,
              fileName: file.name,
              mimeType: file.type,
              pathParts: gDrivePath,
            },
          });
          if (serverRes.success && serverRes.url) {
            response = { success: true, url: serverRes.url, fileId: serverRes.fileId };
          }
        }

        clearInterval(progressInterval);

        let foundRange: { from: number; to: number } | null = null;
        editor?.state.doc.descendants((node, pos) => {
          if (node.marks) {
            for (const mark of node.marks) {
              if (mark.type.name === "link" && mark.attrs.href === `#upload-${tempId}`) {
                foundRange = { from: pos, to: pos + node.nodeSize };
                return false;
              }
            }
          }
          return true;
        });

        if (response.success && response.url) {
          if (foundRange) {
            editor?.chain().focus().deleteRange(foundRange).setImage({ src: response.url }).run();
          } else {
            editor?.chain().focus().setImage({ src: response.url }).run();
          }
          toast.success("Imagem enviada para o Google Drive com sucesso!");
        } else {
          // Fallback to Supabase Storage before base64
          const supabaseUrl = await uploadToSupabaseStorage(file);
          const finalUrl = supabaseUrl || (await new Promise<string>((res) => {
            const r = new FileReader();
            r.onload = (e) => res(e.target?.result as string);
            r.readAsDataURL(file);
          }));
          if (foundRange) {
            editor?.chain().focus().deleteRange(foundRange).setImage({ src: finalUrl }).run();
          } else {
            editor?.chain().focus().setImage({ src: finalUrl }).run();
          }
          if (supabaseUrl) {
            toast.success("Imagem enviada para o servidor com sucesso!");
          } else {
            toast.warning("Hospedagem em nuvem indisponível. Salvo em base64.");
          }
        }
      } catch (error) {
        console.error("Upload error, using fallback:", error);
        clearInterval(progressInterval);
        let foundRange: { from: number; to: number } | null = null;
        editor?.state.doc.descendants((node, pos) => {
          if (node.marks) {
            for (const mark of node.marks) {
              if (mark.type.name === "link" && mark.attrs.href === `#upload-${tempId}`) {
                foundRange = { from: pos, to: pos + node.nodeSize };
                return false;
              }
            }
          }
          return true;
        });
        const supabaseUrl = await uploadToSupabaseStorage(file);
        const finalUrl = supabaseUrl || (await new Promise<string>((res) => {
          const r = new FileReader();
          r.onload = (e) => res(e.target?.result as string);
          r.readAsDataURL(file);
        }));
        if (foundRange) {
          editor?.chain().focus().deleteRange(foundRange).setImage({ src: finalUrl }).run();
        } else {
          editor?.chain().focus().setImage({ src: finalUrl }).run();
        }
        if (supabaseUrl) {
          toast.success("Imagem enviada para o servidor com sucesso!");
        } else {
          toast.warning("Falha no Google Drive. Salvo em base64.");
        }
      } finally {
        setUploading(false);
        setUploadProgress(0);
      }
    },
    [editor, uploadFn, getGDriveTokenFn, gDrivePath]
  );

  const handleEditorFileDropOrUpload = useCallback(
    async (file: File) => {
      if (onAttachFile) {
        await onAttachFile(file);
        return;
      }

      if (file.type.startsWith("image/")) {
        await insertImage(file);
        return;
      }

      const tempId = Math.random().toString(36).substring(2, 9);
      const ext = file.name.split(".").pop() || "file";

      editor?.chain().focus().insertContent({
        type: "attachmentCard",
        attrs: {
          src: `#upload-${tempId}`,
          fileName: file.name,
          fileExt: ext,
          isUploading: "true",
          uploadId: tempId,
          progress: 10,
        },
      }).run();

      setUploading(true);
      setUploadProgress(10);

      let currentProgress = 10;
      const progressInterval = setInterval(() => {
        currentProgress = Math.min(currentProgress + Math.floor(Math.random() * 15) + 5, 90);
        setUploadProgress(currentProgress);
        const statusEl = document.getElementById(`upload-status-${tempId}`);
        const percentEl = document.getElementById(`upload-percent-${tempId}`);
        if (statusEl) statusEl.textContent = `Fazendo upload (${currentProgress}%)...`;
        if (percentEl) percentEl.textContent = `${currentProgress}%`;
      }, 300);

      try {
        let response = await uploadDirectToGDrive(file, gDrivePath, getGDriveTokenFn);

        if (!response.success) {
          const fullBase64 = await new Promise<string>((res) => {
            const r = new FileReader();
            r.onload = (e) => res(e.target?.result as string);
            r.readAsDataURL(file);
          });
          const base64 = fullBase64.split(",")[1];
          const serverRes = await uploadFn({
            data: {
              fileBase64: base64,
              fileName: file.name,
              mimeType: file.type || "application/octet-stream",
              pathParts: gDrivePath,
            },
          });
          if (serverRes.success && serverRes.url) {
            response = { success: true, url: serverRes.url, fileId: serverRes.fileId };
          }
        }

        clearInterval(progressInterval);

        let foundRange: { from: number; to: number } | null = null;
        editor?.state.doc.descendants((node, pos) => {
          if (
            node.type.name === "attachmentCard" &&
            (node.attrs.uploadId === tempId || node.attrs.src === `#upload-${tempId}`)
          ) {
            foundRange = { from: pos, to: pos + node.nodeSize };
            return false;
          }
          return true;
        });

        if (response.success && response.url) {
          const cardData = {
            type: "attachmentCard",
            attrs: {
              src: response.url,
              fileName: file.name,
              fileSize: formatFileSizeLocal(file.size),
              fileExt: ext,
              isUploading: "false",
            },
          };
          if (foundRange) {
            editor?.chain().focus().deleteRange(foundRange).insertContent(cardData).run();
          } else {
            editor?.chain().focus().insertContent(cardData).run();
          }
          toast.success(`Arquivo "${file.name}" anexado no destaque!`);
        } else {
          if (foundRange) {
            editor?.chain().focus().deleteRange(foundRange).run();
          }
          toast.error(response.error || "Erro ao carregar arquivo.");
        }
      } catch (error: any) {
        clearInterval(progressInterval);
        let foundRange: { from: number; to: number } | null = null;
        editor?.state.doc.descendants((node, pos) => {
          if (
            node.type.name === "attachmentCard" &&
            (node.attrs.uploadId === tempId || node.attrs.src === `#upload-${tempId}`)
          ) {
            foundRange = { from: pos, to: pos + node.nodeSize };
            return false;
          }
          return true;
        });
        if (foundRange) {
          editor?.chain().focus().deleteRange(foundRange).run();
        }
        console.error("Upload error:", error);
        toast.error("Erro ao subir arquivo.");
      } finally {
        setUploading(false);
        setUploadProgress(0);
      }
    },
    [onAttachFile, insertImage, uploadFn, getGDriveTokenFn, gDrivePath, editor]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (isChatInput && e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmitChat?.();
    }
  };

  if (!editor) return null;

  // Render for Chat Input (WhatsApp style, send button on the outside, 1-line default expanding height)
  if (isChatInput) {
    return (
      <div className="flex items-end gap-2 w-full">
        <div className="flex-1 rounded-xl border border-border bg-background py-1.5 px-3 relative min-w-0 shadow-sm focus-within:ring-1 focus-within:ring-ring focus-within:border-ring">
          <TiptapBubbleMenu 
            editor={editor}
            shouldShow={({ editor, from, to }) => {
              if (from === to) return false;
              if (editor.isActive("image")) return false;
              return true;
            }}
          >
            <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-border bg-popover shadow-2xl text-xs select-none">
              <>
                <select
                  value={
                    editor.isActive("heading", { level: 1 })
                      ? "h1"
                      : editor.isActive("heading", { level: 2 })
                      ? "h2"
                      : "p"
                  }
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "h1") editor.chain().focus().toggleHeading({ level: 1 }).run();
                    else if (val === "h2") editor.chain().focus().toggleHeading({ level: 2 }).run();
                    else editor.chain().focus().setParagraph().run();
                  }}
                  className="bg-background border border-border rounded px-1.5 py-0.5 text-[11px] text-foreground focus:outline-none cursor-pointer h-7"
                >
                  <option value="p">Parágrafo</option>
                  <option value="h1">Título 1</option>
                  <option value="h2">Título 2</option>
                </select>

                <span className="w-px h-5 bg-border mx-1 shrink-0" />
              </>

              <ToolbarBtn
                title="Negrito"
                active={editor.isActive("bold")}
                onClick={() => editor.chain().focus().toggleBold().run()}
              >
                <Bold className="h-3.5 w-3.5" />
              </ToolbarBtn>
              <ToolbarBtn
                title="Itálico"
                active={editor.isActive("italic")}
                onClick={() => editor.chain().focus().toggleItalic().run()}
              >
                <Italic className="h-3.5 w-3.5" />
              </ToolbarBtn>
              <ToolbarBtn
                title="Sublinhado"
                active={editor.isActive("underline")}
                onClick={() => editor.chain().focus().toggleUnderline().run()}
              >
                <UnderlineIcon className="h-3.5 w-3.5" />
              </ToolbarBtn>
              <ToolbarBtn
                title="Taxado"
                active={editor.isActive("strike")}
                onClick={() => editor.chain().focus().toggleStrike().run()}
              >
                <Strikethrough className="h-3.5 w-3.5" />
              </ToolbarBtn>

              <>
                <span className="w-px h-5 bg-border mx-1 shrink-0" />
                <ToolbarBtn
                  title="Alinhar à esquerda"
                  active={editor.isActive({ textAlign: "left" })}
                  onClick={() => editor.chain().focus().setTextAlign("left").run()}
                >
                  <AlignLeft className="h-3.5 w-3.5" />
                </ToolbarBtn>
                <ToolbarBtn
                  title="Centralizar"
                  active={editor.isActive({ textAlign: "center" })}
                  onClick={() => editor.chain().focus().setTextAlign("center").run()}
                >
                  <AlignCenter className="h-3.5 w-3.5" />
                </ToolbarBtn>
                <ToolbarBtn
                  title="Alinhar à direita"
                  active={editor.isActive({ textAlign: "right" })}
                  onClick={() => editor.chain().focus().setTextAlign("right").run()}
                >
                  <AlignRight className="h-3.5 w-3.5" />
                </ToolbarBtn>
                <span className="w-px h-5 bg-border mx-1 shrink-0" />
                <ToolbarBtn
                  title="Lista de tarefas"
                  active={editor.isActive("taskList")}
                  onClick={() => editor.chain().focus().toggleTaskList().run()}
                >
                  <CheckSquare className="h-3.5 w-3.5" />
                </ToolbarBtn>
                <ToolbarBtn
                  title="Lista com marcadores"
                  active={editor.isActive("bulletList")}
                  onClick={() => editor.chain().focus().toggleBulletList().run()}
                >
                  <List className="h-3.5 w-3.5" />
                </ToolbarBtn>
                <ToolbarBtn
                  title="Lista numerada"
                  active={editor.isActive("orderedList")}
                  onClick={() => editor.chain().focus().toggleOrderedList().run()}
                >
                  <ListOrdered className="h-3.5 w-3.5" />
                </ToolbarBtn>
              </>
            </div>
          </TiptapBubbleMenu>

          <TiptapEditorContent editor={editor} onKeyDown={handleKeyDown} />
        </div>

        <button
          type="button"
          onClick={onSubmitChat}
          disabled={editor.isEmpty}
          className={cn(
            "h-8 w-8 rounded-full flex items-center justify-center transition-all bg-[#0f9d58] hover:bg-[#0b8043] text-white shrink-0 shadow cursor-pointer mb-[1.5px]",
            editor.isEmpty && "opacity-45 cursor-not-allowed"
          )}
        >
          <Send className="h-3.5 w-3.5 text-white" />
        </button>
      </div>
    );
  }

  // Render for Standard Description Editor (Stretchable borderless option, negative margins)
  return (
    <div
      className={cn(
        "w-full flex-1 flex flex-col min-h-0 relative overflow-hidden transition-all",
        borderless
          ? "rounded-xl border border-border bg-background"
          : "rounded-xl border border-border bg-background",
      )}
    >
      <TiptapBubbleMenu 
        editor={editor}
        shouldShow={({ editor, from, to }) => {
          if (from === to) return false;
          if (editor.isActive("image")) return false;
          return true;
        }}
      >
        <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-border bg-popover shadow-2xl text-xs select-none">
          <>
            <select
              value={
                editor.isActive("heading", { level: 1 })
                  ? "h1"
                  : editor.isActive("heading", { level: 2 })
                  ? "h2"
                  : "p"
              }
              onChange={(e) => {
                const val = e.target.value;
                if (val === "h1") editor.chain().focus().toggleHeading({ level: 1 }).run();
                else if (val === "h2") editor.chain().focus().toggleHeading({ level: 2 }).run();
                else editor.chain().focus().setParagraph().run();
              }}
              className="bg-background border border-border rounded px-1.5 py-0.5 text-[11px] text-foreground focus:outline-none cursor-pointer h-7"
            >
              <option value="h1">Título 1</option>
              <option value="h2">Título 2</option>
              <option value="p">Parágrafo</option>
            </select>

            <span className="w-px h-5 bg-border mx-1 shrink-0" />
          </>

          <ToolbarBtn
            title="Negrito"
            active={editor.isActive("bold")}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <Bold className="h-3.5 w-3.5" />
          </ToolbarBtn>
          <ToolbarBtn
            title="Itálico"
            active={editor.isActive("italic")}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <Italic className="h-3.5 w-3.5" />
          </ToolbarBtn>
          <ToolbarBtn
            title="Sublinhado"
            active={editor.isActive("underline")}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
          >
            <UnderlineIcon className="h-3.5 w-3.5" />
          </ToolbarBtn>
          <ToolbarBtn
            title="Taxado"
            active={editor.isActive("strike")}
            onClick={() => editor.chain().focus().toggleStrike().run()}
          >
            <Strikethrough className="h-3.5 w-3.5" />
          </ToolbarBtn>

          <>
            <span className="w-px h-5 bg-border mx-1 shrink-0" />
            <ToolbarBtn
              title="Alinhar à esquerda"
              active={editor.isActive({ textAlign: "left" })}
              onClick={() => editor.chain().focus().setTextAlign("left").run()}
            >
              <AlignLeft className="h-3.5 w-3.5" />
            </ToolbarBtn>
            <ToolbarBtn
              title="Centralizar"
              active={editor.isActive({ textAlign: "center" })}
              onClick={() => editor.chain().focus().setTextAlign("center").run()}
            >
              <AlignCenter className="h-3.5 w-3.5" />
            </ToolbarBtn>
            <ToolbarBtn
              title="Alinhar à direita"
              active={editor.isActive({ textAlign: "right" })}
              onClick={() => editor.chain().focus().setTextAlign("right").run()}
            >
              <AlignRight className="h-3.5 w-3.5" />
            </ToolbarBtn>
            <span className="w-px h-5 bg-border mx-1 shrink-0" />
            <ToolbarBtn
              title="Lista de tarefas"
              active={editor.isActive("taskList")}
              onClick={() => editor.chain().focus().toggleTaskList().run()}
            >
              <CheckSquare className="h-3.5 w-3.5" />
            </ToolbarBtn>
            <ToolbarBtn
              title="Lista com marcadores"
              active={editor.isActive("bulletList")}
              onClick={() => editor.chain().focus().toggleBulletList().run()}
            >
              <List className="h-3.5 w-3.5" />
            </ToolbarBtn>
            <ToolbarBtn
              title="Lista numerada"
              active={editor.isActive("orderedList")}
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
            >
              <ListOrdered className="h-3.5 w-3.5" />
            </ToolbarBtn>
          </>
        </div>
      </TiptapBubbleMenu>

      {/* Bubble menu for table controls (appears while cursor is inside a table) */}
      {enableTables && (
        <TiptapBubbleMenu
          editor={editor}
          shouldShow={({ editor }) => editor.isActive("table")}
          options={{ placement: "top" }}
        >
          <div className="flex items-center gap-1 px-2 py-1.5 rounded-xl border border-border bg-popover shadow-2xl text-xs select-none">
            <ToolbarBtn
              title="Adicionar linha abaixo"
              onClick={() => editor.chain().focus().addRowAfter().run()}
            >
              <Rows3 className="h-3.5 w-3.5" />
            </ToolbarBtn>
            <ToolbarBtn
              title="Adicionar coluna à direita"
              onClick={() => editor.chain().focus().addColumnAfter().run()}
            >
              <Columns3 className="h-3.5 w-3.5" />
            </ToolbarBtn>
            <ToolbarBtn
              title="Excluir linha"
              onClick={() => editor.chain().focus().deleteRow().run()}
            >
              <span className="text-[10px] font-bold">−R</span>
            </ToolbarBtn>
            <ToolbarBtn
              title="Excluir coluna"
              onClick={() => editor.chain().focus().deleteColumn().run()}
            >
              <span className="text-[10px] font-bold">−C</span>
            </ToolbarBtn>
            <span className="w-px h-5 bg-border mx-0.5 shrink-0" />
            <button
              type="button"
              title="Excluir tabela"
              onMouseDown={(e) => {
                e.preventDefault();
                editor.chain().focus().deleteTable().run();
              }}
              className="h-7 px-2 flex items-center gap-1 rounded text-xs text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
            >
              <Trash className="h-3.5 w-3.5" />
              Excluir tabela
            </button>
          </div>
        </TiptapBubbleMenu>
      )}



      {/* Subtle top helper bar for images and lists — hidden in readOnly mode */}
      {!readOnly && (
        <div className={cn(
          "flex items-center gap-1.5 py-1.5 border-b border-border bg-muted/40 justify-end shrink-0",
          borderless ? "px-6" : "px-3"
        )}>
          {uploading && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground mr-auto animate-pulse font-medium">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              Enviando para o Google Drive ({uploadProgress}%)...
            </span>
          )}
          <button
            type="button"
            disabled={uploading}
            title="Inserir imagem"
            onClick={() => fileRef.current?.click()}
            className="text-muted-foreground hover:text-foreground hover:bg-accent/65 p-1 rounded transition-colors cursor-pointer"
          >
            <ImageIcon className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            disabled={uploading}
            title="Anexar arquivo"
            onClick={() => attachmentFileRef.current?.click()}
            className="text-muted-foreground hover:text-foreground hover:bg-accent/65 p-1 rounded transition-colors cursor-pointer"
          >
            <Paperclip className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Lista de tarefas"
            onClick={() => editor.chain().focus().toggleTaskList().run()}
            className="text-muted-foreground hover:text-foreground hover:bg-accent/65 p-1 rounded transition-colors cursor-pointer"
          >
            <CheckSquare className="h-3.5 w-3.5" />
          </button>
          {enableTables && !editor.isActive("table") && (
            <button
              type="button"
              title="Inserir tabela"
              onClick={() =>
                editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
              }
              className="text-muted-foreground hover:text-foreground hover:bg-accent/65 p-1 rounded transition-colors cursor-pointer"
            >
              <TableIcon className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto min-h-0 pr-0.5 scrollbar-thin">
        <TiptapEditorContent editor={editor} onKeyDown={handleKeyDown} />
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) insertImage(file);
          e.target.value = "";
        }}
      />

      <input
        ref={attachmentFileRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && onAttachFile) {
            onAttachFile(file);
          }
          e.target.value = "";
        }}
      />
    </div>
  );
}
