import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listDemands } from "@/lib/demands.functions";
import { listClients } from "@/lib/clients.functions";
import { Card } from "@/components/ui/card";
import {
  AlertCircle,
  ListChecks,
  Users,
  Play,
  ArrowRight,
  RotateCcw,
  Clock,
  Sparkles,
  ChevronRight,
  Building2,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useDemandOverlay } from "@/contexts/demand-overlay";
import { LoadingSpinner } from "@/components/loading-spinner";
import { getClientActivityStatus, getStatusColor, getStatusLabel } from "@/lib/activity.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({ meta: [{ title: "Dashboard — Sparkin Hub" }] }),
  component: Dashboard,
});

function formatFriendlyDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "Sem data";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;

  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();

  const timeStr = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  if (isToday) return `Hoje às ${timeStr}`;
  if (isTomorrow) return `Amanhã às ${timeStr}`;

  const dayMonth = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  if (d.getTime() < now.getTime()) {
    return `Atrasada (${dayMonth} às ${timeStr})`;
  }
  return `${dayMonth} às ${timeStr}`;
}

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  fazendo: { label: "Em Andamento", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  com_ajustes: { label: "Com Ajustes", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  nao_iniciado: { label: "A Iniciar", className: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  para_analise: { label: "Para Análise", className: "bg-purple-500/15 text-purple-400 border-purple-500/30" },
  rascunho: { label: "Rascunho", className: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30" },
  concluido: { label: "Concluído", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
};

function Dashboard() {
  const demandsFn = useServerFn(listDemands);
  const clientsFn = useServerFn(listClients);
  const activityFn = useServerFn(getClientActivityStatus);
  const { data: demands = [], isPending: demandsLoading } = useQuery({ queryKey: ["demands"], queryFn: () => demandsFn(), staleTime: 5 * 60 * 1000 });
  const { data: clients = [], isPending: clientsLoading } = useQuery({ queryKey: ["clients"], queryFn: () => clientsFn(), staleTime: 5 * 60 * 1000 });
  const { data: _clientActivities } = useQuery({
    queryKey: ["clientActivity"],
    queryFn: () => activityFn(),
  });
  const clientActivities = Array.isArray(_clientActivities) ? _clientActivities : [];
  const overlay = useDemandOverlay();

  // Tab filter state for main demands box
  const [activeFilter, setActiveFilter] = useState<"cronologica" | "em_aberto" | "atrasadas" | "refacao">("cronologica");

  if (demandsLoading || clientsLoading) return <LoadingSpinner />;

  const open = demands.filter((d) => d.status !== "concluido" && d.status !== "rascunho");
  const now = new Date();
  const nowTime = now.getTime();
  const todayStr = now.toISOString().slice(0, 10);
  const overdue = open.filter((d) => d.due_date && d.due_date < todayStr);
  const refacaoList = open.filter((d) => d.status === "com_ajustes");

  // Scheduled open demands with calculated start & end times
  const scheduledOpen = open
    .filter((d) => d.due_date)
    .map((d) => {
      const start = new Date(d.due_date!).getTime();
      const durationHours = d.estimated_hours ? Number(d.estimated_hours) : 1;
      const end = start + durationHours * 3600 * 1000;
      return { ...d, startTime: start, endTime: end };
    })
    .sort((a, b) => a.startTime - b.startTime);

  // 1. ACTIVE DEMAND (Demanda em Produção Agora)
  let activeDemand = scheduledOpen.find(
    (d) => nowTime >= d.startTime && nowTime < d.endTime
  );
  if (!activeDemand) {
    activeDemand = scheduledOpen.find((d) => d.status === "fazendo") || (open.find((d) => d.status === "fazendo") as any);
  }
  if (!activeDemand && scheduledOpen.length > 0) {
    activeDemand = scheduledOpen.find((d) => d.startTime >= nowTime) || scheduledOpen[0];
  }

  // 2. NEXT DEMAND IN QUEUE (Próxima da Fila)
  const nextDemand = scheduledOpen.find(
    (d) => d.id !== activeDemand?.id && d.startTime >= (activeDemand ? activeDemand.startTime : nowTime)
  );

  // 3. REFACÇÃO HIGHLIGHT
  const activeRefacao = refacaoList.find((d) => d.id !== activeDemand?.id && d.id !== nextDemand?.id) || refacaoList[0];

  // Dynamically computed demands list based on tab filter
  let displayedDemands: any[] = [];
  if (activeFilter === "cronologica") {
    displayedDemands = scheduledOpen.filter((d) => d.id !== activeDemand?.id);
  } else if (activeFilter === "em_aberto") {
    displayedDemands = [...open].sort((a, b) => (a.due_date && b.due_date ? a.due_date.localeCompare(b.due_date) : 0));
  } else if (activeFilter === "atrasadas") {
    displayedDemands = [...overdue].sort((a, b) => (a.due_date && b.due_date ? a.due_date.localeCompare(b.due_date) : 0));
  } else if (activeFilter === "refacao") {
    displayedDemands = [...refacaoList].sort((a, b) => (a.due_date && b.due_date ? a.due_date.localeCompare(b.due_date) : 0));
  }

  return (
    <div className="w-full max-w-[1400px] mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h2 className="font-display text-2xl font-bold text-foreground">Dashboard</h2>
        <p className="text-sm text-muted-foreground">Visão geral da sua fila de trabalho e ritmo de entregas.</p>
      </div>

      {/* Active Work Hub: Active Demand, Next in Queue & Refaction */}
      <div className="grid md:grid-cols-3 gap-4">
        {/* 1. Active Demand Card */}
        <Card className="p-5 border border-emerald-500/30 bg-emerald-950/10 shadow-lg shadow-emerald-950/20 relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                Executando Agora
              </span>
              {activeDemand?.due_date && (
                <span className="text-xs text-emerald-300/80 font-medium">
                  {formatFriendlyDateTime(activeDemand.due_date)}
                </span>
              )}
            </div>

            {activeDemand ? (
              <div className="space-y-2">
                <h4 className="text-lg font-bold text-foreground line-clamp-2 leading-snug">
                  {activeDemand.title}
                </h4>
                {activeDemand.clients && (
                  <p className="text-xs text-emerald-300/90 font-medium flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5" />
                    {activeDemand.clients.name}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground py-4">Nenhuma demanda ativa agendada no momento.</p>
            )}
          </div>

          {activeDemand && (
            <button
              onClick={() => overlay.open(activeDemand.id, activeDemand.clients ? [activeDemand.clients] : undefined)}
              className="mt-4 flex items-center justify-between px-3.5 py-2.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-bold transition-all cursor-pointer w-full"
            >
              <span className="flex items-center gap-1.5">
                <Play className="h-3.5 w-3.5 fill-current" /> Abrir Demanda Ativa
              </span>
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </Card>

        {/* 2. Next in Queue Card */}
        <Card className="p-5 border border-blue-500/30 bg-blue-950/10 shadow-lg shadow-blue-950/20 relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase bg-blue-500/20 text-blue-400 border border-blue-500/30">
                <ArrowRight className="h-3 w-3" /> Próxima da Fila
              </span>
              {nextDemand?.due_date && (
                <span className="text-xs text-blue-300/80 font-medium">
                  {formatFriendlyDateTime(nextDemand.due_date)}
                </span>
              )}
            </div>

            {nextDemand ? (
              <div className="space-y-2">
                <h4 className="text-lg font-bold text-foreground line-clamp-2 leading-snug">
                  {nextDemand.title}
                </h4>
                {nextDemand.clients && (
                  <p className="text-xs text-blue-300/90 font-medium flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5" />
                    {nextDemand.clients.name}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground py-4">Sem próxima demanda na fila agendada.</p>
            )}
          </div>

          {nextDemand && (
            <button
              onClick={() => overlay.open(nextDemand.id, nextDemand.clients ? [nextDemand.clients] : undefined)}
              className="mt-4 flex items-center justify-between px-3.5 py-2.5 rounded-lg bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/30 text-blue-300 text-xs font-bold transition-all cursor-pointer w-full"
            >
              <span>Ver Detalhes</span>
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </Card>

        {/* 3. Refaction / Attention Card */}
        <Card className="p-5 border border-amber-500/30 bg-amber-950/10 shadow-lg shadow-amber-950/20 relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase bg-amber-500/20 text-amber-400 border border-amber-500/30">
                <RotateCcw className="h-3 w-3" /> Em Refação / Ajustes ({refacaoList.length})
              </span>
            </div>

            {activeRefacao ? (
              <div className="space-y-2">
                <h4 className="text-lg font-bold text-foreground line-clamp-2 leading-snug">
                  {activeRefacao.title}
                </h4>
                {activeRefacao.clients && (
                  <p className="text-xs text-amber-300/90 font-medium flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5" />
                    {activeRefacao.clients.name}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground py-4">Nenhuma demanda aguardando refação.</p>
            )}
          </div>

          {activeRefacao && (
            <button
              onClick={() => overlay.open(activeRefacao.id, activeRefacao.clients ? [activeRefacao.clients] : undefined)}
              className="mt-4 flex items-center justify-between px-3.5 py-2.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-bold transition-all cursor-pointer w-full"
            >
              <span>Revisar Ajustes</span>
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </Card>
      </div>

      {/* Main Grid: Interactive Filter Tabs & Clientes Ativos */}
      <div className="grid md:grid-cols-3 gap-4">
        {/* Main Demands Box with Filter Tabs (Spans 2 columns) */}
        <Card className="p-5 md:col-span-2 border-border/60 bg-surface-2/30">
          {/* Header & Filter Tabs */}
          <div className="flex items-center justify-between gap-2 mb-4 flex-wrap border-b border-border/60 pb-3">
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={() => setActiveFilter("cronologica")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer",
                  activeFilter === "cronologica"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-surface-2"
                )}
              >
                <Clock className="h-3.5 w-3.5" />
                Fila Cronológica
              </button>

              <button
                onClick={() => setActiveFilter("em_aberto")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer",
                  activeFilter === "em_aberto"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-surface-2"
                )}
              >
                <ListChecks className="h-3.5 w-3.5" />
                Em Aberto ({open.length})
              </button>

              <button
                onClick={() => setActiveFilter("atrasadas")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer",
                  activeFilter === "atrasadas"
                    ? "bg-destructive text-destructive-foreground shadow-sm"
                    : "text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                )}
              >
                <AlertCircle className="h-3.5 w-3.5" />
                Atrasadas ({overdue.length})
              </button>

              <button
                onClick={() => setActiveFilter("refacao")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer",
                  activeFilter === "refacao"
                    ? "bg-amber-500 text-zinc-950 font-bold shadow-sm"
                    : "text-muted-foreground hover:text-amber-400 hover:bg-amber-500/10"
                )}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Em Refação ({refacaoList.length})
              </button>
            </div>
          </div>

          {/* Demands List */}
          <div className="divide-y divide-border/60 max-h-[420px] overflow-y-auto pr-1">
            {displayedDemands.map((d) => {
              const badge = STATUS_BADGES[d.status] || STATUS_BADGES.nao_iniciado;
              return (
                <button
                  key={d.id}
                  onClick={() => overlay.open(d.id, d.clients ? [d.clients] : undefined)}
                  className="flex items-center justify-between gap-3 py-3 hover:bg-surface-2/60 px-2 rounded-lg transition-all w-full text-left cursor-pointer group"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${badge.className}`}>
                      {badge.label}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                        {d.title}
                      </p>
                      {d.clients && (
                        <p className="text-xs text-muted-foreground truncate">{d.clients.name}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground font-medium tabular-nums">
                      {formatFriendlyDateTime(d.due_date)}
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary transition-colors" />
                  </div>
                </button>
              );
            })}

            {displayedDemands.length === 0 && (
              <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma demanda encontrada neste filtro.</p>
            )}
          </div>
        </Card>

        {/* Clientes Ativos */}
        <Card className="p-5 border-border/60 bg-surface-2/30 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" /> Clientes Ativos
              </h3>
              <span className="text-xs text-muted-foreground font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                {clients.filter((c) => c.access_active).length} ativos
              </span>
            </div>
            <div className="divide-y divide-border/60 max-h-[380px] overflow-y-auto">
              {clients.filter((c) => c.access_active).slice(0, 8).map((c) => (
                <Link
                  key={c.id}
                  to="/clients/$id"
                  params={{ id: c.id }}
                  className="flex items-center justify-between text-sm py-2.5 hover:text-primary transition-colors group"
                >
                  <span className="truncate font-medium text-foreground group-hover:text-primary">{c.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0 ml-2 bg-surface-2 px-2 py-0.5 rounded border border-border/50">
                    {c.billing_model === "credits" ? "Créditos" : c.billing_model === "seasonal" ? "Sazonal" : "Fixo"}
                  </span>
                </Link>
              ))}
              {clients.length === 0 && (
                <p className="text-sm text-muted-foreground py-4">Nenhum cliente ativo.</p>
              )}
            </div>
          </div>

          <Link
            to="/clients"
            className="mt-4 text-xs font-bold text-primary flex items-center justify-center gap-1.5 py-2 rounded-lg bg-primary/10 hover:bg-primary/20 transition-all text-center"
          >
            Ver todos os clientes <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </Card>
      </div>

      {/* Saúde & Ritmo dos Clientes */}
      <Card className="p-5 border-border/60 bg-surface-2/30">
        <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" /> Saúde & Ritmo dos Clientes
        </h3>
        <div className="divide-y divide-border/60">
          {clientActivities.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">Nenhum cliente ativo.</p>
          ) : (
            clientActivities.map((a) => (
              <Link
                key={a.clientId}
                to="/clients/$id"
                params={{ id: a.clientId }}
                className="flex items-center gap-3 text-sm py-3 hover:bg-surface-2/50 px-2 rounded-lg transition-all group"
              >
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: getStatusColor(a.status) }}
                />
                <span className="truncate flex-1 font-medium text-foreground group-hover:text-primary">{a.clientName}</span>
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 uppercase tracking-wider"
                  style={{
                    color: getStatusColor(a.status),
                    backgroundColor: `${getStatusColor(a.status)}18`,
                  }}
                >
                  {getStatusLabel(a.status)}
                </span>
                <span className="text-xs text-muted-foreground shrink-0 tabular-nums font-medium">
                  {a.estoqueTotal} na fila | {a.entregasRecentes} entregues
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-primary transition-colors" />
              </Link>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
