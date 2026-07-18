import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { createClient as createClientFn } from "@/lib/clients.functions";
import { ClientForm, type ClientFormValues } from "@/components/client-form";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/clients/new")({
  head: () => ({ meta: [{ title: "Novo cliente" }] }),
  component: NewClient,
});

function NewClient() {
  const create = useServerFn(createClientFn);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  async function submit(values: ClientFormValues) {
    setLoading(true);
    try {
      const res = await create({ data: values });
      toast.success("Cliente criado!");
      qc.invalidateQueries({ queryKey: ["clients"] });
      if (res?.id) navigate({ to: "/clients/$id", params: { id: res.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl p-6 space-y-4">
      <div>
        <h2 className="font-display text-2xl font-bold text-foreground">Novo cliente</h2>
        <p className="text-sm text-muted-foreground">Cadastre os dados principais.</p>
      </div>
      <Card className="p-6">
        <ClientForm onSubmit={submit} submitting={loading} submitLabel="Criar cliente" />
      </Card>
    </div>
  );
}