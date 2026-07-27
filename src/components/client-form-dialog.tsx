import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient as createClientFn, getClient } from "@/lib/clients.functions";
import { ClientForm, type ClientFormValues } from "@/components/client-form";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface ClientFormState {
  open: boolean;
  parentId?: string;
  isProject?: boolean;
}

export function ClientFormDialog() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const create = useServerFn(createClientFn);
  const [state, setState] = useState<ClientFormState>({ open: false });
  const [loading, setLoading] = useState(false);

  const { data: parentClient } = useQuery({
    queryKey: ["client", state.parentId],
    queryFn: () => getClient({ data: { id: state.parentId! } }),
    enabled: !!state.parentId && state.open,
  });

  useEffect(() => {
    function handler(e: CustomEvent<{ parentId?: string; isProject?: boolean }>) {
      setState({ open: true, parentId: e.detail?.parentId, isProject: e.detail?.isProject });
    }
    window.addEventListener("open-client-form", handler as EventListener);
    return () => window.removeEventListener("open-client-form", handler as EventListener);
  }, []);

  async function submit(values: ClientFormValues) {
    setLoading(true);
    try {
      const res = await create({
        data: { ...values, parent_id: state.parentId ?? null, is_project: state.isProject ?? false },
      });
      toast.success(state.isProject ? "Projeto criado!" : "Cliente criado!");
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["clientActivity"] });
      qc.invalidateQueries({ queryKey: ["clientActivityMap"] });
      setState({ open: false });
      if (res?.id) navigate({ to: "/clients/$id", params: { id: res.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={state.open} onOpenChange={(o) => !o && setState({ open: false })}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{state.isProject ? "Novo Projeto" : "Novo Cliente"}</DialogTitle>
          <p className="text-xs text-muted-foreground">
            {state.isProject && parentClient
              ? `Vincular ao cliente: ${(parentClient as any).name}`
              : "Cadastre os dados principais."}
          </p>
        </DialogHeader>
        <ClientForm
          onSubmit={submit}
          submitting={loading}
          submitLabel={state.isProject ? "Criar projeto" : "Criar cliente"}
          hideBilling={!!state.isProject}
          initial={state.parentId ? { parent_id: state.parentId } : undefined}
        />
      </DialogContent>
    </Dialog>
  );
}
