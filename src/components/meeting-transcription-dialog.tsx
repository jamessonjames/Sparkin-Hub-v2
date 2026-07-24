import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createSuggestion } from "@/lib/suggestions.functions";
import { listClients } from "@/lib/clients.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { toast } from "sonner";
import { Mic, Sparkles } from "lucide-react";

export function MeetingTranscriptionDialog({
  open,
  onOpenChange,
  defaultClientId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultClientId?: string;
}) {
  const qc = useQueryClient();
  const createFn = useServerFn(createSuggestion);
  const listClientsFn = useServerFn(listClients);

  const [clientId, setClientId] = useState(defaultClientId || "");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: () => listClientsFn(),
    enabled: open,
  });

  // Sync defaultClientId when dialog opens
  const handleOpenStateChange = (newOpen: boolean) => {
    if (newOpen && defaultClientId) {
      setClientId(defaultClientId);
    }
    onOpenChange(newOpen);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetClient = clientId || defaultClientId;
    if (!targetClient || !notes.trim()) {
      toast.error("Selecione o cliente e cole a transcrição da reunião.");
      return;
    }

    setIsProcessing(true);
    try {
      await createFn({
        data: {
          client_id: targetClient,
          source: "meeting",
          suggested_type: "NOVA_DEMANDA",
          suggested_title: title.trim() || "Demanda extraída de reunião",
          suggested_description: notes,
          ai_summary: `Transcrição/Ata de Reunião: ${notes.slice(0, 300)}...`,
          raw_content: notes,
          estimated_hours: 2.0,
        },
      });

      toast.success("Reunião processada! As sugestões de demandas foram enviadas para a Caixa de Entrada.", {
        duration: 5000,
      });

      qc.invalidateQueries({ queryKey: ["demand_suggestions"] });
      onOpenChange(false);
      setTitle("");
      setNotes("");
    } catch (err: any) {
      toast.error("Erro ao processar reunião: " + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenStateChange}>
      <DialogContent className="sm:max-w-lg bg-[#1e1e1e] border-white/10 text-foreground">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <div className="p-2 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
              <Mic className="h-5 w-5" />
            </div>
            Transcrever Reunião & Gerar Demandas
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {!defaultClientId && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Cliente Relacionado *</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger className="h-9 text-xs bg-background">
                  <SelectValue placeholder="Selecione o cliente da reunião" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Título / Pauta da Reunião</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Reunião de alinhamento mensal de campanha"
              className="h-9 text-xs bg-background"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Transcrição / Anotações da Reunião *</Label>
            <Textarea
              rows={6}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Cole aqui a ata, anotações ou transcrição do Google Meet, Zoom, Teams..."
              className="text-xs bg-background resize-none"
            />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isProcessing}
              className="bg-purple-600 hover:bg-purple-700 text-white font-semibold gap-1.5"
            >
              <Sparkles className="h-4 w-4" />
              {isProcessing ? "Analisando com IA..." : "Processar Reunião"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
