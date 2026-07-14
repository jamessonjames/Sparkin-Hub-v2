import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  listDemands,
  moveDemandStatus,
  createDemand,
  updateDemand,
  deleteDemand,
  getDemand,
  type DemandStatus,
} from "@/lib/demands.functions";
import { listClients } from "@/lib/clients.functions";
import { listComments, addComment } from "@/lib/comments.functions";
import { KanbanBoard } from "@/components/kanban-board";
import { DemandForm, type DemandFormValues } from "@/components/demand-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/demands")({
  head: () => ({ meta: [{ title: "Demandas — Creative Flow Hub" }] }),
  component: DemandsPage,
});

function DemandsPage() {
  const listFn = useServerFn(listDemands);
  const clientsFn = useServerFn(listClients);
  const moveFn = useServerFn(moveDemandStatus);
  const createFn = useServerFn(createDemand);
  const qc = useQueryClient();

  const { data: demands = [] } = useQuery({ queryKey: ["demands"], queryFn: () => listFn() });
  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: () => clientsFn() });

  const [openNew, setOpenNew] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function handleMove(id: string, status: DemandStatus) {
    qc.setQueryData<typeof demands>(["demands"], (prev) =>
      (prev ?? []).map((d) => (d.id === id ? { ...d, status } : d)),
    );
    try {
      await moveFn({ data: { id, status } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao mover");
      qc.invalidateQueries({ queryKey: ["demands"] });
    }
  }

  async function handleCreate(values: DemandFormValues) {
    setCreating(true);
    try {
      await createFn({ data: values });
      toast.success("Demanda criada!");
      qc.invalidateQueries({ queryKey: ["demands"] });
      setOpenNew(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl font-bold text-foreground">Demandas</h2>
          <p className="text-sm text-muted-foreground">Arraste os cards entre as colunas.</p>
        </div>
        <Button onClick={() => setOpenNew(true)} disabled={clients.length === 0}>
          <Plus className="h-4 w-4 mr-1" /> Nova demanda
        </Button>
      </div>

      {clients.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Crie um cliente antes de abrir demandas.
        </Card>
      ) : (
        <KanbanBoard
          demands={demands.map((d) => ({
            id: d.id,
            title: d.title,
            status: d.status,
            priority: d.priority,
            due_date: d.due_date,
            clients: d.clients ?? null,
          }))}
          onMove={handleMove}
          onOpen={(id) => setEditId(id)}
        />
      )}

      <Dialog open={openNew} onOpenChange={setOpenNew}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nova demanda</DialogTitle>
          </DialogHeader>
          <DemandForm
            clients={clients.map((c) => ({ id: c.id, name: c.name }))}
            onSubmit={handleCreate}
            submitting={creating}
            submitLabel="Criar"
          />
        </DialogContent>
      </Dialog>

      {editId && (
        <DemandDetailDialog
          id={editId}
          onClose={() => setEditId(null)}
          clients={clients.map((c) => ({ id: c.id, name: c.name }))}
        />
      )}
    </div>
  );
}

function DemandDetailDialog({
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