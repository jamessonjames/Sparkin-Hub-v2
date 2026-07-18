import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  listNotes,
  upsertNote,
  deleteNote,
  toggleNotePin,
  NOTE_TYPES,
} from "@/lib/notes.functions";
import { getClient } from "@/lib/clients.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { RichEditor } from "@/components/rich-editor";
import { cn } from "@/lib/utils";
import {
  Plus,
  Pin,
  PinOff,
  Trash2,
  LayoutGrid,
  List as ListIcon,
  Search,
  StickyNote,
  FileText,
  Lightbulb,
  Users,
  Type as TypeIcon,
  ClipboardList,
} from "lucide-react";

type NoteType = (typeof NOTE_TYPES)[number];

interface Note {
  id: string;
  title: string;
  content: string;
  note_type: NoteType;
  visibility: string;
  client_id: string;
  is_pinned: boolean;
  updated_at: string;
  created_at: string;
}

const TYPE_META: Record<NoteType, { label: string; classes: string; icon: React.ComponentType<{ className?: string }> }> = {
  reuniao: {
    label: "Reunião",
    classes: "bg-blue-500/15 text-blue-300 border-blue-500/30",
    icon: Users,
  },
  briefing: {
    label: "Briefing",
    classes: "bg-purple-500/15 text-purple-300 border-purple-500/30",
    icon: ClipboardList,
  },
  ideias: {
    label: "Ideias",
    classes: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    icon: Lightbulb,
  },
  copy: {
    label: "Copy",
    classes: "bg-pink-500/15 text-pink-300 border-pink-500/30",
    icon: TypeIcon,
  },
  planejamento: {
    label: "Planejamento",
    classes: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    icon: FileText,
  },
  observacoes: {
    label: "Observações",
    classes: "bg-slate-500/15 text-slate-300 border-slate-500/30",
    icon: StickyNote,
  },
};

function TypePill({ type }: { type: NoteType }) {
  const meta = TYPE_META[type] ?? TYPE_META.observacoes;
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-medium",
        meta.classes,
      )}
    >
      <Icon className="h-2.5 w-2.5" />
      {meta.label}
    </span>
  );
}

function stripHtml(html: string): string {
  if (!html) return "";
  if (typeof window === "undefined") return html.replace(/<[^>]+>/g, " ").trim();
  const div = document.createElement("div");
  div.innerHTML = html;
  return (div.textContent || "").replace(/\s+/g, " ").trim();
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

export function ClientNotesPanel({ clientId }: { clientId: string }) {
  const listFn = useServerFn(listNotes);
  const upsertFn = useServerFn(upsertNote);
  const delFn = useServerFn(deleteNote);
  const pinFn = useServerFn(toggleNotePin);
  const qc = useQueryClient();

  const { data: notes = [] } = useQuery({
    queryKey: ["notes", clientId],
    queryFn: () => listFn({ data: { client_id: clientId } }),
  });

  const getClientFn = useServerFn(getClient);
  const { data: client } = useQuery({
    queryKey: ["client", clientId],
    queryFn: () => getClientFn({ data: { id: clientId } }),
    enabled: !!clientId,
  });

  const clientName = client?.name || "Desconhecido";
  const gDrivePath = useMemo(() => ["Clients", clientName, "Notes"], [clientName]);

  const [view, setView] = useState<"grid" | "list">("grid");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Note | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = (notes as Note[]).filter((n) => {
      if (!q) return true;
      return (
        n.title.toLowerCase().includes(q) ||
        stripHtml(n.content).toLowerCase().includes(q)
      );
    });
    // Server already orders by pinned/updated, keep it.
    return list;
  }, [notes, search]);

  const pinned = filtered.filter((n) => n.is_pinned);
  const others = filtered.filter((n) => !n.is_pinned);

  async function handlePin(n: Note) {
    try {
      await pinFn({ data: { id: n.id, is_pinned: !n.is_pinned } });
      qc.invalidateQueries({ queryKey: ["notes", clientId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir nota?")) return;
    try {
      await delFn({ data: { id } });
      qc.invalidateQueries({ queryKey: ["notes", clientId] });
      toast.success("Nota excluída.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  function openNew() {
    setIsCreating(true);
    setEditing({
      id: "",
      title: "",
      content: "",
      note_type: "observacoes",
      visibility: "private",
      client_id: clientId,
      is_pinned: false,
      updated_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    });
  }

  function openEdit(n: Note) {
    setIsCreating(false);
    setEditing(n);
  }

  async function handleSave(values: { title: string; content: string; note_type: NoteType }) {
    if (!values.title.trim()) {
      toast.error("Adicione um título.");
      return;
    }
    try {
      await upsertFn({
        data: {
          id: editing?.id && !isCreating ? editing.id : undefined,
          client_id: clientId,
          title: values.title,
          content: values.content,
          note_type: values.note_type,
          visibility: "private",
        },
      });
      qc.invalidateQueries({ queryKey: ["notes", clientId] });
      setEditing(null);
      setIsCreating(false);
      toast.success(isCreating ? "Nota criada!" : "Nota atualizada.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar em anotações..."
            className="pl-9 h-9"
          />
        </div>
        <div className="flex items-center gap-1 p-0.5 rounded-lg border border-border bg-muted/30">
          <button
            onClick={() => setView("grid")}
            className={cn(
              "h-7 w-7 flex items-center justify-center rounded-md transition-colors",
              view === "grid"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            title="Grade"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setView("list")}
            className={cn(
              "h-7 w-7 flex items-center justify-center rounded-md transition-colors",
              view === "list"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            title="Lista"
          >
            <ListIcon className="h-3.5 w-3.5" />
          </button>
        </div>
        <Button size="sm" onClick={openNew}>
          <Plus className="h-4 w-4 mr-1" /> Nova anotação
        </Button>
      </div>

      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-border rounded-xl bg-muted/10">
          <StickyNote className="h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            {search ? "Nenhuma anotação encontrada." : "Nenhuma anotação ainda."}
          </p>
          {!search && (
            <button
              onClick={openNew}
              className="text-xs text-primary hover:underline mt-2"
            >
              Criar a primeira anotação
            </button>
          )}
        </div>
      )}

      {/* Pinned section */}
      {pinned.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            <Pin className="h-3 w-3" /> Fixadas
          </div>
          <NotesSurface
            view={view}
            notes={pinned}
            onOpen={openEdit}
            onPin={handlePin}
            onDelete={handleDelete}
          />
        </div>
      )}

      {/* Others */}
      {others.length > 0 && (
        <div className="space-y-2">
          {pinned.length > 0 && (
            <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Todas
            </div>
          )}
          <NotesSurface
            view={view}
            notes={others}
            onOpen={openEdit}
            onPin={handlePin}
            onDelete={handleDelete}
          />
        </div>
      )}

      {/* Editor Dialog */}
      <NoteEditorDialog
        open={editing !== null}
        note={editing}
        gDrivePath={gDrivePath}
        onClose={() => {
          setEditing(null);
          setIsCreating(false);
        }}
        onSave={handleSave}
      />
    </div>
  );
}

function NotesSurface({
  view,
  notes,
  onOpen,
  onPin,
  onDelete,
}: {
  view: "grid" | "list";
  notes: Note[];
  onOpen: (n: Note) => void;
  onPin: (n: Note) => void;
  onDelete: (id: string) => void;
}) {
  if (view === "grid") {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {notes.map((n) => (
          <NoteCard key={n.id} note={n} onOpen={onOpen} onPin={onPin} onDelete={onDelete} />
        ))}
      </div>
    );
  }
  return (
    <div className="divide-y divide-border rounded-xl border border-border bg-card overflow-hidden">
      {notes.map((n) => (
        <NoteRow key={n.id} note={n} onOpen={onOpen} onPin={onPin} onDelete={onDelete} />
      ))}
    </div>
  );
}

function NoteCard({
  note,
  onOpen,
  onPin,
  onDelete,
}: {
  note: Note;
  onOpen: (n: Note) => void;
  onPin: (n: Note) => void;
  onDelete: (id: string) => void;
}) {
  const preview = stripHtml(note.content);
  return (
    <div
      className="group relative rounded-xl border border-border bg-card hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 transition-all cursor-pointer flex flex-col h-40"
      onClick={() => onOpen(note)}
    >
      <div className="p-3 flex-1 flex flex-col min-h-0">
        <div className="flex items-start justify-between gap-2">
          <TypePill type={note.note_type} />
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onPin(note);
              }}
              className={cn(
                "h-6 w-6 flex items-center justify-center rounded hover:bg-accent",
                note.is_pinned ? "text-primary" : "text-muted-foreground",
              )}
              title={note.is_pinned ? "Desafixar" : "Fixar"}
            >
              {note.is_pinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(note.id);
              }}
              className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
              title="Excluir"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </div>
        <h3 className="font-semibold text-sm text-foreground mt-2 line-clamp-2">
          {note.title}
        </h3>
        <p className="text-xs text-muted-foreground mt-1 line-clamp-3 flex-1">
          {preview || "Sem conteúdo"}
        </p>
      </div>
      <div className="px-3 py-2 border-t border-border/60 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{formatDate(note.created_at)}</span>
        {note.is_pinned && <Pin className="h-2.5 w-2.5 text-primary fill-primary" />}
      </div>
    </div>
  );
}

function NoteRow({
  note,
  onOpen,
  onPin,
  onDelete,
}: {
  note: Note;
  onOpen: (n: Note) => void;
  onPin: (n: Note) => void;
  onDelete: (id: string) => void;
}) {
  const preview = stripHtml(note.content);
  return (
    <div
      className="group flex items-center gap-3 px-4 py-3 hover:bg-accent/30 transition-colors cursor-pointer"
      onClick={() => onOpen(note)}
    >
      <TypePill type={note.note_type} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="font-medium text-sm text-foreground truncate">{note.title}</h3>
          {note.is_pinned && <Pin className="h-2.5 w-2.5 text-primary fill-primary shrink-0" />}
        </div>
        {preview && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">{preview}</p>
        )}
      </div>
      <div className="text-[11px] text-muted-foreground shrink-0 hidden sm:block">
        {formatDate(note.created_at)}
      </div>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPin(note);
          }}
          className={cn(
            "h-7 w-7 flex items-center justify-center rounded hover:bg-accent",
            note.is_pinned ? "text-primary" : "text-muted-foreground",
          )}
          title={note.is_pinned ? "Desafixar" : "Fixar"}
        >
          {note.is_pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(note.id);
          }}
          className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
          title="Excluir"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function NoteEditorDialog({
  open,
  note,
  onClose,
  onSave,
  gDrivePath,
}: {
  open: boolean;
  note: Note | null;
  onClose: () => void;
  onSave: (v: { title: string; content: string; note_type: NoteType }) => Promise<void>;
  gDrivePath?: string[];
}) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [type, setType] = useState<NoteType>("observacoes");
  const [saving, setSaving] = useState(false);

  // Sync when note changes
  useEffect(() => {
    if (note) {
      setTitle(note.title);
      setContent(note.content ?? "");
      setType(note.note_type);
    }
  }, [note]);

  async function submit() {
    setSaving(true);
    try {
      await onSave({ title, content, note_type: type });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl h-[80vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-border">
          <DialogTitle className="sr-only">Editar anotação</DialogTitle>
          <div className="flex items-center gap-3">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Título da anotação"
              className="flex-1 border-0 shadow-none focus-visible:ring-0 text-lg font-semibold px-0 h-auto"
            />
            <Select value={type} onValueChange={(v) => setType(v as NoteType)}>
              <SelectTrigger className="w-[170px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NOTE_TYPES.map((t) => (
                  <SelectItem key={t} value={t} className="text-xs">
                    {TYPE_META[t].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 flex flex-col p-6 pt-4">
          <RichEditor
            content={content}
            onChange={setContent}
            placeholder="Comece a escrever... Selecione texto para formatar."
            enableTables
            gDrivePath={gDrivePath}
          />
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-3 border-t border-border">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button size="sm" onClick={submit} disabled={saving || !title.trim()}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
