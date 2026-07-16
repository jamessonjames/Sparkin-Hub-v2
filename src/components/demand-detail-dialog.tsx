import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  getDemand,
  updateDemand,
  createDemand,
  deleteDemand,
  type DemandStatus,
  DEMAND_STATUSES,
} from "@/lib/demands.functions";
import { listComments, addComment, deleteComment, updateComment } from "@/lib/comments.functions";
import { listProfiles } from "@/lib/users.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { STATUS_LABELS, PRIORITY_LABELS } from "@/lib/demand-labels";
import { RichEditor } from "@/components/rich-editor";
import { Trash2, Send, Calendar, X, Save, User } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_CHIP: Record<string, string> = {
  rascunho:     "bg-zinc-700 text-zinc-200 hover:bg-zinc-600",
  nao_iniciado: "bg-zinc-700 text-zinc-200 hover:bg-zinc-600",
  fazendo:      "bg-blue-700 text-blue-100 hover:bg-blue-600",
  para_analise: "bg-purple-700 text-purple-100 hover:bg-purple-600",
  com_ajustes:  "bg-amber-700 text-amber-100 hover:bg-amber-600",
  concluido:    "bg-emerald-700 text-emerald-100 hover:bg-emerald-600",
};

const PRIORITY_CHIP: Record<string, string> = {
  low:    "bg-zinc-500 dark:bg-zinc-700 text-white font-semibold hover:bg-zinc-600",
  medium: "bg-blue-500 dark:bg-blue-600 text-white font-semibold hover:bg-blue-600",
  high:   "bg-amber-500 dark:bg-amber-600 text-white font-semibold hover:bg-amber-500",
  urgent: "bg-red-500 dark:bg-red-650 text-white font-semibold hover:bg-red-600",
};

export function DemandDetailDialog({
  id,
  onClose,
  onMinimize,
  clients,
  defaultClientId,
  defaultStatus,
}: {
  id: string; // "new" for creation mode, uuid for edit mode
  onClose: () => void;
  onMinimize?: () => void;
  clients: { id: string; name: string }[];
  defaultClientId?: string;
  defaultStatus?: string;
}) {
  const isNew = id === "new";

  const getFn = useServerFn(getDemand);
  const createFn = useServerFn(createDemand);
  const updateFn = useServerFn(updateDemand);
  const deleteFn = useServerFn(deleteDemand);
  const listCommentsFn = useServerFn(listComments);
  const addCommentFn = useServerFn(addComment);
  const deleteCommentFn = useServerFn(deleteComment);
  const updateCommentFn = useServerFn(updateComment);
  const listProfilesFn = useServerFn(listProfiles);
  const qc = useQueryClient();

  // Queries
  const { data: demand, isLoading: isDemandLoading } = useQuery({
    queryKey: ["demand", id],
    queryFn: () => getFn({ data: { id } }),
    enabled: !isNew,
  });

  const { data: comments = [] } = useQuery({
    queryKey: ["comments", id],
    queryFn: () => listCommentsFn({ data: { demand_id: id } }),
    enabled: !isNew,
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles"],
    queryFn: () => listProfilesFn(),
  });

  // Local state for properties (initialized from demand or defaults)
  const [clientId, setClientId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<DemandStatus>("nao_iniciado");
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "urgent">("medium");
  const [dueDate, setDueDate] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [showComments, setShowComments] = useState(true);

  // Comments editing states
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentBody, setEditingCommentBody] = useState("");

  // Sync state when demand is loaded or when in creation mode
  useEffect(() => {
    if (isNew) {
      setClientId(defaultClientId || clients[0]?.id || "");
      setTitle("");
      setDescription("");
      setStatus((defaultStatus as DemandStatus) || "nao_iniciado");
      setPriority("medium");
      setDueDate("");
      setAssigneeId("");
    } else if (demand) {
      setClientId(demand.client_id);
      setTitle(demand.title);
      setDescription(demand.description || "");
      setStatus(demand.status as DemandStatus);
      setPriority(demand.priority as "low" | "medium" | "high" | "urgent");
      setDueDate(demand.due_date ? demand.due_date.slice(0, 10) : "");
      setAssigneeId(demand.assignee_user_id || "");
    }
  }, [demand, isNew, defaultClientId, defaultStatus, clients]);

  // Track if any properties were modified
  const isDirty = isNew
    ? title.trim() !== "" || description !== "" || dueDate !== "" || assigneeId !== ""
    : demand && (
        clientId !== demand.client_id ||
        title !== demand.title ||
        description !== (demand.description || "") ||
        status !== demand.status ||
        priority !== demand.priority ||
        dueDate !== (demand.due_date ? demand.due_date.slice(0, 10) : "") ||
        assigneeId !== (demand.assignee_user_id || "")
      );

  async function handleSave() {
    if (!clientId) { toast.error("Selecione um cliente."); return; }
    if (!title.trim()) { toast.error("O título não pode ficar vazio."); return; }
    
    setSaving(true);
    try {
      if (isNew) {
        const created = await createFn({
          data: {
            client_id: clientId,
            title,
            description,
            status,
            priority,
            due_date: dueDate || null,
            assignee_user_id: assigneeId || null,
          },
        });
        toast.success("Demanda criada com sucesso!");
        qc.invalidateQueries({ queryKey: ["demands"] });
        // Close overlay or transition to the newly created demand detail page
        onClose();
      } else {
        await updateFn({
          data: {
            id,
            client_id: clientId,
            title,
            description,
            status,
            priority,
            due_date: dueDate || null,
            estimated_credits: demand?.estimated_credits,
            internal_notes: demand?.internal_notes,
            assignee_user_id: assigneeId || null,
          },
        });
        toast.success("Alterações salvas!");
        qc.invalidateQueries({ queryKey: ["demand", id] });
        qc.invalidateQueries({ queryKey: ["demands"] });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Excluir esta demanda permanentemente?")) return;
    try {
      await deleteFn({ data: { id } });
      toast.success("Excluída.");
      qc.invalidateQueries({ queryKey: ["demands"] });
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  async function handleAddComment() {
    const textContent = comment.replace(/<[^>]*>/g, "").trim();
    if (!textContent && !comment.includes("<img")) return;
    try {
      await addCommentFn({ data: { demand_id: id, body: comment } });
      setComment("");
      qc.invalidateQueries({ queryKey: ["comments", id] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  async function handleDeleteComment(commentId: string) {
    if (!confirm("Excluir este comentário permanentemente?")) return;
    try {
      await deleteCommentFn({ data: { id: commentId } });
      qc.invalidateQueries({ queryKey: ["comments", id] });
      toast.success("Comentário excluído.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao excluir");
    }
  }

  function startEditComment(commentId: string, bodyHtml: string) {
    setEditingCommentId(commentId);
    // Strip HTML tags for clean text editing inside simple textarea
    const cleaned = bodyHtml.replace(/<[^>]*>/g, "").trim();
    setEditingCommentBody(cleaned);
  }

  async function handleSaveEditComment(commentId: string) {
    if (!editingCommentBody.trim()) return;
    try {
      // Re-wrap in paragraphs if needed, or save as-is
      await updateCommentFn({ data: { id: commentId, body: `<p>${editingCommentBody}</p>` } });
      setEditingCommentId(null);
      setEditingCommentBody("");
      qc.invalidateQueries({ queryKey: ["comments", id] });
      toast.success("Comentário atualizado!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-[95vw] lg:max-w-5xl xl:max-w-6xl h-[90vh] bg-zinc-900 border border-zinc-700/60 rounded-2xl flex flex-col overflow-hidden shadow-2xl my-auto mx-auto animate-in fade-in zoom-in duration-200">
        
        {(!isNew && isDemandLoading) ? (
          <div className="flex-1 flex items-center justify-center text-zinc-500">Carregando...</div>
        ) : (
          <>
            {/* ── TOP BAR ── */}
            <div className="flex items-center gap-4 px-5 py-2.5 border-b border-zinc-800 shrink-0 flex-wrap bg-zinc-900/80 w-full">
              <div className="flex-1 min-w-[200px]">
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="text-base font-bold bg-transparent border-transparent hover:border-zinc-700/60 focus:border-primary/65 text-zinc-100 h-8 transition-colors p-0.5 px-2 rounded w-full max-w-xl focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-zinc-500 placeholder:italic"
                  placeholder={isNew ? "Título da nova demanda..." : "Título da demanda..."}
                />
              </div>

              <div className="ml-auto flex items-center gap-1.5">
                {!isNew && (
                  <>
                    <button
                      onClick={() => setShowComments((v) => !v)}
                      className="text-xs text-zinc-500 hover:text-zinc-300 px-2 py-1 rounded hover:bg-zinc-800 transition-colors"
                    >
                      {showComments ? "Ocultar comentários" : "Comentários"}
                    </button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleDelete}
                      className="h-7 px-2 text-zinc-500 hover:text-red-400 hover:bg-red-950/30 gap-1 text-xs"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Excluir
                    </Button>
                  </>
                )}
                {onMinimize && (
                  <button
                    onClick={onMinimize}
                    title="Minimizar"
                    className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded transition-colors"
                    aria-label="Minimizar"
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <rect x="2" y="9" width="10" height="1.5" rx="0.75" fill="currentColor"/>
                    </svg>
                  </button>
                )}
                <button
                  onClick={onClose}
                  title="Fechar"
                  className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded transition-colors"
                  aria-label="Fechar"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* ── MAIN BODY ── */}
            <div className="flex flex-1 min-h-0">
              
              {/* Left Panel - Fields & description */}
              <div className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-6">
                
                {/* Meta details row (Client, Status, Priority, Date, Assignee) */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 bg-zinc-950/20 p-4 rounded-xl border border-zinc-800/80">
                  
                  {/* Client Select */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold">Cliente</label>
                    <Select value={clientId} onValueChange={setClientId}>
                      <SelectTrigger className="h-8 text-xs bg-zinc-850 border-zinc-700 text-zinc-200">
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        {clients.map((c) => (
                          <SelectItem key={c.id} value={c.id} className="text-xs">{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Status Select */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold">Status</label>
                    <Select value={status} onValueChange={(val) => setStatus(val as DemandStatus)}>
                      <SelectTrigger className={cn("h-8 text-xs font-bold border-none text-white", STATUS_CHIP[status])}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DEMAND_STATUSES.map((s) => (
                          <SelectItem key={s} value={s} className="text-xs">{STATUS_LABELS[s]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Priority Select */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold">Prioridade</label>
                    <Select value={priority} onValueChange={(val) => setPriority(val as any)}>
                      <SelectTrigger className={cn("h-8 text-xs font-bold border-none text-white", PRIORITY_CHIP[priority])}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {([ "low", "medium", "high", "urgent" ] as const).map((p) => (
                          <SelectItem key={p} value={p} className="text-xs">{PRIORITY_LABELS[p]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Due Date */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold">Prazo / Entrega</label>
                    <div className="relative">
                      <Input
                        type="date"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                        className="h-8 text-xs bg-zinc-850 border-zinc-700 text-zinc-200"
                      />
                    </div>
                  </div>

                  {/* Assignee Select */}
                  <div className="flex flex-col gap-1 col-span-1 md:col-span-2">
                    <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold flex items-center gap-1">
                      <User className="h-3 w-3 text-zinc-500" /> Responsável
                    </label>
                    <Select value={assigneeId} onValueChange={setAssigneeId}>
                      <SelectTrigger className="h-8 text-xs bg-zinc-850 border-zinc-700 text-zinc-200">
                        <SelectValue placeholder="Selecione um responsável..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none" className="text-xs text-zinc-500 italic">Sem responsável</SelectItem>
                        {profiles.map((p) => (
                          <SelectItem key={p.id} value={p.id} className="text-xs">
                            {p.name} ({p.email})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Rich Editor */}
                <div className="flex-1 flex flex-col min-h-[160px] -mx-6">
                  <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold mb-1.5 block px-6">Descrição</label>
                  <div className="flex-1">
                    <RichEditor
                      content={description}
                      onChange={(html) => setDescription(html)}
                      borderless={true}
                    />
                  </div>
                </div>
              </div>

              {/* Right Panel - Comments */}
              {!isNew && showComments && (
                <div className="w-[360px] md:w-[400px] shrink-0 border-l border-zinc-850 flex flex-col bg-zinc-900/40">
                  <div className="px-4 py-3 border-b border-zinc-800 shrink-0">
                    <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Comentários</h4>
                  </div>

                  {/* Comments list (placed in middle, scrollable) */}
                  <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                    {comments.map((c) => {
                      const initials = c.author_label
                        ? c.author_label.split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase()
                        : "?";
                      return (
                        <div key={c.id} className="flex gap-2.5 group">
                          <div className="h-7 w-7 rounded-full bg-primary/20 text-primary text-[10px] font-bold flex items-center justify-center shrink-0 border border-primary/35">
                            {initials}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline justify-between mb-0.5">
                              <span className="text-xs font-bold text-zinc-200">{c.author_label ?? "Equipe"}</span>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="text-[9px] text-zinc-500">{new Date(c.created_at).toLocaleDateString("pt-BR")}</span>
                                {/* Comment Action Buttons (Pencil / Trash on hover) */}
                                <div className="hidden group-hover:flex items-center gap-1.5 pl-1.5 border-l border-zinc-800/80">
                                  <button
                                    onClick={() => startEditComment(c.id, c.body)}
                                    title="Editar comentário"
                                    className="text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
                                  >
                                    <Pencil className="h-2.5 w-2.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteComment(c.id)}
                                    title="Excluir comentário"
                                    className="text-zinc-500 hover:text-red-400 transition-colors cursor-pointer"
                                  >
                                    <Trash2 className="h-2.5 w-2.5" />
                                  </button>
                                </div>
                              </div>
                            </div>
                            
                            {editingCommentId === c.id ? (
                              <div className="space-y-1.5 mt-1 bg-zinc-850 p-2 rounded-lg border border-zinc-700/60">
                                <textarea
                                  value={editingCommentBody}
                                  onChange={(e) => setEditingCommentBody(e.target.value)}
                                  className="w-full bg-zinc-900 border border-zinc-700 rounded p-1.5 text-xs text-zinc-200 focus:outline-none focus:border-primary/60 min-h-[50px] resize-none"
                                  placeholder="Editar comentário..."
                                />
                                <div className="flex justify-end gap-1.5">
                                  <button
                                    onClick={() => setEditingCommentId(null)}
                                    className="text-[10px] text-zinc-400 hover:text-zinc-200 px-2 py-0.5 rounded hover:bg-zinc-800 transition-colors cursor-pointer"
                                  >
                                    Cancelar
                                  </button>
                                  <button
                                    onClick={() => handleSaveEditComment(c.id)}
                                    className="text-[10px] bg-emerald-600 text-white px-2..5 py-0.5 rounded hover:bg-emerald-500 transition-colors cursor-pointer font-bold"
                                  >
                                    Salvar
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div 
                                className="text-xs text-zinc-300 bg-zinc-800/40 rounded-lg px-2.5 py-1.5 border border-zinc-800 prose prose-invert prose-xs max-w-none break-words [&_p]:m-0"
                                dangerouslySetInnerHTML={{ __html: c.body }}
                              />
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {comments.length === 0 && (
                      <div className="text-center py-8 text-[11px] text-zinc-600">Nenhum comentário.</div>
                    )}
                  </div>

                  {/* Comment Input (placed at bottom) */}
                  <div className="px-4 py-3.5 border-t border-zinc-800 bg-zinc-900/60 shrink-0">
                    <RichEditor
                      content={comment}
                      onChange={(html) => setComment(html)}
                      isChatInput={true}
                      onSubmitChat={handleAddComment}
                      placeholder="Escrever comentário..."
                    />
                  </div>
                </div>
              )}
            </div>

            {/* ── BOTTOM SAVE BAR ── */}
            <div className="shrink-0 border-t border-zinc-800 px-6 py-3.5 flex items-center justify-between bg-zinc-900/60">
              <p className="text-xs text-zinc-500">
                {isDirty ? "Você tem alterações pendentes" : "Sem alterações"}
              </p>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={onClose} className="h-9 px-4 text-xs">
                  Cancelar
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={saving || !isDirty}
                  className="gap-2 px-6 h-9 text-xs font-bold"
                >
                  <Save className="h-3.5 w-3.5" />
                  {saving ? "Salvando..." : isNew ? "Criar Demanda" : "Salvar alterações"}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
