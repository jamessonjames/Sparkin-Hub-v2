import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listProfiles } from "@/lib/users.functions";
import {
  DndContext,
  PointerSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
  closestCenter,
  pointerWithin,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { KANBAN_STATUSES, type DemandStatus } from "@/lib/demands.functions";
import { STATUS_LABELS, PRIORITY_LABELS } from "@/lib/demand-labels";
import { cn } from "@/lib/utils";
import { Plus, Calendar, ArrowUpDown, Search, X, GripVertical, Trash2, Target, MessageSquare } from "lucide-react";

export type KanbanDemand = {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  clients?: { id: string; name: string } | null;
  sort_order?: number | null;
  assignee_user_id?: string | null;
  comments_count?: number;
};

export function getStatusTheme(statusId: string, label: string) {
  const normLabel = (label || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  
  if (statusId === "nao_iniciado" || normLabel.includes("nao iniciado") || normLabel.includes("iniciado")) {
    return {
      dot: "bg-[#9ca3af]",
      pill: "bg-[#27272a] text-[#d4d4d8]",
      cardBg: "bg-[#242427] hover:bg-[#2b2b2f]",
      cardBorder: "border-[#37373c] hover:border-[#4b4b52]",
      btnText: "text-[#d4d4d8] hover:text-white",
      btnBorder: "border-[#37373c] hover:border-[#4b4b52] bg-[#242427]/40",
      columnBg: "bg-[#18181b]/70 border border-[#27272a]/60",
    };
  }
  if (statusId === "fazendo" || normLabel.includes("fazendo") || normLabel.includes("progresso")) {
    return {
      dot: "bg-[#c084fc]",
      pill: "bg-[#3d2343] text-[#e879f9]",
      cardBg: "bg-[#2a1d33] hover:bg-[#32233c]",
      cardBorder: "border-[#442854] hover:border-[#57336b]",
      btnText: "text-[#e879f9] hover:text-[#f0abfc]",
      btnBorder: "border-[#442854] hover:border-[#57336b] bg-[#2a1d33]/40",
      columnBg: "bg-[#1d1722]/70 border border-[#33223b]/60",
    };
  }
  if (statusId === "para_analise" || normLabel.includes("analise") || normLabel.includes("revisao")) {
    return {
      dot: "bg-[#60a5fa]",
      pill: "bg-[#172b43] text-[#60a5fa]",
      cardBg: "bg-[#18293d] hover:bg-[#1d324b]",
      cardBorder: "border-[#284466] hover:border-[#335682]",
      btnText: "text-[#60a5fa] hover:text-[#93c5fd]",
      btnBorder: "border-[#284466] hover:border-[#335682] bg-[#18293d]/40",
      columnBg: "bg-[#131f2c]/70 border border-[#1e334a]/60",
    };
  }
  if (statusId === "com_ajustes" || normLabel.includes("ajuste") || normLabel.includes("pendente")) {
    return {
      dot: "bg-[#fbbf24]",
      pill: "bg-[#3a2818] text-[#fbbf24]",
      cardBg: "bg-[#332317] hover:bg-[#3d2b1c]",
      cardBorder: "border-[#543822] hover:border-[#6b472a]",
      btnText: "text-[#fbbf24] hover:text-[#fde047]",
      btnBorder: "border-[#543822] hover:border-[#6b472a] bg-[#332317]/40",
      columnBg: "bg-[#221a14]/70 border border-[#3d2b1d]/60",
    };
  }
  if (statusId === "concluido" || normLabel.includes("concluido") || normLabel.includes("finalizado") || normLabel.includes("sucesso")) {
    return {
      dot: "bg-[#4ade80]",
      pill: "bg-[#1a3324] text-[#4ade80]",
      cardBg: "bg-[#1c3024] hover:bg-[#223b2c]",
      cardBorder: "border-[#2a4d38] hover:border-[#356147]",
      btnText: "text-[#4ade80] hover:text-[#86efac]",
      btnBorder: "border-[#2a4d38] hover:border-[#356147] bg-[#1c3024]/40",
      columnBg: "bg-[#14231b]/70 border border-[#203a2a]/60",
    };
  }
  
  // Default/Grey (Aguardando material, Reunião, etc.)
  return {
    dot: "bg-[#9ca3af]",
    pill: "bg-[#27272a] text-[#d4d4d8]",
    cardBg: "bg-[#242427] hover:bg-[#2b2b2f]",
    cardBorder: "border-[#37373c] hover:border-[#4b4b52]",
    btnText: "text-[#d4d4d8] hover:text-white",
    btnBorder: "border-[#37373c] hover:border-[#4b4b52] bg-[#242427]/40",
    columnBg: "bg-[#18181b]/70 border border-[#27272a]/60",
  };
}

const PRIORITY_CHIP: Record<string, string> = {
  low:    "bg-[#242427] text-[#9ca3af] border border-[#37373c]",
  medium: "bg-[#3a2818] text-[#fbbf24] border border-[#543822]",
  high:   "bg-[#3e1b1b] text-[#f87171] border border-[#5a2424]",
  urgent: "bg-[#4c1d1d] text-[#fca5a5] border border-[#6e2424]",
};

export function KanbanBoard({
  demands,
  onMove,
  onOpen,
  onAdd,
  onReorder,
  isClientPortal = false,
  showSearch = true,
  scrollRef,
  search,
  onSearchChange,
}: {
  demands: KanbanDemand[];
  onMove: (id: string, status: DemandStatus) => void;
  onOpen: (id: string) => void;
  onAdd?: (status: DemandStatus) => void;
  onReorder?: (updates: { id: string; status: DemandStatus; sort_order: number }[]) => void;
  isClientPortal?: boolean;
  showSearch?: boolean;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  search?: string;
  onSearchChange?: (value: string) => void;
}) {
  const listProfilesFn = useServerFn(listProfiles);
  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles"],
    queryFn: () => listProfilesFn(),
  });

  const profilesMap = useMemo(() => {
    const map = new Map<string, { id: string; name: string; avatar_url?: string | null }>();
    profiles.forEach((p: any) => map.set(p.id, p));
    return map;
  }, [profiles]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
  );
  const [internalSearch, setInternalSearch] = useState("");
  const resolvedSearch = search !== undefined ? search : internalSearch;
  const handleSearchChange = onSearchChange ?? setInternalSearch;
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeColumnId, setActiveColumnId] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<"card" | "column" | null>(null);
  const [localDemands, setLocalDemands] = useState<KanbanDemand[]>(demands);
  const dragStatusRef = useRef<Record<string, string>>({});

  // Load columns order from localStorage, fallback to default KANBAN_STATUSES
  const [columns, setColumns] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("CF_KanbanColumns");
      return saved ? JSON.parse(saved) : [...KANBAN_STATUSES];
    }
    return [...KANBAN_STATUSES];
  });

  // Load custom status display names from localStorage
  const [customStatusNames, setCustomStatusNames] = useState<Record<string, string>>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("CF_CustomStatusNames");
      return saved ? JSON.parse(saved) : {};
    }
    return {};
  });

  const getStatusLabel = useCallback((status: string) => {
    return customStatusNames[status] ?? (STATUS_LABELS as Record<string, string>)[status] ?? status;
  }, [customStatusNames]);

  // Keep localDemands in sync with demands when NOT dragging
  useEffect(() => {
    if (!activeId) setLocalDemands(demands);
  }, [demands, activeId]);

  // During a drag, render from localDemands (reflects drag-over visual moves).
  // After drag ends (activeId === null), render from demands (the React Query cache).
  const displayDemands = activeId ? localDemands : demands;

  const filtered = useMemo(() => {
    if (!resolvedSearch.trim()) return displayDemands;
    const q = resolvedSearch.toLowerCase();
    return displayDemands.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        (d.clients?.name ?? "").toLowerCase().includes(q),
    );
  }, [displayDemands, resolvedSearch]);

  const byStatus = useMemo(() => {
    const map: Record<string, KanbanDemand[]> = {};
    for (const s of columns) map[s] = [];
    for (const d of filtered) {
      if (map[d.status]) {
        map[d.status].push(d);
      } else {
        if (map["nao_iniciado"]) {
          map["nao_iniciado"].push(d);
        }
      }
    }
    return map;
  }, [filtered, columns]);

  const activeDemand = useMemo(
    () => (activeId ? displayDemands.find((d) => d.id === activeId) ?? null : null),
    [activeId, displayDemands],
  );

  function handleDragStart(e: DragStartEvent) {
    const id = String(e.active.id);
    if (columns.includes(id)) {
      setActiveType("column");
      setActiveColumnId(id);
    } else {
      // Sync localDemands to the latest demands before starting the drag
      setLocalDemands(demands);
      setActiveType("card");
      setActiveId(id);
    }
  }

  function handleDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    if (activeId === overId) return;

    if (activeType === "column") {
      if (columns.includes(overId)) {
        setColumns((cols) => {
          const oldIdx = cols.indexOf(activeId);
          const newIdx = cols.indexOf(overId);
          if (oldIdx === -1 || newIdx === -1) return cols;
          const updated = arrayMove(cols, oldIdx, newIdx);
          if (typeof window !== "undefined") {
            localStorage.setItem("CF_KanbanColumns", JSON.stringify(updated));
          }
          return updated;
        });
      }
      return;
    }

    const activeDemand = localDemands.find((d) => d.id === activeId);
    if (!activeDemand) return;

    // Check if over a column (status) or a card
    const overIsColumn = columns.includes(overId);
    const overDemand = overIsColumn ? null : localDemands.find((d) => d.id === overId);
    const targetStatus: string = overIsColumn ? overId : (overDemand?.status ?? activeDemand.status);

    // Block moving to fazendo or para_analise in portal
    if (isClientPortal && (targetStatus === "fazendo" || targetStatus === "para_analise")) return;

    if (activeDemand.status === targetStatus) {
      // Same column reorder
      if (!overIsColumn && overDemand) {
        setLocalDemands((prev) => {
          const colItems = prev.filter((d) => d.status === targetStatus);
          const fromIdx = colItems.findIndex((d) => d.id === activeId);
          const toIdx = colItems.findIndex((d) => d.id === overId);
          if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return prev;
          const reordered = arrayMove(colItems, fromIdx, toIdx);
          const otherItems = prev.filter((d) => d.status !== targetStatus);
          return [...otherItems, ...reordered];
        });
      }
    } else {
      // Moving to a different column
      dragStatusRef.current[activeId] = targetStatus;
      setLocalDemands((prev) =>
        prev.map((d) =>
          d.id === activeId ? { ...d, status: targetStatus } : d,
        ),
      );
    }
  }

  async function handleDragEnd(e: DragEndEvent) {
    const dragActiveId = String(e.active.id);
    const dragOverId = e.over ? String(e.over.id) : null;

    setActiveColumnId(null);
    setActiveType(null);

    if (activeType === "column") {
      dragStatusRef.current = {};
      setActiveId(null);
      return;
    }

    if (!dragOverId) {
      dragStatusRef.current = {};
      setActiveId(null);
      setLocalDemands(demands);
      return;
    }

    const originalDemand = demands.find((d) => d.id === dragActiveId);
    if (!originalDemand) {
      dragStatusRef.current = {};
      setActiveId(null);
      return;
    }

    // Use the ref to get final status (set during handleDragOver, reliable even across renders)
    const refStatus = dragStatusRef.current[dragActiveId];
    const finalStatus: string = refStatus ?? originalDemand.status;
    dragStatusRef.current = {};

    if (isClientPortal && (finalStatus === "fazendo" || finalStatus === "para_analise")) {
      setActiveId(null);
      return;
    }

    const statusChanged = originalDemand.status !== finalStatus;

    if (statusChanged) {
      await onMove(dragActiveId, finalStatus as DemandStatus);

      if (onReorder) {
        const adjusted = demands.map((d) =>
          d.id === dragActiveId ? { ...d, status: finalStatus } : d
        );
        const allUpdates: { id: string; status: DemandStatus; sort_order: number }[] = [];
        for (const st of columns) {
          const colItems = adjusted.filter((d) => d.status === st);
          colItems.forEach((d, i) => {
            allUpdates.push({ id: d.id, status: st as any, sort_order: i });
          });
        }
        onReorder(allUpdates);
      }

      setActiveId(null);
    } else if (onReorder) {
      const colItems = demands
        .filter((d) => d.status === originalDemand.status)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      const fromIdx = colItems.findIndex((d) => d.id === dragActiveId);
      const overIdx = colItems.findIndex((d) => d.id === dragOverId);
      if (fromIdx === -1 || overIdx === -1) return;
      const reordered = arrayMove(colItems, fromIdx, overIdx);
      const allUpdates = reordered.map((d, i) => ({
        id: d.id,
        status: originalDemand.status as DemandStatus,
        sort_order: i,
      }));
      onReorder(allUpdates);
      setActiveId(null);
    }
  }

  function handleAutoSort(status: string) {
    setLocalDemands((prev) => {
      const colItems = [...prev.filter((d) => d.status === status)].sort((a, b) => {
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return a.due_date.localeCompare(b.due_date);
      });
      const others = prev.filter((d) => d.status !== status);
      const updated = [...others, ...colItems];

      if (onReorder) {
        const allUpdates: { id: string; status: DemandStatus; sort_order: number }[] = [];
        for (const st of columns) {
          const items = updated.filter((d) => d.status === st);
          items.forEach((d, i) => {
            allUpdates.push({ id: d.id, status: st as any, sort_order: i });
          });
        }
        onReorder(allUpdates);
      }
      return updated;
    });
  }

  function handleAddStatus() {
    const name = prompt("Digite o nome do novo status:");
    if (!name || !name.trim()) return;

    const cleanName = name.trim();
    // Normalize to create a safe ID prefixing custom_
    const newId = "custom_" + cleanName.toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "") + "_" + Date.now().toString().slice(-4);

    const updatedCols = [...columns, newId];
    const updatedNames = { ...customStatusNames, [newId]: cleanName };

    setColumns(updatedCols);
    setCustomStatusNames(updatedNames);

    if (typeof window !== "undefined") {
      localStorage.setItem("CF_KanbanColumns", JSON.stringify(updatedCols));
      localStorage.setItem("CF_CustomStatusNames", JSON.stringify(updatedNames));
    }
  }

  function handleDeleteStatus(statusId: string) {
    if (byStatus[statusId]?.length > 0) {
      alert("N├úo ├® poss├¡vel remover um status que possui demandas.");
      return;
    }
    if (!confirm(`Remover o status "${getStatusLabel(statusId)}"?`)) return;

    const updatedCols = columns.filter((id) => id !== statusId);
    const updatedNames = { ...customStatusNames };
    delete updatedNames[statusId];

    setColumns(updatedCols);
    setCustomStatusNames(updatedNames);

    if (typeof window !== "undefined") {
      localStorage.setItem("CF_KanbanColumns", JSON.stringify(updatedCols));
      localStorage.setItem("CF_CustomStatusNames", JSON.stringify(updatedNames));
    }
  }

  function handleRenameStatus(statusId: string, newName: string) {
    if (!newName || !newName.trim()) return;
    const cleanName = newName.trim();
    const updatedNames = { ...customStatusNames, [statusId]: cleanName };
    setCustomStatusNames(updatedNames);
    if (typeof window !== "undefined") {
      localStorage.setItem("CF_CustomStatusNames", JSON.stringify(updatedNames));
    }
  }

  // ÔöÇÔöÇ Drag board horizontally with right mouse button ÔöÇÔöÇ
  const internalScrollRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = scrollRef ?? internalScrollRef;
  const isDraggingBoard = useRef(false);
  const startX = useRef(0);
  const startScrollLeft = useRef(0);
  const hasMovedBoard = useRef(false);

  // ── Floating dummy scrollbar ──
  const dummyScrollRef = useRef<HTMLDivElement>(null);
  const kanbanRootRef = useRef<HTMLDivElement>(null);
  const isSyncingScroll = useRef(false);
  const dummyInnerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 2) return; // Only right click
    const container = scrollContainerRef.current;
    if (!container) return;

    isDraggingBoard.current = true;
    hasMovedBoard.current = false;
    startX.current = e.pageX - container.offsetLeft;
    startScrollLeft.current = container.scrollLeft;

    // Prevent text/elements selection while dragging
    document.body.style.userSelect = "none";
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingBoard.current) return;
      const container = scrollContainerRef.current;
      if (!container) return;

      const x = e.pageX - container.offsetLeft;
      const walk = (x - startX.current) * 1.5; // Drag speed modifier
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

  // ── Sync floating scrollbar with board scroll ──
  const updateDummy = useCallback(() => {
    const container = scrollContainerRef.current;
    const dummy = dummyScrollRef.current;
    const inner = dummyInnerRef.current;
    if (!container || !dummy || !inner) return;
    const rect = container.getBoundingClientRect();
    dummy.style.left = `${rect.left}px`;
    dummy.style.width = `${rect.width}px`;
    inner.style.width = `${container.scrollWidth}px`;
    dummy.style.display = "block";
  }, []);

  useEffect(() => {
    const container = scrollContainerRef.current;
    const dummy = dummyScrollRef.current;
    if (!container || !dummy) return;

    updateDummy();

    // Hide native scrollbar on wrapper div (keep scroll behavior)
    if (!document.getElementById("sh-scrollbar-style")) {
      const s = document.createElement("style");
      s.id = "sh-scrollbar-style";
      s.textContent = `.sh-hide-scrollbar::-webkit-scrollbar{display:none}.sh-hide-scrollbar{scrollbar-width:none}`;
      document.head.appendChild(s);
    }
    container.classList.add("sh-hide-scrollbar");

    const onBoardScroll = () => {
      if (isSyncingScroll.current) return;
      isSyncingScroll.current = true;
      dummy.scrollLeft = container.scrollLeft;
      isSyncingScroll.current = false;
    };

    container.addEventListener("scroll", onBoardScroll);
    const observer = new ResizeObserver(updateDummy);
    observer.observe(container);
    window.addEventListener("resize", updateDummy);

    return () => {
      container.removeEventListener("scroll", onBoardScroll);
      observer.disconnect();
      window.removeEventListener("resize", updateDummy);
    };
  }, []);

  // Re-check visibility when columns/content render
  useEffect(() => {
    updateDummy();
  });

  const handleDummyScroll = () => {
    const container = scrollContainerRef.current;
    const dummy = dummyScrollRef.current;
    if (!container || !dummy) return;
    if (isSyncingScroll.current) return;
    isSyncingScroll.current = true;
    container.scrollLeft = dummy.scrollLeft;
    isSyncingScroll.current = false;
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    if (hasMovedBoard.current) {
      e.preventDefault();
      hasMovedBoard.current = false;
    }
  };

  return (
    <div ref={kanbanRootRef} className="flex flex-col flex-1 gap-3 min-h-0">
      {showSearch && !onSearchChange && (
        <div className="w-full shrink-0">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar demandas..."
              value={resolvedSearch}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-sm rounded-lg border border-border bg-surface-2/40 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring transition-all"
            />
            {resolvedSearch && (
              <button
                onClick={() => handleSearchChange("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div
          ref={scrollContainerRef}
          onMouseDown={handleMouseDown}
          onContextMenu={handleContextMenu}
          className="flex gap-3 flex-1 min-h-0 -mx-2 px-2 select-none md:select-auto items-stretch align-stretch pr-8"
        >
          <SortableContext
            items={columns}
            strategy={horizontalListSortingStrategy}
            disabled={isClientPortal}
          >
            {columns.map((s) => {
              const colItems = byStatus[s] ?? [];
              return (
                <KanbanColumn
                  key={s}
                  status={s}
                  label={getStatusLabel(s)}
                  demands={colItems}
                  onOpen={onOpen}
                  onAdd={isClientPortal && (s === "fazendo" || s === "para_analise") ? undefined : onAdd}
                  onAutoSort={() => handleAutoSort(s)}
                  onDelete={s.startsWith("custom_") ? () => handleDeleteStatus(s) : undefined}
                  onRename={s.startsWith("custom_") ? (newName) => handleRenameStatus(s, newName) : undefined}
                  isClientPortal={isClientPortal}
                  profilesMap={profilesMap}
                />
              );
            })}
          </SortableContext>

          {/* Add Status Button */}
          {!isClientPortal && (
            <div className="min-w-[200px] w-[200px] flex-shrink-0 flex flex-col justify-start pt-1.5 pr-4">
              <button
                onClick={handleAddStatus}
                className="flex items-center justify-center gap-1.5 px-4 py-3.5 rounded-xl border border-dashed border-border/80 hover:border-foreground/35 text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-surface-2/40 transition-all cursor-pointer w-full text-center h-[42px] shrink-0"
              >
                <Plus className="h-4 w-4" />
                <span>Novo Status</span>
              </button>
            </div>
          )}
        </div>

        <DragOverlay>
          {activeDemand ? (
            <KanbanCardStatic demand={activeDemand} isDragging />
          ) : activeColumnId ? (
            <div className="opacity-80 rotate-1 scale-[1.02] shadow-2xl">
              <KanbanColumnStatic
                status={activeColumnId}
                label={getStatusLabel(activeColumnId)}
                count={byStatus[activeColumnId]?.length ?? 0}
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Floating dummy scrollbar — syncs with the kanban horizontal scroll */}
      <div
        ref={dummyScrollRef}
        onScroll={handleDummyScroll}
        className="fixed bottom-0 z-50 h-6 overflow-x-auto overflow-y-hidden bg-background/80 border-t border-border/50"
        style={{ pointerEvents: "auto" }}
      >
        <div ref={dummyInnerRef} className="h-[1px]" />
      </div>
    </div>
  );
}

function KanbanColumn({
  status,
  label,
  demands,
  onOpen,
  onAdd,
  onAutoSort,
  onDelete,
  onRename,
  isClientPortal,
  profilesMap,
}: {
  status: string;
  label: string;
  demands: KanbanDemand[];
  onOpen: (id: string) => void;
  onAdd?: (status: any) => void;
  onAutoSort: () => void;
  onDelete?: () => void;
  onRename?: (newName: string) => void;
  isClientPortal: boolean;
  profilesMap: Map<string, { id: string; name: string; avatar_url?: string | null }>;
}) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(label);

  // Sync label prop to local editedName state when it updates externally
  useEffect(() => {
    setEditedName(label);
  }, [label]);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({
    id: status,
    disabled: isClientPortal,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const theme = getStatusTheme(status, label);
  const ids = useMemo(() => demands.map((d) => d.id), [demands]);

  const isBlockedColumn = isClientPortal && (status === "fazendo" || status === "para_analise");

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "min-w-[272px] w-[272px] flex-shrink-0 flex flex-col transition-all duration-150 h-full",
        isDragging && "opacity-0",
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3 px-1 group/column w-full font-sans select-none">
        <div className="flex items-center gap-2 truncate flex-1 min-w-0">
          {!isClientPortal && (
            <div
              {...attributes}
              {...listeners}
              className="cursor-grab active:cursor-grabbing text-muted-foreground/30 hover:text-muted-foreground transition-colors p-0.5 rounded touch-none shrink-0"
              title="Reorganizar coluna"
            >
              <GripVertical className="h-3.5 w-3.5" />
            </div>
          )}

          {isEditingName ? (
            <input
              type="text"
              value={editedName}
              onChange={(e) => setEditedName(e.target.value)}
              onBlur={() => {
                setIsEditingName(false);
                if (editedName.trim() && editedName.trim() !== label) {
                  onRename?.(editedName);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setIsEditingName(false);
                  if (editedName.trim() && editedName.trim() !== label) {
                    onRename?.(editedName);
                  }
                } else if (e.key === "Escape") {
                  setIsEditingName(false);
                  setEditedName(label);
                }
              }}
              className="text-xs font-semibold bg-background border border-input rounded px-1.5 py-0.5 w-full focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring text-foreground shrink min-w-[100px]"
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <div
              onClick={() => {
                if (onRename) {
                  setEditedName(label);
                  setIsEditingName(true);
                }
              }}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold shrink-0 cursor-default",
                theme.pill,
                onRename && "cursor-pointer hover:opacity-85"
              )}
              title={onRename ? "Clique para renomear" : undefined}
            >
              <span className={cn("h-2 w-2 rounded-full shrink-0", theme.dot)} />
              <span className="truncate">{label}</span>
              <span className="ml-1 opacity-75 font-medium">{demands.length}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover/column:opacity-100 transition-opacity shrink-0 ml-1">
          {onAdd && (
            <button
              onClick={() => onAdd(status)}
              title="Nova demanda"
              className="text-muted-foreground hover:text-foreground transition-colors rounded p-0.5 hover:bg-zinc-800 light:hover:bg-zinc-200 shrink-0"
            >
              <Plus className="h-3 w-3" />
            </button>
          )}
          <button
            onClick={onAutoSort}
            title="Ordenar por data"
            className="text-muted-foreground hover:text-foreground transition-colors rounded p-0.5 hover:bg-zinc-800 light:hover:bg-zinc-200 shrink-0"
          >
            <ArrowUpDown className="h-3 w-3" />
          </button>
          {onDelete && (
            <button
              onClick={onDelete}
              title="Excluir status"
              className="text-muted-foreground hover:text-red-500 transition-colors rounded p-0.5 hover:bg-red-500/10 light:hover:bg-red-500/5 shrink-0"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Drop zone */}
      <div
        className={cn(
          "flex-1 rounded-xl p-2.5 space-y-2 min-h-[150px] transition-all duration-150",
          theme.columnBg,
          isOver && !isBlockedColumn && "opacity-90 ring-1 ring-primary/20",
        )}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {demands.map((d) => (
            <KanbanCard
              key={d.id}
              demand={d}
              onOpen={onOpen}
              isClientPortal={isClientPortal}
              profilesMap={profilesMap}
            />
          ))}
        </SortableContext>

        {onAdd && !isBlockedColumn && (
          <button
            onClick={() => onAdd(status)}
            className={cn(
              "flex items-center justify-start gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold w-full transition-all cursor-pointer border mt-2 shadow-xs",
              theme.btnText,
              theme.btnBorder
            )}
          >
            <Plus className="h-3.5 w-3.5 shrink-0" />
            <span>Demanda</span>
          </button>
        )}
      </div>
    </div>
  );
}

function KanbanCard({
  demand,
  onOpen,
  isClientPortal,
  profilesMap,
}: {
  demand: KanbanDemand;
  onOpen: (id: string) => void;
  isClientPortal?: boolean;
  profilesMap: Map<string, { id: string; name: string; avatar_url?: string | null }>;
}) {
  const isDragDisabled = isClientPortal && (demand.status === "fazendo" || demand.status === "para_analise");

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: demand.id,
    disabled: isDragDisabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const theme = getStatusTheme(demand.status, (STATUS_LABELS as any)[demand.status] || demand.status);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-lg border p-3.5 cursor-pointer group select-none relative transition-all duration-100 shadow-sm",
        theme.cardBg,
        theme.cardBorder,
        isDragging && "opacity-0",
      )}
      onClick={() => onOpen(demand.id)}
      {...attributes}
      {...listeners}
    >
      <KanbanCardContent
        demand={demand}
        profilesMap={profilesMap}
      />
    </div>
  );
}

function KanbanColumnStatic({
  status,
  label,
  count,
}: {
  status: string;
  label: string;
  count: number;
}) {
  const theme = getStatusTheme(status, label);

  return (
    <div className="min-w-[272px] w-[272px] flex-shrink-0 flex flex-col bg-[#1c1c1c]/90 border border-zinc-700/50 rounded-xl p-3 shadow-2xl select-none">
      <div className="flex items-center gap-2 mb-3 px-1">
        <div className={cn("flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium shrink-0", theme.pill)}>
          <span className={cn("h-1.5 w-1.5 rounded-full", theme.dot)} />
          <span>{label}</span>
        </div>
        <span className="text-xs text-zinc-500 font-medium ml-1">
          {count}
        </span>
      </div>
      <div className="flex-1 rounded-xl border border-dashed border-zinc-850 bg-zinc-900/10 min-h-[120px]" />
    </div>
  );
}

function KanbanCardStatic({
  demand,
  isDragging,
  profilesMap,
}: {
  demand: KanbanDemand;
  isDragging?: boolean;
  profilesMap?: Map<string, { id: string; name: string; avatar_url?: string | null }>;
}) {
  const theme = getStatusTheme(demand.status, (STATUS_LABELS as any)[demand.status] || demand.status);

  return (
    <div
      className={cn(
        "rounded-lg border p-3.5 select-none shadow-2xl rotate-1 scale-[1.02] opacity-95",
        theme.cardBg,
        theme.cardBorder,
      )}
    >
      <KanbanCardContent demand={demand} profilesMap={profilesMap} />
    </div>
  );
}

function KanbanCardContent({
  demand,
  profilesMap,
}: {
  demand: KanbanDemand;
  profilesMap?: Map<string, { id: string; name: string; avatar_url?: string | null }>;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = demand.due_date && demand.due_date < today;

  // Resolve assignee from profilesMap
  const assignee = demand.assignee_user_id && profilesMap
    ? profilesMap.get(demand.assignee_user_id)
    : null;

  return (
    <div className="flex flex-col gap-2.5">
      {/* Title */}
      <div className="flex items-start gap-1.5 w-full">
        <p className="text-sm font-semibold text-foreground leading-tight line-clamp-2 flex-1 tracking-tight">
          {demand.title}
        </p>
      </div>

      {/* Client Name */}
      {demand.clients && (
        <p className="text-[11px] text-zinc-400 font-medium truncate -mt-1.5 ml-0">
          {demand.clients.name}
        </p>
      )}

      {/* Assignee Profile */}
      {assignee && (
        <div className="flex items-center gap-1.5 ml-0">
          {assignee.avatar_url ? (
            <img
              src={assignee.avatar_url}
              alt={assignee.name}
              className="h-4.5 w-4.5 rounded-full object-cover border border-zinc-800"
            />
          ) : (
            <div className="h-4.5 w-4.5 rounded-full bg-zinc-850 border border-zinc-700 flex items-center justify-center text-[9px] font-bold text-zinc-400 shrink-0">
              {assignee.name ? assignee.name.slice(0, 2).toUpperCase() : "?"}
            </div>
          )}
          <span className="text-[10px] text-zinc-400 font-medium truncate max-w-[125px]">
            {assignee.name}
          </span>
        </div>
      )}

      {/* Footer (Priority, Due Date, Comments) */}
      <div className="flex items-center justify-between gap-2 ml-0 mt-0.5 pt-1.5 border-t border-zinc-800/10">
        <span className={cn(
          "text-[9px] font-bold px-1.5 py-0.5 rounded-md tracking-wider uppercase",
          PRIORITY_CHIP[demand.priority]
        )}>
          {PRIORITY_LABELS[demand.priority]}
        </span>

        <div className="flex items-center gap-2.5 text-zinc-500 text-[10px] font-medium shrink-0">
          {/* Comments count */}
          {typeof demand.comments_count === "number" && demand.comments_count > 0 && (
            <span className="flex items-center gap-1 hover:text-zinc-300 transition-colors">
              <MessageSquare className="h-3 w-3" />
              <span>{demand.comments_count}</span>
            </span>
          )}

          {/* Due date */}
          {demand.due_date && (
            <span className={cn(
              "flex items-center gap-1",
              isOverdue ? "text-red-500 font-semibold" : "text-zinc-500"
            )}>
              <Calendar className="h-3 w-3" />
              {(() => {
                const pureDate = demand.due_date.includes("T") ? demand.due_date.split("T")[0] : demand.due_date;
                const parts = pureDate.split("-");
                if (parts.length === 3) {
                  return `${parts[2]}/${parts[1]}`; // clean DD/MM format
                }
                return pureDate;
              })()}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
