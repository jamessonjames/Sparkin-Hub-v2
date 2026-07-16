import { useMemo, useState, useCallback, useRef, useEffect } from "react";
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
import { Plus, Calendar, ArrowUpDown, Search, X, GripVertical, Trash2 } from "lucide-react";

export type KanbanDemand = {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  clients?: { id: string; name: string } | null;
  sort_order?: number | null;
};

const STATUS_STYLES: Record<string, { dot: string; text: string; badge: string; drop: string }> = {
  nao_iniciado: { dot: "bg-zinc-400 dark:bg-zinc-500",   text: "text-zinc-600 dark:text-zinc-300",     badge: "bg-zinc-200/60 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200",                         drop: "border-zinc-400 bg-zinc-450/5" },
  fazendo:      { dot: "bg-blue-500",                     text: "text-blue-600 dark:text-blue-300",      badge: "bg-blue-100/70 dark:bg-blue-950/40 text-blue-700 dark:text-blue-200",                     drop: "border-blue-400 bg-blue-500/5" },
  para_analise: { dot: "bg-purple-500",                   text: "text-purple-600 dark:text-purple-300",  badge: "bg-purple-100/70 dark:bg-purple-950/40 text-purple-700 dark:text-purple-200",             drop: "border-purple-400 bg-purple-500/5" },
  com_ajustes:  { dot: "bg-amber-500",                    text: "text-amber-600 dark:text-amber-300",    badge: "bg-amber-100/70 dark:bg-amber-950/40 text-amber-700 dark:text-amber-200",                 drop: "border-amber-400 bg-amber-500/5" },
  concluido:    { dot: "bg-emerald-500",                  text: "text-emerald-600 dark:text-emerald-300",badge: "bg-emerald-100/70 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-200",          drop: "border-emerald-400 bg-emerald-500/5" },
};

const PRIORITY_CHIP: Record<string, string> = {
  low:    "bg-zinc-500 dark:bg-zinc-700 text-white font-semibold",
  medium: "bg-blue-500 dark:bg-blue-600 text-white font-semibold",
  high:   "bg-amber-500 dark:bg-amber-600 text-white font-semibold",
  urgent: "bg-red-500 dark:bg-red-650 text-white font-semibold",
};

export function KanbanBoard({
  demands,
  onMove,
  onOpen,
  onAdd,
  onReorder,
  isClientPortal = false,
  showSearch = true,
}: {
  demands: KanbanDemand[];
  onMove: (id: string, status: DemandStatus) => void;
  onOpen: (id: string) => void;
  onAdd?: (status: DemandStatus) => void;
  onReorder?: (updates: { id: string; status: DemandStatus; sort_order: number }[]) => void;
  isClientPortal?: boolean;
  showSearch?: boolean;
}) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
  );
  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeColumnId, setActiveColumnId] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<"card" | "column" | null>(null);
  const [localDemands, setLocalDemands] = useState<KanbanDemand[]>(demands);

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
    return customStatusNames[status] ?? STATUS_LABELS[status] ?? status;
  }, [customStatusNames]);

  // Sync external changes into local state
  useMemo(() => { setLocalDemands(demands); }, [demands]);

  const filtered = useMemo(() => {
    if (!search.trim()) return localDemands;
    const q = search.toLowerCase();
    return localDemands.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        (d.clients?.name ?? "").toLowerCase().includes(q),
    );
  }, [localDemands, search]);

  const byStatus = useMemo(() => {
    const map: Record<string, KanbanDemand[]> = {};
    for (const s of columns) map[s] = [];
    for (const d of filtered) {
      if (map[d.status]) {
        map[d.status].push(d);
      } else {
        // Fallback to nao_iniciado if column was removed
        if (map["nao_iniciado"]) {
          map["nao_iniciado"].push(d);
        }
      }
    }
    return map;
  }, [filtered, columns]);

  const activeDemand = useMemo(
    () => (activeId ? localDemands.find((d) => d.id === activeId) ?? null : null),
    [activeId, localDemands],
  );

  function handleDragStart(e: DragStartEvent) {
    const id = String(e.active.id);
    if (columns.includes(id)) {
      setActiveType("column");
      setActiveColumnId(id);
    } else {
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
      setLocalDemands((prev) =>
        prev.map((d) =>
          d.id === activeId ? { ...d, status: targetStatus } : d,
        ),
      );
    }
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    setActiveColumnId(null);
    setActiveType(null);

    if (activeType === "column") {
      return;
    }

    const { active, over } = e;
    if (!over) {
      setLocalDemands(demands);
      return;
    }

    const activeId = String(active.id);
    const overId = String(over.id);
    const overIsColumn = columns.includes(overId);

    // The local state already has the right position from handleDragOver
    // Now we figure out the final status
    const activeDemand = localDemands.find((d) => d.id === activeId);
    if (!activeDemand) return;

    const overDemand = overIsColumn ? null : localDemands.find((d) => d.id === overId);
    const finalStatus: string = overIsColumn ? overId : (overDemand?.status ?? activeDemand.status);

    if (isClientPortal && (finalStatus === "fazendo" || finalStatus === "para_analise")) {
      // Revert
      setLocalDemands(demands);
      return;
    }

    // Status change (cross-column) - call onMove
    const originalDemand = demands.find((d) => d.id === activeId);
    if (originalDemand && originalDemand.status !== activeDemand.status) {
      onMove(activeId, activeDemand.status as any);
    }

    // Persist sort order for the full board
    if (onReorder) {
      const allUpdates: { id: string; status: DemandStatus; sort_order: number }[] = [];
      for (const st of columns) {
        const colItems = localDemands.filter((d) => d.status === st);
        colItems.forEach((d, i) => {
          allUpdates.push({ id: d.id, status: st as any, sort_order: i });
        });
      }
      onReorder(allUpdates);
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
      alert("Não é possível remover um status que possui demandas.");
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

  // ── Drag board horizontally with right mouse button ──
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isDraggingBoard = useRef(false);
  const startX = useRef(0);
  const startScrollLeft = useRef(0);
  const hasMovedBoard = useRef(false);

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

  const handleContextMenu = (e: React.MouseEvent) => {
    if (hasMovedBoard.current) {
      e.preventDefault();
      hasMovedBoard.current = false;
    }
  };

  return (
    <div className="flex flex-col flex-1 gap-3 min-h-0">
      {showSearch && (
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar demandas..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-8 py-2 text-sm rounded-lg border border-border bg-surface-2/40 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring transition-all"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
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
          className="flex gap-3 overflow-x-auto flex-1 min-h-0 -mx-2 px-2 select-none md:select-auto items-stretch align-stretch pr-8"
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

  const st = STATUS_STYLES[status] ?? {
    dot: "bg-zinc-400 dark:bg-zinc-500",
    text: "text-zinc-650 dark:text-zinc-300",
    badge: "bg-zinc-200/60 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200",
    drop: "border-zinc-400 bg-zinc-450/5",
  };
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
      <div className="flex items-center gap-2 mb-2 px-1 group/column">
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
        <span className={cn("h-2 w-2 rounded-full shrink-0", st.dot)} />
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
          <span
            onClick={() => {
              if (onRename) {
                setEditedName(label);
                setIsEditingName(true);
              }
            }}
            className={cn(
              "text-sm font-semibold flex-1 truncate select-text",
              st.text,
              onRename && "cursor-pointer hover:underline hover:text-foreground decoration-dashed underline-offset-4"
            )}
            title={onRename ? "Clique para renomear" : undefined}
          >
            {label}
          </span>
        )}
        <span className={cn("text-[11px] font-semibold px-1.5 py-0.5 rounded-full min-w-[20px] text-center shrink-0", st.badge)}>
          {demands.length}
        </span>
        <button
          onClick={onAutoSort}
          title="Ordenar por data"
          className="text-muted-foreground hover:text-foreground transition-colors rounded p-0.5 hover:bg-surface-2 shrink-0"
        >
          <ArrowUpDown className="h-3.5 w-3.5" />
        </button>
        {onDelete && (
          <button
            onClick={onDelete}
            title="Excluir status"
            className="text-muted-foreground hover:text-red-500 transition-colors rounded p-0.5 hover:bg-red-500/10 shrink-0"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Drop zone */}
      <div
        className={cn(
          "flex-1 rounded-xl border p-1.5 space-y-1.5 min-h-[80px] transition-all duration-150",
          "border-border bg-surface-2/30",
          isOver && !isBlockedColumn && st.drop,
        )}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {demands.map((d) => (
            <KanbanCard key={d.id} demand={d} onOpen={onOpen} isClientPortal={isClientPortal} />
          ))}
        </SortableContext>

        {onAdd && !isBlockedColumn && (
          <button
            onClick={() => onAdd(status)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-dashed text-left w-full transition-all cursor-pointer bg-transparent",
              "border-border hover:border-foreground/30 text-muted-foreground hover:text-foreground hover:bg-surface-2/50",
            )}
          >
            <Plus className="h-3.5 w-3.5" />
            <span>demanda</span>
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
}: {
  demand: KanbanDemand;
  onOpen: (id: string) => void;
  isClientPortal?: boolean;
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-lg border bg-card p-3 cursor-pointer group select-none relative",
        "border-border hover:border-foreground/20 hover:bg-surface-2/65",
        "transition-all duration-100",
        isDragging && "opacity-0",
      )}
      onClick={() => onOpen(demand.id)}
    >
      <KanbanCardContent
        demand={demand}
        dragHandleProps={isDragDisabled ? undefined : { ...attributes, ...listeners }}
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
  const st = STATUS_STYLES[status] ?? {
    dot: "bg-zinc-400 dark:bg-zinc-500",
    text: "text-zinc-600 dark:text-zinc-300",
    badge: "bg-zinc-200/60 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200",
  };

  return (
    <div className="min-w-[272px] w-[272px] flex-shrink-0 flex flex-col bg-card border border-border rounded-xl p-3.5 shadow-xl select-none">
      <div className="flex items-center gap-2 mb-2 px-1">
        <span className={cn("h-2 w-2 rounded-full shrink-0", st.dot)} />
        <span className={cn("text-sm font-semibold flex-1 truncate", st.text)}>
          {label}
        </span>
        <span className={cn("text-[11px] font-semibold px-1.5 py-0.5 rounded-full min-w-[20px] text-center shrink-0", st.badge)}>
          {count}
        </span>
      </div>
      <div className="flex-1 rounded-xl border border-dashed border-border bg-surface-2/15 min-h-[120px] transition-all duration-150" />
    </div>
  );
}

function KanbanCardStatic({ demand, isDragging }: { demand: KanbanDemand; isDragging?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-3 select-none",
        "border-border",
        isDragging && "shadow-2xl rotate-1 scale-[1.02] opacity-95",
      )}
    >
      <KanbanCardContent demand={demand} />
    </div>
  );
}

function KanbanCardContent({
  demand,
  dragHandleProps,
}: {
  demand: KanbanDemand;
  dragHandleProps?: Record<string, unknown>;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = demand.due_date && demand.due_date < today;

  return (
    <>
      {dragHandleProps ? (
        <div
          {...dragHandleProps}
          className="flex items-start gap-1.5 mb-2 cursor-grab active:cursor-grabbing select-none touch-none"
        >
          <GripVertical className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground/45 hover:text-muted-foreground transition-colors animate-pulse" />
          <p className="text-sm font-medium text-foreground leading-snug line-clamp-2 flex-1 transition-colors">
            {demand.title}
          </p>
        </div>
      ) : (
        <div className="flex items-start gap-1.5 mb-2">
          <p className="text-sm font-medium text-foreground leading-snug line-clamp-2 flex-1 transition-colors">
            {demand.title}
          </p>
        </div>
      )}

      {demand.clients && (
        <p className="text-[11px] text-muted-foreground truncate mb-2 ml-5">{demand.clients.name}</p>
      )}

      <div className="flex items-center justify-between gap-2 ml-5">
        <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", PRIORITY_CHIP[demand.priority])}>
          {PRIORITY_LABELS[demand.priority]}
        </span>

        {demand.due_date && (
          <span
             className={cn(
              "flex items-center gap-1 text-[10px] font-medium",
              isOverdue ? "text-red-500" : "text-muted-foreground",
            )}
          >
            <Calendar className="h-3 w-3" />
            {demand.due_date}
          </span>
        )}
      </div>
    </>
  );
}