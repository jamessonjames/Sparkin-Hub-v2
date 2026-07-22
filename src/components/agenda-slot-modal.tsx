import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ListChecks, Pin, Calendar, Clock } from "lucide-react";

interface AgendaSlotModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slotDateTime?: string; // YYYY-MM-DDTHH:mm
  onCreateDemand: () => void;
  onCreateReminder: () => void;
}

export function AgendaSlotModal({
  open,
  onOpenChange,
  slotDateTime,
  onCreateDemand,
  onCreateReminder,
}: AgendaSlotModalProps) {
  let dateFormatted = "";
  let timeFormatted = "";

  if (slotDateTime) {
    const dt = new Date(slotDateTime);
    dateFormatted = dt.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
    timeFormatted = `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[360px] p-5 bg-[#202020] border border-white/10 text-foreground rounded-2xl shadow-2xl space-y-4">
        <DialogHeader>
          <DialogTitle className="text-sm font-bold text-foreground flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            <span>Adicionar no Horário</span>
          </DialogTitle>
          {slotDateTime && (
            <p className="text-xs text-muted-foreground font-medium flex items-center gap-1.5 pt-0.5">
              <Clock className="h-3 w-3" />
              <span>{dateFormatted} às {timeFormatted}</span>
            </p>
          )}
        </DialogHeader>

        <div className="grid grid-cols-1 gap-2.5 pt-1">
          <button
            type="button"
            onClick={() => {
              onOpenChange(false);
              onCreateDemand();
            }}
            className="flex items-center gap-3 p-3.5 rounded-xl border border-white/10 bg-[#262626] hover:bg-[#2e2e2e] hover:border-primary/40 transition-all text-left group cursor-pointer"
          >
            <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <ListChecks className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-foreground group-hover:text-primary transition-colors">Nova Demanda</p>
              <p className="text-[11px] text-muted-foreground">Vincular a um cliente e fluxo do Kanban</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              onOpenChange(false);
              onCreateReminder();
            }}
            className="flex items-center gap-3 p-3.5 rounded-xl border border-white/10 bg-[#262626] hover:bg-[#2e2e2e] hover:border-amber-500/40 transition-all text-left group cursor-pointer"
          >
            <div className="h-9 w-9 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <Pin className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-foreground group-hover:text-amber-400 transition-colors">Adicionar Lembrete</p>
              <p className="text-[11px] text-muted-foreground">Post-it pessoal, checklist ou recorrente</p>
            </div>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
