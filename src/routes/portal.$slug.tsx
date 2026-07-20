import { createFileRoute, notFound } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPublicPortal, updatePortalDemandsOrder } from "@/lib/portal.functions";
import { DemandDetailDialog, type PortalInitialDemand } from "@/components/demand-detail-dialog";
import { KanbanBoard, type KanbanDemand } from "@/components/kanban-board";
import type { DemandStatus } from "@/lib/demands.functions";
import { cn } from "@/lib/utils";
import { STATUS_LABELS, PRIORITY_LABELS } from "@/lib/demand-labels";
import { LayoutList, Columns2, Plus, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreditProgressBar } from "@/components/credit-progress-bar";

export const Route = createFileRoute("/portal/$slug")({
  loader: async ({ params }) => {
    const data = await getPublicPortal({ data: { slug: params.slug } });
    if (!data) throw notFound();
    return data;
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData ? `Portal · ${loaderData.client.name}` : "Portal" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
      { name: "googlebot", content: "noindex, nofollow" },
    ],
  }),
  errorComponent: () => (
    <div className="min-h-screen grid place-items-center p-6 text-muted-foreground">
      Erro ao carregar portal.
    </div>
  ),
  notFoundComponent: () => (
    <div className="min-h-screen grid place-items-center p-6 text-muted-foreground">
      Portal não encontrado ou inativo.
    </div>
  ),
  component: PortalPage,
});

const STATUS_CHIP: Record<string, string> = {
  nao_iniciado: "bg-zinc-700 text-zinc-200",
  fazendo:      "bg-blue-700 text-blue-100",
  para_analise: "bg-purple-700 text-purple-100",
  com_ajustes:  "bg-amber-700 text-amber-100",
  concluido:    "bg-emerald-700 text-emerald-100",
};

const PRIORITY_CHIP: Record<string, string> = {
  low:    "bg-zinc-500 text-white",
  medium: "bg-blue-50 text-white",
  high:   "bg-amber-500 text-white",
  urgent: "bg-red-500 text-white",
};

type PortalDemand = PortalInitialDemand & {
  created_at: string;
  sort_order?: number | null;
};

function PortalPage() {
  const params = Route.useParams();
  const slug = params.slug;
  const getPortalFn = useServerFn(getPublicPortal);

  // Poll database to get real-time status updates from the admin area
  const { data } = useQuery({
    queryKey: ["portal-data", slug],
    queryFn: () => getPortalFn({ data: { slug } }),
    initialData: Route.useLoaderData(),
    refetchInterval: 5000, // Poll every 5 seconds
  });

  const client = data.client;
  const initialDemands = data.demands;
  const creditConfig = (data as any).creditConfig;

  const [view, setView] = useState<"list" | "kanban">("kanban");
  const [demands, setDemands] = useState<PortalDemand[]>(initialDemands as PortalDemand[]);

  // Sync server updates with local client state
  useEffect(() => {
    if (initialDemands) {
      setDemands(initialDemands as PortalDemand[]);
    }
  }, [initialDemands]);

  // Compute total credits consumed in the current calendar month
  const currentMonthCredits = useMemo(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

    return demands
      .filter((d) => {
        if (d.status !== "concluido") return false;
        if (!d.due_date) return false;
        const dateStr = d.due_date.slice(0, 10);
        return dateStr >= startOfMonth && dateStr <= endOfMonth;
      })
      .reduce((sum, d) => sum + (d.estimated_credits || 0), 0);
  }, [demands]);

  // Dialog state: null = closed, "new" = create, uuid = detail
  const [openDialogId, setOpenDialogId] = useState<string | null>(null);
  const [defaultStatus, setDefaultStatus] = useState<string>("nao_iniciado");

  const reorderFn = useServerFn(updatePortalDemandsOrder);

  const selectedDemand = openDialogId && openDialogId !== "new"
    ? demands.find((d) => d.id === openDialogId) ?? null
    : null;

  function openNew(status = "nao_iniciado") {
    setDefaultStatus(status);
    setOpenDialogId("new");
  }

  async function handleReorder(updates: { id: string; status: DemandStatus; sort_order: number }[]) {
    setDemands((prev) => {
      const map = new Map(updates.map((u) => [u.id, u]));
      return prev.map((d) => {
        const u = map.get(d.id);
        return u ? { ...d, status: u.status, sort_order: u.sort_order } : d;
      });
    });
    try {
      await reorderFn({ data: { slug, updates } });
    } catch { /* silent */ }
  }

  function handleMove(id: string, status: DemandStatus) {
    if (status === "fazendo" || status === "para_analise") return;
    setDemands((prev) => prev.map((d) => (d.id === id ? { ...d, status } : d)));
    const updates = demands.map((d, i) => ({
      id: d.id,
      status: (d.id === id ? status : d.status) as DemandStatus,
      sort_order: i,
    }));
    reorderFn({ data: { slug, updates } }).catch(() => {});
  }

  const kanbanDemands: KanbanDemand[] = demands.map((d) => ({
    id: d.id,
    title: d.title,
    status: d.status,
    priority: d.priority ?? "medium",
    due_date: d.due_date,
    sort_order: d.sort_order,
  }));

  const active = demands.filter((d) => d.status !== "concluido");
  const done = demands.filter((d) => d.status === "concluido");

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      {/* Header */}
      <header className="border-b border-border shrink-0">
        <div className="px-6 py-5 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">
                Portal do cliente
              </p>
              <span className="text-xs text-muted-foreground/45 select-none">
                · Link privado - não compartilhe publicamente
              </span>
            </div>
            <h1 className="text-2xl font-bold text-foreground">{client.name}</h1>
            {client.contact_name && (
              <p className="text-sm text-muted-foreground mt-0.5">{client.contact_name}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex items-center rounded-lg border border-border overflow-hidden bg-surface-2/30">
              <button
                onClick={() => setView("list")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-all",
                  view === "list" ? "bg-surface-2 text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <LayoutList className="h-3.5 w-3.5" />
                Lista
              </button>
              <button
                onClick={() => setView("kanban")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-all",
                  view === "kanban" ? "bg-surface-2 text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Columns2 className="h-3.5 w-3.5" />
                Kanban
              </button>
            </div>

            <Button size="sm" onClick={() => openNew()} className="flex items-center gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              Abrir demanda
            </Button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 flex flex-col px-4 pt-4 md:px-6 md:pt-6 min-h-0 overflow-hidden">
        {client.billing_model === "credits" && creditConfig?.show_progress_bar === true && (
          <div className="mb-4 shrink-0">
            <CreditProgressBar
              totalCredits={currentMonthCredits}
              tiers={creditConfig.tiers}
              title="Seu consumo de créditos neste mês"
            />
          </div>
        )}

        {view === "list" ? (
          <div className="flex-1 overflow-y-auto space-y-6 pb-6">
            <section>
              <h2 className="text-sm font-semibold mb-3 text-foreground">
                Em andamento <span className="text-muted-foreground font-normal">({active.length})</span>
              </h2>
              {active.length === 0 ? (
                <p className="text-muted-foreground text-sm">Nenhuma demanda em andamento.</p>
              ) : (
                <div className="grid gap-2">
                  {active.map((d) => (
                    <ListDemandRow key={d.id} d={d} onClick={() => setOpenDialogId(d.id)} />
                  ))}
                </div>
              )}
            </section>

            {done.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold mb-3 text-foreground">
                  Concluídas <span className="text-muted-foreground font-normal">({done.length})</span>
                </h2>
                <div className="grid gap-2">
                  {done.map((d) => (
                    <ListDemandRow key={d.id} d={d} onClick={() => setOpenDialogId(d.id)} />
                  ))}
                </div>
              </section>
            )}
          </div>
        ) : (
          <KanbanBoard
            demands={kanbanDemands}
            onMove={handleMove}
            onOpen={(id) => setOpenDialogId(id)}
            onAdd={(status) => {
              if (status === "fazendo") return;
              openNew(status);
            }}
            onReorder={handleReorder}
            isClientPortal={true}
            showSearch={true}
          />
        )}
      </main>

      {/* The one shared DemandDetailDialog — in portal mode */}
      {openDialogId && (
        <DemandDetailDialog
          id={openDialogId}
          onClose={() => setOpenDialogId(null)}
          clients={[]}
          defaultStatus={defaultStatus}
          portalMode={true}
          portalSlug={slug}
          portalClientName={client.name}
          portalBillingModel={client.billing_model}
          portalCreditsEnabled={creditConfig?.show_progress_bar ?? false}
          initialDemandData={selectedDemand ?? undefined}
          onPortalDemandCreated={(newDemand) => {
            setDemands((prev) => [{ ...newDemand, created_at: new Date().toISOString() }, ...prev]);
          }}
          onPortalDemandUpdated={(updated) => {
            setDemands((prev) =>
              prev.map((d) => (d.id === updated.id ? { ...d, ...updated } : d)),
            );
          }}
        />
      )}
    </div>
  );
}

function ListDemandRow({
  d,
  onClick,
}: {
  d: PortalDemand;
  onClick: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = d.due_date && d.due_date.slice(0, 10) < today;

  return (
    <div
      onClick={onClick}
      className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border bg-card hover:bg-surface-2/50 cursor-pointer transition-all"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{d.title}</p>
      </div>
      <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0", STATUS_CHIP[d.status])}>
        {(STATUS_LABELS as Record<string, string>)[d.status] ?? d.status}
      </span>
      {d.priority && (
        <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0", PRIORITY_CHIP[d.priority])}>
          {PRIORITY_LABELS[d.priority]}
        </span>
      )}
      {d.due_date && (
        <span className={cn("flex items-center gap-1 text-[10px] font-medium shrink-0", isOverdue ? "text-red-500" : "text-muted-foreground")}>
          <Calendar className="h-3 w-3" />
          {new Date(d.due_date).toLocaleDateString("pt-BR")}
        </span>
      )}
    </div>
  );
}
