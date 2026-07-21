import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ActivityStatus = "gargalo" | "inativo" | "saudavel" | "atencao";

export interface ClientActivity {
  clientId: string;
  clientName: string;
  status: ActivityStatus;
  estoqueTotal: number;
  entregasRecentes: number;
  demandaAntiga: boolean;
}

function getStatusLabel(status: ActivityStatus): string {
  switch (status) {
    case "gargalo": return "Gargalo";
    case "inativo": return "Inativo";
    case "saudavel": return "Saudável";
    case "atencao": return "Atenção";
  }
}

function getStatusColor(status: ActivityStatus): string {
  switch (status) {
    case "gargalo": return "#a855f7";
    case "inativo": return "#ef4444";
    case "saudavel": return "#22c55e";
    case "atencao": return "#eab308";
  }
}

function evaluateStatus(estoqueTotal: number, demandaAntiga: boolean, entregasRecentes: number): ActivityStatus {
  if (demandaAntiga && entregasRecentes === 0) return "gargalo";
  if (estoqueTotal === 0 && entregasRecentes === 0) return "inativo";
  if (entregasRecentes >= 2 && estoqueTotal >= 1) return "saudavel";
  return "atencao";
}

export { getStatusLabel, getStatusColor, evaluateStatus };

export const getClientActivityStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      const threeDaysAgoStr = threeDaysAgo.toISOString();

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const sevenDaysAgoStr = sevenDaysAgo.toISOString();

      // Fetch active clients
      const { data: clients, error: clientErr } = await context.supabase
        .from("clients")
        .select("id, name")
        .is("deleted_at", null)
        .eq("access_active", true)
        .order("name", { ascending: true });

      if (clientErr) throw clientErr;
      if (!clients || clients.length === 0) return [];

      const clientIds = clients.map((c) => c.id);

      // Fetch all non-deleted demands for these clients
      const { data: demands, error: demandErr } = await context.supabase
        .from("demands")
        .select("client_id, status, created_at, updated_at")
        .is("deleted_at", null)
        .in("client_id", clientIds);

      if (demandErr) throw demandErr;

      const backlogStatuses = new Set(["nao_iniciado", "com_ajustes", "fazendo"]);
      const oldBacklogStatuses = new Set(["nao_iniciado", "com_ajustes"]);
      const deliveryStatuses = new Set(["para_analise", "concluido"]);

      const result: ClientActivity[] = clients.map((client) => {
        const clientDemands = (demands || []).filter((d) => d.client_id === client.id);
        const emptyStatuses = new Set(["rascunho"]);

        let estoqueTotal = 0;
        let demandaAntiga = false;
        let entregasRecentes = 0;

        for (const d of clientDemands) {
          if (backlogStatuses.has(d.status)) {
            estoqueTotal++;
          }

          if (oldBacklogStatuses.has(d.status)) {
            const updated = d.updated_at || d.created_at;
            if (updated && updated < threeDaysAgoStr) {
              demandaAntiga = true;
            }
          }

          if (deliveryStatuses.has(d.status)) {
            const updated = d.updated_at || d.created_at;
            if (updated && updated >= sevenDaysAgoStr) {
              entregasRecentes++;
            }
          }
        }

        const status = evaluateStatus(estoqueTotal, demandaAntiga, entregasRecentes);

        return {
          clientId: client.id,
          clientName: client.name,
          status,
          estoqueTotal,
          entregasRecentes,
          demandaAntiga,
        };
      });

      return result;
    } catch (e: any) {
      console.error("getClientActivityStatus error:", e);
      return [];
    }
  });
