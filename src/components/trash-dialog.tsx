import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Trash2,
  RotateCcw,
  Search,
  AlertTriangle,
  FolderKanban,
  Building2,
  FileText,
  Video,
  Clock,
  Loader2,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import {
  listTrashItems,
  restoreTrashItem,
  permanentlyDeleteTrashItem,
  emptyTrash,
  type TrashItem,
  type TrashCategory,
} from "@/lib/trash.functions";
import { cn } from "@/lib/utils";

interface TrashDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CATEGORY_CONFIG: Record<
  TrashCategory,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  demands: { label: "Demandas", icon: FolderKanban },
  clients: { label: "Clientes", icon: Building2 },
  notes: { label: "Anotações", icon: FileText },
  meetings: { label: "Reuniões", icon: Video },
};

export function TrashDialog({ open, onOpenChange }: TrashDialogProps) {
  const qc = useQueryClient();
  const listFn = useServerFn(listTrashItems);
  const restoreFn = useServerFn(restoreTrashItem);
  const deletePermanentFn = useServerFn(permanentlyDeleteTrashItem);
  const emptyTrashFn = useServerFn(emptyTrash);

  const [activeTab, setActiveTab] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [emptyTrashConfirmOpen, setEmptyTrashConfirmOpen] = useState(false);
  const [isEmptying, setIsEmptying] = useState(false);

  // Fetch trash items
  const { data: trashData, isLoading, refetch } = useQuery({
    queryKey: ["trash-items"],
    queryFn: () => listFn(),
    enabled: open,
    staleTime: 10_000,
  });

  const items = trashData?.items || [];
  const counts = trashData?.counts || { demands: 0, clients: 0, notes: 0, meetings: 0, total: 0 };

  // Filter items by tab and search
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesTab = activeTab === "all" || item.category === activeTab;
      if (!matchesTab) return false;

      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      const titleMatch = item.title.toLowerCase().includes(term);
      const subtitleMatch = item.subtitle?.toLowerCase().includes(term);
      return titleMatch || subtitleMatch;
    });
  }, [items, activeTab, searchTerm]);

  // Handlers
  async function handleRestore(item: TrashItem) {
    try {
      setActionLoadingId(item.id);
      await restoreFn({ data: { id: item.id, category: item.category } });
      toast.success(`"${item.title}" restaurado com sucesso!`);
      // Invalidate relevant queries
      qc.invalidateQueries({ queryKey: ["trash-items"] });
      qc.invalidateQueries({ queryKey: ["demands"] });
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["notes"] });
      qc.invalidateQueries({ queryKey: ["meetings"] });
    } catch (e: any) {
      toast.error(e?.message || "Erro ao restaurar item.");
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handlePermanentDelete(item: TrashItem) {
    if (!window.confirm(`Tem certeza que deseja excluir definitivamente "${item.title}"? Esta ação não pode ser desfeita.`)) {
      return;
    }

    try {
      setActionLoadingId(item.id);
      await deletePermanentFn({ data: { id: item.id, category: item.category } });
      toast.success(`"${item.title}" excluído definitivamente.`);
      qc.invalidateQueries({ queryKey: ["trash-items"] });
    } catch (e: any) {
      toast.error(e?.message || "Erro ao excluir definitivamente.");
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleEmptyTrashConfirm() {
    try {
      setIsEmptying(true);
      await emptyTrashFn({ data: { category: activeTab === "all" ? "all" : (activeTab as any) } });
      toast.success(
        activeTab === "all"
          ? "Lixeira esvaziada completamente."
          : `Lixeira de ${CATEGORY_CONFIG[activeTab as TrashCategory]?.label || "itens"} esvaziada.`
      );
      qc.invalidateQueries({ queryKey: ["trash-items"] });
      setEmptyTrashConfirmOpen(false);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao esvaziar lixeira.");
    } finally {
      setIsEmptying(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden bg-card border-border shadow-2xl">
          {/* Header */}
          <div className="p-6 border-b border-border/80 bg-muted/20">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <DialogTitle className="text-xl font-bold flex items-center gap-2 text-foreground">
                  <Trash2 className="h-5 w-5 text-red-500" />
                  Lixeira do Sistema
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
                  Itens na lixeira são excluídos permanentemente após <strong>30 dias</strong>.
                  Você pode restaurá-los com 1 clique a qualquer momento antes do prazo.
                </DialogDescription>
              </div>
            </div>

            {/* Search Input */}
            <div className="mt-4 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70" />
              <Input
                placeholder="Buscar por nome, cliente, notas..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-9 text-xs bg-background/60 border-border/80 focus-visible:ring-1"
              />
            </div>
          </div>

          {/* Navigation Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
            <div className="px-6 border-b border-border/80 bg-muted/10">
              <TabsList className="bg-transparent h-11 p-0 gap-2">
                <TabsTrigger
                  value="all"
                  className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary border-b-2 border-transparent data-[state=active]:border-primary rounded-none px-3 text-xs font-semibold h-full gap-1.5"
                >
                  Todos
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-muted text-muted-foreground">
                    {counts.total}
                  </Badge>
                </TabsTrigger>
                {(["demands", "clients", "notes", "meetings"] as TrashCategory[]).map((cat) => {
                  const conf = CATEGORY_CONFIG[cat];
                  const Icon = conf.icon;
                  const count = counts[cat] || 0;
                  return (
                    <TabsTrigger
                      key={cat}
                      value={cat}
                      className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary border-b-2 border-transparent data-[state=active]:border-primary rounded-none px-3 text-xs font-semibold h-full gap-1.5"
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {conf.label}
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-muted text-muted-foreground">
                        {count}
                      </Badge>
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </div>

            {/* Items List Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-2.5 min-h-[300px]">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  <span className="text-xs">Carregando itens da lixeira...</span>
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground gap-2">
                  <div className="h-12 w-12 rounded-full bg-muted/40 grid place-items-center mb-1">
                    <Trash2 className="h-6 w-6 opacity-40" />
                  </div>
                  <p className="text-sm font-medium text-foreground">A lixeira está vazia</p>
                  <p className="text-xs max-w-sm">
                    {searchTerm
                      ? `Nenhum item encontrado com o termo "${searchTerm}".`
                      : "Nenhum item excluído foi encontrado nesta categoria."}
                  </p>
                </div>
              ) : (
                filteredItems.map((item) => {
                  const CatIcon = CATEGORY_CONFIG[item.category]?.icon || Trash2;
                  const isExpiringSoon = item.days_remaining <= 3;
                  const isLoadingItem = actionLoadingId === item.id;

                  return (
                    <div
                      key={`${item.category}-${item.id}`}
                      className="flex items-center justify-between p-3.5 rounded-xl border border-border/60 bg-surface-1/40 hover:bg-surface-2/60 transition-colors gap-4 group"
                    >
                      {/* Left: icon + info */}
                      <div className="flex items-center gap-3.5 min-w-0 flex-1">
                        <div className="h-9 w-9 rounded-lg bg-muted/50 border border-border/80 flex items-center justify-center shrink-0 text-muted-foreground group-hover:text-primary transition-colors">
                          <CatIcon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-xs text-foreground truncate">
                              {item.title}
                            </span>
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1.5 py-0 h-4 uppercase font-semibold tracking-wider text-muted-foreground/80 shrink-0"
                            >
                              {CATEGORY_CONFIG[item.category]?.label}
                            </Badge>
                          </div>
                          {item.subtitle && (
                            <p className="text-[11px] text-muted-foreground truncate">
                              {item.subtitle}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Middle: Days countdown badge */}
                      <div className="shrink-0 flex items-center gap-1.5">
                        <Badge
                          variant="secondary"
                          className={cn(
                            "text-[11px] font-medium gap-1 px-2.5 py-1 rounded-md border",
                            isExpiringSoon
                              ? "bg-red-500/10 text-red-400 border-red-500/30"
                              : "bg-amber-500/10 text-amber-300 border-amber-500/30"
                          )}
                        >
                          <Clock className="h-3 w-3" />
                          {item.days_remaining === 0
                            ? "Exclui hoje"
                            : item.days_remaining === 1
                            ? "Falta 1 dia"
                            : `Faltam ${item.days_remaining} dias`}
                        </Badge>
                      </div>

                      {/* Right: Actions (Restore & Permanent Delete) */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isLoadingItem}
                          onClick={() => handleRestore(item)}
                          className="h-8 px-2.5 text-xs font-semibold gap-1.5 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/10 hover:border-emerald-500/40 cursor-pointer"
                          title="Restaurar de volta ao painel"
                        >
                          {isLoadingItem ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RotateCcw className="h-3.5 w-3.5" />
                          )}
                          Restaurar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isLoadingItem}
                          onClick={() => handlePermanentDelete(item)}
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 cursor-pointer"
                          title="Excluir definitivamente"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Tabs>

          {/* Footer stats & actions */}
          <div className="p-3 border-t border-border/80 bg-muted/20 px-6 flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-3">
              <span>
                Total na lixeira: <strong>{counts.total}</strong> {counts.total === 1 ? "item" : "itens"}
              </span>

              {counts.total > 0 && (
                <>
                  <span className="text-border">•</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEmptyTrashConfirmOpen(true)}
                    className="h-7 px-2.5 text-xs text-red-500 hover:text-red-400 hover:bg-red-500/10 gap-1.5 font-medium cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Esvaziar {activeTab === "all" ? "lixeira" : CATEGORY_CONFIG[activeTab as TrashCategory]?.label.toLowerCase()}
                  </Button>
                </>
              )}
            </div>

            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="h-7 text-xs">
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog for Empty Trash */}
      <AlertDialog open={emptyTrashConfirmOpen} onOpenChange={setEmptyTrashConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-500">
              <AlertTriangle className="h-5 w-5" />
              Esvaziar lixeira permanentemente?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs leading-relaxed">
              Esta ação excluirá definitivamente todos os itens{" "}
              {activeTab !== "all" ? `da categoria ${CATEGORY_CONFIG[activeTab as TrashCategory]?.label}` : ""} da
              lixeira. <strong>Eles não poderão ser recuperados.</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isEmptying} className="text-xs">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isEmptying}
              onClick={handleEmptyTrashConfirm}
              className="bg-red-600 hover:bg-red-700 text-white text-xs gap-1.5"
            >
              {isEmptying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              {isEmptying ? "Esvaziando..." : "Sim, esvaziar tudo"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
