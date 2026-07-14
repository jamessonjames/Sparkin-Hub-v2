import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useMyRole } from "@/hooks/use-my-role";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Creative Flow Hub" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { user } = Route.useRouteContext();
  const role = useMyRole();
  const navigate = useNavigate();

  async function signOut() {
    await supabase.auth.signOut();
    toast.success("Você saiu.");
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="font-display text-xl font-bold">Creative Flow Hub</h1>
            <p className="text-xs text-muted-foreground">
              {user.email} · {role.isOwner ? "Proprietário" : role.isAdminOrOwner ? "Admin" : "Colaborador"}
            </p>
          </div>
          <button className="btn-ghost" onClick={signOut}>Sair</button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="surface-card p-8">
          <h2 className="text-lg font-semibold mb-2">Fase 1 concluída ✅</h2>
          <p className="text-sm text-muted-foreground">
            Fundação em pé: autenticação, papéis (owner/admin/collaborator), schema base
            (clients, demands, notes, credit tiers) e função admin-users prontos.
          </p>
          <p className="text-sm text-muted-foreground mt-3">
            Próximo passo: <strong className="text-foreground">Fase 2 — Núcleo</strong> (CRUD de clientes, demandas, kanban, sidebar).
          </p>
        </div>
      </main>
    </div>
  );
}
