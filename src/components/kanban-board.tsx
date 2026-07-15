import { useMemo } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import { KANBAN_STATUSES, type DemandStatus } from "@/lib/demands.functions";
import { STATUS_LABELS, PRIORITY_LABELS } from "@/lib/demand-labels";
import { cn } from "@/lib/utils";
import { Plus, Calendar } from "lucide-react";

export type KanbanDemand = {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  clients: { id: string; name: string } | null;
};

const STATUS_STYLES: Record<string, { dot: string; text: string; badge: string; drop: string }> = {
  nao_iniciado: { dot: "bg-zinc-400", text: "text-zinc-300", badge: "bg-zinc-700/80 text-zinc-200", drop: "border-zinc-600/50 bg-primary/5" },
  fazendo:      { dot: "bg-blue-400",    text: "text-blue-300",    badge: "bg-blue-900/70 text-blue-200",    drop: "border-blue-500/50 bg-blue-950/20" },
  para_analise: { dot: "bg-purple-400",  text: "text-purple-300",  badge: "bg-purple-900/70 text-purple-200",drop: "border-purple-500/50 bg-purple-950/20" },
  com_ajustes:  { dot: "bg-amber-400",   text: "text-amber-300",   badge: "bg-amber-900/70 text-amber-200",  drop: "border-amber-500/50 bg-amber-950/20" },
  concluido:    { dot: "bg-emerald-400", text: "text-emerald-300", badge: "bg-emerald-900/70 text-emerald-200", drop: "border-emerald-500/50 bg-emerald-950/20" },
};

const PRIORITY_CHIP: Record<string, string> = {
  low:    "bg-zinc-700/80 text-zinc-300",
  medium: "bg-blue-900/70 text-blue-300",
  high:   "bg-amber-900/70 text-amber-300",
  urgent: "bg-red-900/70 text-red-300",
};

export function KanbanBoard({
  demands,
  onMove,
  onOpen,
  onAdd,
}: {
  demands: KanbanDemand[];
  onMove: (id: string, status: DemandStatus) => void;
  onOpen: (id: string) => void;
  onAdd?: (status: DemandStatus) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const byStatus = useMemo(() => {
    const map: Record<string, KanbanDemand[]> = {};
    for (const s of KANBAN_STATUSES) map[s] = [];
    for (const d of demands) {
      if (map[d.status]) map[d.status].push(d);
    }
    return map;
  }, [demands]);

  function handleDragEnd(e: DragEndEvent) {
    if (!e.over) return;
    const to = e.over.id as DemandStatus;
    const id = String(e.active.id);
    const d = demands.find((x) => x.id === id);
    if (d && d.status !== to) onMove(id, to);
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-4 -mx-2 px-2">
        {KANBAN_STATUSES.map((s) => (
          <KanbanColumn key={s} status={s} demands={byStatus[s] ?? []} onOpen={onOpen} onAdd={onAdd} />
        ))}
      </div>
    </DndContext>
  );
}

function KanbanColumn({
  status,
  demands,
  onOpen,
  onAdd,
}: {
  status: DemandStatus;
  demands: KanbanDemand[];
  onOpen: (id: string) => void;
  onAdd?: (status: DemandStatus) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const st = STATUS_STYLES[status] ?? STATUS_STYLES.nao_iniciado;

  return (
    <div className="min-w-[272px] w-[272px] flex-shrink-0 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2 px-1">
        <span className={cn("h-2 w-2 rounded-full shrink-0", st.dot)} />
        <span className={cn("text-sm font-semibold flex-1 truncate", st.text)}>
          {STATUS_LABELS[status]}
        </span>
        <span className={cn("text-[11px] font-semibold px-1.5 py-0.5 rounded-full min-w-[20px] text-center", st.badge)}>
          {demands.length}
        </span>
        {onAdd && (
          <button
            onClick={() => onAdd(status)}
            className="text-zinc-600 hover:text-zinc-200 transition-colors rounded p-0.5 hover:bg-zinc-800"
            aria-label={`Adicionar em ${STATUS_LABELS[status]}`}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 rounded-xl border p-1.5 space-y-1.5 min-h-[80px] transition-all duration-150",
          "border-border/20 bg-zinc-900/40",
          isOver && st.drop,
        )}
      >
        {demands.map((d) => (
          <KanbanCard key={d.id} demand={d} onOpen={onOpen} />
        ))}

        {demands.length === 0 && !isOver && (
          <div className="flex items-center justify-center h-16 text-xs text-zinc-700 select-none">
            Sem itens
          </div>
        )}
      </div>

      {/* Add at bottom */}
      {onAdd && (
        <button
          onClick={() => onAdd(status)}
          className="mt-1.5 flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs text-zinc-600 hover:text-zinc-200 hover:bg-zinc-800/50 transition-all w-full"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Adicionar demanda</span>
        </button>
      )}
    </div>
  );
}

function KanbanCard({ demand, onOpen }: { demand: KanbanDemand; onOpen: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: demand.id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;

  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = demand.due_date && demand.due_date < today;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(demand.id)}
      className={cn(
        "rounded-lg border bg-zinc-900 p-3 cursor-pointer group select-none",
        "border-zinc-800 hover:border-zinc-600 hover:bg-zinc-800/80",
        "transition-all duration-100",
        isDragging && "opacity-40 scale-[0.97] shadow-2xl rotate-1",
      )}
    >
      <p className="text-sm font-medium text-zinc-100 leading-snug line-clamp-2 mb-2.5 group-hover:text-white transition-colors">
        {demand.title}
      </p>

      {demand.clients && (
        <p className="text-[11px] text-zinc-500 truncate mb-2">{demand.clients.name}</p>
      )}

      <div className="flex items-center justify-between gap-2">
        <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", PRIORITY_CHIP[demand.priority])}>
          {PRIORITY_LABELS[demand.priority]}
        </span>

        {demand.due_date && (
          <span className={cn(
            "flex items-center gap-1 text-[10px] font-medium",
            isOverdue ? "text-red-400" : "text-zinc-500"
          )}>
            <Calendar className="h-3 w-3" />
            {demand.due_date}
          </span>
        )}
      </div>
    </div>
  );
}