import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { triggerWhatsAppScan } from "@/lib/suggestions.functions";
import { useUserContext } from "@/contexts/user-context";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Inbox as InboxIcon,
  RefreshCw,
} from "lucide-react";
import { DemandTriageView } from "@/components/demand-triage-view";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/inbox")({
  component: InboxPage,
});

function InboxPage() {
  const triggerScanFn = useServerFn(triggerWhatsAppScan);
  const { currentRole } = useUserContext();
  const isAdminOrOwner = currentRole === "PROPRIETARIO" || currentRole === "GESTOR";

  const [isScanning, setIsScanning] = useState(false);

  const handleScanWhatsApp = async () => {
    setIsScanning(true);
    try {
      await triggerScanFn();
      toast.success("Varredura do WhatsApp iniciada!");
    } catch (err: any) {
      toast.error("Erro ao iniciar varredura: " + err.message);
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div className="w-full p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-border/40 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
            <InboxIcon className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Triagem de Demandas (IA)</h1>
            <p className="text-xs text-muted-foreground">
              Central de reuniões transcritas e demandas pré-analisadas pela IA (WhatsApp, Reuniões e E-mails)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isAdminOrOwner && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleScanWhatsApp}
              disabled={isScanning}
              className="gap-2 border-emerald-500/30 hover:bg-emerald-500/10 text-emerald-300 text-xs font-semibold"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isScanning && "animate-spin")} />
              Varrer WhatsApp Agora
            </Button>
          )}
        </div>
      </div>

      {/* Unified Triage View Component */}
      <DemandTriageView />
    </div>
  );
}
