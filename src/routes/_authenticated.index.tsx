import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listDemands } from "@/lib/demands.functions";
import { listClients } from "@/lib/clients.functions";
import { Card } from "@/components/ui/card";
import { AlertCircle, ListChecks, Users, CheckCircle2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useDemandOverlay } from "@/contexts/demand-overlay";
import { LoadingSpinner } from "@/components/loading-spinner";
import { getClientActivityStatus, getStatusColor, getStatusLabel } from "@/lib/activity.functions";
import type { ClientActivity } from "@/lib/activity.functions";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({ meta: [{ title: "Dashboard — Sparkin Hub" }] }),
  component: Dashboard,
});

function Dashboard() {
  const demandsFn = useServerFn(listDemands);
  const clientsFn = useServerFn(listClients);
  const activityFn = useServerFn(getClientActivityStatus);
  const { data: demands = [], isPending: demandsLoading } = useQuery({ queryKey: ["demands"], queryFn: () => demandsFn(), staleTime: 2 * 60 * 1000 });
  const { data: clients = [], isPending: clientsLoading } = useQuery({ queryKey: ["clients"], queryFn: () => clientsFn() });
  const { data: _clientActivities } = useQuery({
    queryKey: ["clientActivity"],
    queryFn: () => activityFn(),
  });
  const clientActivities = Array.isArray(_clientActivities) ? _clientActivities : [];

  const open = demands.filter((d) => d.status !== "concluido" && d.status !== "rascunho");
  const today = new Date().toISOString().slice(0, 10);
  const overdue = open.filter((d) => d.due_date && d.due_date < today);
  const done = demands.filter((d) => d.status === "concluido");
  const overlay = useDemandOverlay();

  if (demandsLoading || clientsLoading) return <LoadingSpinner />;

  const stats = [
    { label: "Demandas em aberto", value: open.length, icon: ListChecks, tone: "text-primary" },
    { label: "Atrasadas", value: overdue.length, icon: AlertCircle, tone: "text-destructive" },
    { label: "Concluídas", value: done.length, icon: CheckCircle2, tone: "text-emerald-500" },
    { label: "Clientes ativos", value: clients.filter((c) => c.access_active).length, icon: Users, tone: "text-primary" },
  ];

  return (
    <div className="w-full max-w-[1400px] mx-auto p-6 space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold text-foreground">Dashboard</h2>
        <p className="text-sm text-muted-foreground">Visão geral do seu fluxo criativo.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Card key={s.label} className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{s.label}</span>
              <s.icon className={`h-4 w-4 ${s.tone}`} />
            </div>
            <div className="mt-2 font-display text-3xl font-bold text-foreground">{s.value}</div>
          </Card>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="p-4">
          <h3 className="font-semibold text-foreground mb-3">Próximas entregas</h3>
          <div className="space-y-2">
            {open
              .filter((d) => d.due_date)
              .sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1))
              .slice(0, 5)
              .map((d) => (
                <button
                  key={d.id}
                  onClick={() => overlay.open(d.id, d.clients ? [d.clients] : undefined)}
                  className="flex items-center justify-between text-sm py-2 border-b border-border last:border-0 hover:text-primary w-full text-left cursor-pointer"
                >
                  <span className="truncate">{d.title}</span>
                  <span className="text-xs text-muted-foreground shrink-0 ml-2">{d.due_date}</span>
                </button>
              ))}
            {open.filter((d) => d.due_date).length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhuma entrega agendada.</p>
            )}
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="font-semibold text-foreground mb-3">Clientes recentes</h3>
          <div className="space-y-2">
            {clients.slice(0, 5).map((c) => (
              <Link
                key={c.id}
                to="/clients/$id"
                params={{ id: c.id }}
                className="flex items-center justify-between text-sm py-2 border-b border-border last:border-0 hover:text-primary"
              >
                <span className="truncate">{c.name}</span>
                <span className="text-xs text-muted-foreground shrink-0 ml-2">
                  {c.billing_model === "credits" ? "Créditos" : "Fixo"}
                </span>
              </Link>
            ))}
            {clients.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nenhum cliente.{" "}
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent("open-client-form"))}
                  className="text-primary underline cursor-pointer"
                >
                  Criar o primeiro
                </button>
                .
              </p>
            )}
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <h3 className="font-semibold text-foreground mb-3">Saúde & Ritmo dos Clientes</h3>
        <div className="space-y-1">
          {clientActivities.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum cliente ativo.</p>
          ) : (
            clientActivities.map((a) => (
              <Link
                key={a.clientId}
                to="/clients/$id"
                params={{ id: a.clientId }}
                className="flex items-center gap-3 text-sm py-2 border-b border-border last:border-0 hover:text-primary"
              >
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: getStatusColor(a.status) }}
                />
                <span className="truncate flex-1">{a.clientName}</span>
                <span
                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0"
                  style={{
                    color: getStatusColor(a.status),
                    backgroundColor: `${getStatusColor(a.status)}18`,
                  }}
                >
                  {getStatusLabel(a.status)}
                </span>
                <span className="text-[11px] text-muted-foreground shrink-0 tabular-nums">
                  {a.estoqueTotal} na fila | {a.entregasRecentes} entregues
                </span>
              </Link>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}