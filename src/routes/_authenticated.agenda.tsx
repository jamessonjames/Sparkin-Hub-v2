import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState, useRef, useEffect } from "react";
import { listDemands, batchUpdateDueDates, type DemandStatus } from "@/lib/demands.functions";
import { useDemandOverlay } from "@/contexts/demand-overlay";
import { ChevronLeft, ChevronRight, Settings, Clock, Calendar as CalendarIcon, Save } from "lucide-react";
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
} from "@/utils/scheduler";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/agenda")({
  head: () => ({ meta: [{ title: "Agenda — Creative Flow Hub" }] }),
  component: AgendaPage,
});

const DAYS_SHORT = ["DOM.", "SEG.", "TER.", "QUA.", "QUI.", "SEX.", "SÁB."];
const HOURS = Array.from({ length: 24 }, (_, i) => i); // 0..23

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

function AgendaPage() {
  const listFn = useServerFn(listDemands);
  const batchUpdateFn = useServerFn(batchUpdateDueDates);
  const overlay = useDemandOverlay();
  const qc = useQueryClient();

  const { data: demands = [] } = useQuery({
    queryKey: ["demands"],
    queryFn: () => listFn(),
  });

  // Load scheduler config from localStorage or fallback
  const [config, setConfig] = useState<SchedulingConfig>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("CreativeFlow_ScheduleConfig");
      if (saved) {
        try { return JSON.parse(saved); } catch (e) {}
      }
    }
    return DEFAULT_CONFIG;
  });

  const [showSettings, setShowSettings] = useState(false);
  const today = useMemo(() => getTzTime(config.timezone), [config.timezone]);
  const todayISO = toISO(today);

  // Week anchor (Sunday)
  const [anchor, setAnchor] = useState(() => weekStart(today));

  const weekDays = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => {
      const d = new Date(anchor);
      d.setDate(anchor.getDate() + i);
      return d;
    }), [anchor]);

  // Run the scheduler to organize active demands
  const scheduledMap = useMemo(() => {
    // Demands format for scheduling utility
    const forScheduler = demands.map((d) => ({
      id: d.id,
      title: d.title,
      priority: d.priority as "low" | "medium" | "high" | "urgent",
      status: d.status,
      due_date: d.due_date,
      created_at: d.created_at,
    }));
    return scheduleDemands(forScheduler, config);
  }, [demands, config]);

  // Automatically sync scheduled times back to Supabase if they changed
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
      // Apply updates to DB silently in batch
      batchUpdateFn({ data: { updates } })
        .then(() => {
          qc.invalidateQueries({ queryKey: ["demands"] });
        })
        .catch((e) => console.error("Erro no auto-agendamento:", e));
    }
  }, [scheduledMap, demands, batchUpdateFn, qc]);

  // Group demands by date/hour slot for display
  const demandsBySlot = useMemo(() => {
    const map = new Map<string, typeof demands[number]>();
    for (const d of demands) {
      const finalDate = d.status === "concluido" ? d.due_date : (scheduledMap[d.id] ?? d.due_date);
      if (finalDate) {
        // e.g. "2026-07-15T09:00:00" -> key "2026-07-15_9"
        const dt = new Date(finalDate);
        const key = `${toISO(dt)}_${dt.getHours()}`;
        map.set(key, d);
      }
    }
    return map;
  }, [demands, scheduledMap]);

  // Drag and drop sensor configuration
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  );

  async function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over) return;

    const demandId = String(active.id);
    const targetSlotId = String(over.id); // e.g. "slot_2026-07-15_9"
    const parts = targetSlotId.split("_");
    if (parts.length < 3) return;

    const dateStr = parts[1]; // YYYY-MM-DD
    const hourVal = parseInt(parts[2], 10);

    // Create target datetime in correct format
    const targetDate = new Date(`${dateStr}T${String(hourVal).padStart(2, "0")}:00:00`);
    const formatted = formatTzString(targetDate);

    // Optimistically update local view first
    qc.setQueryData<typeof demands>(["demands"], (prev) =>
      (prev ?? []).map((d) => (d.id === demandId ? { ...d, due_date: formatted } : d))
    );

    try {
      // Save manual drop to database. This will trigger scheduler auto-push for conflicts!
      const updates = [{ id: demandId, due_date: formatted }];
      await batchUpdateFn({ data: { updates } });
      toast.success("Demanda reagendada!");
    } catch (err) {
      toast.error("Erro ao salvar agendamento");
    } finally {
      qc.invalidateQueries({ queryKey: ["demands"] });
    }
  }

  // Settings handlers
  function saveConfig(newConfig: SchedulingConfig) {
    setConfig(newConfig);
    localStorage.setItem("CreativeFlow_ScheduleConfig", JSON.stringify(newConfig));
    setShowSettings(false);
    toast.success("Configuração de expediente salva!");
    qc.invalidateQueries({ queryKey: ["demands"] });
  }

  const headerLabel = useMemo(() => {
    const start = weekDays[0];
    const end = weekDays[6];
    if (start.getMonth() === end.getMonth()) {
      return start.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    }
    return `${start.toLocaleDateString("pt-BR", { month: "short" })} – ${end.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}`;
  }, [weekDays]);

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) {
      const top = Math.max(0, (config.startHour - 1) * 56);
      scrollRef.current.scrollTop = top;
    }
  }, [config.startHour]);

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex flex-col h-[calc(100vh-60px)] bg-[#121212] text-zinc-100 overflow-hidden relative">

        {/* ── TOP TOOLBAR ── */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800/80 shrink-0 bg-zinc-900/50">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAnchor(weekStart(today))}
            className="border-zinc-700 text-zinc-200 hover:bg-zinc-800/80"
          >
            Hoje
          </Button>

          <div className="flex items-center">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hover:bg-zinc-800"
              onClick={() => {
                const d = new Date(anchor);
                d.setDate(d.getDate() - 7);
                setAnchor(d);
              }}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hover:bg-zinc-800"
              onClick={() => {
                const d = new Date(anchor);
                d.setDate(d.getDate() + 7);
                setAnchor(d);
              }}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <h2 className="text-base font-bold text-zinc-100 capitalize">{headerLabel}</h2>

          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSettings(!showSettings)}
              className={cn(
                "border-zinc-700 text-zinc-300 gap-1.5 hover:bg-zinc-800",
                showSettings && "bg-zinc-800 text-white"
              )}
            >
              <Settings className="h-3.5 w-3.5" />
              Expediente
            </Button>
          </div>
        </div>

        {/* ── EXPEDIENTE CONFIG (FLOATING CARD) ── */}
        {showSettings && (
          <SettingsPanel config={config} onSave={saveConfig} onClose={() => setShowSettings(false)} />
        )}

        {/* ── COLUMN HEADERS (DAYS) ── */}
        <div className="flex border-b border-zinc-800/60 bg-zinc-900/30 shrink-0">
          <div className="w-[60px] shrink-0 border-r border-zinc-800/20" />
          {weekDays.map((day) => {
            const iso = toISO(day);
            const isToday = iso === todayISO;
            return (
              <div key={iso} className="flex-1 text-center py-2 border-l border-zinc-800/20 min-w-[120px]">
                <div className="text-[10px] font-bold text-zinc-500 tracking-wider">
                  {DAYS_SHORT[day.getDay()]}
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

        {/* ── SCROLLABLE GRID ── */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div className="flex relative">
            
            {/* Hour indicators on the left */}
            <div className="w-[60px] shrink-0 select-none bg-zinc-900/20 border-r border-zinc-800/20 z-10">
              {HOURS.map((h) => (
                <div key={h} className="h-14 relative flex items-start justify-end pr-2.5">
                  {h > 0 && (
                    <span className="text-[10px] text-zinc-600 font-semibold mt-[-6px]">
                      {String(h).padStart(2, "0")}:00
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Day columns containing slots */}
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
                  {/* Cells / Droppable targets */}
                  {HOURS.map((h) => {
                    const slotKey = `${iso}_${h}`;
                    const demand = demandsBySlot.get(slotKey);
                    const isBusiness = isValidSlot(new Date(`${iso}T${String(h).padStart(2, "0")}:00:00`), config);

                    return (
                      <DroppableHourCell
                        key={h}
                        id={`slot_${iso}_${h}`}
                        isBusiness={isBusiness}
                      >
                        {demand && (
                          <DraggableDemandCard
                            demand={demand}
                            onClick={() => overlay.open(demand.id)}
                          />
                        )}
                      </DroppableHourCell>
                    );
                  })}

                  {/* Red line for current time */}
                  {isToday && (
                    <div
                      className="absolute left-0 right-0 z-20 pointer-events-none"
                      style={{ top: `${(currentHour * 60 + currentMinute) / 60 * 56}px` }}
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

        {/* ── FOOTER ── */}
        <div className="shrink-0 px-4 py-1.5 border-t border-zinc-800/80 bg-zinc-900/60 flex items-center justify-between text-[10px] text-zinc-500">
          <span>Prioridade: Vermelho = Urgente • Laranja = Alta • Azul = Média • Cinza = Baixa</span>
          <span>Fuso Horário: {config.timezone}</span>
        </div>

      </div>
    </DndContext>
  );
}

/** Droppable Cell representant for each hour of each day */
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
        "h-14 border-t border-zinc-800/10 p-0.5 relative transition-colors duration-150",
        !isBusiness && "bg-zinc-950/40 opacity-70",
        isOver && (isBusiness ? "bg-primary/20 border-t-primary" : "bg-red-950/20 border-t-red-700")
      )}
    >
      {children}
    </div>
  );
}

/** Draggable Demand Card */
function DraggableDemandCard({
  demand,
  onClick,
}: {
  demand: any;
  onClick: () => void;
}) {
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
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "absolute inset-0.5 rounded border-l-3 p-1 text-[10px] font-medium cursor-pointer shadow-md select-none",
        "transition-all flex flex-col justify-between overflow-hidden",
        STATUS_BG[demand.status] ?? "bg-zinc-800 border-zinc-700 text-zinc-100",
        PRIORITY_COLOR[demand.priority] ?? "border-zinc-500",
        isDragging && "opacity-40 scale-95 z-50 shadow-2xl rotate-1",
        demand.status === "concluido" && "line-through opacity-60"
      )}
    >
      <div className="font-semibold truncate leading-tight">{demand.title}</div>
      <div className="flex items-center justify-between text-[9px] opacity-75 mt-0.5">
        <span className="truncate max-w-[60px]">
          {demand.clients?.name ?? "Geral"}
        </span>
        <span className="shrink-0">{STATUS_LABELS[demand.status]}</span>
      </div>
    </div>
  );
}

/** Settings Panel Component */
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
    onSave({
      workingDays,
      startHour,
      endHour,
      lunchStart,
      lunchEnd,
      timezone,
    });
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

      {/* Days checkboxes */}
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

      {/* Expediente Start / End */}
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

      {/* Lunch Break Start / End */}
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

      {/* Timezone */}
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

      {/* Save Button */}
      <Button onClick={handleSave} className="w-full gap-2 h-8 text-xs">
        <Save className="h-3.5 w-3.5" />
        Salvar Configuração
      </Button>
    </div>
  );
}
