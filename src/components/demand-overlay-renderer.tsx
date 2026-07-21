import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useDemandOverlay } from "@/contexts/demand-overlay";
import { DemandDetailDialog } from "@/components/demand-detail-dialog";
import { listClients } from "@/lib/clients.functions";
import { Layers, X } from "lucide-react";

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

  const resolvedClients =
    activeDemand && activeDemand.clients.length > 0
      ? activeDemand.clients
      : allClients.map((c) => ({ id: c.id, name: c.name }));

  return (
    <>
      {/* Minimized badges */}
      {minimizedDemands.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 flex gap-2">
          {minimizedDemands.map((entry) => (
            <button
              key={entry.demandId}
              onClick={() => restore(entry.demandId)}
              className="group flex items-center gap-2 bg-zinc-800 border border-zinc-600 rounded-full pl-4 pr-2 py-2 shadow-2xl hover:bg-zinc-700 transition-colors text-sm text-zinc-200"
            >
              <Layers className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="max-w-[160px] truncate">Demanda aberta</span>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  closeMinimized(entry.demandId);
                }}
                className="ml-1 p-0.5 rounded-full hover:bg-zinc-600 text-zinc-500 hover:text-zinc-200 transition-colors"
              >
                <X className="h-3 w-3" />
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Full dialog for the active demand */}
      {activeDemand && (
        <DemandDetailDialog
          id={activeDemand.demandId}
          onClose={close}
          onMinimize={minimize}
          clients={resolvedClients}
          defaultClientId={activeDemand.defaultClientId}
          defaultStatus={activeDemand.defaultStatus}
          defaultClientEditionId={activeDemand.defaultClientEditionId}
          defaultAssigneeId={activeDemand.defaultAssigneeId}
        />
      )}
    </>
  );
}
