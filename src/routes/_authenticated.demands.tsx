import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useMemo } from "react";
import {
  listDemands,
  moveDemandStatus,
  updateDemandsOrder,
  type DemandStatus,
} from "@/lib/demands.functions";
import { listClients } from "@/lib/clients.functions";
import { KanbanBoard } from "@/components/kanban-board";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus } from "lucide-react";
import { useDemandOverlay } from "@/contexts/demand-overlay";
import { getClientCreditTiers } from "@/lib/credit-tiers";
import { CreditProgressBar } from "@/components/credit-progress-bar";

function ClientCreditProgressWrapper({
  client,
  demands,
}: {
  client: { id: string; name: string };
  demands: any[];
}) {
  const getTiersFn = useServerFn(getClientCreditTiers);

  const { data: creditConfig } = useQuery({
    queryKey: ["client-credit-tiers", client.id],
    queryFn: () => getTiersFn({ data: { client_id: client.id } }),
  });

  const monthlyCredits = useMemo(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

    return demands
      .filter((d) => {
        const dClientId = d.client_id || d.clients?.id || (d.clients as any)?.id;
        if (dClientId !== client.id) return false;
        if (d.status !== "concluido") return false;
        if (!d.due_date) return false;
        const dateStr = d.due_date.slice(0, 10);
        return dateStr >= startOfMonth && dateStr <= endOfMonth;
      })
      .reduce((sum, d) => sum + (d.estimated_credits || 0), 0);
  }, [demands, client.id]);

  if (!creditConfig) return null;

  return (
    <CreditProgressBar
      totalCredits={monthlyCredits}
      tiers={creditConfig.tiers}
      title={`Consumo de créditos: ${client.name}`}
    />
  );
}

export const Route = createFileRoute("/_authenticated/demands")({
  head: () => ({ meta: [{ title: "Demandas — Creative Flow Hub" }] }),
  component: DemandsPage,
});

function DemandsPage() {
  const listFn = useServerFn(listDemands);
  const clientsFn = useServerFn(listClients);
  const moveFn = useServerFn(moveDemandStatus);
  const reorderFn = useServerFn(updateDemandsOrder);
  const qc = useQueryClient();
  const overlay = useDemandOverlay();

  const { data: demands = [] } = useQuery({ queryKey: ["demands"], queryFn: () => listFn() });
  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: () => clientsFn() });

  const creditClients = useMemo(() => {
    return clients.filter((c) => c.billing_model === "credits");
  }, [clients]);

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

  async function handleReorder(updates: { id: string; status: DemandStatus; sort_order: number }[]) {
    // Optimistically update local cache
    qc.setQueryData<typeof demands>(["demands"], (prev) => {
      if (!prev) return prev;
      const map = new Map(updates.map((u) => [u.id, u]));
      return prev.map((d) => {
        const u = map.get(d.id);
        return u ? { ...d, status: u.status, sort_order: u.sort_order } : d;
      });
    });
    try {
      await reorderFn({ data: { updates } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao reordenar");
      qc.invalidateQueries({ queryKey: ["demands"] });
    }
  }

  const resolvedClients = clients.map((c) => ({ id: c.id, name: c.name }));

  return (
    <div className="flex flex-col h-full p-4 md:p-6 gap-4">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h2 className="font-display text-2xl font-bold text-foreground">Demandas</h2>
          <p className="text-sm text-muted-foreground">Arraste os cards entre as colunas para mover ou reordenar.</p>
        </div>
        <Button
          onClick={() => overlay.openNew(resolvedClients)}
          disabled={clients.length === 0}
        >
          <Plus className="h-4 w-4 mr-1" /> Nova demanda
        </Button>
      </div>

      {clients.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Crie um cliente antes de abrir demandas.
        </Card>
      ) : (
        <>
          {creditClients.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 shrink-0 mb-2">
              {creditClients.map((c) => (
                <ClientCreditProgressWrapper
                  key={c.id}
                  client={c}
                  demands={demands}
                />
              ))}
            </div>
          )}

          <KanbanBoard
            demands={demands.map((d) => ({
            id: d.id,
            title: d.title,
            status: d.status,
            priority: d.priority,
            due_date: d.due_date,
            clients: d.clients ?? null,
            sort_order: (d as any).sort_order ?? null,
          }))}
          onMove={handleMove}
          onOpen={(id) => overlay.open(id, resolvedClients)}
          onAdd={(status) => overlay.openNew(resolvedClients, undefined, status)}
          onReorder={handleReorder}
          showSearch={true}
        />
        </>
      )}
    </div>
  );
}