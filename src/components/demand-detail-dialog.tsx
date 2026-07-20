import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  getDemand,
  updateDemand,
  createDemand,
  deleteDemand,
  type DemandStatus,
  DEMAND_STATUSES,
} from "@/lib/demands.functions";
import { listComments, addComment, deleteComment, updateComment } from "@/lib/comments.functions";
import { listProfiles } from "@/lib/users.functions";
import { listClients, listClientEditions } from "@/lib/clients.functions";
import { getPricingSettings } from "@/lib/pricing.functions";
import {
  getPortalDemandComments,
  addPortalComment,
  createPortalDemand,
  updatePortalDemand,
} from "@/lib/portal.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { STATUS_LABELS, PRIORITY_LABELS } from "@/lib/demand-labels";
import { RichEditor } from "@/components/rich-editor";
import { FileAttachments } from "@/components/file-attachments";
import { Trash2, Send, Calendar, X, Save, User, Loader2, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_CHIP: Record<string, string> = {
  rascunho:     "bg-zinc-700 text-zinc-200 hover:bg-zinc-600",
  nao_iniciado: "bg-zinc-700 text-zinc-200 hover:bg-zinc-600",
  fazendo:      "bg-blue-700 text-blue-100 hover:bg-blue-600",
  para_analise: "bg-purple-700 text-purple-100 hover:bg-purple-600",
  com_ajustes:  "bg-amber-700 text-amber-100 hover:bg-amber-600",
  concluido:    "bg-emerald-700 text-emerald-100 hover:bg-emerald-600",
};

const PRIORITY_CHIP: Record<string, string> = {
  low:    "bg-zinc-500 dark:bg-zinc-700 text-white font-semibold hover:bg-zinc-600",
  medium: "bg-blue-500 dark:bg-blue-600 text-white font-semibold hover:bg-blue-600",
  high:   "bg-amber-500 dark:bg-amber-600 text-white font-semibold hover:bg-amber-500",
  urgent: "bg-red-500 dark:bg-red-650 text-white font-semibold hover:bg-red-600",
};

// Statuses that clients can set (not "fazendo", not "para_analise", not "rascunho")
const CLIENT_STATUSES: DemandStatus[] = ["nao_iniciado", "com_ajustes", "concluido"];

export type PortalInitialDemand = {
  id: string;
  title: string;
  status: string;
  priority: string | null;
  due_date: string | null;
  description?: string | null;
  estimated_credits?: number | null;
};

export function DemandDetailDialog({
  id,
  onClose,
  onMinimize,
  clients,
  defaultClientId,
  defaultStatus,
  defaultClientEditionId,
  defaultAssigneeId,
  // Portal-mode props
  portalMode = false,
  portalSlug,
  portalClientName,
  portalBillingModel,
  portalCreditsEnabled,
  initialDemandData,
  onPortalDemandCreated,
  onPortalDemandUpdated,
}: {
  id: string; // "new" for creation mode, uuid for edit mode
  onClose: () => void;
  onMinimize?: () => void;
  clients: { id: string; name: string }[];
  defaultClientId?: string;
  defaultStatus?: string;
  defaultClientEditionId?: string;
  defaultAssigneeId?: string;
  portalMode?: boolean;
  portalSlug?: string;
  portalClientName?: string;
  portalBillingModel?: string;
  portalCreditsEnabled?: boolean;
  initialDemandData?: PortalInitialDemand;
  onPortalDemandCreated?: (d: PortalInitialDemand) => void;
  onPortalDemandUpdated?: (d: PortalInitialDemand) => void;
}) {
  const isNew = id === "new";
  const overlayClickRef = useRef(false);

  // ── Admin server functions (declared unconditionally — rules of hooks) ──
  const getFn = useServerFn(getDemand);
  const createFn = useServerFn(createDemand);
  const updateFn = useServerFn(updateDemand);
  const deleteFn = useServerFn(deleteDemand);
  const listCommentsFn = useServerFn(listComments);
  const addCommentFn = useServerFn(addComment);
  const deleteCommentFn = useServerFn(deleteComment);
  const updateCommentFn = useServerFn(updateComment);
  const listProfilesFn = useServerFn(listProfiles);
  const qc = useQueryClient();

  // ── Portal server functions (also declared unconditionally) ──
  const getPortalCommentsFn = useServerFn(getPortalDemandComments);
  const addPortalCommentFn = useServerFn(addPortalComment);
  const createPortalFn = useServerFn(createPortalDemand);
  const updatePortalFn = useServerFn(updatePortalDemand);

  // ── Queries ──
  // Admin demand fetch (skip in portal mode — we have initialDemandData)
  const { data: demand, isLoading: isDemandLoading } = useQuery({
    queryKey: ["demand", id],
    queryFn: () => getFn({ data: { id } }),
    enabled: !isNew && !portalMode,
  });

  // Admin comments (skip in portal mode)
  const { data: adminComments = [] } = useQuery({
    queryKey: ["comments", id],
    queryFn: () => listCommentsFn({ data: { demand_id: id } }),
    enabled: !isNew && !portalMode,
  });

  // Portal comments (fetched when in portal detail mode)
  const { data: portalCommentsData = [], isLoading: isPortalCommentsLoading } = useQuery({
    queryKey: ["portal-comments", id],
    queryFn: () => getPortalCommentsFn({ data: { slug: portalSlug!, demand_id: id } }),
    enabled: !isNew && portalMode && !!portalSlug,
  });

  const comments = portalMode ? portalCommentsData : adminComments;
  const isLoadingComments = portalMode ? isPortalCommentsLoading : false;

  // Admin profiles
  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles"],
    queryFn: () => listProfilesFn(),
    enabled: !portalMode,
  });

  // Admin clients to check billing model
  const listClientsFn = useServerFn(listClients);
  const { data: fullClients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: () => listClientsFn(),
    enabled: !portalMode,
  });

  // Load pricing settings for auto-fill
  const getPricingSettingsFn = useServerFn(getPricingSettings);
  const { data: pricingConfig } = useQuery({
    queryKey: ["pricing-settings"],
    queryFn: () => getPricingSettingsFn(),
    enabled: !portalMode,
  });

  // ── Local form state ──
  const [clientId, setClientId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<DemandStatus>("nao_iniciado");
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "urgent">("medium");
  const [dueDate, setDueDate] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [showComments, setShowComments] = useState(true);
  const [estimatedHours, setEstimatedHours] = useState<number>(1.0);
  const [estimatedCredits, setEstimatedCredits] = useState<number>(0);
  const [clientEditionId, setClientEditionId] = useState("");
  const [price, setPrice] = useState<number | null>(null);
  
  // Flag to track if the user manually edited the price field
  const [isPriceManuallyEdited, setIsPriceManuallyEdited] = useState(false);

  // Reset manually edited flag when switching/loading demands
  useEffect(() => {
    setIsPriceManuallyEdited(false);
  }, [demand?.id]);

  // Recalculate price based on hours and client pricing settings
  useEffect(() => {
    if (portalMode || !pricingConfig || isPriceManuallyEdited) return;

    const selectedClient = fullClients.find((c) => c.id === clientId);
    if (!selectedClient) return;

    const isOneOff = selectedClient.billing_model === "fixed" && selectedClient.fixed_type === "one_off";
    const isSeasonal = selectedClient.billing_model === "seasonal";

    if (isOneOff || isSeasonal) {
      const baseRate = pricingConfig.base_hourly_rate ?? 80;
      const tiers = pricingConfig.tiers || [];
      
      // Separate tiers by type (default to up_to if type is not set)
      const upToTiers = tiers.filter(t => t.type === "up_to" || !t.type)
        .sort((a, b) => a.hours_limit - b.hours_limit);
        
      const aboveTiers = tiers.filter(t => t.type === "above")
        .sort((a, b) => b.hours_limit - a.hours_limit);

      let rate = baseRate;

      // 1. Try to find match in "up_to" tiers
      const matchingUpTo = upToTiers.find((t) => estimatedHours <= t.hours_limit);
      if (matchingUpTo) {
        rate = matchingUpTo.hourly_rate;
      } else {
        // 2. Try to find match in "above" tiers
        const matchingAbove = aboveTiers.find((t) => estimatedHours > t.hours_limit);
        if (matchingAbove) {
          rate = matchingAbove.hourly_rate;
        }
      }

      setPrice(estimatedHours * rate);
    }
  }, [estimatedHours, clientId, pricingConfig, isPriceManuallyEdited, portalMode, fullClients]);

  // Admin client editions query
  const listClientEditionsFn = useServerFn(listClientEditions);
  const { data: clientEditions = [] } = useQuery({
    queryKey: ["client-editions", clientId],
    queryFn: () => listClientEditionsFn({ data: { client_id: clientId } }),
    enabled: !!clientId && !portalMode,
  });

  const selectedClient = !portalMode ? fullClients.find((c) => c.id === clientId) : null;
  const clientName = portalMode ? (portalClientName || "Desconhecido") : (selectedClient?.name || "Desconhecido");
  const demandTitle = title.trim() || "Nova Demanda";
  const gDrivePath = useMemo(() => ["Clients", clientName, "Demands", demandTitle], [clientName, demandTitle]);
  const isCreditBillingEnabled = portalMode
    ? portalBillingModel === "credits" && portalCreditsEnabled !== false
    : selectedClient?.billing_model === "credits";

  const headerInfoText = useMemo(() => {
    if (isNew) return "";
    
    const parts: string[] = [];
    if (portalMode) {
      if (portalClientName) parts.push(portalClientName);
    } else if (selectedClient) {
      parts.push(selectedClient.name);
      if (selectedClient.billing_model === "seasonal" && clientEditionId) {
        const ed = clientEditions.find((e: any) => e.id === clientEditionId);
        if (ed) {
          parts.push(ed.name);
        }
      }
    }
    return parts.join(" • ");
  }, [isNew, portalMode, portalClientName, selectedClient, clientEditionId, clientEditions]);

  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentBody, setEditingCommentBody] = useState("");

  // ── Sync state when data loads ──
  useEffect(() => {
    if (isNew) {
      setClientId(defaultClientId || clients[0]?.id || "");
      setTitle("");
      setDescription("");
      setStatus((defaultStatus as DemandStatus) || "nao_iniciado");
      setPriority("medium");
      setDueDate("");
      setAssigneeId(defaultAssigneeId || "");
      setEstimatedHours(1.0);
      setEstimatedCredits(0);
      setPrice(null);
      if (defaultClientEditionId) {
        setClientEditionId(defaultClientEditionId);
      } else {
        setClientEditionId("");
      }
    } else if (portalMode && initialDemandData) {
      setTitle(initialDemandData.title);
      setDescription(initialDemandData.description || "");
      setStatus((initialDemandData.status as DemandStatus) || "nao_iniciado");
      setPriority((initialDemandData.priority as any) || "medium");
      setDueDate(initialDemandData.due_date ? initialDemandData.due_date.slice(0, 10) : "");
      setEstimatedCredits(initialDemandData.estimated_credits ? Number(initialDemandData.estimated_credits) : 0);
    } else if (!portalMode && demand) {
      setClientId(demand.client_id);
      setTitle(demand.title);
      setDescription(demand.description || "");
      setStatus(demand.status as DemandStatus);
      setPriority(demand.priority as "low" | "medium" | "high" | "urgent");
      setDueDate(demand.due_date ? demand.due_date.slice(0, 10) : "");
      setAssigneeId(demand.assignee_user_id || "");
      setEstimatedHours(demand.estimated_hours ? Number(demand.estimated_hours) : 1.0);
      setEstimatedCredits(demand.estimated_credits ? Number(demand.estimated_credits) : 0);
      setClientEditionId(demand.client_edition_id || "");
      setPrice(demand.price ? Number(demand.price) : null);
    }
  }, [demand, isNew, defaultClientId, defaultStatus, defaultClientEditionId, defaultAssigneeId, clients, portalMode, initialDemandData]);

  // Set default client edition when editions list is loaded
  useEffect(() => {
    if (isNew && !clientEditionId && clientEditions.length > 0) {
      if (defaultClientEditionId) {
        setClientEditionId(defaultClientEditionId);
      } else {
        const activeEdition = clientEditions.find((e: any) => e.is_active);
        setClientEditionId(activeEdition?.id || clientEditions[0]?.id || "");
      }
    }
  }, [isNew, clientEditions, defaultClientEditionId, clientEditionId]);

  // Debounced auto-save for description
  useEffect(() => {
    if (isNew) return;

    const dbDesc = portalMode 
      ? (initialDemandData?.description || "") 
      : (demand?.description || "");

    if (description === dbDesc) return;

    const timer = setTimeout(async () => {
      try {
        if (portalMode) {
          await updatePortalFn({
            data: {
              slug: portalSlug!,
              id,
              title: title.trim(),
              description: description || null,
              status,
              priority,
              due_date: dueDate || null,
            },
          });
          onPortalDemandUpdated?.({
            id,
            title: title.trim(),
            status,
            priority,
            due_date: dueDate || null,
            description: description || null,
          });
        } else {
          let finalDueDate = null;
          if (dueDate) {
            const origDatePart = demand?.due_date ? demand.due_date.slice(0, 10) : "";
            if (dueDate === origDatePart && demand?.due_date) {
              finalDueDate = demand.due_date;
            } else {
              const origTimePart = demand?.due_date && demand.due_date.includes("T")
                ? demand.due_date.split("T")[1]
                : "12:00:00";
              finalDueDate = `${dueDate}T${origTimePart}`;
            }
          }

          await updateFn({
            data: {
              id,
              client_id: clientId,
              title,
              description: description,
              status,
              priority,
              due_date: finalDueDate,
              estimated_credits: estimatedCredits,
              estimated_hours: estimatedHours,
              internal_notes: demand?.internal_notes,
              assignee_user_id: assigneeId || null,
              client_edition_id: clientEditionId || null,
              price: price ?? null,
            },
          });
        }
        qc.invalidateQueries({ queryKey: ["demand", id] });
        qc.invalidateQueries({ queryKey: ["demands"] });
        toast.success("Descrição salva automaticamente!");
      } catch (e) {
        toast.error("Erro ao salvar descrição automaticamente");
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [description, isNew, portalMode, demand?.description, initialDemandData?.description, clientId, title, status, priority, dueDate, estimatedCredits, estimatedHours, assigneeId, clientEditionId, price]);

  async function handleClose() {
    const dbDesc = portalMode 
      ? (initialDemandData?.description || "") 
      : (demand?.description || "");
      
    if (!isNew && description !== dbDesc && title.trim()) {
      try {
        if (portalMode) {
          await updatePortalFn({
            data: {
              slug: portalSlug!,
              id,
              title: title.trim(),
              description: description || null,
              status,
              priority,
              due_date: dueDate || null,
            },
          });
        } else {
          let finalDueDate = null;
          if (dueDate) {
            const origDatePart = demand?.due_date ? demand.due_date.slice(0, 10) : "";
            if (dueDate === origDatePart && demand?.due_date) {
              finalDueDate = demand.due_date;
            } else {
              const origTimePart = demand?.due_date && demand.due_date.includes("T")
                ? demand.due_date.split("T")[1]
                : "12:00:00";
              finalDueDate = `${dueDate}T${origTimePart}`;
            }
          }

          await updateFn({
            data: {
              id,
              client_id: clientId,
              title,
              description: description,
              status,
              priority,
              due_date: finalDueDate,
              estimated_credits: estimatedCredits,
              estimated_hours: estimatedHours,
              internal_notes: demand?.internal_notes,
              assignee_user_id: assigneeId || null,
              client_edition_id: clientEditionId || null,
              price: price ?? null,
            },
          });
        }
        qc.invalidateQueries({ queryKey: ["demand", id] });
        qc.invalidateQueries({ queryKey: ["demands"] });
      } catch (e) {
        console.error("Erro ao salvar descrição ao fechar:", e);
      }
    }
    onClose();
  }

  // ── Dirty check ──
  const isDirty = isNew
    ? title.trim() !== ""
    : portalMode && initialDemandData
      ? (
          title !== initialDemandData.title ||
          description !== (initialDemandData.description || "") ||
          status !== (initialDemandData.status || "nao_iniciado") ||
          priority !== ((initialDemandData.priority as any) || "medium") ||
          dueDate !== (initialDemandData.due_date ? initialDemandData.due_date.slice(0, 10) : "") ||
          estimatedCredits !== (initialDemandData.estimated_credits ? Number(initialDemandData.estimated_credits) : 0)
        )
      : !portalMode && demand && (
          clientId !== demand.client_id ||
          title !== demand.title ||
          description !== (demand.description || "") ||
          status !== demand.status ||
          priority !== demand.priority ||
          dueDate !== (demand.due_date ? demand.due_date.slice(0, 10) : "") ||
          assigneeId !== (demand.assignee_user_id || "") ||
          estimatedHours !== (demand.estimated_hours ? Number(demand.estimated_hours) : 1.0) ||
          estimatedCredits !== (demand.estimated_credits ? Number(demand.estimated_credits) : 0) ||
          clientEditionId !== (demand.client_edition_id || "") ||
          price !== (demand.price ? Number(demand.price) : null)
        );

  // ── Save ──
  async function handleSave() {
    if (portalMode && isNew) {
      // Portal create
      if (!title.trim()) return;
      setSaving(true);
      try {
        const row = await createPortalFn({
          data: { slug: portalSlug!, title: title.trim(), description: description || null, priority },
        });
        onPortalDemandCreated?.({
          id: row.id,
          title: title.trim(),
          status,
          priority,
          due_date: dueDate || null,
          description: description || null,
        });
        toast.success("Demanda criada com sucesso!");
        onClose();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao criar demanda");
      } finally {
        setSaving(false);
      }
      return;
    }

    if (portalMode && !isNew) {
      // Portal update existing demand
      if (!title.trim()) { toast.error("O título não pode ficar vazio."); return; }
      setSaving(true);
      try {
        await updatePortalFn({
          data: {
            slug: portalSlug!,
            id,
            title: title.trim(),
            description: description || null,
            status,
            priority,
            due_date: dueDate || null,
          },
        });
        onPortalDemandUpdated?.({
          id,
          title: title.trim(),
          status,
          priority,
          due_date: dueDate || null,
          description: description || null,
        });
        toast.success("Alterações salvas!");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao salvar");
      } finally {
        setSaving(false);
      }
      return;
    }

    // Admin save
    if (!clientId) { toast.error("Selecione um cliente."); return; }
    if (!title.trim()) { toast.error("O título não pode ficar vazio."); return; }

    let finalDueDate = null;
    if (dueDate) {
      const origDatePart = demand?.due_date ? demand.due_date.slice(0, 10) : "";
      if (dueDate === origDatePart && demand?.due_date) {
        finalDueDate = demand.due_date;
      } else {
        const origTimePart = demand?.due_date && demand.due_date.includes("T")
          ? demand.due_date.split("T")[1]
          : "12:00:00";
        finalDueDate = `${dueDate}T${origTimePart}`;
      }
    }

    setSaving(true);
    try {
      if (isNew) {
        await createFn({
          data: {
            client_id: clientId,
            title,
            description,
            status,
            priority,
            due_date: finalDueDate,
            estimated_credits: estimatedCredits,
            estimated_hours: estimatedHours,
            assignee_user_id: assigneeId || null,
            client_edition_id: clientEditionId || null,
            price: price ?? null,
          },
        });
        toast.success("Demanda criada com sucesso!");
        qc.invalidateQueries({ queryKey: ["demands"] });
        onClose();
      } else {
        await updateFn({
          data: {
            id,
            client_id: clientId,
            title,
            description,
            status,
            priority,
            due_date: finalDueDate,
            estimated_credits: estimatedCredits,
            estimated_hours: estimatedHours,
            internal_notes: demand?.internal_notes,
            assignee_user_id: assigneeId || null,
            client_edition_id: clientEditionId || null,
            price: price ?? null,
          },
        });
        toast.success("Alterações salvas!");
        qc.invalidateQueries({ queryKey: ["demand", id] });
        qc.invalidateQueries({ queryKey: ["demands"] });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Excluir esta demanda permanentemente?")) return;
    try {
      await deleteFn({ data: { id } });
      toast.success("Excluída.");
      qc.invalidateQueries({ queryKey: ["demands"] });
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  async function handleAddComment() {
    const textContent = comment.replace(/<[^>]*>/g, "").trim();
    if (!textContent && !comment.includes("<img")) return;

    try {
      if (portalMode) {
        await addPortalCommentFn({
          data: { slug: portalSlug!, demand_id: id, body: comment, author_label: portalClientName },
        });
        qc.invalidateQueries({ queryKey: ["portal-comments", id] });
      } else {
        await addCommentFn({ data: { demand_id: id, body: comment } });
        qc.invalidateQueries({ queryKey: ["comments", id] });
      }
      setComment("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  async function handleDeleteComment(commentId: string) {
    if (!confirm("Excluir este comentário permanentemente?")) return;
    try {
      await deleteCommentFn({ data: { id: commentId } });
      qc.invalidateQueries({ queryKey: ["comments", id] });
      toast.success("Comentário excluído.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao excluir");
    }
  }

  function startEditComment(commentId: string, bodyHtml: string) {
    setEditingCommentId(commentId);
    const cleaned = bodyHtml.replace(/<[^>]*>/g, "").trim();
    setEditingCommentBody(cleaned);
  }

  async function handleSaveEditComment(commentId: string) {
    if (!editingCommentBody.trim()) return;
    try {
      await updateCommentFn({ data: { id: commentId, body: `<p>${editingCommentBody}</p>` } });
      setEditingCommentId(null);
      setEditingCommentBody("");
      qc.invalidateQueries({ queryKey: ["comments", id] });
      toast.success("Comentário atualizado!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    }
  }

  // In portal mode all fields are editable (status restricted to non-fazendo).
  const fieldsEditable = true;
  const descriptionEditable = true;

  // Clients are blocked from changing status if it's already "fazendo" or "para_analise"
  const isStatusBlockedInPortal = portalMode && (status === "fazendo" || status === "para_analise");

  // Statuses available in selector
  const availableStatuses = portalMode
    ? (CLIENT_STATUSES.includes(status) ? CLIENT_STATUSES : [...CLIENT_STATUSES, status])
    : (DEMAND_STATUSES as unknown as DemandStatus[]);

  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = dueDate && dueDate < today;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onMouseDown={(e) => {
        overlayClickRef.current = e.target === e.currentTarget;
      }}
      onMouseUp={(e) => {
        if (e.target === e.currentTarget && overlayClickRef.current) {
          handleClose();
        }
        overlayClickRef.current = false;
      }}
    >
      <div className="relative w-full max-w-[95vw] lg:max-w-5xl xl:max-w-6xl h-[90vh] bg-card border border-border rounded-2xl flex flex-col overflow-hidden shadow-2xl my-auto mx-auto animate-in fade-in zoom-in duration-200">

        {(!isNew && !portalMode && isDemandLoading) ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">Carregando...</div>
        ) : (
          <>
             {/* ── TOP BAR ── */}
             <div className="flex items-center gap-4 px-5 py-2 border-b border-border shrink-0 flex-wrap bg-card/85 w-full">
               <div className="flex-1 min-w-[200px] flex flex-col justify-center">
                 {headerInfoText && (
                   <span className="text-[10px] text-muted-foreground/80 font-bold uppercase tracking-wider px-2 mb-0.5">
                     {headerInfoText}
                   </span>
                 )}
                 {fieldsEditable ? (
                   <Input
                     value={title}
                     onChange={(e) => setTitle(e.target.value)}
                     className="text-base font-bold bg-transparent border-transparent hover:border-input focus:border-primary/65 text-foreground h-8 transition-colors p-0.5 px-2 rounded w-full max-w-xl focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/60 placeholder:italic"
                     placeholder={isNew ? "Título da nova demanda..." : "Título da demanda..."}
                   />
                 ) : (
                   <h2 className="text-base font-bold text-foreground px-2 py-0.5 leading-snug line-clamp-1">
                     {title}
                   </h2>
                 )}
               </div>

              <div className="ml-auto flex items-center gap-1.5">
                {!isNew && (
                  <button
                    onClick={() => setShowComments((v) => !v)}
                    className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted transition-colors"
                  >
                    {showComments ? "Ocultar comentários" : "Comentários"}
                  </button>
                )}
                {onMinimize && (
                  <button
                    onClick={onMinimize}
                    title="Minimizar"
                    className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
                    aria-label="Minimizar"
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <rect x="2" y="9" width="10" height="1.5" rx="0.75" fill="currentColor"/>
                    </svg>
                  </button>
                )}
                <button
                  onClick={handleClose}
                  title="Fechar"
                  className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
                  aria-label="Fechar"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* ── MAIN BODY ── */}
            <div className="flex flex-1 min-h-0">

              {/* Left Panel */}
              <div className="flex-1 px-6 py-5 flex flex-col gap-4 min-h-0">

                {/* Meta fields row — flex-wrap so chips stay naturally sized (left-aligned) */}
                <div className="flex flex-wrap gap-x-6 gap-y-3 bg-muted/20 p-4 rounded-xl border border-border/80 shrink-0">

                  {/* Client — admin only, visible only on creation if there are multiple clients to choose from */}
                  {!portalMode && isNew && clients.length > 1 && (
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Cliente</label>
                      <Select value={clientId} onValueChange={setClientId}>
                        <SelectTrigger className="h-8 text-xs bg-background border-input text-foreground w-auto min-w-[120px]">
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                        <SelectContent>
                          {clients.map((c) => (
                            <SelectItem key={c.id} value={c.id} className="text-xs">{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Status */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Status</label>
                    {fieldsEditable && !isStatusBlockedInPortal ? (
                      <Select value={status} onValueChange={(val) => setStatus(val as DemandStatus)}>
                        <SelectTrigger className={cn("h-8 text-xs font-bold border-none text-white w-auto min-w-[100px]", STATUS_CHIP[status])}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {availableStatuses.map((s) => (
                            <SelectItem key={s} value={s} className="text-xs">{STATUS_LABELS[s]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className={cn("inline-flex h-8 items-center px-3 rounded-md text-xs font-bold w-fit", STATUS_CHIP[status])}>
                        {STATUS_LABELS[status] ?? status}
                      </span>
                    )}
                  </div>

                  {/* Priority */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Prioridade</label>
                    {fieldsEditable ? (
                      <Select value={priority} onValueChange={(val) => setPriority(val as any)}>
                        <SelectTrigger className={cn("h-8 text-xs font-bold border-none text-white w-auto min-w-[80px]", PRIORITY_CHIP[priority])}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(["low", "medium", "high", "urgent"] as const).map((p) => (
                            <SelectItem key={p} value={p} className="text-xs">{PRIORITY_LABELS[p]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className={cn("inline-flex h-8 items-center px-3 rounded-md text-xs font-bold w-fit", PRIORITY_CHIP[priority])}>
                        {PRIORITY_LABELS[priority]}
                      </span>
                    )}
                  </div>

                  {/* Due Date */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Prazo / Entrega</label>
                    {fieldsEditable ? (
                      <Input
                        type="date"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                        className="h-8 text-xs bg-background border-input text-foreground w-auto"
                      />
                    ) : (
                      <span className={cn(
                        "inline-flex h-8 items-center gap-1.5 px-3 rounded-md text-xs font-medium w-fit bg-muted/60",
                        isOverdue ? "text-red-400" : "text-foreground"
                      )}>
                        <Calendar className="h-3 w-3" />
                        {dueDate ? new Date(dueDate + "T12:00:00").toLocaleDateString("pt-BR") : "—"}
                      </span>
                    )}
                  </div>

                  {/* Assignee — admin only */}
                  {!portalMode && (
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold flex items-center gap-1">
                        <User className="h-3 w-3 text-muted-foreground" /> Responsável
                      </label>
                      <Select value={assigneeId} onValueChange={setAssigneeId}>
                        <SelectTrigger className="h-8 text-xs bg-background border-input text-foreground w-auto min-w-[140px]">
                          <SelectValue placeholder="Selecione um responsável..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none" className="text-xs text-muted-foreground italic">Sem responsável</SelectItem>
                          {profiles.map((p) => (
                            <SelectItem key={p.id} value={p.id} className="text-xs">
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                   {/* Estimated Hours — admin only */}
                  {!portalMode && (
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Tempo Estimado</label>
                      <Input
                        type="number"
                        step="0.5"
                        min="0.5"
                        value={estimatedHours}
                        onChange={(e) => setEstimatedHours(parseFloat(e.target.value) || 1.0)}
                        className="h-8 text-xs bg-background border-input text-foreground w-20"
                      />
                    </div>
                  )}

                  {/* Credits — visible if credit billing enabled */}
                  {isCreditBillingEnabled && (
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Créditos</label>
                      {portalMode ? (
                        <span className="inline-flex h-8 items-center px-3 rounded-md text-xs font-bold w-fit bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                          {estimatedCredits} {estimatedCredits === 1 ? "crédito" : "créditos"}
                        </span>
                      ) : (
                        <Input
                          type="number"
                          min="0"
                          value={estimatedCredits}
                          onChange={(e) => setEstimatedCredits(parseInt(e.target.value) || 0)}
                          className="h-8 text-xs bg-background border-input text-foreground w-20"
                        />
                      )}
                    </div>
                  )}
                  
                  {/* Edition Select — visible only on creation if seasonal billing enabled */}
                  {!portalMode && isNew && selectedClient?.billing_model === "seasonal" && (
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Edição</label>
                      <Select value={clientEditionId} onValueChange={setClientEditionId}>
                        <SelectTrigger className="h-8 text-xs bg-background border-input text-foreground w-auto min-w-[120px]">
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                        <SelectContent>
                          {clientEditions.map((ed: any) => (
                            <SelectItem key={ed.id} value={ed.id} className="text-xs">
                              {ed.name} {ed.is_active ? "(Vigente)" : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Price Input — visible if seasonal or one_off billing enabled */}
                  {!portalMode && selectedClient && (
                    (selectedClient.billing_model === "seasonal") || 
                    (selectedClient.billing_model === "fixed" && selectedClient.fixed_type === "one_off")
                  ) && (
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Valor (R$)</label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={price ?? ""}
                        onChange={(e) => {
                          setPrice(e.target.value ? parseFloat(e.target.value) : null);
                          setIsPriceManuallyEdited(true);
                        }}
                        className="h-8 text-xs bg-background border-input text-foreground w-24"
                      />
                    </div>
                  )}
                </div>

                {/* Description label */}
                <div className="shrink-0">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Descrição</label>
                </div>

                {/* Description editor */}
                <div className="flex-1 flex flex-col min-h-0">
                  <RichEditor
                    content={description}
                    onChange={(html) => setDescription(html)}
                    borderless={false}
                    readOnly={!descriptionEditable}
                    placeholder="Descreva a demanda em detalhes..."
                    gDrivePath={gDrivePath}
                  />
                </div>

                {/* Attachments Section — only for existing demands */}
                {!isNew && !portalMode && id !== "new" && (
                  <div className="shrink-0 border-t border-border pt-3 px-0.5">
                    <FileAttachments entityType="demand" entityId={id} />
                  </div>
                )}
              </div>

              {/* Right Panel — Comments */}
              {!isNew && showComments && (
                <div className="w-[360px] md:w-[400px] shrink-0 border-l border-border flex flex-col bg-muted/10">
                  <div className="px-3.5 py-2.5 border-b border-border shrink-0">
                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Comentários</h4>
                  </div>

                  {/* Comments list */}
                  <div className="flex-1 overflow-y-auto px-3.5 py-3 space-y-4">
                    {isLoadingComments ? (
                      <div className="flex justify-center py-8">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/60" />
                      </div>
                    ) : comments.length === 0 ? (
                      <div className="text-center py-8 text-[11px] text-muted-foreground/60">Nenhum comentário.</div>
                    ) : (
                      comments.map((c) => {
                        const initials = c.author_label
                          ? c.author_label.split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase()
                          : "?";
                        const isClient = c.author_type === "client";
                        return (
                          <div key={c.id} className="flex gap-2.5 group">
                            <div className={cn(
                              "h-7 w-7 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 border",
                              isClient
                                ? "bg-emerald-900/40 text-emerald-400 border-emerald-700/40"
                                : "bg-primary/20 text-primary border-primary/35"
                            )}>
                              {initials}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-baseline justify-between mb-0.5">
                                <span className="text-xs font-bold text-foreground">
                                  {c.author_label ?? (isClient ? "Cliente" : "Equipe")}
                                </span>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span className="text-[9px] text-muted-foreground">
                                    {new Date(c.created_at).toLocaleDateString("pt-BR")}
                                  </span>
                                  {/* Edit/delete buttons — admin only */}
                                  {!portalMode && (
                                    <div className="hidden group-hover:flex items-center gap-1.5 pl-1.5 border-l border-border">
                                      <button
                                        onClick={() => startEditComment(c.id, c.body)}
                                        title="Editar comentário"
                                        className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                                      >
                                        <Pencil className="h-2.5 w-2.5" />
                                      </button>
                                      <button
                                        onClick={() => handleDeleteComment(c.id)}
                                        title="Comentário"
                                        className="text-muted-foreground hover:text-red-500 transition-colors cursor-pointer"
                                      >
                                        <Trash2 className="h-2.5 w-2.5" />
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {!portalMode && editingCommentId === c.id ? (
                                <div className="space-y-1.5 mt-1 bg-muted p-2 rounded-lg border border-border">
                                  <textarea
                                    value={editingCommentBody}
                                    onChange={(e) => setEditingCommentBody(e.target.value)}
                                    className="w-full bg-background border border-input rounded p-1.5 text-xs text-foreground focus:outline-none focus:border-primary/60 min-h-[50px] resize-none"
                                    placeholder="Editar comentário..."
                                  />
                                  <div className="flex justify-end gap-1.5">
                                    <button
                                      onClick={() => setEditingCommentId(null)}
                                      className="text-[10px] text-muted-foreground hover:text-foreground px-2 py-0.5 rounded hover:bg-muted transition-colors cursor-pointer"
                                    >
                                      Cancelar
                                    </button>
                                    <button
                                      onClick={() => handleSaveEditComment(c.id)}
                                      className="text-[10px] bg-emerald-600 text-white px-2.5 py-0.5 rounded hover:bg-emerald-500 transition-colors cursor-pointer font-bold"
                                    >
                                      Salvar
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div
                                  className="text-xs text-foreground bg-muted/40 rounded-lg px-2.5 py-1.5 border border-border prose prose-invert prose-xs max-w-none break-words [&_p]:m-0"
                                  dangerouslySetInnerHTML={{ __html: c.body }}
                                />
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Comment input */}
                  <div className="px-3.5 py-2.5 border-t border-border bg-muted/10 shrink-0">
                    <RichEditor
                      content={comment}
                      onChange={(html) => setComment(html)}
                      isChatInput={true}
                      onSubmitChat={handleAddComment}
                      placeholder="Escrever comentário..."
                      gDrivePath={gDrivePath}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* ── BOTTOM SAVE BAR ── */}
            <div className="shrink-0 border-t border-border px-6 py-3.5 flex items-center justify-between bg-card/90">
              <div className="flex items-center gap-4">
                {/* Admin-only: delete */}
                {!isNew && !portalMode && (
                  <Button
                    variant="ghost"
                    onClick={handleDelete}
                    className="h-9 px-3.5 text-red-500 hover:text-red-600 hover:bg-red-500/10 border border-red-500/20 hover:border-red-500/30 gap-1.5 text-xs font-bold rounded-lg cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" /> Excluir demanda
                  </Button>
                )}
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  {isDirty ? "Você tem alterações pendentes" : "Sem alterações"}
                </span>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={handleClose} className="h-9 px-4 text-xs">
                  {isNew ? "Cancelar" : "Fechar"}
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={saving || !isDirty}
                  className="gap-2 px-6 h-9 text-xs font-bold"
                >
                  {saving
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Save className="h-3.5 w-3.5" />
                  }
                  {saving ? "Salvando..." : isNew ? "Criar Demanda" : "Salvar alterações"}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
