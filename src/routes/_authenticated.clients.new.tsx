import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { createClient as createClientFn, getClient } from "@/lib/clients.functions";
import { ClientForm, type ClientFormValues } from "@/components/client-form";
import { Card } from "@/components/ui/card";

const newClientSearchSchema = z.object({
  parent_id: z.string().optional(),
  is_project: z.coerce.boolean().optional(),
});

export const Route = createFileRoute("/_authenticated/clients/new")({
  validateSearch: (search) => newClientSearchSchema.parse(search),
  head: (ctx) => ({
    meta: [{ title: (ctx as any).search.is_project ? "Novo Projeto" : "Novo cliente" }],
  }),
  component: NewClient,
});

function NewClient() {
  const create = useServerFn(createClientFn);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const { parent_id, is_project } = Route.useSearch();

  const { data: parentClient } = useQuery({
    queryKey: ["client", parent_id],
    queryFn: () => getClient({ data: { id: parent_id! } }),
    enabled: !!parent_id,
  });

  async function submit(values: ClientFormValues) {
    setLoading(true);
    try {
      const res = await create({
        data: { ...values, parent_id: parent_id ?? null, is_project: is_project ?? false },
      });
      toast.success(is_project ? "Projeto criado!" : "Cliente criado!");
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
        <h2 className="font-display text-2xl font-bold text-foreground">
          {is_project ? "Novo Projeto" : "Novo cliente"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {is_project
            ? parentClient
              ? `Vincular ao cliente: ${parentClient.name}`
              : "Cadastre os dados do projeto."
            : "Cadastre os dados principais."}
        </p>
      </div>
      <Card className="p-6">
        <ClientForm
          onSubmit={submit}
          submitting={loading}
          submitLabel={is_project ? "Criar projeto" : "Criar cliente"}
          hideBilling={!!is_project}
          initial={parent_id ? { parent_id } : undefined}
        />
      </Card>
    </div>
  );
}