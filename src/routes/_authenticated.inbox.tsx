import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  listSuggestions,
  approveSuggestion,
  dismissSuggestion,
  createSuggestion,
  triggerWhatsAppScan,
  type DemandSuggestion,
  type SuggestionSource,
  type SuggestedType,
} from "@/lib/suggestions.functions";
import { listClients } from "@/lib/clients.functions";
import { listDemands } from "@/lib/demands.functions";
import { useUserContext } from "@/contexts/user-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Inbox as InboxIcon,
  MessageSquare,
  Mic,
  Mail,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  RefreshCw,
  Plus,
  ArrowRight,
  AlertTriangle,
  FileText,
} from "lucide-react";
import { MeetingTranscriptionDialog } from "@/components/meeting-transcription-dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/inbox")({
  component: InboxPage,
});

function InboxPage() {
  const { currentUserRole } = useUserContext();
  const isAdminOrOwner = currentUserRole === "owner" || currentUserRole === "admin";
  const qc = useQueryClient();

  const listSuggestionsFn = useServerFn(listSuggestions);
  const approveFn = useServerFn(approveSuggestion);
  const dismissFn = useServerFn(dismissSuggestion);
  const createFn = useServerFn(createSuggestion);
  const scanFn = useServerFn(triggerWhatsAppScan);
  const listClientsFn = useServerFn(listClients);
  const listDemandsFn = useServerFn(listDemands);

  const [activeTab, setActiveTab] = useState<"pending" | "approved" | "dismissed">("pending");
  const [selectedClientId, setSelectedClientId] = useState<string>("all");
  const [selectedSource, setSelectedSource] = useState<string>("all");
  const [isScanning, setIsScanning] = useState(false);

  // Manual suggestion dialog
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newClientId, setNewClientId] = useState("");
  const [newSource, setNewSource] = useState<SuggestionSource>("whatsapp");
  const [newType, setNewType] = useState<SuggestedType>("NOVA_DEMANDA");
  const [newTargetDemandId, setNewTargetDemandId] = useState<string>("");
  const [newTitle, setNewTitle] = useState("");
  const [newSummary, setNewSummary] = useState("");
  const [newRaw, setNewRaw] = useState("");
  const [newHours, setNewHours] = useState(1.0);
  const [isSaving, setIsSaving] = useState(false);

  // Meeting Upload Dialog
  const [isMeetingOpen, setIsMeetingOpen] = useState(false);
  const [meetingClientId, setMeetingClientId] = useState("");
  const [meetingTitle, setMeetingTitle] = useState("");
  const [meetingNotes, setMeetingNotes] = useState("");
  const [isProcessingMeeting, setIsProcessingMeeting] = useState(false);

  // Data Queries
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

  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: () => listClientsFn(),
  });

  const { data: clientDemands = [] } = useQuery({
    queryKey: ["demands_for_client", newClientId],
    queryFn: () => listDemandsFn({ data: { clientId: newClientId } }),
    enabled: !!newClientId && newType === "AJUSTE_DEMANDA",
  });

  const filteredSuggestions = suggestions.filter((s) => {
    if (selectedSource !== "all" && s.source !== selectedSource) return false;
    return true;
  });

  const handleScanWhatsApp = async () => {
    setIsScanning(true);
    try {
      await scanFn();
      toast.success("Varredura solicitada! A extensão processará as novas conversas em breve.", {
        duration: 5000,
      });
      qc.invalidateQueries({ queryKey: ["demand_suggestions"] });
    } catch (err: any) {
      toast.error("Erro ao disparar varredura: " + err.message);
    } finally {
      setIsScanning(false);
    }
  };

  const handleApprove = async (s: DemandSuggestion) => {
    try {
      await approveFn({
        data: {
          id: s.id,
          title: s.suggested_title,
          description: s.suggested_description || s.ai_summary || "",
          estimated_hours: Number(s.estimated_hours || 1.0),
        },
      });
      toast.success(
        s.suggested_type === "AJUSTE_DEMANDA"
          ? "Demanda movida para 'Com Ajustes' com sucesso!"
          : "Nova demanda criada com sucesso!"
      );
      qc.invalidateQueries({ queryKey: ["demand_suggestions"] });
      qc.invalidateQueries({ queryKey: ["demands"] });
    } catch (err: any) {
      toast.error("Erro ao aprovar sugestão: " + err.message);
    }
  };

  const handleDismiss = async (id: string) => {
    try {
      await dismissFn({ data: { id } });
      toast.info("Sugestão descartada.");
      qc.invalidateQueries({ queryKey: ["demand_suggestions"] });
    } catch (err: any) {
      toast.error("Erro ao descartar: " + err.message);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClientId || !newTitle) {
      toast.error("Selecione o cliente e insira um título.");
      return;
    }
    setIsSaving(true);
    try {
      await createFn({
        data: {
          client_id: newClientId,
          source: newSource,
          suggested_type: newType,
          target_demand_id: newType === "AJUSTE_DEMANDA" ? newTargetDemandId || null : null,
          suggested_title: newTitle,
          suggested_description: newSummary,
          ai_summary: newSummary,
          raw_content: newRaw,
          estimated_hours: newHours,
        },
      });
      toast.success("Sugestão adicionada à Caixa de Entrada!");
      setIsCreateOpen(false);
      resetForm();
      qc.invalidateQueries({ queryKey: ["demand_suggestions"] });
    } catch (err: any) {
      toast.error("Erro ao criar sugestão: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleMeetingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!meetingClientId || !meetingNotes) {
      toast.error("Selecione o cliente e cole a transcrição da reunião.");
      return;
    }
    setIsProcessingMeeting(true);
    try {
      await createFn({
        data: {
          client_id: meetingClientId,
          source: "meeting",
          suggested_type: "NOVA_DEMANDA",
          suggested_title: meetingTitle || "Demanda extraída de reunião",
          suggested_description: meetingNotes,
          ai_summary: `Transcrição/Ata de Reunião: ${meetingNotes.slice(0, 300)}...`,
          raw_content: meetingNotes,
          estimated_hours: 2.0,
        },
      });
      toast.success("Reunião processada e enviada para a Caixa de Entrada!");
      setIsMeetingOpen(false);
      setMeetingTitle("");
      setMeetingNotes("");
      qc.invalidateQueries({ queryKey: ["demand_suggestions"] });
    } catch (err: any) {
      toast.error("Erro ao processar reunião: " + err.message);
    } finally {
      setIsProcessingMeeting(false);
    }
  };

  const resetForm = () => {
    setNewClientId("");
    setNewSource("whatsapp");
    setNewType("NOVA_DEMANDA");
    setNewTargetDemandId("");
    setNewTitle("");
    setNewSummary("");
    setNewRaw("");
    setNewHours(1.0);
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-border/40 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <InboxIcon className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Triagem de Demandas (IA)</h1>
              <p className="text-xs text-muted-foreground">
                Central de triagem de demandas e alterações pré-analisadas pela IA (WhatsApp, Reuniões e E-mails)
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isAdminOrOwner && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleScanWhatsApp}
              disabled={isScanning}
              className="gap-2 border-emerald-500/30 hover:bg-emerald-500/10 text-emerald-300"
            >
              <RefreshCw className={cn("h-4 w-4", isScanning && "animate-spin")} />
              Varrer WhatsApp Agora
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsMeetingOpen(true)}
            className="gap-2 border-purple-500/30 hover:bg-purple-500/10 text-purple-300"
          >
            <Mic className="h-4 w-4 text-purple-400" />
            Transcrever Reunião
          </Button>

          <Button size="sm" onClick={() => setIsCreateOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Simular Sugestão
          </Button>
        </div>
      </div>

      {/* Tabs & Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="w-full sm:w-auto">
          <TabsList className="bg-muted/40">
            <TabsTrigger value="pending" className="gap-2">
              <Clock className="h-3.5 w-3.5 text-amber-400" />
              Pendentes
              {suggestions.length > 0 && activeTab === "pending" && (
                <Badge variant="secondary" className="ml-1 px-1.5 py-0.2 text-[10px] bg-amber-500/20 text-amber-300">
                  {suggestions.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="approved" className="gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              Aprovadas
            </TabsTrigger>
            <TabsTrigger value="dismissed" className="gap-2">
              <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
              Descartadas
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          {/* Client Filter */}
          <Select value={selectedClientId} onValueChange={setSelectedClientId}>
            <SelectTrigger className="w-[180px] h-9 text-xs">
              <SelectValue placeholder="Todos os clientes" />
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

          {/* Source Filter */}
          <Select value={selectedSource} onValueChange={setSelectedSource}>
            <SelectTrigger className="w-[160px] h-9 text-xs">
              <SelectValue placeholder="Todas as origens" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as Origens</SelectItem>
              <SelectItem value="whatsapp">💬 WhatsApp</SelectItem>
              <SelectItem value="meeting">🎙️ Reuniões</SelectItem>
              <SelectItem value="email">✉️ E-mails</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Suggestion Cards Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center p-12 text-muted-foreground">
          <RefreshCw className="h-6 w-6 animate-spin mr-2" />
          Carregando caixa de entrada...
        </div>
      ) : filteredSuggestions.length === 0 ? (
        <div className="border border-dashed border-border/60 rounded-2xl p-12 text-center space-y-3 bg-muted/10">
          <Sparkles className="h-10 w-10 text-muted-foreground/50 mx-auto" />
          <h3 className="font-semibold text-base">Nenhuma sugestão encontrada</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Quando novas mensagens no WhatsApp, e-mails ou reuniões forem analisadas, as sugestões aparecerão nesta tela.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSuggestions.map((s) => (
            <SuggestionCard
              key={s.id}
              suggestion={s}
              onApprove={handleApprove}
              onDismiss={handleDismiss}
              isReadonly={activeTab !== "pending"}
            />
          ))}
        </div>
      )}

      {/* Modal: Simular Sugestão Manual */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-lg bg-[#1e1e1e] border-white/10">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Simular Nova Sugestão de IA
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleCreateSubmit} className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Cliente *</Label>
                <Select value={newClientId} onValueChange={setNewClientId}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Selecione o cliente" />
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

              <div className="space-y-1.5">
                <Label className="text-xs">Origem</Label>
                <Select value={newSource} onValueChange={(v: any) => setNewSource(v)}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="whatsapp">💬 WhatsApp</SelectItem>
                    <SelectItem value="meeting">🎙️ Reunião</SelectItem>
                    <SelectItem value="email">✉️ E-mail</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Tipo de Ação</Label>
                <Select value={newType} onValueChange={(v: any) => setNewType(v)}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NOVA_DEMANDA">🆕 Nova Demanda</SelectItem>
                    <SelectItem value="AJUSTE_DEMANDA">🟧 Ajuste em Demanda</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {newType === "AJUSTE_DEMANDA" && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Demanda Alvo</Label>
                  <Select value={newTargetDemandId} onValueChange={setNewTargetDemandId}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Selecione a demanda" />
                    </SelectTrigger>
                    <SelectContent>
                      {clientDemands.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {newType === "NOVA_DEMANDA" && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Horas Estimadas</Label>
                  <Input
                    type="number"
                    step="0.5"
                    value={newHours}
                    onChange={(e) => setNewHours(Number(e.target.value))}
                    className="h-9 text-xs"
                  />
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Título Sugerido pela IA *</Label>
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Ex: Criar carrossel para promoção de Dia dos Pais"
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Resumo / Briefing da IA</Label>
              <Textarea
                rows={3}
                value={newSummary}
                onChange={(e) => setNewSummary(e.target.value)}
                placeholder="Cliente solicitou a criação de 4 artes em formato carrossel..."
                className="text-xs resize-none"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Trecho da Conversa Original (Opcional)</Label>
              <Textarea
                rows={2}
                value={newRaw}
                onChange={(e) => setNewRaw(e.target.value)}
                placeholder="Cliente: Fala James, precisamos daquele carrossel até sexta..."
                className="text-xs resize-none"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setIsCreateOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? "Salvando..." : "Adicionar Sugestão"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal: Transcrever Reunião */}
      <MeetingTranscriptionDialog open={isMeetingOpen} onOpenChange={setIsMeetingOpen} />
    </div>
  );
}

function SuggestionCard({
  suggestion,
  onApprove,
  onDismiss,
  isReadonly,
}: {
  suggestion: DemandSuggestion;
  onApprove: (s: DemandSuggestion) => void;
  onDismiss: (id: string) => void;
  isReadonly?: boolean;
}) {
  const [showRaw, setShowRaw] = useState(false);

  const getSourceBadge = () => {
    switch (suggestion.source) {
      case "whatsapp":
        return (
          <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
            <MessageSquare className="h-3 w-3" /> WhatsApp
          </span>
        );
      case "meeting":
        return (
          <span className="flex items-center gap-1 text-[10px] font-semibold text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full border border-purple-500/20">
            <Mic className="h-3 w-3" /> Reunião
          </span>
        );
      case "email":
        return (
          <span className="flex items-center gap-1 text-[10px] font-semibold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">
            <Mail className="h-3 w-3" /> E-mail
          </span>
        );
      default:
        return null;
    }
  };

  const isAdjustment = suggestion.suggested_type === "AJUSTE_DEMANDA";

  return (
    <div
      className={cn(
        "rounded-2xl border p-4 flex flex-col justify-between space-y-3 transition-all duration-150 shadow-md",
        isAdjustment
          ? "bg-[#241d15] border-amber-500/30 hover:border-amber-500/50"
          : "bg-[#1c2226] border-white/10 hover:border-white/20"
      )}
    >
      <div className="space-y-2.5">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 truncate">
            {getSourceBadge()}
            <Badge variant="outline" className="text-[10px] truncate border-white/10 font-normal">
              {suggestion.clients?.name || "Cliente"}
            </Badge>
          </div>
          <span className="text-[10px] text-muted-foreground shrink-0">
            {new Date(suggestion.created_at).toLocaleDateString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>

        {/* Action Type Badge */}
        <div>
          {isAdjustment ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded-md">
              <AlertTriangle className="h-3 w-3" />
              Solicitação de Ajuste
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-300 bg-emerald-500/20 px-2 py-0.5 rounded-md">
              <Sparkles className="h-3 w-3" />
              Nova Demanda
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className="font-bold text-sm text-foreground line-clamp-2 leading-snug">
          {suggestion.suggested_title}
        </h3>

        {/* AI Summary */}
        {(suggestion.ai_summary || suggestion.suggested_description) && (
          <div className="p-2.5 rounded-xl bg-black/20 border border-white/5 text-xs text-muted-foreground space-y-1 leading-relaxed">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/75 flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-primary" /> Resumo da IA
            </p>
            <p className="line-clamp-4">{suggestion.ai_summary || suggestion.suggested_description}</p>
          </div>
        )}

        {/* Raw Content Collapsible */}
        {suggestion.raw_content && (
          <div>
            <button
              type="button"
              onClick={() => setShowRaw(!showRaw)}
              className="text-[11px] text-primary/80 hover:text-primary flex items-center gap-1 font-medium transition-colors"
            >
              <FileText className="h-3 w-3" />
              {showRaw ? "Ocultar conversa original" : "Ver conversa original"}
            </button>
            {showRaw && (
              <div className="mt-1.5 p-2 rounded-lg bg-black/40 text-[11px] font-mono text-zinc-300 max-h-32 overflow-y-auto whitespace-pre-wrap scrollbar-thin">
                {suggestion.raw_content}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer Actions */}
      {!isReadonly && (
        <div className="pt-3 border-t border-white/10 flex items-center justify-between gap-2 mt-auto">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onDismiss(suggestion.id)}
            className="text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 h-8 px-2.5"
          >
            <XCircle className="h-3.5 w-3.5 mr-1" />
            Descartar
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={() => onApprove(suggestion)}
            className={cn(
              "text-xs font-semibold h-8 px-3 gap-1.5 shadow-sm",
              isAdjustment
                ? "bg-amber-600 hover:bg-amber-700 text-white"
                : "bg-emerald-600 hover:bg-emerald-700 text-white"
            )}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            {isAdjustment ? "Mover p/ Ajustes" : "Criar Demanda"}
          </Button>
        </div>
      )}
    </div>
  );
}
