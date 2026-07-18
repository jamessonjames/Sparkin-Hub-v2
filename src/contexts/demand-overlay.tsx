import { createContext, useContext, useState, type ReactNode } from "react";

interface DemandOverlayState {
  demandId: string | null; // "new" for creation mode, uuid for edit mode, null for closed
  minimized: boolean;
  clients: { id: string; name: string }[];
  defaultClientId?: string;
  defaultStatus?: string;
  defaultClientEditionId?: string;
  open: (id: string, clients?: { id: string; name: string }[]) => void;
  openNew: (clients: { id: string; name: string }[], defaultClientId?: string, defaultStatus?: string, defaultClientEditionId?: string) => void;
  close: () => void;
  minimize: () => void;
  restore: () => void;
}

const DemandOverlayContext = createContext<DemandOverlayState | null>(null);

export function DemandOverlayProvider({ children }: { children: ReactNode }) {
  const [demandId, setDemandId] = useState<string | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [defaultClientId, setDefaultClientId] = useState<string | undefined>(undefined);
  const [defaultStatus, setDefaultStatus] = useState<string | undefined>(undefined);
  const [defaultClientEditionId, setDefaultClientEditionId] = useState<string | undefined>(undefined);

  function open(id: string, cls?: { id: string; name: string }[]) {
    setDemandId(id);
    setMinimized(false);
    setDefaultClientId(undefined);
    setDefaultStatus(undefined);
    setDefaultClientEditionId(undefined);
    if (cls) setClients(cls);
  }

  function openNew(cls: { id: string; name: string }[], defaultClientId?: string, defaultStatus?: string, defaultClientEditionId?: string) {
    setDemandId("new");
    setMinimized(false);
    setClients(cls);
    setDefaultClientId(defaultClientId || cls[0]?.id);
    setDefaultStatus(defaultStatus || "nao_iniciado");
    setDefaultClientEditionId(defaultClientEditionId);
  }

  function close() {
    setDemandId(null);
    setMinimized(false);
    setDefaultClientId(undefined);
    setDefaultStatus(undefined);
    setDefaultClientEditionId(undefined);
  }

  function minimize() {
    setMinimized(true);
  }

  function restore() {
    setMinimized(false);
  }

  return (
    <DemandOverlayContext.Provider
      value={{
        demandId,
        minimized,
        clients,
        defaultClientId,
        defaultStatus,
        defaultClientEditionId,
        open,
        openNew,
        close,
        minimize,
        restore,
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
