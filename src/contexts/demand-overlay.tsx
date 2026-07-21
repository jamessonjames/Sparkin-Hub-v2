import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

type DemandEntry = {
  demandId: string;
  clients: { id: string; name: string }[];
  defaultClientId?: string;
  defaultStatus?: string;
  defaultClientEditionId?: string;
  defaultAssigneeId?: string;
};

interface DemandOverlayState {
  activeDemand: DemandEntry | null;
  minimizedDemands: DemandEntry[];
  open: (id: string, clients?: { id: string; name: string }[]) => void;
  openNew: (
    clients: { id: string; name: string }[],
    defaultClientId?: string,
    defaultStatus?: string,
    defaultClientEditionId?: string,
    defaultAssigneeId?: string
  ) => void;
  close: () => void;
  minimize: () => void;
  restore: (id: string) => void;
  closeMinimized: (id: string) => void;
}

const DemandOverlayContext = createContext<DemandOverlayState | null>(null);

function makeEntry(
  demandId: string,
  clients?: { id: string; name: string }[],
  defaults?: {
    defaultClientId?: string;
    defaultStatus?: string;
    defaultClientEditionId?: string;
    defaultAssigneeId?: string;
  }
): DemandEntry {
  return {
    demandId,
    clients: clients ?? [],
    defaultClientId: defaults?.defaultClientId,
    defaultStatus: defaults?.defaultStatus,
    defaultClientEditionId: defaults?.defaultClientEditionId,
    defaultAssigneeId: defaults?.defaultAssigneeId,
  };
}

export function DemandOverlayProvider({ children }: { children: ReactNode }) {
  const [activeDemand, setActiveDemand] = useState<DemandEntry | null>(null);
  const [minimizedDemands, setMinimizedDemands] = useState<DemandEntry[]>([]);

  const open = useCallback((id: string, clients?: { id: string; name: string }[]) => {
    setMinimizedDemands((prev) => prev.filter((e) => e.demandId !== id));
    setActiveDemand(makeEntry(id, clients));
  }, []);

  const openNew = useCallback(
    (
      clients: { id: string; name: string }[],
      defaultClientId?: string,
      defaultStatus?: string,
      defaultClientEditionId?: string,
      defaultAssigneeId?: string
    ) => {
      setMinimizedDemands((prev) => prev.filter((e) => e.demandId !== "new"));
      setActiveDemand(
        makeEntry("new", clients, {
          defaultClientId,
          defaultStatus,
          defaultClientEditionId,
          defaultAssigneeId,
        })
      );
    },
    []
  );

  const close = useCallback(() => {
    setActiveDemand(null);
  }, []);

  const minimize = useCallback(() => {
    setActiveDemand((current) => {
      if (!current) return current;
      setMinimizedDemands((prev) => {
        // Max 3 minimized; if already at limit, remove oldest
        const updated = [current, ...prev.filter((e) => e.demandId !== current.demandId)];
        return updated.slice(0, 3);
      });
      return null;
    });
  }, []);

  const restore = useCallback((id: string) => {
    setMinimizedDemands((prev) => {
      const entry = prev.find((e) => e.demandId === id);
      if (entry) {
        setActiveDemand(entry);
      }
      return prev.filter((e) => e.demandId !== id);
    });
  }, []);

  const closeMinimized = useCallback((id: string) => {
    setMinimizedDemands((prev) => prev.filter((e) => e.demandId !== id));
  }, []);

  return (
    <DemandOverlayContext.Provider
      value={{
        activeDemand,
        minimizedDemands,
        open,
        openNew,
        close,
        minimize,
        restore,
        closeMinimized,
      }}
    >
      {children}
    </DemandOverlayContext.Provider>
  );
}

export function useDemandOverlay() {
  const ctx = useContext(DemandOverlayContext);
  if (!ctx) throw new Error("useDemandOverlay must be used inside DemandOverlayProvider");
  return ctx;
}
