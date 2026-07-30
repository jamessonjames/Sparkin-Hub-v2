import { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect, lazy, Suspense } from "react";
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
import { getPricingSettings, calculateCreditsFromPricing } from "@/lib/pricing.functions";
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
import { useUserContext } from "@/contexts/user-context";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { STATUS_LABELS, PRIORITY_LABELS } from "@/lib/demand-labels";
const RichEditorLazy = lazy(() => import("@/components/rich-editor").then(m => ({ default: m.RichEditor })));
import { deleteFromGDrive } from "@/lib/gdrive.functions";
import { getFileIdFromUrl } from "@/lib/gdrive-token";
import { listClientGems, type ClientGem } from "@/lib/client-gems.functions";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Trash2, Send, Calendar, X, Save, User, Users, Loader2, Pencil, Upload, Download, Lock, Share2, MoreVertical, Building2, Sparkles, AlertCircle, Clock, Coins, Layers, DollarSign, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { getClientCreditTiers, calculateCreditsFromHours } from "@/lib/credit-tiers";

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

const CLIENT_STATUSES: DemandStatus[] = ["nao_iniciado", "com_ajustes", "concluido"];

const PROFILE_COLORS = [
  "bg-indigo-600/40 text-indigo-200 border-indigo-500/50",
  "bg-emerald-600/40 text-emerald-200 border-emerald-500/50",
  "bg-amber-600/40 text-amber-200 border-amber-500/50",
  "bg-rose-600/40 text-rose-200 border-rose-500/50",
  "bg-purple-600/40 text-purple-200 border-purple-500/50",
  "bg-cyan-600/40 text-cyan-200 border-cyan-500/50",
  "bg-blue-600/40 text-blue-200 border-blue-500/50",
  "bg-pink-600/40 text-pink-200 border-pink-500/50",
];

function getProfileColor(str: string) {
  if (!str) return PROFILE_COLORS[0];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % PROFILE_COLORS.length;
  return PROFILE_COLORS[index];
}

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
  const deleteFromGDriveFn = useServerFn(deleteFromGDrive);
  const listCommentsFn = useServerFn(listComments);
  const addCommentFn = useServerFn(addComment);
  const deleteCommentFn = useServerFn(deleteComment);
  const updateCommentFn = useServerFn(updateComment);
  const listProfilesFn = useServerFn(listProfiles);
  const qc = useQueryClient();
  const { selectedUserId } = useUserContext();
  const activeUserId = selectedUserId;

  const [lightbox, setLightbox] = useState<{
    src: string;
    source: "description" | "comment";
    commentId?: string;
  } | null>(null);

  const handleDialogClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === "IMG") {
      const src = target.getAttribute("src");
      if (!src) return;

      // Determine the source by traversing up the DOM tree
      let current: HTMLElement | null = target;
      let source: "description" | "comment" = "description";
      let commentId: string | undefined = undefined;

      while (current) {
        if (current.classList.contains("comment-body-wrapper") || current.dataset.commentId) {
          source = "comment";
          commentId = current.dataset.commentId;
          break;
        }
        if (current.classList.contains("description-editor-wrapper")) {
          source = "description";
          break;
        }
        current = current.parentElement;
      }

      e.preventDefault();
      e.stopPropagation();
      setLightbox({ src, source, commentId });
    }
  };

  const handleDeleteLightboxImage = async () => {
    if (!lightbox) return;
    const { src, source, commentId } = lightbox;

    const fileId = getFileIdFromUrl(src);
    if (fileId) {
      try {
        await deleteFromGDriveFn({ data: { fileId } });
      } catch (err) {
        console.error("Could not delete from Google Drive:", err);
        toast.warning("Imagem removida do painel, mas não pôde ser excluída do Google Drive (permissão expirada).");
      }
    }

    if (source === "description") {
      const cleanHtml = description.replace(new RegExp(`<img[^>]*src=["']${src}["'][^>]*>`, "g"), "");
      setDescription(cleanHtml);

      if (!isNew && id !== "new") {
        try {
          if (portalMode) {
            await updatePortalFn({
              data: {
                id,
                description: cleanHtml || null,
              }
            });
          } else {
            await updateFn({
              data: {
                id,
                description: cleanHtml || null,
              }
            });
          }
          qc.invalidateQueries({ queryKey: ["demands"] });
          qc.invalidateQueries({ queryKey: ["demand", id] });
          toast.success("Imagem removida da descrição.");
        } catch (err) {
          console.error("Error deleting image:", err);
          toast.error("Erro ao salvar alterações da descrição.");
        }
      } else {
        toast.success("Imagem removida do rascunho da descrição.");
      }
    } else if (source === "comment" && commentId) {
      const commentToEdit = comments.find(c => c.id === commentId);
      if (commentToEdit) {
        const cleanHtml = commentToEdit.body.replace(new RegExp(`<img[^>]*src=["']${src}["'][^>]*>`, "g"), "");
        try {
          await updateCommentFn({ data: { id: commentId, body: cleanHtml } });
          qc.invalidateQueries({ queryKey: ["comments", id] });
          toast.success("Imagem removida do comentário.");
        } catch (err) {
          console.error("Error deleting comment image:", err);
          toast.error("Erro ao remover imagem do comentário.");
        }
      }
    }
    setLightbox(null);
  };

  const handleDownloadLightboxImage = async () => {
    if (!lightbox) return;
    try {
      const response = await fetch(lightbox.src);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const fileName = lightbox.src.split("/").pop()?.split("?")[0] || "imagem-anexo.png";
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch {
      window.open(lightbox.src, "_blank");
    }
  };



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
  const [activeCommentTab, setActiveCommentTab] = useState<"public" | "internal">("public");
  const [estimatedHours, setEstimatedHours] = useState<number>(1.0);
  const [estimatedCredits, setEstimatedCredits] = useState<number>(0);
  const [clientEditionId, setClientEditionId] = useState("");
  const [price, setPrice] = useState<number | null>(null);
  
  // Flag to track if the user manually edited the price field
  const [isPriceManuallyEdited, setIsPriceManuallyEdited] = useState(false);

  // Fetch registered gems for the current client
  const listGemsFn = useServerFn(listClientGems);
  const { data: clientGems = [] } = useQuery({
    queryKey: ["client-gems", clientId],
    queryFn: () => listGemsFn({ data: { client_id: clientId } }),
    enabled: !!clientId,
  });

  const handleTriggerGem = async (gem: ClientGem) => {
    const plainDesc = description ? description.replace(/<[^>]*>/g, '').trim() : '';
    const compiledBriefing = `TÍTULO DA DEMANDA:\n${title}\n\nBRIEFING E DETALHES:\n${plainDesc}`;

    try {
      await navigator.clipboard.writeText(compiledBriefing);
    } catch (err) {
      console.error("Erro ao copiar briefing:", err);
    }

    toast.success(`Briefing copiado! Abrindo assistente (${gem.name})...`);

    const popupLeft = typeof window !== "undefined" && window.screen.width ? window.screen.width - 530 : 1000;
    window.open(
      gem.gem_url,
      'GeminiAssistant',
      'width=520,height=850,left=' + popupLeft + ',top=50,resizable=yes'
    );
  };

  const handleAiButtonClick = () => {
    if (!clientId) {
      toast.error("Selecione um cliente primeiro.");
      return;
    }
    if (clientGems.length === 0) {
      toast.warning(
        "Nenhum Agente cadastrado para este cliente. Acesse a aba 'IA / Agentes' no perfil do cliente para cadastrar.",
        { duration: 5000 }
      );
      return;
    }
    if (clientGems.length === 1) {
      handleTriggerGem(clientGems[0]);
    }
  };

  // Dynamic Real-Time Overflow Calculation for Option B
  const propBarRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState<number>(6);

  const calculateOverflow = useCallback(() => {
    if (!propBarRef.current) return;
    const containerWidth = propBarRef.current.clientWidth;
    if (containerWidth === 0) return;

    const showClient = !portalMode && isNew && clients.length > 1;
    const showAssignee = !portalMode;
    const showHours = !portalMode;

    const itemWidths: number[] = [];
    if (showClient) itemWidths.push(130);
    itemWidths.push(115); // Status
    if (showAssignee) itemWidths.push(145); // Responsável
    itemWidths.push(95); // Prioridade
    itemWidths.push(140); // Data de término
    if (showHours) itemWidths.push(105); // Tempo Estimado

    const dotsWidth = 44;
    const gap = 16;
    let usedWidth = 0;
    let count = 0;

    for (let i = 0; i < itemWidths.length; i++) {
      const w = itemWidths[i];
      const isLast = i === itemWidths.length - 1;
      const needed = isLast ? w : w + dotsWidth;

      if (usedWidth + needed <= containerWidth || count === 0) {
        usedWidth += w + gap;
        count++;
      } else {
        break;
      }
    }

    setVisibleCount(count);
  }, [portalMode, isNew, clients.length]);

  useLayoutEffect(() => {
    calculateOverflow();
  }, [calculateOverflow]);

  useEffect(() => {
    if (!propBarRef.current) return;
    const observer = new ResizeObserver(() => {
      calculateOverflow();
    });
    observer.observe(propBarRef.current);
    return () => observer.disconnect();
  }, [calculateOverflow]);

  // Reset manually edited flag when switching/loading demands
  useEffect(() => {
    setIsPriceManuallyEdited(false);
  }, [demand?.id]);

  // Recalculate price based on hours and client pricing settings
  useEffect(() => {
    if (portalMode || !pricingConfig || isPriceManuallyEdited) return;

    const selectedClient = (fullClients as any[]).find((c) => c.id === clientId);
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

  const selectedClient = !portalMode ? (fullClients as any[]).find((c) => c.id === clientId) : null;
  const clientName = portalMode ? (portalClientName || "Desconhecido") : (selectedClient?.name || "Desconhecido");
  const demandTitle = title.trim() || "Nova Demanda";
  const gDrivePath = useMemo(() => ["Clients", clientName, "Demands", demandTitle], [clientName, demandTitle]);
  const isCreditBillingEnabled = portalMode
    ? portalBillingModel === "credits" && portalCreditsEnabled !== false
    : selectedClient?.billing_model === "credits";

  const [isCreditsManuallyEdited, setIsCreditsManuallyEdited] = useState(false);

  // Recalculate credits based on hours and central pricing credit rules
  useEffect(() => {
    if (portalMode || !isCreditBillingEnabled || isCreditsManuallyEdited || !pricingConfig) return;
    if (estimatedHours > 0) {
      const calc = calculateCreditsFromPricing(estimatedHours, pricingConfig.credit_tiers);
      if (calc > 0) {
        setEstimatedCredits(calc);
      }
    }
  }, [estimatedHours, clientId, isCreditBillingEnabled, pricingConfig, isCreditsManuallyEdited, portalMode]);

  const headerInfoText = useMemo(() => {
    if (isNew) return "";
    
    const parts: string[] = [];
    if (portalMode) {
      if (portalClientName) parts.push(portalClientName);
    } else if (selectedClient) {
      parts.push(selectedClient.name);
      if (selectedClient.billing_model === "seasonal" && clientEditionId) {
        const ed = (clientEditions as any[]).find((e: any) => e.id === clientEditionId);
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
        const activeEdition = (clientEditions as any[]).find((e: any) => e.is_active);
        setClientEditionId((activeEdition as any)?.id || (clientEditions as any[])[0]?.id || "");
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
            assignee_user_id: assigneeId || (profiles as any[]).find((p: any) => p.name?.toLowerCase().includes("jamesson"))?.id || profiles[0]?.id || null,
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
            assignee_user_id: assigneeId || (profiles as any[]).find((p: any) => p.name?.toLowerCase().includes("jamesson"))?.id || profiles[0]?.id || null,
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

  function extractAllGDriveUrls(htmls: string[]): string[] {
    const urls: string[] = [];
    const regexes = [
      /https:\/\/lh3\.googleusercontent\.com\/d\/[a-zA-Z0-9_-]+/g,
      /https:\/\/drive\.google\.com\/uc\?[^"'\s<>]+/g,
      /https:\/\/drive\.google\.com\/file\/d\/[a-zA-Z0-9_-]+/g
    ];

    for (const html of htmls) {
      if (!html) continue;
      for (const regex of regexes) {
        const matches = html.match(regex);
        if (matches) {
          for (const match of matches) {
            const url = match.replace(/&amp;/g, "&");
            urls.push(url);
          }
        }
      }
    }
    return Array.from(new Set(urls));
  }

  async function handleDelete() {
    if (!confirm("Excluir esta demanda permanentemente?")) return;
    try {
      const htmls = [description, ...comments.map((c) => c.body)];
      const gDriveUrls = extractAllGDriveUrls(htmls);
      
      if (gDriveUrls.length > 0) {
        try {
          for (const url of gDriveUrls) {
            const fileId = getFileIdFromUrl(url);
            if (fileId) {
              await deleteFromGDriveFn({ data: { fileId } });
            }
          }
        } catch (err) {
          console.error("Erro ao excluir arquivos do Google Drive:", err);
          toast.warning("Demanda excluída do painel, mas alguns anexos não puderam ser apagados do Google Drive.");
        }
      }

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

    const isInternal = !portalMode && activeCommentTab === "internal";

    try {
      if (portalMode) {
        await addPortalCommentFn({
          data: { slug: portalSlug!, demand_id: id, body: comment, author_label: portalClientName },
        });
        qc.invalidateQueries({ queryKey: ["portal-comments", id] });
      } else {
        await addCommentFn({ data: { demand_id: id, body: comment, is_internal: isInternal } });
        qc.invalidateQueries({ queryKey: ["comments", id] });
      }
      setComment("");
      toast.success(isInternal ? "Nota/comentário interno adicionado!" : "Comentário adicionado!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao comentar");
    }
  }

  async function handleForwardToClient(body: string) {
    try {
      await addCommentFn({
        data: {
          demand_id: id,
          body,
          is_internal: false,
        },
      });
      qc.invalidateQueries({ queryKey: ["comments", id] });
      setActiveCommentTab("public");
      toast.success("Comentário encaminhado para a aba pública do cliente!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao encaminhar comentário");
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
      {/* Lightbox Modal */}
      {lightbox && (
        <div 
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/95 animate-in fade-in duration-200"
          onClick={() => setLightbox(null)}
        >
          {/* Close button top right */}
          <button
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 text-white/70 hover:text-white hover:bg-white/10 p-2.5 rounded-full transition-all cursor-pointer z-50 shadow-lg"
            title="Fechar"
          >
            <X className="h-6 w-6" />
          </button>

          {/* Action bar top center/left */}
          <div className="absolute top-4 left-4 flex items-center gap-2 z-50" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={handleDownloadLightboxImage}
              className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-lg backdrop-blur-sm"
              title="Baixar imagem"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Baixar</span>
            </button>

            {/* Delete button (only if user has rights) */}
            <button
              onClick={() => {
                if (confirm("Deseja realmente excluir esta imagem?")) {
                  handleDeleteLightboxImage();
                }
              }}
              className="flex items-center gap-1.5 bg-red-600/80 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-lg backdrop-blur-sm"
              title="Excluir imagem definitivamente"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Excluir</span>
            </button>
          </div>

          {/* Centered Image */}
          <div 
            className="relative max-w-[90vw] max-h-[80vh] flex items-center justify-center p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <img 
              src={lightbox.src} 
              alt="Visualização" 
              className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl border border-white/5 select-none"
            />
          </div>
        </div>
      )}

      <div
        onClick={handleDialogClick}
        className="relative w-full max-w-[95vw] lg:max-w-5xl xl:max-w-6xl h-[90vh] bg-card border border-border rounded-2xl flex flex-col overflow-hidden shadow-2xl my-auto mx-auto animate-in fade-in zoom-in duration-200"
      >

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

              <div className="ml-auto flex items-center gap-2">
                {/* ✨ Criar layout com IA Button — oculto no portal do cliente */}
                {!portalMode && clientGems.length > 1 ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs font-semibold gap-1.5 border-amber-500/40 hover:border-amber-500 text-amber-300 hover:text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 cursor-pointer shadow-xs"
                      >
                        <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                        <span>Criar layout com IA</span>
                        <ChevronDown className="h-3 w-3 opacity-70" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56 p-1.5 bg-popover text-popover-foreground border border-border shadow-lg rounded-xl space-y-1">
                      {clientGems.some((g) => (g.category || "designer") === "designer") && (
                        <>
                          <DropdownMenuLabel className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-2 py-0.5">
                            Designers
                          </DropdownMenuLabel>
                          {clientGems
                            .filter((g) => (g.category || "designer") === "designer")
                            .map((gem) => (
                              <DropdownMenuItem
                                key={gem.id}
                                onClick={() => handleTriggerGem(gem)}
                                className="text-xs font-medium cursor-pointer flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-accent focus:bg-accent"
                              >
                                <span>{gem.name}</span>
                              </DropdownMenuItem>
                            ))}
                        </>
                      )}

                      {clientGems.some((g) => g.category === "copywriter") && (
                        <>
                          {clientGems.some((g) => (g.category || "designer") === "designer") && (
                            <DropdownMenuSeparator className="bg-border/60" />
                          )}
                          <DropdownMenuLabel className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-2 py-0.5">
                            Copywriters
                          </DropdownMenuLabel>
                          {clientGems
                            .filter((g) => g.category === "copywriter")
                            .map((gem) => (
                              <DropdownMenuItem
                                key={gem.id}
                                onClick={() => handleTriggerGem(gem)}
                                className="text-xs font-medium cursor-pointer flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-accent focus:bg-accent"
                              >
                                <span>{gem.name}</span>
                              </DropdownMenuItem>
                            ))}
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleAiButtonClick}
                    className="h-7 text-xs font-semibold gap-1.5 border-amber-500/40 hover:border-amber-500 text-amber-300 hover:text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 cursor-pointer shadow-xs"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                    <span>Criar layout com IA</span>
                  </Button>
                )}

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
              <div className="flex-1 px-6 py-4 flex flex-col gap-4 min-h-0 overflow-y-auto">

                {/* Notion-style 1-Line Property Bar with Option B Dynamic DOM Measurement */}
                {(() => {
                  const hasExtraFields = isCreditBillingEnabled || (!portalMode && isNew && (selectedClient as any)?.billing_model === "seasonal") || (!portalMode && selectedClient && ((selectedClient as any).billing_model === "seasonal" || ((selectedClient as any).billing_model === "fixed" && (selectedClient as any).fixed_type === "one_off")));
                  
                  const showClientInBar = !portalMode && isNew && clients.length > 1;
                  const showAssigneeInBar = !portalMode;
                  const showHoursCandidate = !portalMode;

                  const showPriorityInBar = visibleCount >= (showClientInBar ? 4 : 3);
                  const showDueDateInBar = visibleCount >= (showClientInBar ? 5 : 4);
                  const showHoursInBar = showHoursCandidate && visibleCount >= (showClientInBar ? 6 : 5);

                  const hasOverflowedProperties = !showPriorityInBar || !showDueDateInBar || (showHoursCandidate && !showHoursInBar);
                  const showMoreDotsButton = hasOverflowedProperties || hasExtraFields;

                  return (
                    <div ref={propBarRef} className="flex items-center justify-between gap-3 md:gap-4 py-2 px-1 border-b border-border/40 shrink-0 text-xs whitespace-nowrap min-w-0">
                      <div className="flex items-center gap-3.5 sm:gap-4 md:gap-5 shrink-0 min-w-0 pr-1">
                        {/* Client — admin only */}
                        {showClientInBar && (
                          <div data-prop-item className="flex flex-col gap-1 shrink-0">
                            <span className="text-xs font-medium text-muted-foreground/80">Cliente</span>
                            <Select value={clientId} onValueChange={setClientId}>
                              <SelectTrigger className="h-7 text-xs bg-muted/40 hover:bg-muted/60 border-transparent text-foreground font-medium py-0 px-2.5 rounded-md">
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
                        <div data-prop-item className="flex flex-col gap-1 shrink-0">
                          <span className="text-xs font-medium text-muted-foreground/80">Status</span>
                          {fieldsEditable && !isStatusBlockedInPortal ? (
                            <Select value={status} onValueChange={(val) => setStatus(val as DemandStatus)}>
                              <SelectTrigger className={cn("h-7 text-xs font-bold border-none text-white w-auto min-w-[100px] py-0 px-2.5 rounded-full shadow-2xs", STATUS_CHIP[status])}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {availableStatuses.map((s) => (
                                  <SelectItem key={s} value={s} className="text-xs">{STATUS_LABELS[s]}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className={cn("inline-flex h-7 items-center px-2.5 rounded-full text-xs font-bold w-fit", STATUS_CHIP[status])}>
                              {STATUS_LABELS[status] ?? status}
                            </span>
                          )}
                        </div>

                        {/* Responsável (Admin only) */}
                        {showAssigneeInBar && (
                          <div data-prop-item className="flex flex-col gap-1 shrink-0">
                            <span className="text-xs font-medium text-muted-foreground/80">Responsável</span>
                            <Select value={assigneeId} onValueChange={setAssigneeId}>
                              <SelectTrigger className="h-7 text-xs bg-transparent hover:bg-muted/40 border-none shadow-none text-foreground font-medium p-0 gap-1.5 focus:ring-0">
                                {assigneeId ? (
                                  <div className="flex items-center gap-1.5">
                                    {(() => {
                                      const assignee = profiles.find((p: any) => p.id === assigneeId);
                                      const name = assignee?.name ?? "Jamesson James";
                                      const colorClass = getProfileColor(assigneeId || name);
                                      return (
                                        <>
                                          <div className={cn("h-4 w-4 rounded-full text-[9px] font-bold flex items-center justify-center shrink-0 border", colorClass)}>
                                            {name.charAt(0).toUpperCase()}
                                          </div>
                                          <span>{name}</span>
                                        </>
                                      );
                                    })()}
                                  </div>
                                ) : (
                                  <SelectValue placeholder="Selecione..." />
                                )}
                              </SelectTrigger>
                              <SelectContent>
                                {profiles.map((p: any) => (
                                  <SelectItem key={p.id} value={p.id} className="text-xs">
                                    <div className="flex items-center gap-2">
                                      <div className={cn("h-4 w-4 rounded-full text-[9px] font-bold flex items-center justify-center border", getProfileColor(p.id))}>
                                        {p.name.charAt(0).toUpperCase()}
                                      </div>
                                      <span>{p.name}</span>
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}

                        {/* Prioridade */}
                        {showPriorityInBar && (
                          <div data-prop-item className="flex flex-col gap-1 shrink-0">
                            <span className="text-xs font-medium text-muted-foreground/80">Prioridade</span>
                            {fieldsEditable ? (
                              <Select value={priority} onValueChange={(val) => setPriority(val as any)}>
                                <SelectTrigger className={cn("h-7 text-xs font-bold border-none text-white w-auto min-w-[80px] py-0 px-2 rounded-md", PRIORITY_CHIP[priority])}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {(["low", "medium", "high", "urgent"] as const).map((p) => (
                                    <SelectItem key={p} value={p} className="text-xs">{PRIORITY_LABELS[p]}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <span className={cn("inline-flex h-7 items-center px-2.5 rounded-md text-xs font-bold w-fit", PRIORITY_CHIP[priority])}>
                                {PRIORITY_LABELS[priority]}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Data de término */}
                        {showDueDateInBar && (
                          <div data-prop-item className="flex flex-col gap-1 shrink-0">
                            <span className="text-xs font-medium text-muted-foreground/80">Data de término</span>
                            {fieldsEditable ? (
                              <Input
                                type="date"
                                value={dueDate}
                                onChange={(e) => setDueDate(e.target.value)}
                                className="h-7 text-xs bg-muted/40 hover:bg-muted/60 border-transparent text-foreground font-medium w-[144px] py-0 pl-2.5 pr-1 rounded-md [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-80 [&::-webkit-calendar-picker-indicator]:hover:opacity-100"
                              />
                            ) : (
                              <span className={cn(
                                "inline-flex h-7 items-center px-2.5 rounded-md text-xs font-medium w-fit bg-muted/40",
                                isOverdue ? "text-red-400" : "text-foreground"
                              )}>
                                {dueDate ? new Date(dueDate + "T12:00:00").toLocaleDateString("pt-BR") : "—"}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Tempo Estimado */}
                        {showHoursInBar && (
                          <div data-prop-item className="flex flex-col gap-1 shrink-0">
                            <span className="text-xs font-medium text-muted-foreground/80">Tempo Estimado</span>
                            <div className="flex items-center gap-1">
                              <Input
                                type="number"
                                step="0.5"
                                min="0.5"
                                value={estimatedHours}
                                onChange={(e) => setEstimatedHours(parseFloat(e.target.value) || 1.0)}
                                className="h-7 text-xs bg-muted/40 hover:bg-muted/60 border-transparent text-foreground font-medium w-14 py-0 px-1 rounded-md text-center"
                              />
                              <span className="text-xs text-muted-foreground">h</span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Secondary & Overflow Fields Dropdown / Popover — Vertical 3 Dots */}
                      {showMoreDotsButton && (
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className="h-7 w-7 flex items-center justify-center rounded-md border border-border/80 bg-surface-2/80 text-foreground hover:bg-surface-2 hover:border-primary/50 transition-colors ml-auto shrink-0 cursor-pointer self-end mb-0.5"
                              title="Mais opções e campos adicionais"
                            >
                              <MoreVertical className="h-4 w-4 text-foreground" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent align="end" className="w-64 p-3.5 bg-popover text-popover-foreground border border-border shadow-lg rounded-xl space-y-3">
                            <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Opções Adicionais</div>

                            {/* Overflowed Prioridade */}
                            {!showPriorityInBar && (
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-medium text-muted-foreground">Prioridade:</span>
                                {fieldsEditable ? (
                                  <Select value={priority} onValueChange={(val) => setPriority(val as any)}>
                                    <SelectTrigger className={cn("h-7 text-xs font-bold border-none text-white w-28 py-0 px-2 rounded-md", PRIORITY_CHIP[priority])}>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {(["low", "medium", "high", "urgent"] as const).map((p) => (
                                        <SelectItem key={p} value={p} className="text-xs">{PRIORITY_LABELS[p]}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <span className={cn("inline-flex h-7 items-center px-2.5 rounded-md text-xs font-bold w-fit", PRIORITY_CHIP[priority])}>
                                    {PRIORITY_LABELS[priority]}
                                  </span>
                                )}
                              </div>
                            )}

                            {/* Overflowed Data de Término */}
                            {!showDueDateInBar && (
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-medium text-muted-foreground">Data de término:</span>
                                {fieldsEditable ? (
                                  <Input
                                    type="date"
                                    value={dueDate}
                                    onChange={(e) => setDueDate(e.target.value)}
                                    className="h-7 text-xs bg-background border-input text-foreground w-36 py-0 pl-2.5 pr-1 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-80 [&::-webkit-calendar-picker-indicator]:hover:opacity-100"
                                  />
                                ) : (
                                  <span className="text-xs font-medium text-foreground">
                                    {dueDate ? new Date(dueDate + "T12:00:00").toLocaleDateString("pt-BR") : "—"}
                                  </span>
                                )}
                              </div>
                            )}

                            {/* Overflowed Tempo Estimado */}
                            {showHoursCandidate && !showHoursInBar && (
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-medium text-muted-foreground">Tempo Estimado:</span>
                                <div className="flex items-center gap-1">
                                  <Input
                                    type="number"
                                    step="0.5"
                                    min="0.5"
                                    value={estimatedHours}
                                    onChange={(e) => setEstimatedHours(parseFloat(e.target.value) || 1.0)}
                                    className="h-7 text-xs bg-background border-input text-foreground w-16 py-0 px-1 text-center"
                                  />
                                  <span className="text-xs text-muted-foreground">h</span>
                                </div>
                              </div>
                            )}
                            
                            {/* Extra billing fields */}
                            {isCreditBillingEnabled && (
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                                  <Coins className="h-3.5 w-3.5" /> Créditos:
                                </span>
                                {portalMode ? (
                                  <span className="text-xs font-bold text-emerald-400">
                                    {estimatedCredits} {estimatedCredits === 1 ? "crédito" : "créditos"}
                                  </span>
                                ) : (
                                  <Input
                                    type="number"
                                    min="0"
                                    value={estimatedCredits}
                                    onChange={(e) => {
                                      setEstimatedCredits(parseInt(e.target.value) || 0);
                                      setIsCreditsManuallyEdited(true);
                                    }}
                                    className="h-7 text-xs bg-background border-input text-foreground w-20 py-0 px-2"
                                  />
                                )}
                              </div>
                            )}

                            {!portalMode && isNew && selectedClient?.billing_model === "seasonal" && (
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                                  <Layers className="h-3.5 w-3.5" /> Edição:
                                </span>
                                <Select value={clientEditionId} onValueChange={setClientEditionId}>
                                  <SelectTrigger className="h-7 text-xs bg-background border-input text-foreground w-32 py-0 px-2">
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

                            {!portalMode && selectedClient && (
                              (selectedClient.billing_model === "seasonal") || 
                              (selectedClient.billing_model === "fixed" && selectedClient.fixed_type === "one_off")
                            ) && (
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                                  <DollarSign className="h-3.5 w-3.5" /> Valor (R$):
                                </span>
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={price ?? ""}
                                  onChange={(e) => {
                                    setPrice(e.target.value ? parseFloat(e.target.value) : null);
                                    setIsPriceManuallyEdited(true);
                                  }}
                                  className="h-7 text-xs bg-background border-input text-foreground w-24 py-0 px-2"
                                />
                              </div>
                            )}
                          </PopoverContent>
                        </Popover>
                      )}
                    </div>
                  );
                })()}

                {/* Description editor — Maximize vertical space, borderless */}
                <div className="description-editor-wrapper flex-1 flex flex-col min-h-[300px]">
                  <Suspense fallback={<div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">Carregando editor...</div>}>
                    <RichEditorLazy
                      content={description}
                      onChange={(html) => setDescription(html)}
                      borderless={true}
                      readOnly={!descriptionEditable}
                      placeholder="Descreva a demanda em detalhes..."
                      gDrivePath={gDrivePath}
                    />
                  </Suspense>
                </div>
              </div>

              {/* Right Panel — Comments */}
              {!isNew && showComments && (
                <div className="w-[380px] lg:w-[420px] shrink-0 border-l border-border flex flex-col bg-muted/10 min-w-0">
                  {/* Comments Header with Full-Width 2-Column Tabs */}
                  <div className="px-4 py-3 border-b border-border shrink-0 flex flex-col gap-2.5 bg-card/40">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Comentários</h4>
                    </div>

                    {!portalMode && (
                      <div className="grid grid-cols-2 bg-zinc-900/90 border border-zinc-800 p-0.5 rounded-lg text-xs w-full">
                        <button
                          type="button"
                          onClick={() => setActiveCommentTab("public")}
                          className={cn(
                            "py-1 rounded font-medium transition-colors cursor-pointer text-center",
                            activeCommentTab === "public"
                              ? "bg-zinc-800 text-zinc-100 font-bold shadow-xs"
                              : "text-zinc-400 hover:text-zinc-200"
                          )}
                        >
                          Gerais ({comments.filter((c: any) => !c.is_internal).length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveCommentTab("internal")}
                          className={cn(
                            "py-1 rounded font-medium transition-colors cursor-pointer flex items-center justify-center gap-1",
                            activeCommentTab === "internal"
                              ? "bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30 shadow-xs"
                              : "text-zinc-400 hover:text-zinc-200"
                          )}
                        >
                          <Lock className="h-3 w-3 text-amber-400" />
                          Internos ({comments.filter((c: any) => c.is_internal).length})
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Comments list */}
                  <div className={cn(
                    "flex-1 overflow-y-auto px-3.5 py-3 space-y-4 transition-colors",
                    !portalMode && activeCommentTab === "internal" && "bg-amber-500/[0.02]"
                  )}>
                    {isLoadingComments ? (
                      <div className="flex justify-center py-8">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/60" />
                      </div>
                    ) : (portalMode ? comments.filter((c: any) => !c.is_internal) : comments.filter((c: any) => activeCommentTab === "internal" ? c.is_internal : !c.is_internal)).length === 0 ? (
                      <div className="text-center py-8 text-[11px] text-muted-foreground/60">
                        {!portalMode && activeCommentTab === "internal" ? "Nenhuma nota interna ainda." : "Nenhum comentário."}
                      </div>
                    ) : (
                      (portalMode ? comments.filter((c: any) => !c.is_internal) : comments.filter((c: any) => activeCommentTab === "internal" ? c.is_internal : !c.is_internal)).map((c: any) => {
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
                                : c.is_internal
                                  ? "bg-amber-900/40 text-amber-300 border-amber-700/40"
                                  : "bg-primary/20 text-primary border-primary/35"
                            )}>
                              {initials}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-baseline justify-between mb-0.5">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-bold text-foreground">
                                    {c.author_label ?? (isClient ? "Cliente" : "Equipe")}
                                  </span>
                                  {c.is_internal && (
                                    <span className="text-[9px] font-extrabold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-0.5">
                                      <Lock className="h-2 w-2" /> Interno
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span className="text-[9px] text-muted-foreground">
                                    {new Date(c.created_at).toLocaleDateString("pt-BR")}
                                  </span>
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
                                        title="Excluir comentário"
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
                                <>
                                  <div
                                    className={cn(
                                      "comment-body-wrapper text-xs text-foreground rounded-lg px-2.5 py-1.5 border prose prose-invert prose-xs max-w-none break-words [&_p]:m-0",
                                      c.is_internal
                                        ? "bg-amber-950/20 border-amber-800/30 text-amber-100"
                                        : "bg-muted/40 border-border"
                                    )}
                                    data-comment-id={c.id}
                                    dangerouslySetInnerHTML={{ __html: c.body }}
                                  />
                                  {c.is_internal && !portalMode && (
                                    <button
                                      type="button"
                                      onClick={() => handleForwardToClient(c.body)}
                                      className="text-[10px] text-amber-400 hover:text-amber-300 flex items-center gap-1 font-semibold hover:underline transition-colors cursor-pointer mt-1.5"
                                      title="Copiar/Encaminhar esta nota para os comentários públicos do cliente"
                                    >
                                      <Share2 className="h-3 w-3" />
                                      <span>Encaminhar para o cliente</span>
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Comment input */}
                  <div className="px-3.5 py-2.5 border-t border-border bg-muted/10 shrink-0">
                    <Suspense fallback={<div className="text-xs text-muted-foreground p-2">Carregando editor...</div>}>
                      <RichEditorLazy
                        content={comment}
                        onChange={(html) => setComment(html)}
                        isChatInput={true}
                        onSubmitChat={handleAddComment}
                        placeholder={!portalMode && activeCommentTab === "internal" ? "Escrever nota/comentário interno (apenas equipe)..." : "Escrever comentário..."}
                        gDrivePath={gDrivePath}
                      />
                    </Suspense>
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
