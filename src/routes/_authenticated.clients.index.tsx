import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listClients } from "@/lib/clients.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/clients/")({
  head: () => ({ meta: [{ title: "Clientes — Creative Flow Hub" }] }),
  component: ClientsList,
});

function ClientsList() {
  const listFn = useServerFn(listClients);
  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: () => listFn() });
  const [q, setQ] = useState("");

  const filtered = clients.filter(
    (c) =>
      !q ||
      c.name.toLowerCase().includes(q.toLowerCase()) ||
      (c.email ?? "").toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div className="p-6 space-y-4 w-full">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold text-foreground">Clientes</h2>
          <p className="text-sm text-muted-foreground">
            {clients.length} {clients.length === 1 ? "cliente" : "clientes"}
          </p>
        </div>
        <Button asChild>
          <Link to="/clients/new">
            <Plus className="h-4 w-4 mr-1" /> Novo cliente
          </Link>
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome ou e-mail..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((c) => (
          <Link key={c.id} to="/clients/$id" params={{ id: c.id }}>
            <Card className="p-4 hover:border-primary/50 transition-colors cursor-pointer">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <h3 className="font-semibold text-foreground truncate">{c.name}</h3>
                  {c.contact_name && (
                    <p className="text-xs text-muted-foreground truncate">{c.contact_name}</p>
                  )}
                </div>
                <Badge variant={c.access_active ? "default" : "secondary"}>
                  {c.access_active ? "Ativo" : "Inativo"}
                </Badge>
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <span>{c.billing_model === "credits" ? "Créditos" : "Fixo"}</span>
                {c.email && <span>· {c.email}</span>}
              </div>
            </Card>
          </Link>
        ))}
        {filtered.length === 0 && (
          <Card className="p-8 text-center col-span-full">
            <p className="text-sm text-muted-foreground">
              {clients.length === 0 ? "Nenhum cliente ainda." : "Nenhum cliente encontrado."}
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}