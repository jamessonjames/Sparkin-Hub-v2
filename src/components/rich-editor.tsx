"use client";
import { useEditor, EditorContent } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
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

  const editor = useEditor({
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
          "prose prose-invert prose-sm max-w-none outline-none text-zinc-200",
          isChatInput
            ? "min-h-[24px] max-h-[120px] overflow-y-auto text-xs py-1.5"
            : "min-h-[160px] p-3",
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

  return (
    <div
      className={cn(
        "w-full relative",
        isChatInput
          ? "rounded-2xl border border-zinc-700/80 bg-zinc-800 pl-3 pr-11 py-0.5"
          : borderless
          ? "border-y border-zinc-800 bg-zinc-900/10"
          : "rounded-lg border border-zinc-700 bg-zinc-800/50 overflow-hidden",
      )}
    >
      {/* Selection / Bubble Menu (Tiptap selection popover) */}
      <BubbleMenu editor={editor} tippyOptions={{ duration: 100 }}>
        <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-zinc-700/80 bg-zinc-950 shadow-2xl text-xs select-none">
          {!isChatInput && (
            <>
              {/* Dropdown in place of Heading buttons */}
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
          )}

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

          {!isChatInput && (
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
            </>
          )}
        </div>
      </BubbleMenu>

      <div className="relative">
        <EditorContent editor={editor} onKeyDown={handleKeyDown} />

        {isChatInput && (
          <button
            type="button"
            onClick={onSubmitChat}
            disabled={editor.isEmpty}
            className={cn(
              "absolute right-2 bottom-[5px] h-7 w-7 rounded-full flex items-center justify-center transition-all bg-emerald-500 hover:bg-emerald-600 text-white shrink-0 shadow",
              editor.isEmpty && "opacity-40 cursor-not-allowed bg-zinc-700"
            )}
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {!isChatInput && (
        <>
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
          {/* Subtle bottom helper bar for images and lists since toolbar is bubble-only */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 border-t border-zinc-700/60 bg-zinc-800/20 justify-end">
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
        </>
      )}
    </div>
  );
}
