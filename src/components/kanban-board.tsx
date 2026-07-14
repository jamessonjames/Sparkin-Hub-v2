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
import { STATUS_LABELS, PRIORITY_LABELS, PRIORITY_COLORS } from "@/lib/demand-labels";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type KanbanDemand = {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  clients: { id: string; name: string } | null;
};

export function KanbanBoard({
  demands,
  onMove,
  onOpen,
}: {
  demands: KanbanDemand[];
  onMove: (id: string, status: DemandStatus) => void;
  onOpen: (id: string) => void;
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
      <div className="flex gap-3 overflow-x-auto pb-4">
        {KANBAN_STATUSES.map((s) => (
          <Column key={s} status={s} demands={byStatus[s] ?? []} onOpen={onOpen} />
        ))}
      </div>
    </DndContext>
  );
}

function Column({
  status,
  demands,
  onOpen,
}: {
  status: DemandStatus;
  demands: KanbanDemand[];
  onOpen: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div className="min-w-[280px] w-[280px] flex-shrink-0">
      <div className="flex items-center justify-between mb-2 px-1">
        <h3 className="text-sm font-semibold text-foreground">{STATUS_LABELS[status]}</h3>
        <span className="text-xs text-muted-foreground">{demands.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "rounded-lg border border-border bg-card/40 p-2 min-h-[calc(100vh-220px)] space-y-2 transition-colors",
          isOver && "border-primary/60 bg-primary/5",
        )}
      >
        {demands.map((d) => (
          <Card key={d.id} demand={d} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}

function Card({ demand, onOpen }: { demand: KanbanDemand; onOpen: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: demand.id,
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(demand.id)}
      className={cn(
        "rounded-md border border-border bg-background p-3 cursor-grab active:cursor-grabbing",
        "hover:border-primary/50 transition-colors",
        isDragging && "opacity-50",
      )}
    >
      <div className="text-sm font-medium text-foreground line-clamp-2">{demand.title}</div>
      {demand.clients && (
        <div className="mt-1 text-xs text-muted-foreground truncate">{demand.clients.name}</div>
      )}
      <div className="mt-2 flex items-center justify-between gap-2">
        <Badge className={cn("text-[10px]", PRIORITY_COLORS[demand.priority])} variant="secondary">
          {PRIORITY_LABELS[demand.priority]}
        </Badge>
        {demand.due_date && (
          <span className="text-[10px] text-muted-foreground">{demand.due_date}</span>
        )}
      </div>
    </div>
  );
}