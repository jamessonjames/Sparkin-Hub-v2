import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { LoadingSpinner } from "@/components/loading-spinner";
import {
  getClient,
  updateClient,
  deleteClient,
  setClientCreditsEnabled,
  listClientEditions,
  createClientEdition,
  updateClientEdition,
  deleteClientEdition,
} from "@/lib/clients.functions";
import {
  listDemands,
  moveDemandStatus,
  createDemand,
  type DemandStatus,
} from "@/lib/demands.functions";
import { listSuggestions, approveSuggestion, dismissSuggestion, type DemandSuggestion } from "@/lib/suggestions.functions";
import { KanbanBoard } from "@/components/kanban-board";
import { DemandForm, type DemandFormValues } from "@/components/demand-form";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useDemandOverlay } from "@/contexts/demand-overlay";
import { useUserContext } from "@/contexts/user-context";
import { useSidebar } from "@/components/ui/sidebar";
import { ClientNotesPanel } from "@/components/client-notes-panel";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ClientForm, type ClientFormValues } from "@/components/client-form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ArrowLeft, Trash2, Plus, ChevronLeft, ChevronRight, Search, X, Star, MoreHorizontal, Pencil, ExternalLink, Copy, Phone, Mail, User, DollarSign, FileText, CheckCircle2, Clock, Sparkles, Mic } from "lucide-react";
import { getClientCreditTiers, saveClientCreditTiers, calculateTiersPrice, DEFAULT_CREDIT_TIERS, type CreditTier } from "@/lib/credit-tiers";
import { CreditProgressBar } from "@/components/credit-progress-bar";
import { ClientGemsTab } from "@/components/client-gems-tab";
import { MeetingTranscriptionDialog } from "@/components/meeting-transcription-dialog";
import { DemandTriageView } from "@/components/demand-triage-view";

export const Route = createFileRoute("/_authenticated/clients/$id")({
  head: () => ({ meta: [{ title: "Cliente" }] }),
  component: ClientPage,
});

// Inline credit progress bar for the Demands tab of a specific client
function ClientCreditProgressInline({
  clientId,
  demands,
}: {
  clientId: string;
  demands: any[];
}) {
  const getTiersFn = useServerFn(getClientCreditTiers);

  const { data: creditConfig } = useQuery({
    queryKey: ["client-credit-tiers", clientId],
    queryFn: () => getTiersFn({ data: { client_id: clientId } }),
  });

  const monthlyCredits = useMemo(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

    return demands
      .filter((d) => {
        if (d.status !== "concluido") return false;
        if (!d.due_date) return false;
        const dateStr = d.due_date.slice(0, 10);
        return dateStr >= startOfMonth && dateStr <= endOfMonth;
      })
      .reduce((sum, d) => sum + (d.estimated_credits || 0), 0);
  }, [demands]);

  if (!creditConfig) return null;

  const now = new Date();
  const monthLabel = now.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const capitalizedMonth = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);

  return (
    <CreditProgressBar
      totalCredits={monthlyCredits}
      tiers={creditConfig.tiers}
      title={`Progresso de Créditos — ${capitalizedMonth}`}
    />
  );
}

function ClientPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const getFn = useServerFn(getClient);
  const updateFn = useServerFn(updateClient);
  const deleteFn = useServerFn(deleteClient);
  const demandsFn = useServerFn(listDemands);
  const moveFn = useServerFn(moveDemandStatus);
  const createFn = useServerFn(createDemand);
  const { currentUserRole, selectedUserId, setSelectedUserId, defaultUserId, setDefaultUserId, profiles, currentUser } = useUserContext();
  const isAdminOrOwner = currentUserRole === "owner" || currentUserRole === "admin";
  const activeUserId = selectedUserId ?? currentUser?.id ?? null;
  const isDefaultUser = defaultUserId ? defaultUserId === activeUserId : activeUserId === currentUser?.id;

  const { data: client, isPending: clientLoading } = useQuery({
    queryKey: ["client", id],
    queryFn: () => getFn({ data: { id } }),
    staleTime: 5 * 60 * 1000,
  });

  const { data: parentClient } = useQuery({
    queryKey: ["client", client?.parent_id],
    queryFn: () => getFn({ data: { id: client!.parent_id! } }),
    enabled: !!client?.parent_id,
    staleTime: 5 * 60 * 1000,
  });
  const { data: clientDemands = [], isPending: demandsLoading } = useQuery({
    queryKey: ["demands", activeUserId, id],
    queryFn: () => demandsFn({ data: { clientId: id, ...(isAdminOrOwner && activeUserId ? { assigneeUserId: activeUserId } : {}) } }),
    staleTime: 5 * 60 * 1000,
  });

  const editionsFn = useServerFn(listClientEditions);
  const { data: clientEditions = [], refetch: refetchEditions } = useQuery({
    queryKey: ["client-editions", id],
    queryFn: () => editionsFn({ data: { client_id: id } }),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });

  const [selectedEditionId, setSelectedEditionId] = useState<string>("all");

  useEffect(() => {
    if (client?.billing_model === "seasonal" && clientEditions.length > 0 && selectedEditionId === "all") {
      const activeEdition = clientEditions.find((e: any) => e.is_active);
      setSelectedEditionId(activeEdition?.id || clientEditions[0]?.id || "all");
    }
  }, [client, clientEditions, selectedEditionId]);

  const listSuggestionsFn = useServerFn(listSuggestions);
  const approveSuggestionFn = useServerFn(approveSuggestion);
  const dismissSuggestionFn = useServerFn(dismissSuggestion);

  const { data: clientSuggestions = [] } = useQuery({
    queryKey: ["demand_suggestions", id],
    queryFn: () => listSuggestionsFn({ data: { clientId: id, status: "pending" } }),
    staleTime: 5 * 60 * 1000,
  });

  const filteredDemands = useMemo(() => {
    if (!client) return [];
    if (selectedEditionId === "all") return clientDemands;
    return clientDemands.filter((d) => d.client_edition_id === selectedEditionId);
  }, [clientDemands, client, selectedEditionId]);

  const [saving, setSaving] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const overlay = useDemandOverlay();
  const { state: sidebarState } = useSidebar();
  const sidebarWidth = sidebarState === "collapsed" ? 48 : 256;
  const [search, setSearch] = useState("");
  const [isMeetingOpen, setIsMeetingOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("demands");
  const scrollRef = useRef<HTMLDivElement>(null);

  async function handleMove(demandId: string, status: DemandStatus) {
    qc.setQueryData<typeof clientDemands>(["demands", activeUserId, id], (prev) =>
      (prev ?? []).map((d) => (d.id === demandId ? { ...d, status } : d)),
    );
    try {
      await moveFn({ data: { id: demandId, status } });
    } catch (e) {
      console.error("[handleMove] moveFn failed", e);
      toast.error(e instanceof Error ? e.message : "Erro ao mover");
      qc.invalidateQueries({ queryKey: ["demands", activeUserId, id] });
    }
  }

  async function handleSave(values: ClientFormValues) {
    setSaving(true);
    try {
      // Preserve credits_enabled — it's managed separately by the portal toggle
      await updateFn({ data: { ...values, id, credits_enabled: client?.credits_enabled ?? false } });
      toast.success("Salvo!");
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["client", id] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setSaving(false);
    }
  }

  const setCreditsEnabledFn = useServerFn(setClientCreditsEnabled);

  async function handleToggleProgress(val: boolean) {
    try {
      await setCreditsEnabledFn({ data: { id, credits_enabled: val } });
      qc.invalidateQueries({ queryKey: ["client", id] });
      qc.invalidateQueries({ queryKey: ["clients"] });
      toast.success(val ? "Progresso visível no portal." : "Progresso ocultado no portal.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    }
  }

  async function handleDelete() {
    if (!confirm("Excluir este cliente?")) return;
    try {
      await deleteFn({ data: { id } });
      toast.success("Excluído.");
      qc.invalidateQueries({ queryKey: ["clients"] });
      navigate({ to: "/clients" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  if (!client) return <LoadingSpinner />;

  const kanbanPaddingLeft = `max(0px, calc((100vw - ${sidebarWidth}px - 1400px) / 2))`;

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <div className="w-full max-w-[1400px] mx-auto px-4 md:px-6 pt-4 md:pt-6 pb-2 shrink-0">
        <button
          onClick={() => navigate({ to: "/clients" })}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          <ArrowLeft className="h-3 w-3" /> Voltar
        </button>

        <div className="flex items-start justify-between gap-3 mt-2">
          <div>
            <h2 className="font-display text-2xl font-bold text-foreground">
              {client.is_project && parentClient
                ? <>{parentClient.name} <span className="text-muted-foreground/50 mx-1">&gt;</span> {client.name}</>
                : client.name}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant={client.access_active ? "default" : "secondary"}>
                {client.access_active ? "Ativo" : "Inativo"}
              </Badge>
              {!client.is_project && (
                <span className="text-xs text-muted-foreground">
                  {client.billing_model === "credits"
                    ? "Créditos"
                    : client.billing_model === "seasonal"
                      ? "Temporada"
                      : client.fixed_type === "one_off"
                        ? "Por Projeto"
                        : "Mensal Fixo"}
                </span>
              )}
            </div>

            {!client.is_project && client.billing_model === "seasonal" && (
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs text-muted-foreground font-semibold">Edição:</span>
                <Select value={selectedEditionId} onValueChange={setSelectedEditionId}>
                  <SelectTrigger className="h-8 text-xs bg-background border-border text-foreground w-auto min-w-[150px]">
                    <SelectValue placeholder="Selecione a edição..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as Edições</SelectItem>
                    {clientEditions.map((ed: any) => (
                      <SelectItem key={ed.id} value={ed.id} className="text-xs">
                        {ed.name} {ed.is_active ? " (Vigente)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {client.slug && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const url = `${window.location.origin}/portal/${client.slug}`;
                  navigator.clipboard.writeText(url);
                  toast.success("Link do portal copiado!");
                }}
                className="gap-1.5 text-xs font-medium"
              >
                <Copy className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Copiar link do portal</span>
              </Button>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 w-8 p-0 cursor-pointer">
                  <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 bg-zinc-950 border border-zinc-800 text-zinc-200">
                <DropdownMenuItem onClick={() => setIsEditDialogOpen(true)} className="cursor-pointer">
                  <Pencil className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                  Editar dados do cliente
                </DropdownMenuItem>

                {client.slug && (
                  <>
                    <DropdownMenuItem
                      onClick={() => {
                        const url = `${window.location.origin}/portal/${client.slug}`;
                        navigator.clipboard.writeText(url);
                        toast.success("Link do portal copiado!");
                      }}
                      className="cursor-pointer"
                    >
                      <Copy className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                      Copiar link do portal
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        const url = `${window.location.origin}/portal/${client.slug}`;
                        window.open(url, "_blank");
                      }}
                      className="cursor-pointer"
                    >
                      <ExternalLink className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                      Visualizar como cliente
                    </DropdownMenuItem>
                  </>
                )}

                <DropdownMenuSeparator className="bg-zinc-800" />

                <DropdownMenuItem
                  className="text-red-400 focus:text-red-400 focus:bg-red-500/10 cursor-pointer"
                  onClick={() => setIsConfirmDeleteOpen(true)}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-2" />
                  Excluir cliente
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} defaultValue="demands" className="flex-1 flex flex-col min-h-0">
        <div className="w-full max-w-[1400px] mx-auto px-4 md:px-6">
          <TabsList className="w-full justify-between bg-zinc-900/60 border border-zinc-800 p-1.5 rounded-xl h-auto flex-wrap sm:flex-nowrap gap-1">
            <div className="flex items-center gap-1 flex-wrap sm:flex-nowrap">
              <TabsTrigger value="demands">
                Demandas ({filteredDemands.length})
              </TabsTrigger>
              {client.billing_model === "seasonal" && (
                <TabsTrigger value="editions">Edições</TabsTrigger>
              )}
              <TabsTrigger value="overview">Visão geral</TabsTrigger>
              <TabsTrigger value="ai_agents">IA / Agentes</TabsTrigger>
              <TabsTrigger value="notes">Notas</TabsTrigger>
              {!client.is_project && <TabsTrigger value="reports">Relatórios</TabsTrigger>}
            </div>

            <TabsTrigger value="suggestions" className="gap-1.5 font-medium">
              <Sparkles className="h-3.5 w-3.5 text-zinc-400" />
              <span>Triagem IA ({clientSuggestions.length})</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="demands" className="flex-1 flex flex-col min-h-0 gap-8 relative">
          {demandsLoading && (
            <div className="absolute inset-0 bg-background/50 backdrop-blur-[1px] z-50 flex items-center justify-center">
              <LoadingSpinner />
            </div>
          )}
          <div className="w-full max-w-[1400px] mx-auto px-4 md:px-6 flex flex-col gap-4 shrink-0 pt-6">
            <div className="flex justify-between items-center gap-3">
              <div className="relative w-56">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  placeholder="Buscar demandas..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 text-sm rounded-lg border border-border bg-surface-2/40 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring transition-all"
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-3">
                <Button
                  onClick={() =>
                    overlay.openNew(
                      [{ id: client.id, name: client.name }],
                      client.id,
                      "nao_iniciado",
                      selectedEditionId === "all" ? undefined : selectedEditionId,
                      isAdminOrOwner && activeUserId ? activeUserId : undefined
                    )
                  }
                  size="sm"
                  style={{ backgroundColor: "#2783de" }}
                  className="hover:opacity-90 border-0"
                >
                  <Plus className="h-4 w-4 mr-1" /> Demanda
                </Button>
              </div>
            </div>

            {client.billing_model === "credits" && (
              <ClientCreditProgressInline
                clientId={client.id}
                demands={clientDemands}
              />
            )}
          </div>

          <div className="flex-1 flex min-h-0">
            {client.billing_model === "seasonal" && clientEditions.length === 0 ? (
              <div className="w-full max-w-[1400px] mx-auto px-4 md:px-6 pb-6">
                <div className="text-center py-12 border border-dashed border-border rounded-lg bg-muted/10">
                  <p className="text-sm text-muted-foreground italic">
                    Este cliente por temporada ainda não possui edições cadastradas.
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Vá para a aba de "Edições" para criar a primeira edição do evento.
                  </p>
                </div>
              </div>
            ) : (
              <div
                ref={scrollRef}
                className="flex flex-col flex-1 min-w-0 min-h-0 overflow-x-auto"
                style={{ paddingLeft: kanbanPaddingLeft }}
              >
              <KanbanBoard
                scrollRef={scrollRef}
                demands={filteredDemands.map((d) => ({
                  id: d.id,
                  title: d.title,
                  status: d.status,
                  priority: d.priority,
                  due_date: d.due_date,
                  clients: d.clients ?? null,
                  assignee_user_id: d.assignee_user_id ?? null,
                  comments_count: (d as any).comments_count ?? 0,
                }))}
                onMove={handleMove}
                onOpen={(demandId) => overlay.open(demandId, [{ id: client.id, name: client.name }])}
                onAdd={(status) =>
                  overlay.openNew(
                    [{ id: client.id, name: client.name }],
                    client.id,
                    status,
                    selectedEditionId === "all" ? undefined : selectedEditionId,
                    isAdminOrOwner && activeUserId ? activeUserId : undefined
                  )
                }
                showSearch={false}
                search={search}
                onSearchChange={setSearch}
              />
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="overview" className="mt-4 overflow-y-auto pb-8">
          <div className="w-full max-w-[1400px] mx-auto px-4 md:px-6 space-y-6">
            {/* Overview Header */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-foreground">Visão Geral do Cliente</h3>
                <p className="text-xs text-muted-foreground">Resumo do contrato, contatos e métricas operacionais.</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditDialogOpen(true)}
                className="gap-1.5 text-xs font-semibold cursor-pointer"
              >
                <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                Editar dados
              </Button>
            </div>

            {/* Dashboard Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Card 1: Cobrança / Contrato */}
              <Card className="p-4 border-border/60 bg-zinc-900/50 flex flex-col justify-between">
                <div className="flex items-center justify-between pb-2 border-b border-border/40">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <DollarSign className="h-3.5 w-3.5 text-emerald-400" /> Contrato & Cobrança
                  </span>
                  <Badge variant={client.access_active ? "default" : "secondary"} className="text-[10px]">
                    {client.access_active ? "Acesso Ativo" : "Inativo"}
                  </Badge>
                </div>
                <div className="mt-3 space-y-1.5">
                  <div className="text-xl font-bold text-foreground">
                    {client.monthly_value
                      ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(client.monthly_value)
                      : "Sem valor cadastrado"}
                  </div>
                  <p className="text-xs text-muted-foreground font-medium">
                    Modelo:{" "}
                    <span className="text-foreground">
                      {client.billing_model === "credits"
                        ? "Mensal com Créditos"
                        : client.billing_model === "seasonal"
                          ? "Por Temporada (Eventos)"
                          : client.fixed_type === "one_off"
                            ? "Por Projeto"
                            : "Pagamento Mensal Fixo"}
                    </span>
                  </p>
                </div>
              </Card>

              {/* Card 2: Resumo de Demandas */}
              <Card className="p-4 border-border/60 bg-zinc-900/50 flex flex-col justify-between">
                <div className="flex items-center justify-between pb-2 border-b border-border/40">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-blue-400" /> Demandas do Cliente
                  </span>
                  <span className="text-xs font-bold text-foreground">{clientDemands.length} total</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-zinc-950/50 p-2 rounded-lg border border-border/40">
                    <span className="text-muted-foreground text-[11px] block">Concluídas</span>
                    <span className="text-base font-bold text-emerald-400">
                      {clientDemands.filter(d => d.status === "concluido").length}
                    </span>
                  </div>
                  <div className="bg-zinc-950/50 p-2 rounded-lg border border-border/40">
                    <span className="text-muted-foreground text-[11px] block">Em Andamento</span>
                    <span className="text-base font-bold text-amber-400">
                      {clientDemands.filter(d => d.status !== "concluido").length}
                    </span>
                  </div>
                </div>
              </Card>

              {/* Card 3: Contatos Diretos */}
              <Card className="p-4 border-border/60 bg-zinc-900/50 flex flex-col justify-between">
                <div className="flex items-center justify-between pb-2 border-b border-border/40">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-purple-400" /> Contatos
                  </span>
                </div>
                <div className="mt-3 space-y-2 text-xs">
                  {client.contact_name && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Contato:</span>
                      <span className="font-semibold text-foreground">{client.contact_name}</span>
                    </div>
                  )}
                  {client.email && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">E-mail:</span>
                      <a href={`mailto:${client.email}`} className="font-medium text-blue-400 hover:underline truncate max-w-[170px]">
                        {client.email}
                      </a>
                    </div>
                  )}
                  {client.phone && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">WhatsApp:</span>
                      <a
                        href={`https://wa.me/${client.phone.replace(/\D/g, "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-emerald-400 hover:underline flex items-center gap-1"
                      >
                        <Phone className="h-3 w-3" /> {client.phone}
                      </a>
                    </div>
                  )}
                  {!client.contact_name && !client.email && !client.phone && (
                    <p className="text-xs text-muted-foreground italic">Nenhum contato cadastrado.</p>
                  )}
                </div>
              </Card>
            </div>

            {/* Notes & Credit Tiers Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
              <div className="lg:col-span-2">
                <Card className="p-5 border-border/60 bg-zinc-900/50 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5 text-zinc-400" /> Notas Internas
                    </h4>
                  </div>
                  <p className="text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed">
                    {client.internal_notes || "Nenhuma nota interna cadastrada para este cliente."}
                  </p>
                </Card>
              </div>

              {!client.is_project && client.billing_model === "credits" && (
                <div className="lg:col-span-1">
                  <CreditTiersEditor
                    clientId={client.id}
                    showProgress={client.credits_enabled ?? false}
                    onToggleProgress={handleToggleProgress}
                  />
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {activeTab === "ai_agents" && (
        <TabsContent value="ai_agents" className="flex-1 w-full max-w-[1400px] mx-auto px-4 md:px-6">
          <ClientGemsTab clientId={id} />
        </TabsContent>
        )}

        {/* Client Edit Dialog Modal */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-zinc-950 border-zinc-800">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-foreground">
                <Pencil className="h-4 w-4 text-primary" /> Editar dados do cliente
              </DialogTitle>
            </DialogHeader>
            <ClientForm
              initial={{
                name: client.name,
                contact_name: client.contact_name,
                email: client.email,
                phone: client.phone,
                billing_model: client.billing_model,
                fixed_type: client.fixed_type,
                monthly_value: client.monthly_value,
                commercial_notes: client.commercial_notes,
                internal_notes: client.internal_notes,
                access_active: client.access_active,
              }}
              onSubmit={async (values) => {
                await handleSave(values);
                setIsEditDialogOpen(false);
              }}
              submitting={saving}
              hideBilling={!!client.is_project}
            />
          </DialogContent>
        </Dialog>

        {/* Confirm Delete Client Dialog Modal */}
        <Dialog open={isConfirmDeleteOpen} onOpenChange={setIsConfirmDeleteOpen}>
          <DialogContent className="max-w-md bg-zinc-950 border-zinc-800">
            <DialogHeader>
              <DialogTitle className="text-red-400 flex items-center gap-2">
                <Trash2 className="h-5 w-5" /> Excluir Cliente
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-zinc-300 py-2">
              Tem certeza que deseja excluir o cliente <strong>{client.name}</strong>? Esta ação removerá o cliente e suas demandas do sistema.
            </p>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="ghost" size="sm" onClick={() => setIsConfirmDeleteOpen(false)}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  setIsConfirmDeleteOpen(false);
                  handleDelete();
                }}
              >
                Confirmar Exclusão
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {activeTab === "notes" && (
        <TabsContent value="notes" className="mt-4 overflow-y-auto">
          <div className="w-full max-w-[1400px] mx-auto px-4 md:px-6">
            <ClientNotesPanel clientId={id} />
          </div>
        </TabsContent>
        )}

        {!client.is_project && activeTab === "reports" && (
          <TabsContent value="reports" className="mt-4 overflow-y-auto pb-8">
            <div className="w-full max-w-[1400px] mx-auto px-4 md:px-6">
              <ClientReportsPanel
                clientId={id}
                billingModel={client.billing_model}
                fixedType={client.fixed_type}
                monthlyValue={client.monthly_value}
                demands={clientDemands}
                clientEditions={clientEditions}
                onOpenDemand={(demandId) => overlay.open(demandId, [{ id: client.id, name: client.name }])}
              />
            </div>
          </TabsContent>
        )}
        {!client.is_project && client.billing_model === "seasonal" && activeTab === "editions" && (
          <TabsContent value="editions" className="mt-4 overflow-y-auto pb-8">
            <div className="w-full max-w-[1400px] mx-auto px-4 md:px-6">
              <ClientEditionsPanel
                clientId={client.id}
                editions={clientEditions}
                demands={clientDemands}
                onRefetch={refetchEditions}
              />
            </div>
          </TabsContent>
        )}
        {activeTab === "suggestions" && (
        <TabsContent value="suggestions" className="mt-4 overflow-y-auto pb-8">
          <div className="w-full max-w-[1400px] mx-auto px-4 md:px-6 space-y-4">
            <DemandTriageView clientId={id} />
          </div>
        </TabsContent>
        )}
      </Tabs>
    </div>
  );
}




function CreditTiersEditor({
  clientId,
  showProgress,
  onToggleProgress,
}: {
  clientId: string;
  showProgress: boolean;
  onToggleProgress: (val: boolean) => void;
}) {
  const getTiersFn = useServerFn(getClientCreditTiers);
  const saveTiersFn = useServerFn(saveClientCreditTiers);
  const qc = useQueryClient();

  const { data: creditConfig } = useQuery({
    queryKey: ["client-credit-tiers", clientId],
    queryFn: () => getTiersFn({ data: { client_id: clientId } }),
  });

  const [editingTiers, setEditingTiers] = useState<CreditTier[]>([]);
  const [savingTiers, setSavingTiers] = useState(false);

  useEffect(() => {
    if (creditConfig) {
      setEditingTiers(creditConfig.tiers || []);
    }
  }, [creditConfig]);

  const addTier = () => {
    const lastTier = editingTiers[editingTiers.length - 1];
    const nextMin = lastTier ? (lastTier.max_credits !== null ? lastTier.max_credits + 1 : lastTier.min_credits + 1) : 0;
    setEditingTiers([
      ...editingTiers,
      { min_credits: nextMin, max_credits: null, price: 1000, extra_per_credit: null }
    ]);
  };

  const removeTier = (index: number) => {
    setEditingTiers(editingTiers.filter((_, i) => i !== index));
  };

  const updateTier = <K extends keyof CreditTier>(index: number, key: K, value: CreditTier[K]) => {
    setEditingTiers(
      editingTiers.map((t, i) => {
        if (i !== index) return t;
        const updated = { ...t, [key]: value };
        if (key === "max_credits" && value !== null) {
          updated.extra_per_credit = null;
        }
        return updated;
      })
    );
  };

  const handleSaveTiers = async () => {
    setSavingTiers(true);
    try {
      await saveTiersFn({
        data: {
          client_id: clientId,
          tiers: editingTiers,
          show_progress_bar: showProgress,
        },
      });
      toast.success("Regras de crédito salvas com sucesso!");
      qc.invalidateQueries({ queryKey: ["client-credit-tiers", clientId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar regras");
    } finally {
      setSavingTiers(false);
    }
  };

  return (
    <Card className="p-5 flex flex-col gap-4">
      <div>
        <h3 className="font-bold text-sm text-foreground">Configurações de Crédito</h3>
        <p className="text-[11px] text-muted-foreground mt-1">
          Personalize as faixas de cobrança e exibição de progresso deste cliente.
        </p>
      </div>

      <div className="flex items-center justify-between border border-border/80 bg-muted/20 p-3 rounded-lg">
        <div className="flex flex-col gap-0.5">
          <Label htmlFor="show-progress" className="font-bold text-xs cursor-pointer select-none">
            Exibir progresso no portal do cliente
          </Label>
          <span className="text-[10px] text-muted-foreground">
            Mostra a barra de consumo de créditos na área pública do cliente
          </span>
        </div>
        <button
          id="show-progress"
          type="button"
          role="switch"
          aria-checked={showProgress}
          onClick={() => onToggleProgress(!showProgress)}
          className={cn(
            "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            showProgress ? "bg-emerald-500" : "bg-input"
          )}
        >
          <span
            className={cn(
              "pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform duration-200 ease-in-out",
              showProgress ? "translate-x-4" : "translate-x-0"
            )}
          />
        </button>
      </div>

      <div className="space-y-3 pt-2 border-t border-border/60">
        <h4 className="font-bold text-xs text-foreground uppercase tracking-wider text-muted-foreground">Tabela de Faixas</h4>
        {editingTiers.map((tier, idx) => (
          <div key={idx} className="flex items-center gap-2 bg-muted/40 p-2.5 rounded-lg border border-border/80 text-xs">
            <div className="flex flex-col gap-1 w-12 shrink-0">
              <span className="text-[9px] text-muted-foreground font-bold uppercase">De</span>
              <Input
                type="number"
                min="0"
                value={tier.min_credits}
                onChange={(e) => updateTier(idx, "min_credits", parseInt(e.target.value) || 0)}
                className="h-8 text-center px-1"
              />
            </div>
            
            <div className="flex flex-col gap-1 w-12 shrink-0">
              <span className="text-[9px] text-muted-foreground font-bold uppercase">Até</span>
              <Input
                type="number"
                placeholder="∞"
                value={tier.max_credits ?? ""}
                onChange={(e) => {
                  const val = e.target.value;
                  updateTier(idx, "max_credits", val === "" ? null : parseInt(val));
                }}
                className="h-8 text-center px-1"
              />
            </div>

            <div className="flex flex-col gap-1 flex-1 min-w-[70px]">
              <span className="text-[9px] text-muted-foreground font-bold uppercase">Valor (R$)</span>
              <Input
                type="number"
                min="0"
                value={tier.price}
                onChange={(e) => updateTier(idx, "price", parseFloat(e.target.value) || 0)}
                className="h-8 px-2"
              />
            </div>

            {tier.max_credits === null && (
              <div className="flex flex-col gap-1 w-16 shrink-0">
                <span className="text-[9px] text-muted-foreground font-bold uppercase">Extra (R$)</span>
                <Input
                  type="number"
                  placeholder="0"
                  min="0"
                  value={tier.extra_per_credit ?? ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    updateTier(idx, "extra_per_credit", val === "" ? null : parseFloat(val));
                  }}
                  className="h-8 px-2"
                />
              </div>
            )}

            <button
              onClick={() => removeTier(idx)}
              className="text-muted-foreground hover:text-red-500 p-1 rounded hover:bg-muted self-end cursor-pointer mb-[2px] transition-colors"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        {editingTiers.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-2">Sem faixas configuradas. Usando padrões.</p>
        )}
      </div>

      <div className="flex justify-between gap-2 mt-2 pt-2 border-t border-border">
        <Button
          variant="outline"
          size="sm"
          onClick={addTier}
          className="text-xs"
        >
          + Adicionar faixa
        </Button>
        <Button
          size="sm"
          onClick={handleSaveTiers}
          disabled={savingTiers}
          className="text-xs font-bold"
        >
          {savingTiers ? "Salvando..." : "Salvar regras"}
        </Button>
      </div>
    </Card>
  );
}

function ClientReportsPanel({
  clientId,
  billingModel,
  fixedType,
  monthlyValue,
  demands,
  clientEditions = [],
  onOpenDemand,
}: {
  clientId: string;
  billingModel: string;
  fixedType?: string | null;
  monthlyValue: number | null;
  demands: any[];
  clientEditions?: any[];
  onOpenDemand: (id: string) => void;
}) {
  const isOneOff = billingModel === "fixed" && fixedType === "one_off";
  const getTiersFn = useServerFn(getClientCreditTiers);

  const [period, setPeriod] = useState<"diario" | "semanal" | "mensal" | "anual" | "personalizado" | "edicao">(() =>
    billingModel === "seasonal" ? "edicao" : "mensal"
  );
  const [refDate, setRefDate] = useState(() => new Date());

  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().slice(0, 10);
  });

  const [reportEditionId, setReportEditionId] = useState<string>(() => {
    const active = clientEditions.find((e) => e.is_active);
    return active?.id || clientEditions[0]?.id || "";
  });

  useEffect(() => {
    if (billingModel === "seasonal" && clientEditions.length > 0 && !reportEditionId) {
      const active = clientEditions.find((e) => e.is_active);
      setReportEditionId(active?.id || clientEditions[0]?.id || "");
    }
  }, [billingModel, clientEditions, reportEditionId]);

  // Load client credit tiers
  const { data: creditConfig } = useQuery({
    queryKey: ["client-credit-tiers", clientId],
    queryFn: () => getTiersFn({ data: { client_id: clientId } }),
    enabled: billingModel === "credits",
  });

  const creditTiers = creditConfig?.tiers ?? [];

  const handlePrevPeriod = () => {
    setRefDate((prev) => {
      const next = new Date(prev);
      if (period === "diario") {
        next.setDate(prev.getDate() - 1);
      } else if (period === "semanal") {
        next.setDate(prev.getDate() - 7);
      } else if (period === "mensal") {
        next.setMonth(prev.getMonth() - 1);
      } else if (period === "anual") {
        next.setFullYear(prev.getFullYear() - 1);
      }
      return next;
    });
  };

  const handleNextPeriod = () => {
    setRefDate((prev) => {
      const next = new Date(prev);
      if (period === "diario") {
        next.setDate(prev.getDate() + 1);
      } else if (period === "semanal") {
        next.setDate(prev.getDate() + 7);
      } else if (period === "mensal") {
        next.setMonth(prev.getMonth() + 1);
      } else if (period === "anual") {
        next.setFullYear(prev.getFullYear() + 1);
      }
      return next;
    });
  };

  const periodOptions = useMemo(() => {
    const base = [
      { value: "diario", label: "Dia" },
      { value: "semanal", label: "Semana" },
      { value: "mensal", label: "Mês" },
      { value: "anual", label: "Ano" },
      { value: "personalizado", label: "Personalizado" }
    ] as const;
    if (billingModel === "seasonal") {
      return [{ value: "edicao", label: "Por Edição" }, ...base];
    }
    return base;
  }, [billingModel]);

  const { actualStart, actualEnd, formattedPeriodLabel } = useMemo(() => {
    let start = "";
    let end = "";
    let label = "";

    if (period === "diario") {
      start = refDate.toISOString().slice(0, 10);
      end = start;
      const rawLabel = refDate.toLocaleDateString("pt-BR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });
      label = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1);
    } else if (period === "semanal") {
      const dStart = new Date(refDate);
      dStart.setDate(refDate.getDate() - refDate.getDay());
      const dEnd = new Date(dStart);
      dEnd.setDate(dStart.getDate() + 6);
      
      start = dStart.toISOString().slice(0, 10);
      end = dEnd.toISOString().slice(0, 10);
      label = `Semana de ${dStart.getDate().toString().padStart(2, "0")}/${(dStart.getMonth() + 1).toString().padStart(2, "0")} a ${dEnd.getDate().toString().padStart(2, "0")}/${(dEnd.getMonth() + 1).toString().padStart(2, "0")}/${dEnd.getFullYear()}`;
    } else if (period === "mensal") {
      const dStart = new Date(refDate.getFullYear(), refDate.getMonth(), 1);
      const dEnd = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0);
      
      start = dStart.toISOString().slice(0, 10);
      end = dEnd.toISOString().slice(0, 10);
      const rawLabel = refDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
      label = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1);
    } else if (period === "anual") {
      start = `${refDate.getFullYear()}-01-01`;
      end = `${refDate.getFullYear()}-12-31`;
      label = `Ano de ${refDate.getFullYear()}`;
    } else if (period === "edicao") {
      const ed = clientEditions.find((e) => e.id === reportEditionId);
      label = ed ? `Edição: ${ed.name}` : "Selecione uma edição";
    } else {
      start = startDate;
      end = endDate;
      label = "Personalizado";
    }

    return { actualStart: start, actualEnd: end, formattedPeriodLabel: label };
  }, [period, refDate, startDate, endDate, clientEditions, reportEditionId]);

  // Filter demands
  const completedDemands = useMemo(() => {
    if (period === "edicao") {
      return demands.filter((d) => d.client_edition_id === reportEditionId);
    }
    return demands.filter((d) => {
      if (d.status !== "concluido") return false;
      if (!d.due_date) return false;
      const dateStr = d.due_date.slice(0, 10);
      return dateStr >= actualStart && dateStr <= actualEnd;
    });
  }, [demands, period, reportEditionId, actualStart, actualEnd]);

  // Calculations
  const totalCredits = completedDemands.reduce((sum, d) => sum + (d.estimated_credits || 0), 0);
  const totalHours = completedDemands.reduce((sum, d) => sum + (Number(d.estimated_hours) || 0), 0);
  
  const totalPrice = useMemo(() => {
    if (billingModel === "seasonal" || isOneOff) {
      return completedDemands.reduce((sum, d) => sum + (Number(d.price) || 0), 0);
    }
    if (billingModel === "credits") {
      return calculateTiersPrice(totalCredits, creditTiers);
    }
    return monthlyValue ?? 0;
  }, [billingModel, isOneOff, completedDemands, totalCredits, creditTiers, monthlyValue]);

  // Credit progress calculations
  const sortedTiers = useMemo(() => {
    const activeTiers = creditTiers && creditTiers.length > 0 ? creditTiers : DEFAULT_CREDIT_TIERS;
    return [...activeTiers].sort((a, b) => a.min_credits - b.min_credits);
  }, [creditTiers]);

  const { currentTier, currentTierIndex, nextTier, percent, remaining } = useMemo(() => {
    const idx = sortedTiers.findIndex(
      (t) => totalCredits >= t.min_credits && (t.max_credits === null || totalCredits <= t.max_credits)
    );
    const curr = idx !== -1 ? sortedTiers[idx] : null;
    const nxt = curr && curr.max_credits !== null && idx + 1 < sortedTiers.length ? sortedTiers[idx + 1] : null;

    let pct = 0;
    let rem = 0;

    if (curr) {
      if (curr.max_credits !== null) {
        pct = Math.min(100, Math.max(0, (totalCredits / curr.max_credits) * 100));
        rem = curr.max_credits - totalCredits;
      } else {
        pct = 100;
        rem = 0;
      }
    }

    return {
      currentTier: curr,
      currentTierIndex: idx,
      nextTier: nxt,
      percent: pct,
      remaining: rem,
    };
  }, [sortedTiers, totalCredits]);

  return (
    <div className="space-y-6">
      {/* Filters Card */}
      <Card className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Period Selector Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 bg-muted/40 p-1 rounded-lg border border-border/60 w-fit">
            {periodOptions.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setPeriod(value as any)}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-all",
                  period === value
                    ? "bg-background text-foreground shadow-sm font-bold"
                    : "text-muted-foreground hover:text-foreground hover:bg-background/40"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Navigation Arrows & Current Label */}
          {period !== "personalizado" && period !== "edicao" && (
            <div className="flex items-center gap-1 bg-muted/20 border border-border/60 rounded-lg p-0.5">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 hover:bg-muted"
                onClick={handlePrevPeriod}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs font-bold px-3 text-foreground capitalize min-w-[140px] text-center select-none">
                {formattedPeriodLabel}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 hover:bg-muted"
                onClick={handleNextPeriod}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          {period === "edicao" && (
            <div className="flex items-center gap-2">
              <Select value={reportEditionId} onValueChange={setReportEditionId}>
                <SelectTrigger className="h-8 text-xs bg-background border-border text-foreground w-auto min-w-[150px]">
                  <SelectValue placeholder="Selecione a edição..." />
                </SelectTrigger>
                <SelectContent>
                  {clientEditions.map((ed: any) => (
                    <SelectItem key={ed.id} value={ed.id} className="text-xs">
                      {ed.name} {ed.is_active ? " (Vigente)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {period === "personalizado" && (
          <div className="flex items-center gap-2">
            <div className="flex flex-col gap-0.5">
              <span className="text-[9px] text-muted-foreground uppercase font-bold pl-1">Início</span>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-8 text-xs w-36"
              />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[9px] text-muted-foreground uppercase font-bold pl-1">Fim</span>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-8 text-xs w-36"
              />
            </div>
          </div>
        )}
      </Card>

      {/* Summary Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 flex flex-col justify-between h-24">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">
            {billingModel === "seasonal" ? "Total de Demandas" : "Serviços Concluídos"}
          </span>
          <div className="flex items-baseline gap-1.5 mt-2">
            <span className="text-3xl font-display font-extrabold text-foreground">{completedDemands.length}</span>
            <span className="text-xs text-muted-foreground">demandas</span>
          </div>
        </Card>

        <Card className="p-4 flex flex-col justify-between h-24">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Total Horas Gastas</span>
          <div className="flex items-baseline gap-1.5 mt-2">
            <span className="text-3xl font-display font-extrabold text-foreground">{totalHours}</span>
            <span className="text-xs text-muted-foreground">horas</span>
          </div>
        </Card>

        {billingModel === "credits" ? (
          <>
            <Card className="p-4 flex flex-col justify-between h-24">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Créditos Consumidos</span>
              <div className="flex items-baseline gap-1.5 mt-2">
                <span className="text-3xl font-display font-extrabold text-foreground">{totalCredits}</span>
                <span className="text-xs text-muted-foreground">{totalCredits === 1 ? "crédito" : "créditos"}</span>
              </div>
            </Card>

            <Card className="p-4 flex flex-col justify-between h-24 border-emerald-500/25 bg-emerald-500/[0.02]">
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 uppercase tracking-wider font-bold">Valor a Cobrar</span>
                <span className="text-[9px] text-muted-foreground">Mínimo da faixa vigente</span>
              </div>
              <div className="flex items-baseline gap-1 mt-2">
                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">R$</span>
                <span className="text-3xl font-display font-extrabold text-emerald-600 dark:text-emerald-400">
                  {totalPrice.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </Card>
          </>
        ) : (billingModel === "seasonal" || isOneOff) ? (
          <Card className="p-4 flex flex-col justify-between h-24 border-emerald-500/25 bg-emerald-500/[0.02]">
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 uppercase tracking-wider font-bold">Total a Cobrar</span>
              <span className="text-[9px] text-muted-foreground">
                {billingModel === "seasonal" ? "Soma das demandas deste evento" : "Soma das demandas concluídas no período"}
              </span>
            </div>
            <div className="flex items-baseline gap-1 mt-2">
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">R$</span>
              <span className="text-3xl font-display font-extrabold text-emerald-600 dark:text-emerald-400">
                {totalPrice.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </Card>
        ) : (
          <Card className="p-4 flex flex-col justify-between h-24 border-blue-500/25 bg-blue-500/[0.02]">
            <span className="text-[10px] text-blue-600 dark:text-blue-400 uppercase tracking-wider font-bold">Mensalidade Contratual</span>
            <div className="flex items-baseline gap-1 mt-2">
              <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">R$</span>
              <span className="text-3xl font-display font-extrabold text-blue-600 dark:text-blue-400">
                {totalPrice.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-[10px] text-muted-foreground pl-1">/fixo</span>
            </div>
          </Card>
        )}
      </div>

      {/* Services Table */}
      <Card className="p-4">
        <h3 className="font-bold text-sm text-foreground mb-4">Detalhamento dos Serviços</h3>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-muted/40 border-b border-border text-[10px] text-muted-foreground uppercase font-bold">
                <th className="p-3">Demanda</th>
                <th className="p-3">Conclusão / Entrega</th>
                <th className="p-3 text-center">Horas</th>
                {billingModel === "credits" && <th className="p-3 text-center">Créditos</th>}
                {(billingModel === "seasonal" || isOneOff) && <th className="p-3 text-right">Valor</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {completedDemands.map((d) => (
                <tr key={d.id} className="hover:bg-muted/20 transition-colors">
                  <td className="p-3">
                    <button
                      onClick={() => onOpenDemand(d.id)}
                      className="text-left font-bold text-foreground hover:text-primary hover:underline cursor-pointer"
                    >
                      {d.title}
                    </button>
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {d.due_date ? (() => {
                      const pureDate = d.due_date.includes("T") ? d.due_date.split("T")[0] : d.due_date;
                      const parts = pureDate.split("-");
                      if (parts.length === 3) {
                        return `${parts[2]}/${parts[1]}/${parts[0]}`;
                      }
                      return pureDate;
                    })() : "—"}
                  </td>
                  <td className="p-3 text-center text-muted-foreground">
                    {d.estimated_hours ? `${Number(d.estimated_hours)}h` : "—"}
                  </td>
                  {billingModel === "credits" && (
                    <td className="p-3 text-center font-bold text-emerald-600 dark:text-emerald-400">
                      {d.estimated_credits || 0}
                    </td>
                  )}
                  {(billingModel === "seasonal" || isOneOff) && (
                    <td className="p-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                      {d.price ? `R$ ${Number(d.price).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                    </td>
                  )}
                </tr>
              ))}
              {completedDemands.length === 0 && (
                <tr>
                  <td
                    colSpan={billingModel === "credits" || billingModel === "seasonal" || isOneOff ? 4 : 3}
                    className="p-8 text-center text-muted-foreground/60 italic"
                  >
                    Nenhum serviço concluído no período selecionado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function ClientEditionsPanel({
  clientId,
  editions,
  demands = [],
  onRefetch,
}: {
  clientId: string;
  editions: any[];
  demands?: any[];
  onRefetch: () => void;
}) {
  const createFn = useServerFn(createClientEdition);
  const updateFn = useServerFn(updateClientEdition);
  const deleteFn = useServerFn(deleteClientEdition);
  const [name, setName] = useState("");
  const [isActive, setIsActive] = useState(false);
  const [billingMonth, setBillingMonth] = useState<string>("none");
  const [billingYear, setBillingYear] = useState<string>(() => String(new Date().getFullYear()));
  const [price, setPrice] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  // Edit states
  const [editingEdition, setEditingEdition] = useState<any | null>(null);
  const [editName, setEditName] = useState("");
  const [editBillingMonth, setEditBillingMonth] = useState("none");
  const [editBillingYear, setEditBillingYear] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editIsActive, setEditIsActive] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  const MONTHS = [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
  ];

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      await createFn({
        data: {
          client_id: clientId,
          name: name.trim(),
          is_active: isActive,
          billing_month: billingMonth === "none" ? null : Number(billingMonth),
          billing_year: billingMonth === "none" ? null : Number(billingYear),
          price: price ? Number(price) : null,
        },
      });
      toast.success("Edição criada com sucesso!");
      setName("");
      setIsActive(false);
      setBillingMonth("none");
      setPrice("");
      onRefetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar edição");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSetActive(edition: any) {
    try {
      await updateFn({
        data: {
          id: edition.id,
          client_id: clientId,
          name: edition.name,
          is_active: true,
          billing_month: edition.billing_month,
          billing_year: edition.billing_year,
          price: edition.price ? Number(edition.price) : null,
        },
      });
      toast.success("Edição definida como vigente!");
      onRefetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar");
    }
  }

  function startEdit(ed: any) {
    setEditingEdition(ed);
    setEditName(ed.name);
    setEditBillingMonth(ed.billing_month ? String(ed.billing_month) : "none");
    setEditBillingYear(ed.billing_year ? String(ed.billing_year) : String(new Date().getFullYear()));
    setEditPrice(ed.price ? String(ed.price) : "");
    setEditIsActive(!!ed.is_active);
    setIsEditDialogOpen(true);
  }

  async function handleEditSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editingEdition || !editName.trim()) return;
    setSubmitting(true);
    try {
      await updateFn({
        data: {
          id: editingEdition.id,
          client_id: clientId,
          name: editName.trim(),
          is_active: editIsActive,
          billing_month: editBillingMonth === "none" ? null : Number(editBillingMonth),
          billing_year: editBillingMonth === "none" ? null : Number(editBillingYear),
          price: editPrice ? Number(editPrice) : null,
        },
      });
      toast.success("Edição atualizada com sucesso!");
      setIsEditDialogOpen(false);
      setEditingEdition(null);
      onRefetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(editionId: string) {
    if (!confirm("Excluir esta edição permanentemente? As demandas associadas serão desvinculadas.")) return;
    try {
      await deleteFn({ data: { id: editionId } });
      toast.success("Edição excluída.");
      onRefetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir");
    }
  }

  return (
    <Card className="p-6 flex flex-col gap-6">
      <div>
        <h3 className="text-lg font-semibold font-display">Gerenciar Edições / Temporadas</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Crie edições para organizar as demandas desse cliente por evento ou temporada.
        </p>
      </div>

      <form onSubmit={handleAdd} className="flex flex-col gap-4 bg-muted/20 p-4 rounded-lg border border-border">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 w-full text-xs">
          <div className="flex flex-col gap-1.5 md:col-span-2">
            <Label htmlFor="edition-name" className="text-xs font-semibold">Nome da Edição *</Label>
            <Input
              id="edition-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Edição de Julho 2026, Rock in Rio 2026"
              className="h-9 bg-background border-border"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edition-month" className="text-xs font-semibold">Mês do Faturamento</Label>
            <Select value={billingMonth} onValueChange={setBillingMonth}>
              <SelectTrigger id="edition-month" className="h-9 bg-background border-border text-xs">
                <SelectValue placeholder="Mês" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-950 border-zinc-800">
                <SelectItem value="none">Nenhum (Sem fatura)</SelectItem>
                {MONTHS.map((m, idx) => (
                  <SelectItem key={idx} value={String(idx + 1)}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edition-year" className="text-xs font-semibold">Ano do Faturamento</Label>
            <Input
              id="edition-year"
              type="number"
              value={billingYear}
              onChange={(e) => setBillingYear(e.target.value)}
              className="h-9 bg-background border-border text-xs"
              disabled={billingMonth === "none"}
            />
          </div>

          <div className="flex flex-col gap-1.5 md:col-span-2">
            <Label htmlFor="edition-price" className="text-xs font-semibold">Valor do Faturamento (R$)</Label>
            <Input
              id="edition-price"
              type="number"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="Vazio = Acumulado das demandas"
              className="h-9 bg-background border-border text-xs"
              disabled={billingMonth === "none"}
            />
          </div>

          <div className="flex items-center gap-2 h-9 md:col-span-2 md:mt-6">
            <input
              type="checkbox"
              id="edition-active"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="rounded border-border bg-background cursor-pointer"
            />
            <Label htmlFor="edition-active" className="text-xs font-semibold select-none cursor-pointer">
              Definir como edição vigente
            </Label>
          </div>
        </div>

        <div className="flex justify-end border-t border-border/40 pt-3 mt-2">
          <Button type="submit" disabled={submitting} size="sm">
            {submitting ? "Criando..." : "Adicionar Edição"}
          </Button>
        </div>
      </form>

      <div className="flex flex-col gap-2">
        <Label className="text-xs font-semibold">Edições Cadastradas</Label>
        {editions.length === 0 ? (
          <div className="text-sm text-muted-foreground italic py-8 text-center bg-muted/10 rounded border border-dashed border-border">
            Nenhuma edição cadastrada para este cliente.
          </div>
        ) : (
          <div className="border border-border rounded-md divide-y divide-border bg-background">
            {editions.map((ed) => {
              // Calculate accumulated value for this edition
              const editionDemands = demands.filter((d) => d.client_edition_id === ed.id);
              const accumulatedVal = editionDemands.reduce((sum, d) => sum + Number(d.price || 0), 0);

              return (
                <div key={ed.id} className="flex items-center justify-between p-3 text-sm">
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-foreground">{ed.name}</span>
                      {ed.is_active && (
                        <Badge variant="default" className="text-[10px] py-0 px-1.5 bg-emerald-700 text-emerald-100 border-none">
                          Vigente
                        </Badge>
                      )}
                    </div>
                    {ed.billing_month && ed.billing_year && (
                      <div className="text-[11px] text-muted-foreground font-sans mt-0.5">
                        Faturamento:{" "}
                        {ed.price && Number(ed.price) > 0 ? (
                          <span className="text-emerald-400 font-semibold">
                            R$ {Number(ed.price).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (Fixo)
                          </span>
                        ) : (
                          <span className="text-sky-400 font-semibold">
                            R$ {accumulatedVal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (Acumulado de {editionDemands.length} demandas)
                          </span>
                        )}
                        {" "}em {MONTHS[ed.billing_month - 1]}/{ed.billing_year}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {!ed.is_active && (
                      <Button variant="outline" size="sm" className="h-7 px-2 py-0 text-xs" onClick={() => handleSetActive(ed)}>
                        Tornar Vigente
                      </Button>
                    )}
                    <Button variant="outline" size="sm" className="h-7 px-2 py-0 text-xs border-zinc-700 hover:bg-zinc-800 text-zinc-300" onClick={() => startEdit(ed)}>
                      Editar
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 px-2 py-0 text-xs text-red-500 hover:text-red-600" onClick={() => handleDelete(ed.id)}>
                      Excluir
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {isEditDialogOpen && (
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="bg-zinc-950 border-zinc-800 text-foreground max-w-md">
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold font-display">Editar Edição / Temporada</DialogTitle>
            </DialogHeader>

            <form onSubmit={handleEditSave} className="flex flex-col gap-4 mt-4 text-xs">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-edition-name" className="text-xs font-semibold">Nome da Edição *</Label>
                <Input
                  id="edit-edition-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Ex: Edição 2026"
                  className="h-9 bg-background border-border text-xs"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="edit-edition-month" className="text-xs font-semibold">Mês do Faturamento</Label>
                  <Select value={editBillingMonth} onValueChange={setEditBillingMonth}>
                    <SelectTrigger id="edit-edition-month" className="h-9 bg-background border-border text-xs">
                      <SelectValue placeholder="Mês" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-950 border-zinc-800">
                      <SelectItem value="none">Nenhum (Sem fatura)</SelectItem>
                      {MONTHS.map((m, idx) => (
                        <SelectItem key={idx} value={String(idx + 1)}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="edit-edition-year" className="text-xs font-semibold">Ano do Faturamento</Label>
                  <Input
                    id="edit-edition-year"
                    type="number"
                    value={editBillingYear}
                    onChange={(e) => setEditBillingYear(e.target.value)}
                    className="h-9 bg-background border-border text-xs"
                    disabled={editBillingMonth === "none"}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-edition-price" className="text-xs font-semibold">Valor do Faturamento (R$)</Label>
                <Input
                  id="edit-edition-price"
                  type="number"
                  step="0.01"
                  value={editPrice}
                  onChange={(e) => setEditPrice(e.target.value)}
                  placeholder="Deixe vazio para o valor acumulado"
                  className="h-9 bg-background border-border text-xs"
                  disabled={editBillingMonth === "none"}
                />
                <span className="text-[10px] text-muted-foreground mt-0.5">
                  Deixe vazio ou em 0,00 para calcular o total acumulado das demandas desta edição.
                </span>
              </div>

              <div className="flex items-center gap-2 h-9">
                <input
                  type="checkbox"
                  id="edit-edition-active"
                  checked={editIsActive}
                  onChange={(e) => setEditIsActive(e.target.checked)}
                  className="rounded border-border bg-background cursor-pointer"
                />
                <Label htmlFor="edit-edition-active" className="text-xs font-semibold select-none cursor-pointer">
                  Definir como edição vigente
                </Label>
              </div>

              <div className="flex justify-end gap-3 border-t border-border/40 pt-4 mt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setIsEditDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={submitting} size="sm">
                  {submitting ? "Salvando..." : "Salvar Alterações"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}