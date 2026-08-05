import { lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useDemandOverlay } from "@/contexts/demand-overlay";
import { listClients } from "@/lib/clients.functions";
import { listDemands } from "@/lib/demands.functions";
import { Layers, X } from "lucide-react";
const DemandDetailDialogLazy = lazy(() => import("@/components/demand-detail-dialog").then(m => ({ default: m.DemandDetailDialog })));

export function DemandOverlayRenderer() {
  const {
    activeDemand,
    minimizedDemands,
    close,
    minimize,
    restore,
    closeMinimized,
  } = useDemandOverlay();

  const listClientsFn = useServerFn(listClients);
  const { data: allClients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: () => listClientsFn(),
  });

  const listDemandsFn = useServerFn(listDemands);
  const { data: allDemands = [] } = useQuery({
    queryKey: ["demands"],
    queryFn: () => listDemandsFn(),
    enabled: !!activeDemand || minimizedDemands.length > 0,
    staleTime: 2 * 60 * 1000,
  });

  const demandsMap = new Map(allDemands.map((d: any) => [d.id, d]));

  const resolvedClients =
    activeDemand && activeDemand.clients.length > 0
      ? activeDemand.clients
      : allClients.map((c: any) => ({ id: c.id, name: c.name }));

  return (
    <>
      {/* Minimized badges */}
      {minimizedDemands.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 flex gap-2">
          {minimizedDemands.map((entry) => {
            const demand = demandsMap.get(entry.demandId) as
              | { title: string; clients?: { id: string; name: string } | null }
              | undefined;
            const clientName = demand?.clients?.name;
            return (
              <button
                key={entry.demandId}
                onClick={() => restore(entry.demandId)}
                className="group flex flex-col items-start bg-zinc-800 border border-zinc-600 rounded-2xl px-4 py-2.5 shadow-2xl hover:bg-zinc-700 transition-colors text-sm text-zinc-200 min-w-0 max-w-[220px]"
              >
                {clientName && (
                  <span className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider leading-none mb-1">
                    {clientName}
                  </span>
                )}
                <div className="flex items-center gap-2 w-full">
                  <Layers className="h-3 w-3 text-primary shrink-0" />
                  <span className="truncate text-xs font-medium">
                    {demand?.title ?? "Demanda"}
                  </span>
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      closeMinimized(entry.demandId);
                    }}
                    className="ml-auto p-0.5 rounded-full hover:bg-zinc-600 text-zinc-500 hover:text-zinc-200 transition-colors shrink-0"
                  >
                    <X className="h-3 w-3" />
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Full dialog for the active demand */}
      {activeDemand && (
        <Suspense fallback={<div className="fixed inset-0 z-50 grid place-items-center bg-black/60 text-sm text-muted-foreground">Carregando...</div>}>
          <DemandDetailDialogLazy
            id={activeDemand.demandId}
            onClose={close}
            onMinimize={minimize}
            clients={resolvedClients}
            defaultClientId={activeDemand.defaultClientId}
            defaultStatus={activeDemand.defaultStatus}
            defaultClientEditionId={activeDemand.defaultClientEditionId}
            defaultAssigneeId={activeDemand.defaultAssigneeId}
            defaultDueDate={activeDemand.defaultDueDate}
            defaultEstimatedHours={activeDemand.defaultEstimatedHours}
          />
        </Suspense>
      )}
    </>
  );
}
