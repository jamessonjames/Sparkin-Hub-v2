import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useDemandOverlay } from "@/contexts/demand-overlay";
import { DemandDetailDialog } from "@/components/demand-detail-dialog";
import { listClients } from "@/lib/clients.functions";
import { Layers } from "lucide-react";

export function DemandOverlayRenderer() {
  const {
    demandId,
    minimized,
    clients,
    defaultClientId,
    defaultStatus,
    defaultClientEditionId,
    close,
    minimize,
    restore,
  } = useDemandOverlay();

  const listClientsFn = useServerFn(listClients);
  const { data: allClients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: () => listClientsFn(),
  });

  const resolvedClients = clients.length > 0 ? clients : allClients.map((c) => ({ id: c.id, name: c.name }));

  if (!demandId) return null;

  if (minimized) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <button
          onClick={restore}
          className="flex items-center gap-2 bg-zinc-800 border border-zinc-600 rounded-full px-4 py-2 shadow-2xl hover:bg-zinc-700 transition-colors text-sm text-zinc-200 group"
        >
          <Layers className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="max-w-[180px] truncate">Demanda aberta</span>
          <span className="text-xs text-zinc-500 group-hover:text-zinc-300 ml-1">← clique para restaurar</span>
        </button>
      </div>
    );
  }

  return (
    <DemandDetailDialog
      id={demandId}
      onClose={close}
      onMinimize={minimize}
      clients={resolvedClients}
      defaultClientId={defaultClientId}
      defaultStatus={defaultStatus}
      defaultClientEditionId={defaultClientEditionId}
    />
  );
}
