import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listSuggestions,
  dismissSuggestion,
  deleteSuggestionPermanently,
  clearAllDismissedSuggestions,
  type DemandSuggestion,
} from "@/lib/suggestions.functions";
import { listClients } from "@/lib/clients.functions";
import { MeetingDetailModal } from "@/components/meeting-detail-modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Mic,
  MessageSquare,
  Mail,
  Trash2,
  XCircle,
  FileText,
  Clock,
  Sparkles,
  Inbox,
  Filter,
  Building2,
  CheckCircle2,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface DemandTriageViewProps {
  clientId?: string; // Optional client filter if rendered inside client page
}

export function DemandTriageView({ clientId: defaultClientId }: DemandTriageViewProps) {
  const qc = useQueryClient();
  const listSuggestionsFn = useServerFn(listSuggestions);
  const listClientsFn = useServerFn(listClients);
  const dismissFn = useServerFn(dismissSuggestion);
  const deleteFn = useServerFn(deleteSuggestionPermanently);
  const clearAllFn = useServerFn(clearAllDismissedSuggestions);

  const [activeTab, setActiveTab] = useState<"pending" | "approved" | "dismissed">("pending");
  const [selectedClientId, setSelectedClientId] = useState<string>(defaultClientId || "all");
  const [selectedSource, setSelectedSource] = useState<string>("all");
  const [activeModalSuggestion, setActiveModalSuggestion] = useState<DemandSuggestion | null>(null);

  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: () => listClientsFn(),
  });

  const { data: suggestions = [], isLoading } = useQuery({
    queryKey: ["demand_suggestions", activeTab, selectedClientId],
    queryFn: () =>
      listSuggestionsFn({
        data: {
          status: activeTab,
          clientId: selectedClientId !== "all" ? selectedClientId : undefined,
        },
      }),
  });

  const handleDismiss = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await dismissFn({ data: { id } });
      toast.info("Sessão movida para Descartadas.");
      qc.invalidateQueries({ queryKey: ["demand_suggestions"] });
    } catch (err: any) {
      toast.error("Erro ao descartar: " + err.message);
    }
  };

  const handleDeletePermanently = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm("Tem certeza que deseja excluir permanentemente esta transcrição?")) return;
    try {
      await deleteFn({ data: { id } });
      toast.success("Transcrição excluída permanentemente.");
      qc.invalidateQueries({ queryKey: ["demand_suggestions"] });
    } catch (err: any) {
      toast.error("Erro ao excluir: " + err.message);
    }
  };

  const handleClearAllDismissed = async () => {
    if (!confirm("Tem certeza que deseja excluir permanentemente TODOS os itens descartados? Esta ação não pode ser desfeita.")) return;
    try {
      const targetClientId = selectedClientId !== "all" ? selectedClientId : defaultClientId;
      await clearAllFn({ data: { clientId: targetClientId } });
      toast.success("Lixeira esvaziada com sucesso.");
      qc.invalidateQueries({ queryKey: ["demand_suggestions"] });
    } catch (err: any) {
      toast.error("Erro ao esvaziar lixeira: " + err.message);
    }
  };

  // Filter by source if selected
  const filteredSuggestions = suggestions.filter((s) => {
    if (selectedSource !== "all" && s.source !== selectedSource) return false;
    return true;
  });

  const pendingCount = suggestions.filter((s) => s.status === "pending").length;

  return (
    <div className="w-full max-w-[1400px] mx-auto space-y-6">
      
      {/* Top Filter Toolbar */}
      <div className="w-full flex flex-wrap items-center justify-between gap-4 pb-2 border-b border-white/5">
        
        {/* Status Filter Tabs */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-zinc-900/80 p-1 rounded-xl border border-white/10">
            <button
              type="button"
              onClick={() => setActiveTab("pending")}
              className={cn(
                "px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5",
                activeTab === "pending"
                  ? "bg-purple-600 text-white shadow-md shadow-purple-600/20"
                  : "text-zinc-400 hover:text-zinc-200"
              )}
            >
              <Clock className="h-3.5 w-3.5" />
              Pendentes
              {pendingCount > 0 && (
                <span className="ml-1 bg-white/20 px-1.5 py-0.2 rounded-full text-[10px] font-bold">
                  {pendingCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("approved")}
              className={cn(
                "px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5",
                activeTab === "approved"
                  ? "bg-purple-600 text-white shadow-md shadow-purple-600/20"
                  : "text-zinc-400 hover:text-zinc-200"
              )}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Aprovadas
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("dismissed")}
              className={cn(
                "px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5",
                activeTab === "dismissed"
                  ? "bg-purple-600 text-white shadow-md shadow-purple-600/20"
                  : "text-zinc-400 hover:text-zinc-200"
              )}
            >
              <XCircle className="h-3.5 w-3.5" />
              Descartadas
            </button>
          </div>

          {activeTab === "dismissed" && filteredSuggestions.length > 0 && (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleClearAllDismissed}
              className="h-8 text-xs font-semibold gap-1.5 bg-red-600/20 text-red-300 hover:bg-red-600 hover:text-white border border-red-500/30 cursor-pointer transition-all"
            >
              <Trash2 className="h-3.5 w-3.5" /> Esvaziar Lixeira
            </Button>
          )}
        </div>

        {/* Dropdown Filters (Client & Source) */}
        <div className="flex items-center gap-3">
          {!defaultClientId && (
            <Select value={selectedClientId} onValueChange={setSelectedClientId}>
              <SelectTrigger className="h-8 text-xs bg-zinc-900 border-white/10 w-44">
                <Building2 className="h-3.5 w-3.5 text-zinc-400 mr-1" />
                <SelectValue placeholder="Todos os Clientes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Clientes</SelectItem>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Select value={selectedSource} onValueChange={setSelectedSource}>
            <SelectTrigger className="h-8 text-xs bg-zinc-900 border-white/10 w-40">
              <Filter className="h-3.5 w-3.5 text-zinc-400 mr-1" />
              <SelectValue placeholder="Todas as Origens" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as Origens</SelectItem>
              <SelectItem value="meeting">Reuniões</SelectItem>
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
              <SelectItem value="email">E-mail</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Grid of Sessions/Reuniões */}
      {isLoading ? (
        <div className="w-full p-12 text-center text-xs text-muted-foreground flex flex-col items-center justify-center gap-2 bg-zinc-900/20 rounded-2xl border border-white/5">
          <Sparkles className="h-5 w-5 animate-spin text-purple-400" />
          Carregando transcrições e triagens...
        </div>
      ) : filteredSuggestions.length === 0 ? (
        <div className="w-full p-16 text-center text-xs text-muted-foreground italic bg-zinc-900/40 rounded-2xl border border-white/10 flex flex-col items-center justify-center gap-2">
          <Inbox className="h-8 w-8 text-zinc-600 mb-1" />
          Nenhuma transcrição ou sugestão encontrada nesta categoria.
        </div>
      ) : (
        <div className="w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSuggestions.map((sug) => {
            const clientName = sug.clients?.name || "Cliente";
            const dateStr = new Date(sug.created_at).toLocaleDateString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            });

            return (
              <div
                key={sug.id}
                onClick={() => setActiveModalSuggestion(sug)}
                className="group relative p-4 rounded-2xl border border-white/10 bg-zinc-900/90 hover:border-purple-500/40 hover:bg-zinc-900 transition-all flex flex-col justify-between cursor-pointer space-y-3 shadow-md hover:shadow-purple-500/5"
              >
                {/* Header Badge Row */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] bg-purple-500/10 text-purple-300 border-purple-500/30 flex items-center gap-1 font-semibold">
                      {sug.source === "meeting" && <Mic className="h-3 w-3" />}
                      {sug.source === "whatsapp" && <MessageSquare className="h-3 w-3" />}
                      {sug.source === "email" && <Mail className="h-3 w-3" />}
                      {sug.source === "meeting" ? "Reunião" : sug.source === "whatsapp" ? "WhatsApp" : "E-mail"}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] bg-zinc-800 text-zinc-300 border-white/10 font-medium">
                      {clientName}
                    </Badge>
                  </div>
                  <span className="text-[10px] text-muted-foreground font-mono">{dateStr}</span>
                </div>

                {/* Title */}
                <div>
                  <h4 className="text-xs font-bold text-zinc-100 group-hover:text-purple-300 transition-colors line-clamp-2">
                    {sug.suggested_title}
                  </h4>
                  <p className="text-[11px] text-zinc-400 line-clamp-2 mt-1 leading-relaxed">
                    {sug.suggested_description || sug.ai_summary || "Clique para abrir a ata completa e sugestões."}
                  </p>
                </div>

                {/* Footer Buttons */}
                <div className="flex items-center justify-between pt-3 border-t border-white/5 mt-auto">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveModalSuggestion(sug);
                    }}
                    className="h-7 text-[11px] text-purple-300 hover:text-purple-200 hover:bg-purple-500/10 gap-1 font-semibold cursor-pointer p-0"
                  >
                    Ver Ata e Sugestões <ChevronRight className="h-3.5 w-3.5" />
                  </Button>

                  {activeTab === "dismissed" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={(e) => handleDeletePermanently(e, sug.id)}
                      className="h-7 text-[11px] text-red-400 hover:text-red-300 hover:bg-red-500/10 gap-1 cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Excluir Permanentemente
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={(e) => handleDismiss(e, sug.id)}
                      className="h-7 text-[11px] text-zinc-400 hover:text-red-300 hover:bg-red-500/10 gap-1 cursor-pointer"
                    >
                      <XCircle className="h-3.5 w-3.5" /> Descartar
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Unified Meeting Detail Modal */}
      <MeetingDetailModal
        open={!!activeModalSuggestion}
        onOpenChange={(open) => {
          if (!open) setActiveModalSuggestion(null);
        }}
        suggestion={activeModalSuggestion}
        allClientSuggestions={suggestions}
      />
    </div>
  );
}
