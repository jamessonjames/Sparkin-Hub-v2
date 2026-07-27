import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import {
  DndContext,
  useDraggable,
  useDroppable,
  DragOverlay,
  PointerSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  pointerWithin,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  listLeads,
  createLead,
  updateLeadStatus,
  deleteLead,
  convertToClient,
  updateLead,
  type CrmLead,
  type LeadStatus,
} from "@/lib/crm.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, DollarSign, Phone, Mail, User } from "lucide-react";
import { ClientColorPicker } from "@/components/client-color-picker";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/crm")({
  head: () => ({ meta: [{ title: "Funil Comercial — Sparkin Hub" }] }),
  component: CrmPage,
});

const COLUMNS: { status: LeadStatus; label: string }[] = [
  { status: "novo", label: "Novo Lead" },
  { status: "contato", label: "Em Contato" },
  { status: "proposta", label: "Proposta Enviada" },
  { status: "ganho", label: "Fechado / Ganho" },
  { status: "perdido", label: "Perdido" },
];

const STATUS_THEME: Record<string, { dot: string; pill: string; cardBg: string; cardBorder: string; columnBg: string }> = {
  novo: {
    dot: "bg-blue-400",
    pill: "bg-blue-500/10 text-blue-400 light:bg-blue-50 light:text-blue-600",
    cardBg: "bg-surface-2/40 hover:bg-surface-2/60 light:bg-white light:hover:bg-zinc-50",
    cardBorder: "border-border hover:border-blue-400/30 light:hover:border-blue-400/30",
    columnBg: "bg-blue-500/5 border border-blue-500/10 light:bg-blue-50/50 light:border-blue-200/50",
  },
  contato: {
    dot: "bg-amber-400",
    pill: "bg-amber-500/10 text-amber-400 light:bg-amber-50 light:text-amber-600",
    cardBg: "bg-surface-2/40 hover:bg-surface-2/60 light:bg-white light:hover:bg-zinc-50",
    cardBorder: "border-border hover:border-amber-400/30 light:hover:border-amber-400/30",
    columnBg: "bg-amber-500/5 border border-amber-500/10 light:bg-amber-50/50 light:border-amber-200/50",
  },
  proposta: {
    dot: "bg-purple-400",
    pill: "bg-purple-500/10 text-purple-400 light:bg-purple-50 light:text-purple-600",
    cardBg: "bg-surface-2/40 hover:bg-surface-2/60 light:bg-white light:hover:bg-zinc-50",
    cardBorder: "border-border hover:border-purple-400/30 light:hover:border-purple-400/30",
    columnBg: "bg-purple-500/5 border border-purple-500/10 light:bg-purple-50/50 light:border-purple-200/50",
  },
  ganho: {
    dot: "bg-emerald-400",
    pill: "bg-emerald-500/10 text-emerald-400 light:bg-emerald-50 light:text-emerald-600",
    cardBg: "bg-surface-2/40 hover:bg-surface-2/60 light:bg-white light:hover:bg-zinc-50",
    cardBorder: "border-border hover:border-emerald-400/30 light:hover:border-emerald-400/30",
    columnBg: "bg-emerald-500/5 border border-emerald-500/10 light:bg-emerald-50/50 light:border-emerald-200/50",
  },
  perdido: {
    dot: "bg-zinc-400",
    pill: "bg-zinc-500/10 text-zinc-400 light:bg-zinc-50 light:text-zinc-600",
    cardBg: "bg-surface-2/40 hover:bg-surface-2/60 light:bg-white light:hover:bg-zinc-50",
    cardBorder: "border-border hover:border-zinc-400/30 light:hover:border-zinc-400/30",
    columnBg: "bg-zinc-500/5 border border-zinc-500/10 light:bg-zinc-50/50 light:border-zinc-200/50",
  },
};

function CrmPage() {
  const listFn = useServerFn(listLeads);
  const createFn = useServerFn(createLead);
  const updateStatusFn = useServerFn(updateLeadStatus);
  const deleteFn = useServerFn(deleteLead);
  const convertFn = useServerFn(convertToClient);
  const updateFn = useServerFn(updateLead);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { state: sidebarState } = useSidebar();
  const sidebarWidth = sidebarState === "collapsed" ? 48 : 256;

  const { data: leads = [] } = useQuery({
    queryKey: ["crm_leads"],
    queryFn: () => listFn(),
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<CrmLead | null>(null);
  const [convertOpen, setConvertOpen] = useState(false);
  const [convertingLead, setConvertingLead] = useState<CrmLead | null>(null);
  const [activeLead, setActiveLead] = useState<CrmLead | null>(null);
  const [createForm, setCreateForm] = useState({
    name: "",
    contact_name: "",
    email: "",
    phone: "",
    estimated_value: "",
    billing_model: "Pagamento Mensal Fixo",
    internal_notes: "",
    client_color: "#3b82f6",
  });
  const [convertForm, setConvertForm] = useState({
    billing_model: "fixed" as "fixed" | "credits" | "seasonal",
    fixed_type: "monthly" as "monthly" | "one_off" | null,
    monthly_value: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const byStatus = COLUMNS.reduce(
    (acc, col) => {
      acc[col.status] = leads.filter((l) => l.status === col.status);
      return acc;
    },
    {} as Record<string, CrmLead[]>,
  );

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  );

  const kanbanPaddingLeft = `max(0px, calc((100vw - ${sidebarWidth}px - 1400px) / 2))`;

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isDraggingBoard = useRef(false);
  const startX = useRef(0);
  const startScrollLeft = useRef(0);
  const hasMovedBoard = useRef(false);

  const handleBoardMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 2) return;
    const container = scrollContainerRef.current;
    if (!container) return;
    isDraggingBoard.current = true;
    hasMovedBoard.current = false;
    startX.current = e.pageX - container.offsetLeft;
    startScrollLeft.current = container.scrollLeft;
    document.body.style.userSelect = "none";
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingBoard.current) return;
      const container = scrollContainerRef.current;
      if (!container) return;
      const x = e.pageX - container.offsetLeft;
      const walk = (x - startX.current) * 1.5;
      if (Math.abs(walk) > 3) {
        hasMovedBoard.current = true;
      }
      container.scrollLeft = startScrollLeft.current - walk;
    };

    const handleMouseUp = () => {
      if (isDraggingBoard.current) {
        isDraggingBoard.current = false;
        document.body.style.userSelect = "";
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  const handleBoardContextMenu = (e: React.MouseEvent) => {
    if (hasMovedBoard.current) {
      e.preventDefault();
      hasMovedBoard.current = false;
    }
  };

  function handleDragStart(event: any) {
    const lead = leads.find((l) => l.id === String(event.active.id));
    if (lead) setActiveLead(lead);
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveLead(null);
    if (!over) return;

    const leadId = String(active.id);
    const targetId = String(over.id);
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return;

    const isColumn = COLUMNS.some((c) => c.status === targetId);
    const targetStatus: LeadStatus | null = isColumn
      ? (targetId as LeadStatus)
      : (leads.find((l) => l.id === targetId)?.status as LeadStatus) ?? null;

    if (!targetStatus || targetStatus === lead.status) return;

    handleStatusChange(lead, targetStatus);
  }

  async function handleCreate() {
    if (!createForm.name.trim()) return;
    setSubmitting(true);
    try {
      await createFn({
        data: {
          name: createForm.name,
          contact_name: createForm.contact_name || null,
          email: createForm.email || null,
          phone: createForm.phone || null,
          estimated_value: createForm.estimated_value ? Number(createForm.estimated_value) : null,
          billing_model: createForm.billing_model,
          internal_notes: createForm.internal_notes || null,
          client_color: createForm.client_color,
        },
      });
      toast.success("Lead criado!");
      qc.invalidateQueries({ queryKey: ["crm_leads"] });
      setCreateOpen(false);
      setCreateForm({
        name: "",
        contact_name: "",
        email: "",
        phone: "",
        estimated_value: "",
        billing_model: "Pagamento Mensal Fixo",
        internal_notes: "",
        client_color: "#3b82f6",
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar lead");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEdit() {
    if (!editingLead || !editingLead.name.trim()) return;
    setSubmitting(true);
    try {
      await updateFn({
        data: {
          id: editingLead.id,
          name: editingLead.name,
          contact_name: editingLead.contact_name,
          email: editingLead.email,
          phone: editingLead.phone,
          estimated_value: editingLead.estimated_value,
          billing_model: editingLead.billing_model,
          internal_notes: editingLead.internal_notes,
          client_color: editingLead.client_color,
        },
      });
      toast.success("Lead atualizado!");
      qc.invalidateQueries({ queryKey: ["crm_leads"] });
      setEditOpen(false);
      setEditingLead(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao atualizar lead");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Tem certeza que deseja excluir este lead?")) return;
    try {
      await deleteFn({ data: { id } });
      toast.success("Lead excluído!");
      qc.invalidateQueries({ queryKey: ["crm_leads"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao excluir lead");
    }
  }

  async function handleStatusChange(lead: CrmLead, status: LeadStatus) {
    if (status === "ganho") {
      setConvertingLead(lead);
      setConvertForm({
        billing_model: lead.billing_model === "Pagamento Mensal Fixo" ? "fixed" : lead.billing_model === "Mensal com Créditos" ? "credits" : "fixed",
        fixed_type: "monthly",
        monthly_value: lead.estimated_value ? String(lead.estimated_value) : "",
      });
      setConvertOpen(true);
      return;
    }

    qc.setQueryData<CrmLead[]>(["crm_leads"], (prev) =>
      (prev ?? []).map((l) => (l.id === lead.id ? { ...l, status } : l)),
    );
    try {
      await updateStatusFn({ data: { id: lead.id, status } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao mover lead");
      qc.invalidateQueries({ queryKey: ["crm_leads"] });
    }
  }

  async function handleConvert() {
    if (!convertingLead) return;
    setSubmitting(true);
    try {
      const result = await convertFn({
        data: {
          leadId: convertingLead.id,
          billing_model: convertForm.billing_model,
          fixed_type: convertForm.fixed_type,
          monthly_value: convertForm.monthly_value ? Number(convertForm.monthly_value) : null,
        },
      });
      toast.success("Lead convertido em cliente!");
      qc.invalidateQueries({ queryKey: ["crm_leads"] });
      qc.invalidateQueries({ queryKey: ["clients"] });
      setConvertOpen(false);
      setConvertingLead(null);
      if (result.clientId) {
        navigate({ to: "/clients/$id", params: { id: result.clientId } });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao converter lead");
    } finally {
      setSubmitting(false);
    }
  }

  function openEdit(lead: CrmLead) {
    setEditingLead({ ...lead });
    setEditOpen(true);
  }

  const getBillingModelLabel = (model: string | null) => {
    if (!model) return "—";
    const map: Record<string, string> = {
      "Pagamento Mensal Fixo": "Mensal Fixo",
      "Mensal com Créditos": "Créditos",
      "Pagamento por Projeto": "Projeto",
      "Por Temporada (Eventos)": "Temporada",
    };
    return map[model] || model;
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <div className="w-full max-w-[1400px] mx-auto px-4 md:px-6 pt-4 md:pt-6 pb-2 flex items-center justify-between shrink-0">
        <div>
          <h2 className="font-display text-2xl font-bold text-foreground">Funil Comercial</h2>
          <p className="text-sm text-muted-foreground">Gerencie leads e oportunidades de venda.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Novo lead
        </Button>
      </div>

      <div className="flex-1 flex min-h-0">
        <div
          ref={scrollContainerRef}
          onMouseDown={handleBoardMouseDown}
          onContextMenu={handleBoardContextMenu}
          className="flex flex-col flex-1 min-w-0 min-h-0 overflow-x-auto select-none md:select-auto"
          style={{ paddingLeft: kanbanPaddingLeft }}
        >
          <DndContext
            sensors={sensors}
            collisionDetection={pointerWithin}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="flex gap-3 flex-1 min-h-0 px-2 pb-6 select-none items-stretch">
              {COLUMNS.map((col) => {
                const items = byStatus[col.status] ?? [];
                return (
                  <KanbanColumn
                    key={col.status}
                    status={col.status}
                    label={col.label}
                    theme={STATUS_THEME[col.status]}
                    leads={items}
                    onAdd={() => setCreateOpen(true)}
                    onEdit={openEdit}
                    onDelete={handleDelete}
                  />
                );
              })}
            </div>

            <DragOverlay>
              {activeLead && (
                <CrmCard
                  lead={activeLead}
                  theme={STATUS_THEME[activeLead.status]}
                  isOverlay
                />
              )}
            </DragOverlay>
          </DndContext>
        </div>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo Lead</DialogTitle>
            <DialogDescription>Cadastre um novo lead no funil comercial.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <Label>Nome do Lead *</Label>
                <Input
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>Nome do Contato</Label>
                <Input
                  value={createForm.contact_name}
                  onChange={(e) => setCreateForm({ ...createForm, contact_name: e.target.value })}
                />
              </div>
              <div>
                <Label>E-mail</Label>
                <Input
                  type="email"
                  value={createForm.email}
                  onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                />
              </div>
              <div>
                <Label>Telefone</Label>
                <Input
                  value={createForm.phone}
                  onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>Notas</Label>
              <Textarea
                rows={3}
                value={createForm.internal_notes}
                onChange={(e) => setCreateForm({ ...createForm, internal_notes: e.target.value })}
              />
            </div>
            <div>
              <ClientColorPicker
                value={createForm.client_color}
                onChange={(color) => setCreateForm({ ...createForm, client_color: color })}
              />
            </div>
            <div className="flex justify-end">
              <Button onClick={handleCreate} disabled={submitting || !createForm.name.trim()}>
                {submitting ? "Salvando..." : "Criar lead"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Lead</DialogTitle>
          </DialogHeader>
          {editingLead && (
            <div className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label>Nome do Lead *</Label>
                  <Input
                    value={editingLead.name}
                    onChange={(e) => setEditingLead({ ...editingLead, name: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label>Nome do Contato</Label>
                  <Input
                    value={editingLead.contact_name ?? ""}
                    onChange={(e) => setEditingLead({ ...editingLead, contact_name: e.target.value })}
                  />
                </div>
                <div>
                  <Label>E-mail</Label>
                  <Input
                    type="email"
                    value={editingLead.email ?? ""}
                    onChange={(e) => setEditingLead({ ...editingLead, email: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Telefone</Label>
                  <Input
                    value={editingLead.phone ?? ""}
                    onChange={(e) => setEditingLead({ ...editingLead, phone: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label>Notas</Label>
                <Textarea
                  rows={3}
                  value={editingLead.internal_notes ?? ""}
                  onChange={(e) => setEditingLead({ ...editingLead, internal_notes: e.target.value })}
                />
              </div>
              <div>
                <ClientColorPicker
                  value={editingLead.client_color}
                  onChange={(color) => setEditingLead({ ...editingLead, client_color: color })}
                />
              </div>
              <div className="flex justify-end">
                <Button onClick={handleEdit} disabled={submitting || !editingLead.name.trim()}>
                  {submitting ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={convertOpen} onOpenChange={setConvertOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Converter Lead em Cliente</DialogTitle>
            <DialogDescription>
              Revise os dados e preencha as informações financeiras para ativar o cliente.
            </DialogDescription>
          </DialogHeader>
          {convertingLead && (
            <div className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label>Nome</Label>
                  <Input value={convertingLead.name} disabled />
                </div>
                <div>
                  <Label>Contato</Label>
                  <Input value={convertingLead.contact_name ?? ""} disabled />
                </div>
                <div>
                  <Label>E-mail</Label>
                  <Input value={convertingLead.email ?? ""} disabled />
                </div>
                <div>
                  <Label>Telefone</Label>
                  <Input value={convertingLead.phone ?? ""} disabled />
                </div>
              </div>
              <div>
                <Label>Notas Internas</Label>
                <Textarea rows={2} value={convertingLead.internal_notes ?? ""} disabled />
              </div>
              <div>
                <ClientColorPicker
                  value={convertingLead.client_color}
                  onChange={() => {}}
                />
              </div>
              <div className="border-t border-border pt-4 space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <Label>Modelo de cobrança</Label>
                    <Select
                      value={
                        convertForm.billing_model === "credits"
                          ? "credits"
                          : convertForm.billing_model === "seasonal"
                            ? "seasonal"
                            : convertForm.fixed_type === "one_off"
                              ? "one_off"
                              : "fixed_monthly"
                      }
                      onValueChange={(val) => {
                        if (val === "credits") {
                          setConvertForm({ ...convertForm, billing_model: "credits", fixed_type: null });
                        } else if (val === "seasonal") {
                          setConvertForm({ ...convertForm, billing_model: "seasonal", fixed_type: null });
                        } else if (val === "one_off") {
                          setConvertForm({ ...convertForm, billing_model: "fixed", fixed_type: "one_off" });
                        } else {
                          setConvertForm({ ...convertForm, billing_model: "fixed", fixed_type: "monthly" });
                        }
                      }}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fixed_monthly">Pagamento Mensal Fixo</SelectItem>
                        <SelectItem value="credits">Mensal com Créditos</SelectItem>
                        <SelectItem value="one_off">Pagamento por Projeto</SelectItem>
                        <SelectItem value="seasonal">Por Temporada (Eventos)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {(convertForm.billing_model === "fixed" || convertForm.billing_model === "credits") && (
                    <div>
                      <Label>
                        {convertForm.billing_model === "credits"
                          ? "Valor Mínimo / Retentor Mensal (R$)"
                          : convertForm.fixed_type === "one_off"
                            ? "Valor por Projeto (R$)"
                            : "Valor mensal (R$)"}
                      </Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={convertForm.monthly_value}
                        onChange={(e) => setConvertForm({ ...convertForm, monthly_value: e.target.value })}
                      />
                    </div>
                  )}
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => { setConvertOpen(false); setConvertingLead(null); }}>
                  Cancelar
                </Button>
                <Button onClick={handleConvert} disabled={submitting}>
                  {submitting ? "Convertendo..." : "Converter em Cliente"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KanbanColumn({
  status,
  label,
  theme,
  leads,
  onAdd,
  onEdit,
  onDelete,
}: {
  status: string;
  label: string;
  theme: { dot: string; pill: string; cardBg: string; cardBorder: string; columnBg: string };
  leads: CrmLead[];
  onAdd: () => void;
  onEdit: (lead: CrmLead) => void;
  onDelete: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div className="min-w-[272px] w-[272px] flex-shrink-0 flex flex-col transition-all duration-150 group/column">
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-1.5">
          <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", theme.dot)} />
          <span className={cn("text-xs font-medium px-2 py-0.5 rounded-md", theme.pill)}>
            {label}
          </span>
          <span className="text-xs text-zinc-500 font-medium ml-0.5">{leads.length}</span>
        </div>
        <button
          onClick={onAdd}
          className="opacity-0 group-hover/column:opacity-100 text-muted-foreground hover:text-foreground transition-all rounded p-0.5 hover:bg-zinc-800 light:hover:bg-zinc-200"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 rounded-xl p-2.5 min-h-[150px] transition-all duration-150 space-y-2",
          theme.columnBg,
          isOver && "ring-1 ring-primary/20",
        )}
      >
        {leads.length === 0 && (
          <div className="flex items-center justify-center h-20 text-xs text-muted-foreground">
            Nenhum lead
          </div>
        )}
        {leads.map((lead) => (
          <DraggableCard
            key={lead.id}
            lead={lead}
            theme={theme}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}

        <button
          onClick={onAdd}
          className="flex items-center justify-start gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold w-full transition-all cursor-pointer border shadow-xs text-muted-foreground hover:text-foreground border-border hover:border-foreground/30 bg-surface-2/40 hover:bg-surface-2"
        >
          <Plus className="h-3.5 w-3.5 shrink-0" />
          <span>Lead</span>
        </button>
      </div>
    </div>
  );
}

function DraggableCard({
  lead,
  theme,
  onEdit,
  onDelete,
}: {
  lead: CrmLead;
  theme: { dot: string; pill: string; cardBg: string; cardBorder: string; columnBg: string };
  onEdit: (lead: CrmLead) => void;
  onDelete: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: lead.id,
  });

  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-lg border p-3.5 cursor-grab active:cursor-grabbing group select-none relative transition-all duration-100 shadow-sm",
        theme.cardBg,
        theme.cardBorder,
        isDragging && "opacity-50",
      )}
      onClick={() => onEdit(lead)}
      {...attributes}
      {...listeners}
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span
              className="h-2 w-2 rounded-full shrink-0 mt-0.5"
              style={{ backgroundColor: lead.client_color || "#3b82f6" }}
            />
            <p className="text-sm font-semibold text-foreground leading-tight truncate">
              {lead.name}
            </p>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(lead.id);
            }}
            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500 transition-all p-0.5 rounded hover:bg-red-500/10"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>

        {lead.contact_name && (
          <p className="text-xs text-zinc-400 truncate flex items-center gap-1">
            <User className="h-3 w-3 shrink-0" />
            <span>{lead.contact_name}</span>
          </p>
        )}

        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-500">
          {lead.email && (
            <span className="flex items-center gap-1 truncate max-w-[140px]">
              <Mail className="h-3 w-3 shrink-0" />
              <span className="truncate">{lead.email}</span>
            </span>
          )}
          {lead.phone && (
            <span className="flex items-center gap-1">
              <Phone className="h-3 w-3 shrink-0" />
              <span>{lead.phone}</span>
            </span>
          )}
        </div>

        {lead.estimated_value != null && lead.estimated_value > 0 && (
          <div className="flex items-center gap-1 text-xs font-medium text-zinc-300 mt-1 pt-1.5 border-t border-zinc-800/10">
            <DollarSign className="h-3 w-3 text-emerald-400" />
            <span>{lead.estimated_value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function CrmCard({
  lead,
  theme,
  isOverlay,
}: {
  lead: CrmLead;
  theme: { dot: string; pill: string; cardBg: string; cardBorder: string; columnBg: string };
  isOverlay?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-3.5 select-none shadow-2xl",
        isOverlay && "rotate-1 scale-[1.02] opacity-95",
        theme.cardBg,
        theme.cardBorder,
      )}
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span
            className="h-2 w-2 rounded-full shrink-0"
            style={{ backgroundColor: lead.client_color || "#3b82f6" }}
          />
          <p className="text-sm font-semibold text-foreground leading-tight truncate">
            {lead.name}
          </p>
        </div>

        {lead.contact_name && (
          <p className="text-xs text-zinc-400 truncate flex items-center gap-1">
            <User className="h-3 w-3 shrink-0" />
            <span>{lead.contact_name}</span>
          </p>
        )}

        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-500">
          {lead.email && (
            <span className="flex items-center gap-1 truncate max-w-[140px]">
              <Mail className="h-3 w-3 shrink-0" />
              <span className="truncate">{lead.email}</span>
            </span>
          )}
          {lead.phone && (
            <span className="flex items-center gap-1">
              <Phone className="h-3 w-3 shrink-0" />
              <span>{lead.phone}</span>
            </span>
          )}
        </div>

        {lead.estimated_value != null && lead.estimated_value > 0 && (
          <div className="flex items-center gap-1 text-xs font-medium text-zinc-300 pt-1.5 border-t border-zinc-800/10">
            <DollarSign className="h-3 w-3 text-emerald-400" />
            <span>{lead.estimated_value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
          </div>
        )}
      </div>
    </div>
  );
}
