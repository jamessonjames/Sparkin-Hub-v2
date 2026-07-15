import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  listDemands,
  moveDemandStatus,
  createDemand,
  type DemandStatus,
} from "@/lib/demands.functions";
import { listClients } from "@/lib/clients.functions";
import { KanbanBoard } from "@/components/kanban-board";
import { DemandForm, type DemandFormValues } from "@/components/demand-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Plus } from "lucide-react";
import { useDemandOverlay } from "@/contexts/demand-overlay";

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
  const overlay = useDemandOverlay();

  const { data: demands = [] } = useQuery({ queryKey: ["demands"], queryFn: () => listFn() });
  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: () => clientsFn() });

  const [openNew, setOpenNew] = useState(false);
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
    <div className="w-full p-4 md:p-6 space-y-4">
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
          onOpen={(id) => overlay.open(id, clients.map((c) => ({ id: c.id, name: c.name })))}
          onAdd={() => setOpenNew(true)}
        />
      )}

      <Dialog open={openNew} onOpenChange={setOpenNew}>
        <DialogContent className="max-w-3xl w-[calc(100vw-48px)]">
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
    </div>
  );
}