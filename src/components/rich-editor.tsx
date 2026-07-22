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
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableCell } from "@tiptap/extension-table-cell";
import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { uploadToGDrive, deleteFromGDrive } from "@/lib/gdrive.functions";
import { getGDriveAccessToken, getFileIdFromUrl } from "@/lib/gdrive-token";
import { Node, mergeAttributes } from "@tiptap/core";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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
          class: "attachment-card-box not-prose my-2.5 p-3 rounded-xl border border-primary/40 bg-primary/5 flex items-center justify-between gap-3 shadow-sm select-none animate-pulse",
        }),
        [
          "div",
          { class: "flex items-center gap-3 min-w-0" },
          [
            "div",
            { class: "h-9 w-9 rounded-lg bg-primary/20 text-primary flex items-center justify-center font-extrabold text-[11px] tracking-wider uppercase shrink-0 border border-primary/30" },
            ext,
          ],
          [
            "div",
            { class: "min-w-0 flex flex-col justify-center" },
            [
              "span",
              { class: "text-xs font-bold text-foreground truncate" },
              HTMLAttributes.fileName || "Enviando arquivo...",
            ],
            [
              "span",
              {
                id: `upload-status-${uploadId}`,
                class: "text-[10px] text-primary font-medium mt-0.5",
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
              class: "px-2.5 py-1 text-xs font-bold text-primary bg-primary/10 rounded-lg border border-primary/20",
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
        class: "attachment-card-box not-prose my-2.5 p-3 rounded-xl border border-border/80 bg-card/80 backdrop-blur-sm flex items-center justify-between gap-3 shadow-sm group transition-all hover:border-primary/50 select-none",
      }),
      [
        "div",
        { class: "flex items-center gap-3 min-w-0" },
        [
          "div",
          { class: "h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-extrabold text-[11px] tracking-wider uppercase shrink-0 border border-primary/20" },
          ext,
        ],
        [
          "div",
          { class: "min-w-0 flex flex-col justify-center" },
          [
            "a",
            {
              href: HTMLAttributes.src,
              target: "_blank",
              rel: "noopener noreferrer",
              class: "text-xs font-bold text-foreground truncate hover:underline hover:text-primary transition-colors cursor-pointer",
            },
            HTMLAttributes.fileName || "Arquivo",
          ],
          [
            "span",
            { class: "text-[10px] text-muted-foreground font-medium mt-0.5" },
            HTMLAttributes.fileSize ? `${HTMLAttributes.fileSize} • Google Drive` : "Google Drive",
          ],
        ],
      ],
      [
        "div",
        { class: "flex items-center gap-2 shrink-0" },
        [
          "a",
          {
            href: HTMLAttributes.src,
            target: "_blank",
            rel: "noopener noreferrer",
            class: "px-3 py-1.5 text-xs font-semibold rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors flex items-center gap-1 cursor-pointer no-underline",
          },
          "Abrir",
        ],
        [
          "button",
          {
            type: "button",
            "data-action": "delete-attachment",
            title: "Excluir anexo permanentemente",
            class: "h-7.5 w-7.5 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-all flex items-center justify-center cursor-pointer border border-destructive/20 ml-1 font-bold text-xs",
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
        if (!isChatInput && editor.state.doc.childCount === 1) {
          const firstChild = editor.state.doc.firstChild;
          if (firstChild && firstChild.type.name === "paragraph" && firstChild.textContent.length > 0) {
            editor.commands.setNode("heading", { level: 1 });
          }
        }
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
        if (!view.editable) return false;
        const target = event.target as HTMLElement;
        if (target.closest("[data-action='delete-attachment']")) {
          event.preventDefault();
          event.stopPropagation();
          view.dispatch(view.state.tr.delete(nodePos, nodePos + node.nodeSize));
          toast.success("Anexo removido da demanda.");
          return true;
        }
        return false;
      },
      handleDrop: (view, event, slice, moved) => {
        if (!moved && event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files.length > 0) {
          event.preventDefault();
          event.stopPropagation();
          const files = Array.from(event.dataTransfer.files);
          for (const file of files) {
            handleEditorFileDropOrUpload(file);
          }
          return true;
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

        if (event.clipboardData && event.clipboardData.files && event.clipboardData.files.length > 0) {
          event.preventDefault();
          event.stopPropagation();
          const files = Array.from(event.clipboardData.files);
          for (const file of files) {
            handleEditorFileDropOrUpload(file);
          }
          return true;
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
          const accessToken = await getGDriveAccessToken();
          for (const fileId of deletedIds) {
            await deleteFromGDriveFn({ data: { accessToken, fileId } });
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
        getGDriveAccessToken().then((accessToken) => {
          for (const fileId of deletedIds) {
            deleteFromGDriveFn({ data: { accessToken, fileId } }).catch(console.error);
          }
        }).catch(console.error);
      }
    };
  }, [content, deleteFromGDriveFn]);

  const formatFileSizeLocal = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const insertImage = useCallback(
    async (file: File) => {
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

      const reader = new FileReader();
      reader.onload = async (e) => {
        const fullBase64 = e.target?.result as string;
        const base64 = fullBase64.split(",")[1];
        try {
          const accessToken = await getGDriveAccessToken();
          const response = await uploadFn({
            data: {
              accessToken,
              fileBase64: base64,
              fileName: file.name,
              mimeType: file.type,
              pathParts: gDrivePath,
            },
          });

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
            if (foundRange) {
              editor?.chain().focus().deleteRange(foundRange).setImage({ src: fullBase64 }).run();
            } else {
              editor?.chain().focus().setImage({ src: fullBase64 }).run();
            }
            toast.warning("Hospedagem Google Drive indisponível. Salvo em base64.");
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
          if (foundRange) {
            editor?.chain().focus().deleteRange(foundRange).setImage({ src: fullBase64 }).run();
          } else {
            editor?.chain().focus().setImage({ src: fullBase64 }).run();
          }
          toast.warning("Falha ao subir para o Google Drive. Usando base64.");
        } finally {
          setUploading(false);
          setUploadProgress(0);
        }
      };
      reader.readAsDataURL(file);
    },
    [editor, uploadFn, gDrivePath]
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
        const reader = new FileReader();
        reader.onload = async (e) => {
          const base64 = (e.target?.result as string).split(",")[1];
          try {
            const accessToken = await getGDriveAccessToken();
            const response = await uploadFn({
              data: {
                accessToken,
                fileBase64: base64,
                fileName: file.name,
                mimeType: file.type || "application/octet-stream",
                pathParts: gDrivePath,
              },
            });

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
        };
        reader.readAsDataURL(file);
      } catch {
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
        toast.error("Erro ao ler o arquivo.");
        setUploading(false);
        setUploadProgress(0);
      }
    },
    [onAttachFile, insertImage, uploadFn, gDrivePath, editor]
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
