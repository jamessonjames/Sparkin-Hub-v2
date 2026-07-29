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
  CheckCircle2,
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

  if (demandsLoading || clientsLoading) return <LoadingSpinner />;

  const open = demands.filter((d) => d.status !== "concluido" && d.status !== "rascunho");
  const now = new Date();
  const nowTime = now.getTime();
  const todayStr = now.toISOString().slice(0, 10);
  const overdue = open.filter((d) => d.due_date && d.due_date < todayStr);
  const done = demands.filter((d) => d.status === "concluido");
  const refacaoList = open.filter((d) => d.status === "com_ajustes");

  // Scheduled open demands with calculate start & end times
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
  // Priority: slot covering now OR status 'fazendo' OR earliest scheduled today
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

  // 4. UPCOMING TIMELINE
  const timelineDemands = scheduledOpen
    .filter((d) => d.id !== activeDemand?.id)
    .slice(0, 6);

  const stats = [
    { label: "Demandas em aberto", value: open.length, icon: ListChecks, tone: "text-primary" },
    { label: "Atrasadas", value: overdue.length, icon: AlertCircle, tone: "text-destructive" },
    { label: "Em Refação", value: refacaoList.length, icon: RotateCcw, tone: "text-amber-400" },
    { label: "Clientes ativos", value: clients.filter((c) => c.access_active).length, icon: Users, tone: "text-primary" },
  ];

  return (
    <div className="w-full max-w-[1400px] mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h2 className="font-display text-2xl font-bold text-foreground">Dashboard</h2>
        <p className="text-sm text-muted-foreground">Visão geral da sua fila de trabalho e ritmo de entregas.</p>
      </div>

      {/* Top KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Card key={s.label} className="p-4 border-border/60 bg-surface-2/40 hover:border-border/90 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium">{s.label}</span>
              <s.icon className={`h-4 w-4 ${s.tone}`} />
            </div>
            <div className="mt-2 font-display text-3xl font-bold text-foreground tabular-nums">{s.value}</div>
          </Card>
        ))}
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

      {/* Main Grid: Fila de Entregas & Clientes Recentes */}
      <div className="grid md:grid-cols-3 gap-4">
        {/* Timeline / Fila de Entregas (Spans 2 columns) */}
        <Card className="p-5 md:col-span-2 border-border/60 bg-surface-2/30">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" /> Fila de Entregas Cronológica
            </h3>
            <span className="text-xs text-muted-foreground font-medium">
              A partir do horário de agora
            </span>
          </div>

          <div className="divide-y divide-border/60">
            {timelineDemands.map((d) => {
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

            {timelineDemands.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">Nenhuma entrega agendada na fila.</p>
            )}
          </div>
        </Card>

        {/* Clientes Recentes */}
        <Card className="p-5 border-border/60 bg-surface-2/30">
          <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" /> Clientes Recentes
          </h3>
          <div className="divide-y divide-border/60">
            {clients.slice(0, 6).map((c) => (
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
              <p className="text-sm text-muted-foreground py-4">
                Nenhum cliente cadastrado.
              </p>
            )}
          </div>
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