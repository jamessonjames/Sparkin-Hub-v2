import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  getDemand,
  updateDemand,
  deleteDemand,
} from "@/lib/demands.functions";
import { listComments, addComment } from "@/lib/comments.functions";
import { DemandForm, type DemandFormValues } from "@/components/demand-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Trash2 } from "lucide-react";

export function DemandDetailDialog({
  id,
  onClose,
  clients,
}: {
  id: string;
  onClose: () => void;
  clients: { id: string; name: string }[];
}) {
  const getFn = useServerFn(getDemand);
  const updateFn = useServerFn(updateDemand);
  const deleteFn = useServerFn(deleteDemand);
  const listCommentsFn = useServerFn(listComments);
  const addCommentFn = useServerFn(addComment);
  const qc = useQueryClient();

  const { data: demand } = useQuery({
    queryKey: ["demand", id],
    queryFn: () => getFn({ data: { id } }),
  });
  const { data: comments = [] } = useQuery({
    queryKey: ["comments", id],
    queryFn: () => listCommentsFn({ data: { demand_id: id } }),
  });

  const [saving, setSaving] = useState(false);
  const [comment, setComment] = useState("");

  async function handleSave(values: DemandFormValues) {
    setSaving(true);
    try {
      await updateFn({ data: { id, ...values } });
      toast.success("Salvo!");
      qc.invalidateQueries({ queryKey: ["demands"] });
      qc.invalidateQueries({ queryKey: ["demand", id] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Excluir esta demanda?")) return;
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

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar demanda</DialogTitle>
        </DialogHeader>
        {demand && (
          <>
            <DemandForm
              clients={clients}
              initial={{
                client_id: demand.client_id,
                title: demand.title,
                description: demand.description,
                status: demand.status,
                priority: demand.priority,
                due_date: demand.due_date,
                estimated_credits: demand.estimated_credits,
                internal_notes: demand.internal_notes,
              }}
              onSubmit={handleSave}
              submitting={saving}
            />

            <div className="pt-6 border-t border-border">
              <h4 className="text-sm font-semibold mb-2">Comentários</h4>
              <div className="space-y-2 mb-3 max-h-60 overflow-y-auto">
                {comments.map((c) => (
                  <div key={c.id} className="text-sm p-2 rounded bg-muted/30">
                    <div className="text-xs text-muted-foreground mb-1">
                      {new Date(c.created_at).toLocaleString("pt-BR")}
                    </div>
                    <div className="whitespace-pre-wrap">{c.body}</div>
                  </div>
                ))}
                {comments.length === 0 && (
                  <p className="text-xs text-muted-foreground">Nenhum comentário ainda.</p>
                )}
              </div>
              <Textarea
                rows={2}
                placeholder="Adicionar comentário..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
              <div className="mt-2 flex justify-between">
                <Button variant="destructive" size="sm" onClick={handleDelete}>
                  <Trash2 className="h-4 w-4 mr-1" /> Excluir demanda
                </Button>
                <Button size="sm" onClick={handleAddComment} disabled={!comment.trim()}>
                  Comentar
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
