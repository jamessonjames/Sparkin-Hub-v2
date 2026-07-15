import { createFileRoute, notFound } from "@tanstack/react-router";
import { getPublicPortal } from "@/lib/portal.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS, PRIORITY_LABELS, PRIORITY_COLORS } from "@/lib/demand-labels";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/portal/$slug")({
  loader: async ({ params }) => {
    const data = await getPublicPortal({ data: { slug: params.slug } });
    if (!data) throw notFound();
    return data;
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData ? `Portal · ${loaderData.client.name}` : "Portal" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
      { name: "googlebot", content: "noindex, nofollow" },
    ],
  }),
  errorComponent: () => (
    <div className="min-h-screen grid place-items-center p-6 text-muted-foreground">
      Erro ao carregar portal.
    </div>
  ),
  notFoundComponent: () => (
    <div className="min-h-screen grid place-items-center p-6 text-muted-foreground">
      Portal não encontrado ou inativo.
    </div>
  ),
  component: PortalPage,
});

function PortalPage() {
  const { client, demands } = Route.useLoaderData();

  type D = (typeof demands)[number];
  const active = demands.filter((d: D) => d.status !== "concluido");
  const done = demands.filter((d: D) => d.status === "concluido");

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
            Portal do cliente
          </p>
          <h1 className="text-3xl font-bold text-foreground">{client.name}</h1>
          {client.contact_name && (
            <p className="text-muted-foreground mt-1">{client.contact_name}</p>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        <section>
          <h2 className="text-lg font-semibold mb-4">
            Em andamento{" "}
            <span className="text-muted-foreground font-normal">({active.length})</span>
          </h2>
          {active.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhuma demanda em andamento.</p>
          ) : (
            <div className="grid gap-3">
              {active.map((d: D) => (
                <DemandCard key={d.id} d={d} />
              ))}
            </div>
          )}
        </section>

        {done.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold mb-4">
              Concluídas{" "}
              <span className="text-muted-foreground font-normal">({done.length})</span>
            </h2>
            <div className="grid gap-3">
              {done.map((d: D) => (
                <DemandCard key={d.id} d={d} />
              ))}
            </div>
          </section>
        )}

        <footer className="pt-8 text-center text-xs text-muted-foreground">
          Link privado · não compartilhe publicamente
        </footer>
      </main>
    </div>
  );
}

function DemandCard({
  d,
}: {
  d: {
    id: string;
    title: string;
    status: string;
    priority: string | null;
    due_date: string | null;
  };
}) {
  return (
    <Card className="p-4 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h3 className="font-medium text-foreground truncate">{d.title}</h3>
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <Badge variant="outline">
            {STATUS_LABELS[d.status as keyof typeof STATUS_LABELS] ?? d.status}
          </Badge>
          {d.priority && (
            <Badge className={cn("border-0", PRIORITY_COLORS[d.priority])}>
              {PRIORITY_LABELS[d.priority] ?? d.priority}
            </Badge>
          )}
          {d.due_date && (
            <span className="text-xs text-muted-foreground">
              Entrega: {new Date(d.due_date).toLocaleDateString("pt-BR")}
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}
