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
import { useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
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
} from "lucide-react";

interface RichEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  isChatInput?: boolean;
  onSubmitChat?: () => void;
  borderless?: boolean;
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
        "h-7 w-7 flex items-center justify-center rounded text-sm transition-colors",
        active
          ? "bg-zinc-700 text-white"
          : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60",
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
}: RichEditorProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  const editor = useTiptapEditor({
    extensions: [
      StarterKit.configure({ strike: false }),
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Image.configure({ inline: false, allowBase64: true }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder }),
    ],
    content: content || "",
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: cn(
          "prose prose-invert prose-sm max-w-none outline-none text-zinc-200 w-full",
          isChatInput
            ? "min-h-[20px] max-h-[140px] overflow-y-auto text-xs py-0.5 [&_p]:m-0"
            : borderless
            ? "min-h-[180px] p-4 text-sm"
            : "min-h-[180px] p-4 text-sm",
        ),
      },
    },
    immediatelyRender: false,
  });

  // Sync content from prop to editor (only if editor is not focused to prevent cursor jumping)
  if (editor && editor.getHTML() !== content && !editor.isFocused) {
    editor.commands.setContent(content || "");
  }

  const insertImage = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const src = e.target?.result as string;
        editor?.chain().focus().setImage({ src }).run();
      };
      reader.readAsDataURL(file);
    },
    [editor],
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
        <div className="flex-1 rounded-xl border border-zinc-800 bg-zinc-950 py-1 px-3 relative min-w-0">
          <TiptapBubbleMenu editor={editor} tippyOptions={{ duration: 100 }}>
            <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-zinc-700/80 bg-zinc-950 shadow-2xl text-xs select-none">
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
                  className="bg-zinc-900 border border-zinc-700 rounded px-1.5 py-0.5 text-[11px] text-zinc-300 focus:outline-none cursor-pointer h-7"
                >
                  <option value="p">Parágrafo</option>
                  <option value="h1">Título 1</option>
                  <option value="h2">Título 2</option>
                </select>

                <span className="w-px h-5 bg-zinc-700 mx-1 shrink-0" />
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
                <span className="w-px h-5 bg-zinc-700 mx-1 shrink-0" />
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
                <span className="w-px h-5 bg-zinc-700 mx-1 shrink-0" />
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
            "h-8 w-8 rounded-full flex items-center justify-center transition-all bg-emerald-500 hover:bg-emerald-600 text-white shrink-0 shadow cursor-pointer mb-[1.5px]",
            editor.isEmpty && "opacity-40 cursor-not-allowed bg-zinc-800 border border-zinc-700 text-zinc-500"
          )}
        >
          <Send className="h-3.5 w-3.5" />
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
          ? "rounded-xl border border-zinc-800 bg-zinc-950/60"
          : "rounded-xl border border-zinc-800 bg-zinc-950/60",
      )}
    >
      <TiptapBubbleMenu editor={editor} tippyOptions={{ duration: 100 }}>
        <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-zinc-700/80 bg-zinc-950 shadow-2xl text-xs select-none">
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
              className="bg-zinc-900 border border-zinc-700 rounded px-1.5 py-0.5 text-[11px] text-zinc-300 focus:outline-none cursor-pointer h-7"
            >
              <option value="p">Parágrafo</option>
              <option value="h1">Título 1</option>
              <option value="h2">Título 2</option>
            </select>

            <span className="w-px h-5 bg-zinc-700 mx-1 shrink-0" />
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
            <span className="w-px h-5 bg-zinc-700 mx-1 shrink-0" />
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
            <span className="w-px h-5 bg-zinc-700 mx-1 shrink-0" />
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

      {/* Subtle top helper bar for images and lists since toolbar is bubble-only */}
      <div className={cn(
        "flex items-center gap-1.5 py-1.5 border-b border-zinc-800/80 bg-zinc-950/40 justify-end shrink-0",
        borderless ? "px-6" : "px-3"
      )}>
        <button
          type="button"
          title="Inserir imagem"
          onClick={() => fileRef.current?.click()}
          className="text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 p-1 rounded transition-colors"
        >
          <ImageIcon className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="Lista de tarefas"
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          className="text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 p-1 rounded transition-colors"
        >
          <CheckSquare className="h-3.5 w-3.5" />
        </button>
      </div>

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
    </div>
  );
}
