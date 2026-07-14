import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listDemands } from "@/lib/demands.functions";
import { listClients } from "@/lib/clients.functions";
import { Card } from "@/components/ui/card";
import { AlertCircle, ListChecks, Users, CheckCircle2 } from "lucide-react";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({ meta: [{ title: "Dashboard — Creative Flow Hub" }] }),
  component: Dashboard,
});

function Dashboard() {
  const demandsFn = useServerFn(listDemands);
  const clientsFn = useServerFn(listClients);
  const { data: demands = [] } = useQuery({ queryKey: ["demands"], queryFn: () => demandsFn() });
  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: () => clientsFn() });

  const open = demands.filter((d) => d.status !== "concluido" && d.status !== "rascunho");
  const today = new Date().toISOString().slice(0, 10);
  const overdue = open.filter((d) => d.due_date && d.due_date < today);
  const done = demands.filter((d) => d.status === "concluido");

  const stats = [
    { label: "Demandas em aberto", value: open.length, icon: ListChecks, tone: "text-primary" },
    { label: "Atrasadas", value: overdue.length, icon: AlertCircle, tone: "text-destructive" },
    { label: "Concluídas", value: done.length, icon: CheckCircle2, tone: "text-emerald-500" },
    { label: "Clientes ativos", value: clients.filter((c) => c.access_active).length, icon: Users, tone: "text-primary" },
  ];

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
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
                <Link
                  key={d.id}
                  to="/demands"
                  className="flex items-center justify-between text-sm py-2 border-b border-border last:border-0 hover:text-primary"
                >
                  <span className="truncate">{d.title}</span>
                  <span className="text-xs text-muted-foreground shrink-0 ml-2">{d.due_date}</span>
                </Link>
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
                Nenhum cliente. <Link to="/clients/new" className="text-primary underline">Criar o primeiro</Link>.
              </p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}