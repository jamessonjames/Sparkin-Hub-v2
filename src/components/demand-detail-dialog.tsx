import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  getDemand,
  updateDemand,
  deleteDemand,
  moveDemandStatus,
  type DemandStatus,
  DEMAND_STATUSES,
} from "@/lib/demands.functions";
import { listComments, addComment } from "@/lib/comments.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { STATUS_LABELS, PRIORITY_LABELS } from "@/lib/demand-labels";
import { RichEditor } from "@/components/rich-editor";
import { Trash2, Send, Calendar, X, Save } from "lucide-react";
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
  low:    "bg-zinc-700 text-zinc-300",
  medium: "bg-blue-800 text-blue-200",
  high:   "bg-amber-800 text-amber-200",
  urgent: "bg-red-800 text-red-200",
};

export function DemandDetailDialog({
  id,
  onClose,
  onMinimize,
  clients,
}: {
  id: string;
  onClose: () => void;
  onMinimize?: () => void;
  clients: { id: string; name: string }[];
}) {
  const getFn = useServerFn(getDemand);
  const updateFn = useServerFn(updateDemand);
  const deleteFn = useServerFn(deleteDemand);
  const moveFn = useServerFn(moveDemandStatus);
  const listCommentsFn = useServerFn(listComments);
  const addCommentFn = useServerFn(addComment);
  const qc = useQueryClient();

  const { data: demand, isLoading } = useQuery({
    queryKey: ["demand", id],
    queryFn: () => getFn({ data: { id } }),
  });
  const { data: comments = [] } = useQuery({
    queryKey: ["comments", id],
    queryFn: () => listCommentsFn({ data: { demand_id: id } }),
  });

  const [title, setTitle] = useState<string | null>(null);       // null = not edited
  const [description, setDescription] = useState<string | null>(null); // null = not edited
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [showComments, setShowComments] = useState(true);

  const currentTitle = title ?? demand?.title ?? "";
  const currentDesc = description ?? demand?.description ?? "";

  async function handleStatusChange(status: string) {
    if (!demand) return;
    try {
      await moveFn({ data: { id, status: status as DemandStatus } });
      qc.invalidateQueries({ queryKey: ["demand", id] });
      qc.invalidateQueries({ queryKey: ["demands"] });
      toast.success("Status atualizado!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  async function handleSave() {
    if (!demand) return;
    if (!currentTitle.trim()) { toast.error("O título não pode ficar vazio."); return; }
    setSaving(true);
    try {
      await updateFn({
        data: {
          id,
          client_id: demand.client_id,
          title: currentTitle,
          description: currentDesc,
          status: demand.status,
          priority: demand.priority,
          due_date: demand.due_date,
          estimated_credits: demand.estimated_credits,
          internal_notes: demand.internal_notes,
        },
      });
      toast.success("Alterações salvas!");
      qc.invalidateQueries({ queryKey: ["demand", id] });
      qc.invalidateQueries({ queryKey: ["demands"] });
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
    if (!comment.trim()) return;
    try {
      await addCommentFn({ data: { demand_id: id, body: comment } });
      setComment("");
      qc.invalidateQueries({ queryKey: ["comments", id] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  const isDirty = title !== null || description !== null;

  // Full-screen overlay
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 md:p-8">
      <div className="relative w-full h-full bg-zinc-900 border border-zinc-700/60 rounded-2xl flex flex-col overflow-hidden shadow-2xl">

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center text-zinc-500">Carregando...</div>
        ) : demand ? (
          <>
            {/* ── TOP BAR ── */}
            <div className="flex items-center gap-2 px-5 py-3 border-b border-zinc-700/40 shrink-0 flex-wrap">
              <Select value={demand.status} onValueChange={handleStatusChange}>
                <SelectTrigger className={cn(
                  "h-7 w-auto min-w-[110px] text-xs font-bold border-none px-3 rounded-full",
                  STATUS_CHIP[demand.status],
                )}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEMAND_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <span className={cn("text-[11px] font-semibold px-2.5 py-1 rounded-full", PRIORITY_CHIP[demand.priority])}>
                {PRIORITY_LABELS[demand.priority]}
              </span>

              {demand.due_date && (
                <span className="flex items-center gap-1 text-xs text-zinc-400">
                  <Calendar className="h-3 w-3" />
                  {demand.due_date}
                </span>
              )}

                <div className="ml-auto flex items-center gap-1">
                  <button
                    onClick={() => setShowComments((v) => !v)}
                    className="text-xs text-zinc-500 hover:text-zinc-300 px-2 py-1 rounded hover:bg-zinc-700/40 transition-colors"
                  >
                    {showComments ? "Ocultar comentários" : "Comentários"}
                  </button>
                  {onMinimize && (
                    <button
                      onClick={onMinimize}
                      title="Minimizar"
                      className="p-1.5 text-zinc-600 hover:text-zinc-300 hover:bg-zinc-700/40 rounded transition-colors"
                      aria-label="Minimizar"
                    >
                      {/* Minimise icon — a horizontal bar */}
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <rect x="2" y="9" width="10" height="1.5" rx="0.75" fill="currentColor"/>
                      </svg>
                    </button>
                  )}
                  <button
                    onClick={onClose}
                    title="Fechar"
                    className="p-1.5 text-zinc-600 hover:text-zinc-300 hover:bg-zinc-700/40 rounded transition-colors"
                    aria-label="Fechar"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
            </div>

            {/* ── MAIN BODY ── */}
            <div className="flex flex-1 min-h-0">

              {/* Left — content editor */}
              <div className="flex-1 overflow-y-auto px-6 md:px-10 py-6 flex flex-col gap-5">

                {/* Client */}
                {demand.clients && (
                  <p className="text-xs text-zinc-500">
                    Cliente: <span className="text-zinc-300 font-semibold">{(demand.clients as { name: string }).name}</span>
                  </p>
                )}

                {/* Title */}
                <div>
                  <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mb-1 block">Título</label>
                  <Input
                    value={currentTitle}
                    onChange={(e) => setTitle(e.target.value)}
                    className="text-xl font-bold bg-transparent border-transparent hover:border-zinc-600 focus:border-primary/60 text-zinc-50 px-2 transition-colors text-xl"
                    placeholder="Título da demanda..."
                  />
                </div>

                {/* Description — Rich Editor */}
                <div className="flex-1 flex flex-col">
                  <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mb-1 block">Descrição</label>
                  <div className="flex-1">
                    <RichEditor
                      content={currentDesc}
                      onChange={(html) => setDescription(html)}
                    />
                  </div>
                </div>

                {/* Credits */}
                {demand.estimated_credits != null && (
                  <p className="text-xs text-zinc-500">
                    Créditos estimados: <span className="text-zinc-200 font-semibold">{demand.estimated_credits}</span>
                  </p>
                )}
              </div>

              {/* Right — Comments */}
              {showComments && (
                <div className="w-[360px] shrink-0 border-l border-zinc-700/40 flex flex-col bg-zinc-900/80">
                  <div className="px-4 py-3 border-b border-zinc-700/40">
                    <h4 className="text-sm font-semibold text-zinc-200">Comentários e atividade</h4>
                  </div>

                  {/* Comment input */}
                  <div className="px-4 py-3 border-b border-zinc-700/40 space-y-2">
                    <Textarea
                      rows={3}
                      placeholder="Escrever um comentário... (Ctrl+Enter para enviar)"
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && e.ctrlKey) handleAddComment(); }}
                      className="bg-zinc-800/70 border-zinc-700 text-zinc-100 text-sm resize-none placeholder:text-zinc-600 focus:border-primary/50"
                    />
                    <Button
                      size="sm"
                      className="w-full gap-1.5"
                      onClick={handleAddComment}
                      disabled={!comment.trim()}
                    >
                      <Send className="h-3.5 w-3.5" />
                      Comentar
                    </Button>
                  </div>

                  {/* Comments list */}
                  <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
                    {comments.map((c) => {
                      const initials = c.author_label
                        ? c.author_label.split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase()
                        : "?";
                      return (
                        <div key={c.id} className="flex gap-2.5">
                          <div className="h-8 w-8 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center shrink-0 mt-0.5 border border-primary/20">
                            {initials}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2 mb-1">
                              <span className="text-xs font-semibold text-zinc-200">{c.author_label ?? "Equipe"}</span>
                              <span className="text-[10px] text-zinc-600">{new Date(c.created_at).toLocaleString("pt-BR")}</span>
                            </div>
                            <div className="text-sm text-zinc-300 bg-zinc-800/50 rounded-xl px-3 py-2 border border-zinc-700/30 whitespace-pre-wrap leading-relaxed">
                              {c.body}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {comments.length === 0 && (
                      <div className="text-center py-6">
                        <p className="text-xs text-zinc-600">Nenhum comentário ainda.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* ── BOTTOM BAR — Save ── */}
            <div className="shrink-0 border-t border-zinc-700/40 px-6 py-3 flex items-center justify-between bg-zinc-900/60">
              <p className="text-xs text-zinc-600">
                {isDirty ? "Você tem alterações não salvas" : "Sem alterações pendentes"}
              </p>
              <Button
                onClick={handleSave}
                disabled={saving}
                className="gap-2 px-6"
              >
                <Save className="h-4 w-4" />
                {saving ? "Salvando..." : "Salvar alterações"}
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
