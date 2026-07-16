import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState, useRef, useEffect } from "react";
import { listDemands, batchUpdateDueDates, updateDemand } from "@/lib/demands.functions";
import { useDemandOverlay } from "@/contexts/demand-overlay";
import { ChevronLeft, ChevronRight, Settings, Clock, Calendar as CalendarIcon, Save, Pencil, Trash2 } from "lucide-react";
import { STATUS_LABELS } from "@/lib/demand-labels";
import { cn } from "@/lib/utils";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  scheduleDemands,
  DEFAULT_CONFIG,
  type SchedulingConfig,
  formatTzString,
  getTzTime,
  isValidSlot,
  safeParseDate,
} from "@/utils/scheduler";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/agenda")({
  head: () => ({ meta: [{ title: "Agenda — Creative Flow Hub" }] }),
  component: AgendaPage,
});

const DAYS_SHORT = ["DOM.", "SEG.", "TER.", "QUA.", "QUI.", "SEX.", "SÁB."];
const WEEKDAY_NAMES = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

// Generate 48 half-hour slots per day
interface TimeSlot {
  h: number;
  m: number;
  label: string;
}

const SLOTS: TimeSlot[] = [];
for (let h = 0; h < 24; h++) {
  SLOTS.push({ h, m: 0, label: `${String(h).padStart(2, "0")}:00` });
  SLOTS.push({ h, m: 30, label: `${String(h).padStart(2, "0")}:30` });
}

const STATUS_BG: Record<string, string> = {
  nao_iniciado: "bg-zinc-800 border-zinc-700 text-zinc-100",
  fazendo:      "bg-blue-900/90 border-blue-700 text-blue-100",
  para_analise: "bg-purple-900/90 border-purple-700 text-purple-100",
  com_ajustes:  "bg-amber-900/90 border-amber-700 text-amber-100",
  concluido:    "bg-emerald-900/90 border-emerald-700 text-emerald-100",
  rascunho:     "bg-zinc-800 border-zinc-700 text-zinc-300",
};

const PRIORITY_COLOR: Record<string, string> = {
  low:    "border-zinc-500",
  medium: "border-blue-500",
  high:   "border-amber-500",
  urgent: "border-red-500",
};

function toISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function weekStart(d: Date) {
  const copy = new Date(d);
  copy.setDate(copy.getDate() - copy.getDay());
  copy.setHours(0, 0, 0, 0);
  return copy;
}

type ViewMode = "day" | "week" | "month";

function AgendaPage() {
  const listFn = useServerFn(listDemands);
  const batchUpdateFn = useServerFn(batchUpdateDueDates);
  const updateFn = useServerFn(updateDemand);
  const overlay = useDemandOverlay();
  const qc = useQueryClient();

  const { data: demands = [] } = useQuery({
    queryKey: ["demands"],
    queryFn: () => listFn(),
  });

  // Config State
  const [config, setConfig] = useState<SchedulingConfig>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("CreativeFlow_ScheduleConfig");
      if (saved) {
        try { return JSON.parse(saved); } catch (e) {}
      }
    }
    return DEFAULT_CONFIG;
  });

  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [showSettings, setShowSettings] = useState(false);
  const today = useMemo(() => getTzTime(config.timezone), [config.timezone]);
  const todayISO = toISO(today);

  // Selected date anchor
  const [currentDate, setCurrentDate] = useState(() => new Date(today));

  // Auto-schedule logic
  const scheduledMap = useMemo(() => {
    const forScheduler = demands.map((d) => ({
      id: d.id,
      title: d.title,
      priority: d.priority as "low" | "medium" | "high" | "urgent",
      status: d.status,
      due_date: d.due_date,
      estimated_hours: d.estimated_hours ? Number(d.estimated_hours) : 1.0,
      created_at: d.created_at,
    }));
    return scheduleDemands(forScheduler, config);
  }, [demands, config]);

  // Sync scheduled times to DB
  useEffect(() => {
    if (demands.length === 0) return;
    const updates: { id: string; due_date: string | null }[] = [];
    for (const d of demands) {
      if (d.status === "concluido") continue;
      const scheduled = scheduledMap[d.id];
      if (scheduled && scheduled !== d.due_date) {
        updates.push({ id: d.id, due_date: scheduled });
      }
    }
    if (updates.length > 0) {
      batchUpdateFn({ data: { updates } })
        .then(() => qc.invalidateQueries({ queryKey: ["demands"] }))
        .catch((e) => console.error("Auto-scheduling sync error:", e));
    }
  }, [scheduledMap, demands, batchUpdateFn, qc]);

  // Group demands by date/hour/minute slot for display
  const demandsBySlot = useMemo(() => {
    const map = new Map<string, typeof demands[number]>();
    for (const d of demands) {
      const finalDate = d.status === "concluido" ? d.due_date : (scheduledMap[d.id] ?? d.due_date);
      if (finalDate) {
        const dt = safeParseDate(finalDate);
        const hStr = String(dt.getHours()).padStart(2, "0");
        // round to nearest 30-min block
        const mStr = dt.getMinutes() >= 30 ? "30" : "00";
        const key = `${toISO(dt)}_${hStr}_${mStr}`;
        map.set(key, d);
      }
    }
    return map;
  }, [demands, scheduledMap]);

  // Group demands by date only (for monthly view)
  const demandsByDate = useMemo(() => {
    const map = new Map<string, typeof demands>();
    for (const d of demands) {
      const finalDate = d.status === "concluido" ? d.due_date : (scheduledMap[d.id] ?? d.due_date);
      if (finalDate) {
        const key = finalDate.slice(0, 10);
        const arr = map.get(key) ?? [];
        arr.push(d);
        map.set(key, arr);
      }
    }
    return map;
  }, [demands, scheduledMap]);

  // Calculate day columns for daily and weekly views
  const weekDays = useMemo(() => {
    if (viewMode === "day") {
      return [new Date(currentDate)];
    }
    const start = weekStart(currentDate);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [currentDate, viewMode]);

  // Calculate month cells for monthly view
  const monthCells = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const startDow = firstDay.getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();

    const cells: Array<{ date: Date | null; key: string }> = [];
    for (let i = 0; i < startDow; i++) {
      cells.push({ date: null, key: `pad-${i}` });
    }
    for (let d = 1; d <= totalDays; d++) {
      const date = new Date(year, month, d);
      cells.push({ date, key: date.toISOString() });
    }
    while (cells.length % 7 !== 0) {
      cells.push({ date: null, key: `tail-${cells.length}` });
    }
    return cells;
  }, [currentDate]);

  // Navigation handlers
  function handlePrev() {
    const next = new Date(currentDate);
    if (viewMode === "day") {
      next.setDate(next.getDate() - 1);
    } else if (viewMode === "week") {
      next.setDate(next.getDate() - 7);
    } else {
      next.setMonth(next.getMonth() - 1);
    }
    setCurrentDate(next);
  }

  // Handle demand resize inside calendar
  async function handleResizeDemand(demandId: string, hours: number) {
    const dObj = demands.find((d) => d.id === demandId);
    if (!dObj) return;

    qc.setQueryData<typeof demands>(["demands"], (prev) =>
      (prev ?? []).map((d) => (d.id === demandId ? { ...d, estimated_hours: hours } : d))
    );

    try {
      await updateFn({
        data: {
          id: demandId,
          client_id: dObj.client_id,
          title: dObj.title,
          description: dObj.description,
          status: dObj.status,
          priority: dObj.priority,
          due_date: dObj.due_date,
          estimated_hours: hours,
        },
      });
      qc.invalidateQueries({ queryKey: ["demands"] });
    } catch (e) {
      console.error(e);
      toast.error("Erro ao atualizar o tempo estimado.");
    }
  }

  function handleNext() {
    const next = new Date(currentDate);
    if (viewMode === "day") {
      next.setDate(next.getDate() + 1);
    } else if (viewMode === "week") {
      next.setDate(next.getDate() + 7);
    } else {
      next.setMonth(next.getMonth() + 1);
    }
    setCurrentDate(next);
  }

  function handleToday() {
    setCurrentDate(new Date(today));
  }

  const headerLabel = useMemo(() => {
    if (viewMode === "day") {
      return currentDate.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    }
    if (viewMode === "week") {
      const start = weekDays[0];
      const end = weekDays[6];
      if (start.getMonth() === end.getMonth()) {
        return start.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
      }
      return `${start.toLocaleDateString("pt-BR", { month: "short" })} – ${end.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}`;
    }
    return currentDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  }, [currentDate, viewMode, weekDays]);

  // Drag and Drop sensors
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  async function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over) return;

    const demandId = String(active.id);
    const targetSlotId = String(over.id); // e.g. "slot_2026-07-15_09_30"
    const parts = targetSlotId.split("_");
    if (parts.length < 4) return;

    const dateStr = parts[1];
    const hourVal = parseInt(parts[2], 10);
    const minVal = parseInt(parts[3], 10);
    const targetDate = new Date(`${dateStr}T${String(hourVal).padStart(2, "0")}:${String(minVal).padStart(2, "0")}:00`);
    const formatted = formatTzString(targetDate);

    qc.setQueryData<typeof demands>(["demands"], (prev) =>
      (prev ?? []).map((d) => (d.id === demandId ? { ...d, due_date: formatted } : d))
    );

    try {
      await batchUpdateFn({ data: { updates: [{ id: demandId, due_date: formatted }] } });
      toast.success("Demanda reagendada!");
    } catch (err) {
      toast.error("Erro ao reagendar");
    } finally {
      qc.invalidateQueries({ queryKey: ["demands"] });
    }
  }

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current && viewMode !== "month") {
      // scroll to config.startHour (each hour = 2 slots of 40px = 80px)
      const top = Math.max(0, (config.startHour - 1) * 80);
      scrollRef.current.scrollTop = top;
    }
  }, [config.startHour, viewMode]);

  const clientsForOverlay = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of demands) {
      if (d.clients) {
        map.set((d.clients as any).id, (d.clients as any).name);
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [demands]);

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex flex-col h-[calc(100vh-60px)] bg-[#121212] text-zinc-100 overflow-hidden relative">
        
        {/* ── TOOLBAR ── */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800/80 shrink-0 bg-zinc-900/50 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={handleToday}
            className="border-zinc-700 text-zinc-200 hover:bg-zinc-800"
          >
            Hoje
          </Button>

          <div className="flex items-center">
            <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-zinc-800" onClick={handlePrev}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-zinc-800" onClick={handleNext}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <h2 className="text-sm md:text-base font-bold text-zinc-100 capitalize">{headerLabel}</h2>

          {/* View Mode Selector */}
          <div className="ml-auto flex items-center bg-zinc-950/60 p-0.5 rounded-lg border border-zinc-800">
            {(["day", "week", "month"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={cn(
                  "px-3 py-1 text-xs font-semibold rounded-md transition-all capitalize",
                  viewMode === mode
                    ? "bg-zinc-800 text-white shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200"
                )}
              >
                {mode === "day" ? "Dia" : mode === "week" ? "Semana" : "Mês"}
              </button>
            ))}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSettings(!showSettings)}
            className={cn("border-zinc-700 text-zinc-300 gap-1.5 hover:bg-zinc-800", showSettings && "bg-zinc-800 text-white")}
          >
            <Settings className="h-3.5 w-3.5" />
            Expediente
          </Button>
        </div>

        {/* ── SETTINGS PANEL ── */}
        {showSettings && (
          <SettingsPanel
            config={config}
            onSave={(newCfg) => {
              setConfig(newCfg);
              localStorage.setItem("CreativeFlow_ScheduleConfig", JSON.stringify(newCfg));
              setShowSettings(false);
              toast.success("Expediente salvo!");
              qc.invalidateQueries({ queryKey: ["demands"] });
            }}
            onClose={() => setShowSettings(false)}
          />
        )}

        {/* ── VIEW RENDERING ── */}
        {viewMode === "month" ? (
          /* ── MONTH VIEW ── */
          <div className="flex-1 flex flex-col min-h-0 bg-zinc-950/20">
            <div className="grid grid-cols-7 border-b border-zinc-800/80 bg-zinc-900/30 text-center py-2 text-xs font-bold text-zinc-500">
              {DAYS_SHORT.map((day) => (
                <div key={day}>{day}</div>
              ))}
            </div>

            <div className="flex-1 grid grid-cols-7 grid-rows-5 md:grid-rows-6 border-b border-zinc-800/20">
              {monthCells.map(({ date, key }) => {
                if (!date) {
                  return <div key={key} className="border-r border-b border-zinc-850 bg-zinc-950/10" />;
                }
                const iso = toISO(date);
                const isToday = iso === todayISO;
                const cellDemands = demandsByDate.get(iso) ?? [];

                return (
                  <div
                    key={key}
                    onClick={() => overlay.openNew(clientsForOverlay, iso, "nao_iniciado")}
                    className={cn(
                      "border-r border-b border-zinc-850 p-1 flex flex-col justify-start gap-1 overflow-hidden cursor-pointer hover:bg-zinc-900/30 transition-colors",
                      isToday && "bg-primary/5"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className={cn(
                        "text-xs font-bold h-6 w-6 rounded-full flex items-center justify-center",
                        isToday ? "bg-primary text-primary-foreground font-black" : "text-zinc-500"
                      )}>
                        {date.getDate()}
                      </span>
                    </div>

                    <div className="space-y-1 overflow-y-auto max-h-[80px] scrollbar-thin">
                      {cellDemands.map((d) => (
                        <div
                          key={d.id}
                          title={`${d.title} (${STATUS_LABELS[d.status]})`}
                          onClick={(e) => {
                            e.stopPropagation();
                            overlay.open(d.id, clientsForOverlay);
                          }}
                          className={cn(
                            "text-[9px] px-1.5 py-0.5 rounded border truncate border-l-2 font-medium",
                            STATUS_BG[d.status] ?? "bg-zinc-800 border-zinc-700",
                            PRIORITY_COLOR[d.priority] ?? "border-zinc-500"
                          )}
                        >
                          {d.title}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* ── GRID FOR DAY / WEEK VIEW (30-Minute Slots) ── */
          <>
            {/* Headers */}
            <div className="flex border-b border-zinc-800/60 bg-zinc-900/30 shrink-0">
              <div className="w-[60px] shrink-0 border-r border-zinc-800/20" />
              {weekDays.map((day) => {
                const iso = toISO(day);
                const isToday = iso === todayISO;
                return (
                  <div key={iso} className="flex-1 text-center py-2 border-l border-zinc-800/20 min-w-[120px]">
                    <div className="text-[10px] font-bold text-zinc-500 tracking-wider">
                      {viewMode === "day" ? WEEKDAY_NAMES[day.getDay()] : DAYS_SHORT[day.getDay()]}
                    </div>
                    <div className={cn(
                      "mx-auto mt-1 h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold",
                      isToday ? "bg-primary text-primary-foreground font-black" : "text-zinc-300"
                    )}>
                      {day.getDate()}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Scrollable grid */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto">
              <div className="flex relative">
                
                {/* Hour labels (Only printed on the hour, every 2 slots) */}
                <div className="w-[60px] shrink-0 select-none bg-zinc-900/20 border-r border-zinc-800/20 z-10">
                  {SLOTS.map((slot, index) => (
                    <div key={index} className="h-10 relative flex items-start justify-end pr-2.5">
                      {slot.m === 0 && slot.h > 0 && (
                        <span className="text-[10px] text-zinc-600 font-semibold mt-[-6px]">
                          {slot.label}
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                {/* Day columns */}
                {weekDays.map((day) => {
                  const iso = toISO(day);
                  const isToday = iso === todayISO;
                  const currentHour = today.getHours();
                  const currentMinute = today.getMinutes();

                  return (
                    <div
                      key={iso}
                      className={cn(
                        "flex-1 border-l border-zinc-800/20 relative min-w-[120px]",
                        isToday && "bg-primary/5"
                      )}
                    >
                      {SLOTS.map((slot, index) => {
                        const hStr = String(slot.h).padStart(2, "0");
                        const mStr = String(slot.m).padStart(2, "0");
                        const slotKey = `${iso}_${hStr}_${mStr}`;
                        const demand = demandsBySlot.get(slotKey);
                        const isBusiness = isValidSlot(new Date(`${iso}T${hStr}:${mStr}:00`), config);

                        return (
                          <DroppableHourCell
                            key={index}
                            id={`slot_${iso}_${hStr}_${mStr}`}
                            isBusiness={isBusiness}
                          >
                            {demand && (
                              <DraggableDemandCard
                                demand={demand}
                                onResize={handleResizeDemand}
                                onClick={() => overlay.open(demand.id, clientsForOverlay)}
                              />
                            )}
                          </DroppableHourCell>
                        );
                      })}

                      {/* Time pointer */}
                      {isToday && (
                        <div
                          className="absolute left-0 right-0 z-20 pointer-events-none"
                          style={{ top: `${(currentHour * 60 + currentMinute) / 60 * 80}px` }}
                        >
                          <div className="relative flex items-center">
                            <div className="h-2 w-2 rounded-full bg-red-500 -ml-1 shrink-0" />
                            <div className="h-px flex-1 bg-red-500" />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* ── FOOTER ── */}
        <div className="shrink-0 px-4 py-1.5 border-t border-zinc-800/80 bg-zinc-900/60 flex items-center justify-between text-[10px] text-zinc-500">
          <span>Prioridade: Vermelho = Urgente • Laranja = Alta • Azul = Média • Cinza = Baixa</span>
          <span>Fuso Horário: {config.timezone}</span>
        </div>

      </div>
    </DndContext>
  );
}

function DroppableHourCell({
  id,
  isBusiness,
  children,
}: {
  id: string;
  isBusiness: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "h-10 border-t border-zinc-800/10 p-0.5 relative transition-colors duration-150",
        !isBusiness && "bg-zinc-950/40 opacity-70",
        isOver && (isBusiness ? "bg-primary/20 border-t-primary" : "bg-red-950/20 border-t-red-700")
      )}
    >
      {children}
    </div>
  );
}

function DraggableDemandCard({
  demand,
  onClick,
  onResize,
}: {
  demand: any;
  onClick: () => void;
  onResize: (demandId: string, hours: number) => Promise<void>;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: demand.id,
  });

  const [isResizing, setIsResizing] = useState(false);
  const [tempHours, setTempHours] = useState(demand.estimated_hours ? Number(demand.estimated_hours) : 1.0);

  const startResize = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsResizing(true);
    
    const startY = e.clientY;
    const startHours = demand.estimated_hours ? Number(demand.estimated_hours) : 1.0;
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - startY;
      // 1 slot = 40px = 0.5 hours. So 80px = 1 hour.
      const deltaHours = Math.round((deltaY / 80) * 2) / 2; // round to nearest 0.5
      const newHours = Math.max(0.5, startHours + deltaHours);
      setTempHours(newHours);
    };
    
    const handleMouseUp = async (upEvent: MouseEvent) => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      setIsResizing(false);
      
      const deltaY = upEvent.clientY - startY;
      const deltaHours = Math.round((deltaY / 80) * 2) / 2;
      const finalHours = Math.max(0.5, startHours + deltaHours);
      
      if (finalHours !== startHours) {
        await onResize(demand.id, finalHours);
      }
    };
    
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const transformStyle = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;

  // Calculate dynamic card height representing estimated time
  const displayHours = isResizing ? tempHours : (demand.estimated_hours ? Number(demand.estimated_hours) : 1.0);
  const slotsCount = displayHours / 0.5;
  const cardHeight = slotsCount * 40 - 4; // in pixels (each cell = 40px)

  const style = {
    ...transformStyle,
    height: `${cardHeight}px`,
    zIndex: isResizing || isDragging ? 50 : 20,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "absolute inset-x-0.5 top-0.5 rounded border-l-3 p-1.5 text-[10px] font-medium cursor-pointer shadow-md select-none",
        "transition-all flex flex-col justify-between overflow-hidden",
        STATUS_BG[demand.status] ?? "bg-zinc-800 border-zinc-700 text-zinc-100",
        PRIORITY_COLOR[demand.priority] ?? "border-zinc-500",
        isDragging && "opacity-40 scale-95 z-50 shadow-2xl rotate-1",
        demand.status === "concluido" && "line-through opacity-60"
      )}
    >
      <div
        {...attributes}
        {...listeners}
        onClick={(e) => {
          // Prevent clicking while drag resizing
          if (isResizing) return;
          e.stopPropagation();
          onClick();
        }}
        className="flex flex-col gap-0.5 h-full justify-between min-w-0 pb-1"
      >
        <div className="min-w-0">
          <div className="font-semibold truncate leading-tight">{demand.title}</div>
          <div className="text-[9px] opacity-75 mt-0.5 truncate max-w-full">
            {demand.clients?.name ?? "Geral"}
          </div>
        </div>

        <div className="flex items-center justify-between text-[8px] opacity-60 shrink-0 mt-1">
          <span>{displayHours}h estimadas</span>
          <span className="font-semibold">{STATUS_LABELS[demand.status]}</span>
        </div>
      </div>

      {/* Dynamic Resize Handle at the bottom border */}
      <div
        onMouseDown={startResize}
        className="absolute bottom-0 left-0 right-0 h-1.5 cursor-ns-resize hover:bg-primary/40 flex items-center justify-center group z-30"
      >
        <span className="w-5 h-0.5 bg-zinc-600 group-hover:bg-primary rounded-full transition-colors" />
      </div>
    </div>
  );
}

function SettingsPanel({
  config,
  onSave,
  onClose,
}: {
  config: SchedulingConfig;
  onSave: (config: SchedulingConfig) => void;
  onClose: () => void;
}) {
  const [startHour, setStartHour] = useState(config.startHour);
  const [endHour, setEndHour] = useState(config.endHour);
  const [lunchStart, setLunchStart] = useState(config.lunchStart);
  const [lunchEnd, setLunchEnd] = useState(config.lunchEnd);
  const [workingDays, setWorkingDays] = useState<number[]>(config.workingDays);
  const [timezone, setTimezone] = useState(config.timezone);

  const toggleDay = (day: number) => {
    setWorkingDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  };

  const handleSave = () => {
    if (startHour >= endHour) {
      toast.error("A hora de início deve ser menor que a de término.");
      return;
    }
    if (lunchStart < startHour || lunchEnd > endHour || lunchStart >= lunchEnd) {
      toast.error("O horário de almoço deve estar dentro do expediente.");
      return;
    }
    onSave({ workingDays, startHour, endHour, lunchStart, lunchEnd, timezone });
  };

  return (
    <div className="absolute top-14 right-4 z-50 w-80 bg-zinc-900/95 border border-zinc-700/80 rounded-xl p-4 shadow-2xl backdrop-blur-md space-y-4">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
        <h4 className="font-semibold text-xs text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
          <Clock className="h-4 w-4 text-primary" />
          Configurar Expediente
        </h4>
        <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-xs">
          Fechar
        </button>
      </div>

      <div className="space-y-1.5">
        <Label className="text-[10px] text-zinc-500 uppercase font-bold">Dias Úteis</Label>
        <div className="flex flex-wrap gap-2 pt-1">
          {["D", "S", "T", "Q", "Q", "S", "S"].map((name, idx) => {
            const isChecked = workingDays.includes(idx);
            return (
              <button
                key={idx}
                type="button"
                onClick={() => toggleDay(idx)}
                className={cn(
                  "h-7 w-7 rounded-full text-xs font-bold transition-all border",
                  isChecked
                    ? "bg-primary border-primary text-primary-foreground"
                    : "border-zinc-700 hover:border-zinc-500 text-zinc-400 bg-transparent"
                )}
              >
                {name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-[10px] text-zinc-500 uppercase font-bold">Início</Label>
          <Input
            type="number"
            min={0}
            max={23}
            value={startHour}
            onChange={(e) => setStartHour(Math.min(23, Math.max(0, parseInt(e.target.value, 10) || 0)))}
            className="bg-zinc-800 border-zinc-700 text-sm h-8"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] text-zinc-500 uppercase font-bold">Término</Label>
          <Input
            type="number"
            min={0}
            max={23}
            value={endHour}
            onChange={(e) => setEndHour(Math.min(23, Math.max(0, parseInt(e.target.value, 10) || 0)))}
            className="bg-zinc-800 border-zinc-700 text-sm h-8"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-[10px] text-zinc-500 uppercase font-bold">Almoço Início</Label>
          <Input
            type="number"
            min={0}
            max={23}
            value={lunchStart}
            onChange={(e) => setLunchStart(Math.min(23, Math.max(0, parseInt(e.target.value, 10) || 0)))}
            className="bg-zinc-800 border-zinc-700 text-sm h-8"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] text-zinc-500 uppercase font-bold">Almoço Fim</Label>
          <Input
            type="number"
            min={0}
            max={23}
            value={lunchEnd}
            onChange={(e) => setLunchEnd(Math.min(23, Math.max(0, parseInt(e.target.value, 10) || 0)))}
            className="bg-zinc-800 border-zinc-700 text-sm h-8"
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-[10px] text-zinc-500 uppercase font-bold">Fuso Horário</Label>
        <select
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-md p-1.5 text-xs text-zinc-200 focus:outline-none"
        >
          <option value="America/Sao_Paulo">America/Sao_Paulo (Brasília)</option>
          <option value="America/Noronha">America/Noronha (FND)</option>
          <option value="Europe/London">Europe/London (GMT)</option>
        </select>
      </div>

      <Button onClick={handleSave} className="w-full gap-2 h-8 text-xs">
        <Save className="h-3.5 w-3.5" />
        Salvar Configuração
      </Button>
    </div>
  );
}
