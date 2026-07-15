import { createContext, useContext, useState, type ReactNode } from "react";

interface DemandOverlayState {
  demandId: string | null;
  minimized: boolean;
  clients: { id: string; name: string }[];
  open: (id: string, clients?: { id: string; name: string }[]) => void;
  close: () => void;
  minimize: () => void;
  restore: () => void;
}

const DemandOverlayContext = createContext<DemandOverlayState | null>(null);

export function DemandOverlayProvider({ children }: { children: ReactNode }) {
  const [demandId, setDemandId] = useState<string | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);

  function open(id: string, cls?: { id: string; name: string }[]) {
    setDemandId(id);
    setMinimized(false);
    if (cls) setClients(cls);
  }

  function close() {
    setDemandId(null);
    setMinimized(false);
  }

  function minimize() {
    setMinimized(true);
  }

  function restore() {
    setMinimized(false);
  }

  return (
    <DemandOverlayContext.Provider value={{ demandId, minimized, clients, open, close, minimize, restore }}>
      {children}
    </DemandOverlayContext.Provider>
  );
}

export function useDemandOverlay() {
  const ctx = useContext(DemandOverlayContext);
  if (!ctx) throw new Error("useDemandOverlay must be used inside DemandOverlayProvider");
  return ctx;
}
