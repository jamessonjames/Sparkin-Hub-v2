import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import {
  getClient,
  updateClient,
  deleteClient,
} from "@/lib/clients.functions";
import {
  listDemands,
  moveDemandStatus,
  createDemand,
  type DemandStatus,
} from "@/lib/demands.functions";
import { KanbanBoard } from "@/components/kanban-board";
import { DemandForm, type DemandFormValues } from "@/components/demand-form";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useDemandOverlay } from "@/contexts/demand-overlay";
import { listNotes, upsertNote, deleteNote, NOTE_TYPES } from "@/lib/notes.functions";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ClientForm, type ClientFormValues } from "@/components/client-form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ArrowLeft, Trash2, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { getClientCreditTiers, saveClientCreditTiers, calculateTiersPrice, DEFAULT_CREDIT_TIERS, type CreditTier } from "@/lib/credit-tiers";
import { listProfiles } from "@/lib/users.functions";
import { CreditProgressBar } from "@/components/credit-progress-bar";

export const Route = createFileRoute("/_authenticated/clients/$id")({
  head: () => ({ meta: [{ title: "Cliente" }] }),
  component: ClientPage,
});

function ClientPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const getFn = useServerFn(getClient);
  const updateFn = useServerFn(updateClient);
  const deleteFn = useServerFn(deleteClient);
  const demandsFn = useServerFn(listDemands);
  const moveFn = useServerFn(moveDemandStatus);
  const createFn = useServerFn(createDemand);

  const { data: client } = useQuery({
    queryKey: ["client", id],
    queryFn: () => getFn({ data: { id } }),
  });
  const { data: allDemands = [] } = useQuery({
    queryKey: ["demands"],
    queryFn: () => demandsFn(),
  });
  const clientDemands = allDemands.filter((d) => d.client_id === id);

  const [saving, setSaving] = useState(false);
  const overlay = useDemandOverlay();

  async function handleMove(demandId: string, status: DemandStatus) {
    qc.setQueryData<typeof allDemands>(["demands"], (prev) =>
      (prev ?? []).map((d) => (d.id === demandId ? { ...d, status } : d)),
    );
    try {
      await moveFn({ data: { id: demandId, status } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao mover");
      qc.invalidateQueries({ queryKey: ["demands"] });
    }
  }

  async function handleSave(values: ClientFormValues) {
    setSaving(true);
    try {
      await updateFn({ data: { ...values, id } });
      toast.success("Salvo!");
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["client", id] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Excluir este cliente?")) return;
    try {
      await deleteFn({ data: { id } });
      toast.success("Excluído.");
      qc.invalidateQueries({ queryKey: ["clients"] });
      navigate({ to: "/clients" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  if (!client) return <div className="p-6 text-muted-foreground">Carregando...</div>;

  return (
    <div className="flex flex-col h-full p-4 md:p-6 gap-4 overflow-hidden">
      <button
        onClick={() => navigate({ to: "/clients" })}
        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
      >
        <ArrowLeft className="h-3 w-3" /> Voltar
      </button>

      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold text-foreground">{client.name}</h2>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant={client.access_active ? "default" : "secondary"}>
              {client.access_active ? "Ativo" : "Inativo"}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {client.billing_model === "credits" ? "Créditos" : "Fixo"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {client.slug && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const url = `${window.location.origin}/portal/${client.slug}`;
                navigator.clipboard.writeText(url);
                toast.success("Link do portal copiado!");
              }}
            >
              Copiar link do portal
            </Button>
          )}
          <Button variant="destructive" size="sm" onClick={handleDelete}>
            <Trash2 className="h-4 w-4 mr-1" /> Excluir
          </Button>
        </div>
      </div>

      <Tabs defaultValue="demands" className="flex-1 flex flex-col min-h-0">
        <TabsList>
          <TabsTrigger value="demands">
            Demandas ({clientDemands.length})
          </TabsTrigger>
          <TabsTrigger value="overview">Visão geral</TabsTrigger>
          <TabsTrigger value="notes">Notas</TabsTrigger>
          <TabsTrigger value="reports">Relatórios</TabsTrigger>
        </TabsList>

        <TabsContent value="demands" className="mt-4 flex-1 flex flex-col min-h-0 gap-4">
          <div className="flex justify-end">
            <Button
              onClick={() => overlay.openNew([{ id: client.id, name: client.name }], client.id)}
              size="sm"
            >
              <Plus className="h-4 w-4 mr-1" /> Nova demanda
            </Button>
          </div>

          <KanbanBoard
            demands={clientDemands.map((d) => ({
              id: d.id,
              title: d.title,
              status: d.status,
              priority: d.priority,
              due_date: d.due_date,
              clients: d.clients ?? null,
            }))}
            onMove={handleMove}
            onOpen={(demandId) => overlay.open(demandId, [{ id: client.id, name: client.name }])}
            onAdd={(status) => overlay.openNew([{ id: client.id, name: client.name }], client.id, status)}
          />
        </TabsContent>

        <TabsContent value="overview" className="mt-4 overflow-y-auto pb-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            <div className="lg:col-span-2">
              <Card className="p-6">
                <ClientForm
                  initial={{
                    name: client.name,
                    contact_name: client.contact_name,
                    email: client.email,
                    phone: client.phone,
                    billing_model: client.billing_model,
                    fixed_type: client.fixed_type,
                    monthly_value: client.monthly_value,
                    commercial_notes: client.commercial_notes,
                    internal_notes: client.internal_notes,
                    credits_enabled: client.credits_enabled,
                    access_active: client.access_active,
                  }}
                  onSubmit={handleSave}
                  submitting={saving}
                />
              </Card>
            </div>
            {client.billing_model === "credits" && (
              <div className="lg:col-span-1">
                <CreditTiersEditor clientId={client.id} />
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="notes" className="mt-4 overflow-y-auto">
          <ClientNotesPanel clientId={id} />
        </TabsContent>

        <TabsContent value="reports" className="mt-4 overflow-y-auto pb-8">
          <ClientReportsPanel
            clientId={id}
            billingModel={client.billing_model}
            monthlyValue={client.monthly_value}
            demands={clientDemands}
            onOpenDemand={(demandId) => overlay.open(demandId, [{ id: client.id, name: client.name }])}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ClientNotesPanel({ clientId }: { clientId: string }) {
  const listFn = useServerFn(listNotes);
  const upsertFn = useServerFn(upsertNote);
  const delFn = useServerFn(deleteNote);
  const qc = useQueryClient();
  const { data: notes = [] } = useQuery({
    queryKey: ["notes", clientId],
    queryFn: () => listFn({ data: { client_id: clientId } }),
  });

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [noteType, setNoteType] =
    useState<(typeof NOTE_TYPES)[number]>("observacoes");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await upsertFn({
        data: {
          client_id: clientId,
          title,
          content,
          note_type: noteType,
          visibility: "private",
        },
      });
      setTitle("");
      setContent("");
      qc.invalidateQueries({ queryKey: ["notes", clientId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Excluir nota?")) return;
    await delFn({ data: { id } });
    qc.invalidateQueries({ queryKey: ["notes", clientId] });
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <Label>Título</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <Label>Tipo</Label>
            <Select value={noteType} onValueChange={(v) => setNoteType(v as typeof noteType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {NOTE_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label>Conteúdo</Label>
          <Textarea rows={3} value={content} onChange={(e) => setContent(e.target.value)} />
        </div>
        <div className="flex justify-end">
          <Button onClick={save} disabled={saving || !title.trim()} size="sm">
            <Plus className="h-4 w-4 mr-1" /> Adicionar nota
          </Button>
        </div>
      </Card>

      <div className="space-y-2">
        {notes.map((n) => (
          <Card key={n.id} className="p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <div className="font-medium text-sm text-foreground">{n.title}</div>
                  <Badge variant="secondary" className="text-[10px]">{n.note_type}</Badge>
                </div>
                {n.content && (
                  <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{n.content}</p>
                )}
                <div className="text-xs text-muted-foreground mt-2">
                  {new Date(n.updated_at).toLocaleString("pt-BR")}
                </div>
              </div>
              <button
                onClick={() => remove(n.id)}
                className="text-muted-foreground hover:text-destructive"
                aria-label="Excluir"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </Card>
        ))}
        {notes.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">Nenhuma nota ainda.</p>
        )}
      </div>
    </div>
  );
}

function CreditTiersEditor({ clientId }: { clientId: string }) {
  const getTiersFn = useServerFn(getClientCreditTiers);
  const saveTiersFn = useServerFn(saveClientCreditTiers);
  const qc = useQueryClient();

  const { data: creditConfig } = useQuery({
    queryKey: ["client-credit-tiers", clientId],
    queryFn: () => getTiersFn({ data: { client_id: clientId } }),
  });

  const [editingTiers, setEditingTiers] = useState<CreditTier[]>([]);
  const [showProgressBar, setShowProgressBar] = useState(true);
  const [savingTiers, setSavingTiers] = useState(false);

  useEffect(() => {
    if (creditConfig) {
      setEditingTiers(creditConfig.tiers || []);
      setShowProgressBar(creditConfig.show_progress_bar ?? true);
    }
  }, [creditConfig]);

  const addTier = () => {
    const lastTier = editingTiers[editingTiers.length - 1];
    const nextMin = lastTier ? (lastTier.max_credits !== null ? lastTier.max_credits + 1 : lastTier.min_credits + 1) : 0;
    setEditingTiers([
      ...editingTiers,
      { min_credits: nextMin, max_credits: null, price: 1000, extra_per_credit: null }
    ]);
  };

  const removeTier = (index: number) => {
    setEditingTiers(editingTiers.filter((_, i) => i !== index));
  };

  const updateTier = <K extends keyof CreditTier>(index: number, key: K, value: CreditTier[K]) => {
    setEditingTiers(
      editingTiers.map((t, i) => {
        if (i !== index) return t;
        const updated = { ...t, [key]: value };
        if (key === "max_credits" && value !== null) {
          updated.extra_per_credit = null;
        }
        return updated;
      })
    );
  };

  const handleSaveTiers = async () => {
    setSavingTiers(true);
    try {
      await saveTiersFn({
        data: {
          client_id: clientId,
          tiers: editingTiers,
          show_progress_bar: showProgressBar,
        },
      });
      toast.success("Regras de crédito salvas com sucesso!");
      qc.invalidateQueries({ queryKey: ["client-credit-tiers", clientId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar regras");
    } finally {
      setSavingTiers(false);
    }
  };

  return (
    <Card className="p-5 flex flex-col gap-4">
      <div>
        <h3 className="font-bold text-sm text-foreground">Configurações de Crédito</h3>
        <p className="text-[11px] text-muted-foreground mt-1">
          Personalize as faixas de cobrança e exibição de progresso deste cliente.
        </p>
      </div>

      <div className="flex items-center justify-between border border-border/80 bg-muted/20 p-3 rounded-lg">
        <div className="flex flex-col gap-0.5">
          <Label htmlFor="show-progress" className="font-bold text-xs cursor-pointer select-none">
            Exibir progresso de consumo
          </Label>
          <span className="text-[10px] text-muted-foreground">
            Exibe a barra de progresso de créditos na área do cliente
          </span>
        </div>
        <button
          id="show-progress"
          type="button"
          role="switch"
          aria-checked={showProgressBar}
          onClick={() => setShowProgressBar(!showProgressBar)}
          className={cn(
            "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            showProgressBar ? "bg-emerald-500" : "bg-input"
          )}
        >
          <span
            className={cn(
              "pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform duration-200 ease-in-out",
              showProgressBar ? "translate-x-4" : "translate-x-0"
            )}
          />
        </button>
      </div>

      <div className="space-y-3 pt-2 border-t border-border/60">
        <h4 className="font-bold text-xs text-foreground uppercase tracking-wider text-muted-foreground">Tabela de Faixas</h4>
        {editingTiers.map((tier, idx) => (
          <div key={idx} className="flex items-center gap-2 bg-muted/40 p-2.5 rounded-lg border border-border/80 text-xs">
            <div className="flex flex-col gap-1 w-12 shrink-0">
              <span className="text-[9px] text-muted-foreground font-bold uppercase">De</span>
              <Input
                type="number"
                min="0"
                value={tier.min_credits}
                onChange={(e) => updateTier(idx, "min_credits", parseInt(e.target.value) || 0)}
                className="h-8 text-center px-1"
              />
            </div>
            
            <div className="flex flex-col gap-1 w-12 shrink-0">
              <span className="text-[9px] text-muted-foreground font-bold uppercase">Até</span>
              <Input
                type="number"
                placeholder="∞"
                value={tier.max_credits ?? ""}
                onChange={(e) => {
                  const val = e.target.value;
                  updateTier(idx, "max_credits", val === "" ? null : parseInt(val));
                }}
                className="h-8 text-center px-1"
              />
            </div>

            <div className="flex flex-col gap-1 flex-1 min-w-[70px]">
              <span className="text-[9px] text-muted-foreground font-bold uppercase">Valor (R$)</span>
              <Input
                type="number"
                min="0"
                value={tier.price}
                onChange={(e) => updateTier(idx, "price", parseFloat(e.target.value) || 0)}
                className="h-8 px-2"
              />
            </div>

            {tier.max_credits === null && (
              <div className="flex flex-col gap-1 w-16 shrink-0">
                <span className="text-[9px] text-muted-foreground font-bold uppercase">Extra (R$)</span>
                <Input
                  type="number"
                  placeholder="0"
                  min="0"
                  value={tier.extra_per_credit ?? ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    updateTier(idx, "extra_per_credit", val === "" ? null : parseFloat(val));
                  }}
                  className="h-8 px-2"
                />
              </div>
            )}

            <button
              onClick={() => removeTier(idx)}
              className="text-muted-foreground hover:text-red-500 p-1 rounded hover:bg-muted self-end cursor-pointer mb-[2px] transition-colors"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        {editingTiers.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-2">Sem faixas configuradas. Usando padrões.</p>
        )}
      </div>

      <div className="flex justify-between gap-2 mt-2 pt-2 border-t border-border">
        <Button
          variant="outline"
          size="sm"
          onClick={addTier}
          className="text-xs"
        >
          + Adicionar faixa
        </Button>
        <Button
          size="sm"
          onClick={handleSaveTiers}
          disabled={savingTiers}
          className="text-xs font-bold"
        >
          {savingTiers ? "Salvando..." : "Salvar regras"}
        </Button>
      </div>
    </Card>
  );
}

function ClientReportsPanel({
  clientId,
  billingModel,
  monthlyValue,
  demands,
  onOpenDemand,
}: {
  clientId: string;
  billingModel: string;
  monthlyValue: number | null;
  demands: any[];
  onOpenDemand: (id: string) => void;
}) {
  const getTiersFn = useServerFn(getClientCreditTiers);

  const [period, setPeriod] = useState<"diario" | "semanal" | "mensal" | "anual" | "personalizado">("mensal");
  const [refDate, setRefDate] = useState(() => new Date());

  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().slice(0, 10);
  });

  // Load client credit tiers
  const { data: creditConfig } = useQuery({
    queryKey: ["client-credit-tiers", clientId],
    queryFn: () => getTiersFn({ data: { client_id: clientId } }),
    enabled: billingModel === "credits",
  });

  const creditTiers = creditConfig?.tiers ?? [];

  const handlePrevPeriod = () => {
    setRefDate((prev) => {
      const next = new Date(prev);
      if (period === "diario") {
        next.setDate(prev.getDate() - 1);
      } else if (period === "semanal") {
        next.setDate(prev.getDate() - 7);
      } else if (period === "mensal") {
        next.setMonth(prev.getMonth() - 1);
      } else if (period === "anual") {
        next.setFullYear(prev.getFullYear() - 1);
      }
      return next;
    });
  };

  const handleNextPeriod = () => {
    setRefDate((prev) => {
      const next = new Date(prev);
      if (period === "diario") {
        next.setDate(prev.getDate() + 1);
      } else if (period === "semanal") {
        next.setDate(prev.getDate() + 7);
      } else if (period === "mensal") {
        next.setMonth(prev.getMonth() + 1);
      } else if (period === "anual") {
        next.setFullYear(prev.getFullYear() + 1);
      }
      return next;
    });
  };

  const { actualStart, actualEnd, formattedPeriodLabel } = useMemo(() => {
    let start = "";
    let end = "";
    let label = "";

    if (period === "diario") {
      start = refDate.toISOString().slice(0, 10);
      end = start;
      const rawLabel = refDate.toLocaleDateString("pt-BR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });
      label = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1);
    } else if (period === "semanal") {
      const dStart = new Date(refDate);
      dStart.setDate(refDate.getDate() - refDate.getDay());
      const dEnd = new Date(dStart);
      dEnd.setDate(dStart.getDate() + 6);
      
      start = dStart.toISOString().slice(0, 10);
      end = dEnd.toISOString().slice(0, 10);
      label = `Semana de ${dStart.getDate().toString().padStart(2, "0")}/${(dStart.getMonth() + 1).toString().padStart(2, "0")} a ${dEnd.getDate().toString().padStart(2, "0")}/${(dEnd.getMonth() + 1).toString().padStart(2, "0")}/${dEnd.getFullYear()}`;
    } else if (period === "mensal") {
      const dStart = new Date(refDate.getFullYear(), refDate.getMonth(), 1);
      const dEnd = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0);
      
      start = dStart.toISOString().slice(0, 10);
      end = dEnd.toISOString().slice(0, 10);
      const rawLabel = refDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
      label = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1);
    } else if (period === "anual") {
      start = `${refDate.getFullYear()}-01-01`;
      end = `${refDate.getFullYear()}-12-31`;
      label = `Ano de ${refDate.getFullYear()}`;
    } else {
      start = startDate;
      end = endDate;
      label = "Personalizado";
    }

    return { actualStart: start, actualEnd: end, formattedPeriodLabel: label };
  }, [period, refDate, startDate, endDate]);

  // Filter demands by status === "concluido" and within date range (based on due_date)
  const completedDemands = demands.filter((d) => {
    if (d.status !== "concluido") return false;
    if (!d.due_date) return false;
    const dateStr = d.due_date.slice(0, 10);
    return dateStr >= actualStart && dateStr <= actualEnd;
  });

  // Calculations
  const totalCredits = completedDemands.reduce((sum, d) => sum + (d.estimated_credits || 0), 0);
  const totalHours = completedDemands.reduce((sum, d) => sum + (Number(d.estimated_hours) || 0), 0);
  
  const totalPrice = billingModel === "credits"
    ? calculateTiersPrice(totalCredits, creditTiers)
    : monthlyValue ?? 0;

  // Credit progress calculations
  const sortedTiers = useMemo(() => {
    const activeTiers = creditTiers && creditTiers.length > 0 ? creditTiers : DEFAULT_CREDIT_TIERS;
    return [...activeTiers].sort((a, b) => a.min_credits - b.min_credits);
  }, [creditTiers]);

  const { currentTier, currentTierIndex, nextTier, percent, remaining } = useMemo(() => {
    const idx = sortedTiers.findIndex(
      (t) => totalCredits >= t.min_credits && (t.max_credits === null || totalCredits <= t.max_credits)
    );
    const curr = idx !== -1 ? sortedTiers[idx] : null;
    const nxt = curr && curr.max_credits !== null && idx + 1 < sortedTiers.length ? sortedTiers[idx + 1] : null;

    let pct = 0;
    let rem = 0;

    if (curr) {
      if (curr.max_credits !== null) {
        pct = Math.min(100, Math.max(0, (totalCredits / curr.max_credits) * 100));
        rem = curr.max_credits - totalCredits;
      } else {
        pct = 100;
        rem = 0;
      }
    }

    return {
      currentTier: curr,
      currentTierIndex: idx,
      nextTier: nxt,
      percent: pct,
      remaining: rem,
    };
  }, [sortedTiers, totalCredits]);

  return (
    <div className="space-y-6">
      {/* Filters Card */}
      <Card className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Period Selector Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 bg-muted/40 p-1 rounded-lg border border-border/60 w-fit">
            {([
              { value: "diario", label: "Dia" },
              { value: "semanal", label: "Semana" },
              { value: "mensal", label: "Mês" },
              { value: "anual", label: "Ano" },
              { value: "personalizado", label: "Personalizado" }
            ] as const).map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setPeriod(value)}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-all",
                  period === value
                    ? "bg-background text-foreground shadow-sm font-bold"
                    : "text-muted-foreground hover:text-foreground hover:bg-background/40"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Navigation Arrows & Current Label */}
          {period !== "personalizado" && (
            <div className="flex items-center gap-1 bg-muted/20 border border-border/60 rounded-lg p-0.5">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 hover:bg-muted"
                onClick={handlePrevPeriod}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs font-bold px-3 text-foreground capitalize min-w-[140px] text-center select-none">
                {formattedPeriodLabel}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 hover:bg-muted"
                onClick={handleNextPeriod}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {period === "personalizado" && (
          <div className="flex items-center gap-2">
            <div className="flex flex-col gap-0.5">
              <span className="text-[9px] text-muted-foreground uppercase font-bold pl-1">Início</span>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-8 text-xs w-36"
              />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[9px] text-muted-foreground uppercase font-bold pl-1">Fim</span>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-8 text-xs w-36"
              />
            </div>
          </div>
        )}
      </Card>

      {/* Summary Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 flex flex-col justify-between h-24">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Serviços Concluídos</span>
          <div className="flex items-baseline gap-1.5 mt-2">
            <span className="text-3xl font-display font-extrabold text-foreground">{completedDemands.length}</span>
            <span className="text-xs text-muted-foreground">demandas</span>
          </div>
        </Card>

        <Card className="p-4 flex flex-col justify-between h-24">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Total Horas Gastas</span>
          <div className="flex items-baseline gap-1.5 mt-2">
            <span className="text-3xl font-display font-extrabold text-foreground">{totalHours}</span>
            <span className="text-xs text-muted-foreground">horas</span>
          </div>
        </Card>

        {billingModel === "credits" ? (
          <>
            <Card className="p-4 flex flex-col justify-between h-24">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Créditos Consumidos</span>
              <div className="flex items-baseline gap-1.5 mt-2">
                <span className="text-3xl font-display font-extrabold text-foreground">{totalCredits}</span>
                <span className="text-xs text-muted-foreground">{totalCredits === 1 ? "crédito" : "créditos"}</span>
              </div>
            </Card>

            <Card className="p-4 flex flex-col justify-between h-24 border-emerald-500/25 bg-emerald-500/[0.02]">
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 uppercase tracking-wider font-bold">Valor Calculado (Faixas)</span>
              <div className="flex items-baseline gap-1 mt-2">
                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">R$</span>
                <span className="text-3xl font-display font-extrabold text-emerald-600 dark:text-emerald-400">
                  {totalPrice.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </Card>
          </>
        ) : (
          <Card className="p-4 flex flex-col justify-between h-24 border-blue-500/25 bg-blue-500/[0.02]">
            <span className="text-[10px] text-blue-600 dark:text-blue-400 uppercase tracking-wider font-bold">Mensalidade Contratual</span>
            <div className="flex items-baseline gap-1 mt-2">
              <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">R$</span>
              <span className="text-3xl font-display font-extrabold text-blue-600 dark:text-blue-400">
                {totalPrice.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-[10px] text-muted-foreground pl-1">/fixo</span>
            </div>
          </Card>
        )}
      </div>

      {/* Credit Progress Bar – only for credit billing model */}
      {billingModel === "credits" && (
        <CreditProgressBar
          totalCredits={totalCredits}
          tiers={creditTiers}
          title={`Progresso de Créditos — ${formattedPeriodLabel}`}
        />
      )}

      {/* Services Table */}
      <Card className="p-4">
        <h3 className="font-bold text-sm text-foreground mb-4">Detalhamento dos Serviços</h3>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-muted/40 border-b border-border text-[10px] text-muted-foreground uppercase font-bold">
                <th className="p-3">Demanda</th>
                <th className="p-3">Conclusão / Entrega</th>
                <th className="p-3 text-center">Horas</th>
                {billingModel === "credits" && <th className="p-3 text-center">Créditos</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {completedDemands.map((d) => (
                <tr key={d.id} className="hover:bg-muted/20 transition-colors">
                  <td className="p-3">
                    <button
                      onClick={() => onOpenDemand(d.id)}
                      className="text-left font-bold text-foreground hover:text-primary hover:underline cursor-pointer"
                    >
                      {d.title}
                    </button>
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {d.due_date ? new Date(d.due_date + "T12:00:00").toLocaleDateString("pt-BR") : "—"}
                  </td>
                  <td className="p-3 text-center text-muted-foreground">
                    {d.estimated_hours ? `${Number(d.estimated_hours)}h` : "—"}
                  </td>
                  {billingModel === "credits" && (
                    <td className="p-3 text-center font-bold text-emerald-600 dark:text-emerald-400">
                      {d.estimated_credits || 0}
                    </td>
                  )}
                </tr>
              ))}
              {completedDemands.length === 0 && (
                <tr>
                  <td
                    colSpan={billingModel === "credits" ? 4 : 3}
                    className="p-8 text-center text-muted-foreground/60 italic"
                  >
                    Nenhum serviço concluído no período selecionado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}