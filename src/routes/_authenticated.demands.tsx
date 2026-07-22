import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
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
import { Input } from "@/components/ui/input";
import { useSidebar } from "@/components/ui/sidebar";
import { Plus, Search, X, Star } from "lucide-react";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useDemandOverlay } from "@/contexts/demand-overlay";
import { useUserContext } from "@/contexts/user-context";

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
  const { currentUserRole, selectedUserId, setSelectedUserId, defaultUserId, setDefaultUserId, profiles, currentUser } = useUserContext();
  const isAdminOrOwner = currentUserRole === "owner" || currentUserRole === "admin";
  const activeUserId = selectedUserId ?? currentUser?.id ?? null;
  const isDefaultUser = defaultUserId ? defaultUserId === activeUserId : activeUserId === currentUser?.id;
  const { state: sidebarState } = useSidebar();
  const sidebarWidth = sidebarState === "collapsed" ? 48 : 256;
  const [search, setSearch] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: demands = [] } = useQuery({
    queryKey: ["demands", selectedUserId],
    queryFn: () => listFn({ data: isAdminOrOwner && selectedUserId ? { assigneeUserId: selectedUserId } : {} }),
  });
  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: () => clientsFn() });

  async function handleMove(id: string, status: DemandStatus) {
    qc.setQueryData<typeof demands>(["demands", selectedUserId], (prev) =>
      (prev ?? []).map((d) => (d.id === id ? { ...d, status } : d)),
    );
    try {
      await moveFn({ data: { id, status } });
    } catch (e) {
      console.error("[handleMove] moveFn failed", e);
      toast.error(e instanceof Error ? e.message : "Erro ao mover");
      qc.invalidateQueries({ queryKey: ["demands", selectedUserId] });
    }
  }

  async function handleReorder(updates: { id: string; status: DemandStatus; sort_order: number }[]) {
    qc.setQueryData<typeof demands>(["demands", selectedUserId], (prev) => {
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
      qc.invalidateQueries({ queryKey: ["demands", selectedUserId] });
    }
  }

  const resolvedClients = clients.map((c) => ({ id: c.id, name: c.name }));

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="w-full max-w-[1400px] mx-auto px-4 md:px-6 pt-4 md:pt-6 pb-12 shrink-0">
        <div className="w-full flex items-center justify-between gap-4">
          <div className="min-w-0 shrink-0">
            <h2 className="font-display text-2xl font-bold text-foreground">Demandas</h2>
            <p className="text-sm text-muted-foreground">Arraste os cards entre as colunas para mover ou reordenar.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative w-56">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                placeholder="Buscar demandas..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-8 py-2 text-sm rounded-lg border border-border bg-surface-2/40 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring transition-all"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <Button
              onClick={() => overlay.openNew(resolvedClients, undefined, undefined, undefined, isAdminOrOwner && selectedUserId ? selectedUserId : undefined)}
              disabled={clients.length === 0}
              style={{ backgroundColor: "#2783de" }}
              className="hover:opacity-90 border-0"
            >
              <Plus className="h-4 w-4 mr-1" /> Demanda
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        {clients.length === 0 ? (
          <div className="w-full max-w-[1400px] mx-auto px-4 md:px-6 pb-4 md:pb-6">
            <Card className="p-8 text-center text-sm text-muted-foreground">
              Crie um cliente antes de abrir demandas.
            </Card>
          </div>
        ) : (
          <div
            ref={scrollRef}
            className="flex flex-col flex-1 min-w-0 min-h-0 overflow-x-auto"
            style={{ paddingLeft: `max(0px, calc((100vw - ${sidebarWidth}px - 1400px) / 2))` }}
          >
          <KanbanBoard
            scrollRef={scrollRef}
            demands={demands.map((d) => ({
              id: d.id,
              title: d.title,
              status: d.status,
              priority: d.priority,
              due_date: d.due_date,
              clients: d.clients ?? null,
              sort_order: (d as any).sort_order ?? null,
              assignee_user_id: d.assignee_user_id ?? null,
              comments_count: (d as any).comments_count ?? 0,
            }))}
            onMove={handleMove}
            onOpen={(id) => overlay.open(id, resolvedClients)}
            onAdd={(status) => overlay.openNew(resolvedClients, undefined, status, undefined, isAdminOrOwner && selectedUserId ? selectedUserId : undefined)}
            onReorder={handleReorder}
            showSearch={false}
            search={search}
            onSearchChange={setSearch}
          />
          </div>
        )}
      </div>
    </div>
  );
}