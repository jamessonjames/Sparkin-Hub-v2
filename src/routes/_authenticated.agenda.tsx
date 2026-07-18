import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState, useRef, useEffect } from "react";
import { listDemands, batchUpdateDueDates, updateDemand } from "@/lib/demands.functions";
import { listProfiles } from "@/lib/users.functions";
import { supabase } from "@/integrations/supabase/client";
import { useDemandOverlay } from "@/contexts/demand-overlay";
import { useUserContext } from "@/contexts/user-context";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Settings, Clock, Calendar as CalendarIcon, Save, Pencil, Trash2, Pin, PinOff } from "lucide-react";
import { STATUS_LABELS } from "@/lib/demand-labels";
import { cn } from "@/lib/utils";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  DragOverlay,
  type DragStartEvent,
  type DragEndEvent,
  pointerWithin,
} from "@dnd-kit/core";
import {
  scheduleByPriority,
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
  nao_iniciado: "bg-[#38a1db] text-white border-y-transparent border-r-transparent",
  fazendo:      "bg-[#1a73e8] text-white border-y-transparent border-r-transparent",
  para_analise: "bg-[#ab47bc] text-white border-y-transparent border-r-transparent",
  com_ajustes:  "bg-[#f29900] text-white border-y-transparent border-r-transparent",
  concluido:    "bg-[#0f9d58] text-white border-y-transparent border-r-transparent",
  rascunho:     "bg-[#90a4ae] text-white border-y-transparent border-r-transparent",
};

const PRIORITY_COLOR: Record<string, string> = {
  low:    "border-l-zinc-300/80 dark:border-l-zinc-400/80",
  medium: "border-l-blue-200/90 dark:border-l-blue-300/90",
  high:   "border-l-amber-300",
  urgent: "border-l-red-500",
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

type AgendaDemand = {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  estimated_hours?: number | null;
  is_manually_scheduled?: boolean | null;
  clients?: { id: string; name: string } | null;
};

function getDemandDurationHours(demand: Pick<AgendaDemand, "estimated_hours">) {
  const value = demand.estimated_hours ? Number(demand.estimated_hours) : 1;
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart.getTime() < bEnd.getTime() && aEnd.getTime() > bStart.getTime();
}

function parseSlotId(slotId: string) {
  const parts = slotId.split("_");
  if (parts.length < 4 || parts[0] !== "slot") return null;

  const dateStr = parts[1];
  const hourVal = Number.parseInt(parts[2], 10);
  const minVal = Number.parseInt(parts[3], 10);
  if (!dateStr || Number.isNaN(hourVal) || Number.isNaN(minVal)) return null;

  return new Date(`${dateStr}T${String(hourVal).padStart(2, "0")}:${String(minVal).padStart(2, "0")}:00`);
}

function getSlotIdFromDragEnd(event: DragEndEvent) {
  const translatedRect = event.active.rect.current.translated;
  if (translatedRect && typeof document !== "undefined") {
    const targetX = translatedRect.left + translatedRect.width / 2;
    const targetY = translatedRect.top + 8;
    const slotElements = Array.from(document.querySelectorAll<HTMLElement>("[data-agenda-slot-id]"));
    const directHit = slotElements.find((element) => {
      const rect = element.getBoundingClientRect();
      return targetX >= rect.left && targetX <= rect.right && targetY >= rect.top && targetY <= rect.bottom;
    });

    if (directHit?.dataset.agendaSlotId) {
      return directHit.dataset.agendaSlotId;
    }
  }

  return event.over ? String(event.over.id) : null;
}

// Custom collision detection based on the top edge of the dragged element
const customCollisionDetection = (args: any) => {
  const { active, droppableContainers, pointerCoordinates } = args;
  
  if (!active || !active.rect.current.translated) {
    return pointerWithin(args);
  }

  const rect = active.rect.current.translated;
  
  // X: Use the pointer's horizontal coordinate (cursor position) to determine the day column.
  // Y: Use the top edge of the dragged card (+ 10px buffer) to determine the time slot.
  const targetX = pointerCoordinates ? pointerCoordinates.x : (rect.left + rect.width / 2);
  const targetY = rect.top + 10; 

  const collisions = [];
  for (const container of droppableContainers) {
    const containerRect = container.rect.current;
    if (!containerRect) continue;

    if (
      targetX >= containerRect.left &&
      targetX <= containerRect.right &&
      targetY >= containerRect.top &&
      targetY <= containerRect.bottom
    ) {
      collisions.push({
        id: container.id,
        data: container.data,
      });
    }
  }

  if (collisions.length > 0) {
    return collisions;
  }

  return pointerWithin(args);
};

function AgendaPage() {
  const listFn = useServerFn(listDemands);
  const batchUpdateFn = useServerFn(batchUpdateDueDates);
  const updateFn = useServerFn(updateDemand);
  const overlay = useDemandOverlay();
  const qc = useQueryClient();
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const { currentUserRole, selectedUserId, setSelectedUserId, profiles, currentUser } = useUserContext();
  const isAdminOrOwner = currentUserRole === "owner" || currentUserRole === "admin";

  const { data: demands = [] } = useQuery({
    queryKey: ["demands", selectedUserId],
    queryFn: () => listFn({ data: isAdminOrOwner && selectedUserId ? { assigneeUserId: selectedUserId } : {} }),
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
    const items = demands.map((d: any) => ({
      id: d.id,
      title: d.title,
      priority: d.priority as "low" | "medium" | "high" | "urgent",
      status: d.status,
      due_date: d.due_date,
      estimated_hours: d.estimated_hours ? Number(d.estimated_hours) : 1.0,
      created_at: d.created_at,
      is_manually_scheduled: !!d.is_manually_scheduled,
    }));
    return scheduleByPriority(items as any, config);
  }, [demands, config]);

  // Persistence handled globally by useAutoScheduler hook (mounted in AppShell).

  // Group demands by date/hour/minute slot for display
  const demandsBySlot = useMemo(() => {
    const map = new Map<string, AgendaDemand>();
    for (const d of demands) {
      const finalDate = d.status === "concluido" ? d.due_date : (scheduledMap[d.id] ?? d.due_date);
      if (finalDate) {
        const dt = safeParseDate(finalDate);
        const hStr = String(dt.getHours()).padStart(2, "0");
        // round to nearest 30-min block
        const mStr = dt.getMinutes() >= 30 ? "30" : "00";
        const key = `${toISO(dt)}_${hStr}_${mStr}`;
        map.set(key, { ...(d as AgendaDemand), due_date: finalDate });
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

    const effectiveDueDate = getEffectiveDueDate(dObj as AgendaDemand);
    if (effectiveDueDate) {
      const conflict = findSchedulingConflict(demandId, safeParseDate(effectiveDueDate), hours);
      if (!conflict.ok) {
        toast.error(conflict.message);
        return;
      }
    }

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
    } catch (e) {
      console.error(e);
      toast.error("Erro ao atualizar o tempo estimado.");
      qc.invalidateQueries({ queryKey: ["demands"] });
    }
  }

  async function handleTogglePin(demandId: string, nextValue: boolean) {
    const currentDemand = demands.find((d) => d.id === demandId) as AgendaDemand | undefined;
    const effectiveDueDate = currentDemand ? (scheduledMap[demandId] ?? currentDemand.due_date ?? null) : null;

    qc.setQueryData<typeof demands>(["demands"], (prev) =>
      (prev ?? []).map((d) =>
        d.id === demandId
          ? ({ ...d, due_date: nextValue ? effectiveDueDate : null, is_manually_scheduled: nextValue } as any)
          : d
      )
    );
    try {
      await batchUpdateFn({
        data: {
          updates: [
            {
              id: demandId,
              due_date: nextValue ? effectiveDueDate : null,
              is_manually_scheduled: nextValue,
            },
          ],
        },
      });
      toast.success(nextValue ? "Demanda fixada nesta posição." : "Demanda liberada — o sistema pode reagendar.");
    } catch (err) {
      toast.error("Erro ao alterar o pin.");
      qc.invalidateQueries({ queryKey: ["demands"] });
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

  function getEffectiveDueDate(demand: AgendaDemand) {
    return demand.status === "concluido" ? demand.due_date : (scheduledMap[demand.id] ?? demand.due_date);
  }

  function findSchedulingConflict(demandId: string, targetDate: Date, durationOverride?: number) {
    const movingDemand = demands.find((d) => d.id === demandId) as AgendaDemand | undefined;
    if (!movingDemand) return { ok: false as const, message: "Demanda não encontrada." };

    const duration = durationOverride ?? getDemandDurationHours(movingDemand);
    const slotCursor = new Date(targetDate);
    for (let step = 0; step < Math.ceil(duration / 0.5); step += 1) {
      if (!isValidSlot(slotCursor, config)) {
        return { ok: false as const, message: "Este intervalo fica fora do expediente configurado." };
      }
      slotCursor.setMinutes(slotCursor.getMinutes() + 30);
    }

    const targetEnd = addHours(targetDate, duration);
    for (const demand of demands as AgendaDemand[]) {
      if (demand.id === demandId) continue;

      const dueDate = getEffectiveDueDate(demand);
      if (!dueDate) continue;

      const otherStart = safeParseDate(dueDate);
      const otherEnd = addHours(otherStart, getDemandDurationHours(demand));
      if (rangesOverlap(targetDate, targetEnd, otherStart, otherEnd)) {
        return {
          ok: false as const,
          message: `Horário ocupado por “${demand.title}”. Escolha um intervalo livre.`,
        };
      }
    }

    return { ok: true as const };
  }

  function handleDragStart(e: DragStartEvent) {
    setActiveDragId(String(e.active.id));
  }

  async function handleDragEnd(e: DragEndEvent) {
    setActiveDragId(null);

    const { active } = e;
    const targetSlotId = getSlotIdFromDragEnd(e);
    if (!targetSlotId) return;

    const demandId = String(active.id);
    const targetDate = parseSlotId(targetSlotId);
    if (!targetDate) return;

    const conflict = findSchedulingConflict(demandId, targetDate);
    if (!conflict.ok) {
      toast.error(conflict.message);
      return;
    }

    const formatted = formatTzString(targetDate);

    qc.setQueryData<typeof demands>(["demands"], (prev) =>
      (prev ?? []).map((d) => (d.id === demandId ? { ...d, due_date: formatted, is_manually_scheduled: true } as any : d))
    );

    try {
      await batchUpdateFn({ data: { updates: [{ id: demandId, due_date: formatted, is_manually_scheduled: true }] } });
      toast.success("Demanda reagendada!");
    } catch (err) {
      toast.error("Erro ao reagendar");
      qc.invalidateQueries({ queryKey: ["demands"] });
    }
  }

  const activeDragDemand = useMemo(() => {
    if (!activeDragId) return null;
    const demand = demands.find((d) => d.id === activeDragId) as AgendaDemand | undefined;
    if (!demand) return null;
    return { ...demand, due_date: getEffectiveDueDate(demand) };
  }, [activeDragId, demands, scheduledMap]);

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
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveDragId(null)}
      collisionDetection={customCollisionDetection}
    >
      <div className="w-full flex flex-col h-[calc(100vh-60px)] bg-background text-foreground overflow-hidden relative">
        
        {/* ── TOOLBAR ── */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border shrink-0 bg-muted/10 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={handleToday}
            className="border-input text-foreground hover:bg-muted"
          >
            Hoje
          </Button>

          <div className="flex items-center">
            <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-muted" onClick={handlePrev}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-muted" onClick={handleNext}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <h2 className="text-sm md:text-base font-bold text-foreground capitalize">{headerLabel}</h2>

          {/* User selector for admin/owner */}
          {isAdminOrOwner && profiles.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground font-semibold uppercase">Usuário:</span>
              <Select
                value={selectedUserId ?? currentUser?.id ?? ""}
                onValueChange={(val) => setSelectedUserId(val === currentUser?.id ? null : val)}
              >
                <SelectTrigger className="h-8 text-xs bg-background border-border text-foreground w-auto min-w-[140px]">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={currentUser?.id ?? ""} className="text-xs font-semibold">
                    {profiles.find(p => p.id === currentUser?.id)?.name ?? "Meu perfil"} (Eu)
                  </SelectItem>
                  {profiles.filter(p => p.id !== currentUser?.id).map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-xs">
                      {p.name ?? p.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* View Mode Selector */}
          <div className="ml-auto flex items-center bg-muted/30 p-0.5 rounded-lg border border-border">
            {(["day", "week", "month"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={cn(
                  "px-3 py-1 text-xs font-semibold rounded-md transition-all capitalize",
                  viewMode === mode
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
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
            className={cn("border-input text-foreground gap-1.5 hover:bg-muted", showSettings && "bg-muted text-foreground")}
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
          <div className="flex-1 flex flex-col min-h-0 bg-muted/10">
            <div className="grid grid-cols-7 border-b border-border bg-muted/20 text-center py-2 text-xs font-bold text-muted-foreground">
              {DAYS_SHORT.map((day) => (
                <div key={day}>{day}</div>
              ))}
            </div>

            <div className="flex-1 grid grid-cols-7 grid-rows-5 md:grid-rows-6 border-b border-border/20">
              {monthCells.map(({ date, key }) => {
                if (!date) {
                  return <div key={key} className="border-r border-b border-border/40 bg-muted/5" />;
                }
                const iso = toISO(date);
                const isToday = iso === todayISO;
                const cellDemands = demandsByDate.get(iso) ?? [];

                return (
                  <div
                    key={key}
                    onClick={() => overlay.openNew(clientsForOverlay, iso, "nao_iniciado", undefined, isAdminOrOwner && selectedUserId ? selectedUserId : undefined)}
                    className={cn(
                      "border-r border-b border-border/40 p-1 flex flex-col justify-start gap-1 overflow-hidden cursor-pointer hover:bg-muted/40 transition-colors",
                      isToday && "bg-primary/5"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className={cn(
                        "text-xs font-bold h-6 w-6 rounded-full flex items-center justify-center",
                        isToday ? "bg-primary text-primary-foreground font-black" : "text-muted-foreground"
                      )}>
                        {date.getDate()}
                      </span>
                    </div>

                    <div className="space-y-1 overflow-y-auto max-h-[80px] scrollbar-thin">
                      {cellDemands.map((d) => (
                        <div
                          key={d.id}
                          title={`${d.title} (${(STATUS_LABELS as Record<string, string>)[d.status]})`}
                          onClick={(e) => {
                            e.stopPropagation();
                            overlay.open(d.id, clientsForOverlay);
                          }}
                          className={cn(
                            "text-[9px] px-1.5 py-0.5 rounded border truncate border-l-2 font-medium",
                            STATUS_BG[d.status] ?? "bg-card border-border",
                            PRIORITY_COLOR[d.priority] ?? "border-border"
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
            <div className="flex border-b border-border bg-muted/20 shrink-0">
              <div className="w-[60px] shrink-0 border-r border-border/40" />
              {weekDays.map((day) => {
                const iso = toISO(day);
                const isToday = iso === todayISO;
                return (
                  <div key={iso} className="flex-1 text-center py-2 border-l border-border/40 min-w-[120px]">
                    <div className="text-[10px] font-bold text-muted-foreground tracking-wider">
                      {viewMode === "day" ? WEEKDAY_NAMES[day.getDay()] : DAYS_SHORT[day.getDay()]}
                    </div>
                    <div className={cn(
                      "mx-auto mt-1 h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold",
                      isToday ? "bg-primary text-primary-foreground font-black" : "text-foreground"
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
                <div className="w-[60px] shrink-0 select-none bg-muted/5 border-r border-border/40 z-10">
                  {SLOTS.map((slot, index) => (
                    <div key={index} className="h-10 relative flex items-start justify-end pr-2.5">
                      {slot.m === 0 && slot.h > 0 && (
                        <span className="text-[10px] text-muted-foreground/60 font-semibold mt-[-6px]">
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
                        "flex-1 border-l border-border/30 relative min-w-[120px]",
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
                                onTogglePin={handleTogglePin}
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
        <div className="shrink-0 px-4 py-1.5 border-t border-border bg-muted/20 flex items-center justify-between text-[10px] text-muted-foreground">
          <span>Prioridade: Vermelho = Urgente • Laranja = Alta • Azul = Média • Cinza = Baixa</span>
          <span>Fuso Horário: {config.timezone}</span>
        </div>

        <DragOverlay dropAnimation={null}>
          {activeDragDemand ? <AgendaDemandCardPreview demand={activeDragDemand} /> : null}
        </DragOverlay>

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
      data-agenda-slot-id={id}
      className={cn(
        "h-10 border-t border-border/15 p-0.5 relative transition-colors duration-150",
        !isBusiness && "bg-muted/30 opacity-70",
        isOver && (isBusiness ? "bg-primary/25 border-t-primary" : "bg-red-500/10 border-t-red-700")
      )}
    >
      {children}
    </div>
  );
}

function AgendaDemandCardPreview({ demand }: { demand: AgendaDemand }) {
  const displayHours = getDemandDurationHours(demand);
  const cardHeight = (displayHours / 0.5) * 40 - 4;

  return (
    <div
      style={{ height: `${cardHeight}px`, width: 180 }}
      className={cn(
        "rounded border-l-4 p-1.5 text-[10px] font-medium shadow-2xl select-none flex flex-col justify-between overflow-hidden opacity-95",
        STATUS_BG[demand.status] ?? "bg-card text-foreground border-border",
        PRIORITY_COLOR[demand.priority] ?? "border-l-border"
      )}
    >
      <div className="min-w-0">
        <div className="font-semibold truncate leading-tight">{demand.title}</div>
        <div className="text-[9px] opacity-75 mt-0.5 truncate max-w-full">
          {demand.clients?.name ?? "Geral"}
        </div>
      </div>
      <div className="flex items-center justify-between text-[8px] opacity-70 shrink-0 mt-1">
        <span>{displayHours}h estimadas</span>
        <span className="font-semibold">{(STATUS_LABELS as Record<string, string>)[demand.status]}</span>
      </div>
    </div>
  );
}

function DraggableDemandCard({
  demand,
  onClick,
  onResize,
  onTogglePin,
}: {
  demand: any;
  onClick: () => void;
  onResize: (demandId: string, hours: number) => Promise<void>;
  onTogglePin: (demandId: string, nextValue: boolean) => Promise<void>;
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

  // Compute if the event time has passed (Google Calendar style transparency)
  const isPast = useMemo(() => {
    if (!demand.due_date) return false;
    const start = new Date(demand.due_date);
    const hours = demand.estimated_hours ? Number(demand.estimated_hours) : 1.0;
    const end = new Date(start.getTime() + hours * 3600 * 1000);
    return end < new Date();
  }, [demand.due_date, demand.estimated_hours]);

  // Calculate dynamic card height representing estimated time
  const displayHours = isResizing ? tempHours : (demand.estimated_hours ? Number(demand.estimated_hours) : 1.0);
  const slotsCount = displayHours / 0.5;
  const cardHeight = slotsCount * 40 - 4; // in pixels (each cell = 40px)

  const style = {
    height: `${cardHeight}px`,
    zIndex: isResizing || isDragging ? 50 : 20,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group absolute inset-x-0.5 top-0.5 rounded border-l-4 p-1.5 text-[10px] font-medium cursor-pointer shadow-sm select-none",
        "transition-all flex flex-col justify-between overflow-hidden",
        STATUS_BG[demand.status] ?? "bg-[#38a1db] text-white",
        PRIORITY_COLOR[demand.priority] ?? "border-l-zinc-500",
        isDragging && "opacity-40 scale-95 z-50 shadow-2xl rotate-1",
        demand.status === "concluido" && "line-through opacity-60",
        isPast && "opacity-45 saturate-[0.65]"
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
          <span className="font-semibold">{(STATUS_LABELS as Record<string, string>)[demand.status]}</span>
        </div>
      </div>

      {/* Pin toggle — top right. Não afeta arrasto. */}
      <button
        type="button"
        title={
          demand.is_manually_scheduled
            ? "Fixado — o sistema não vai reagendar. Clique para liberar."
            : "Fixar aqui — impede o auto-scheduler de mover."
        }
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onTogglePin(demand.id, !demand.is_manually_scheduled);
        }}
        className={cn(
          "absolute top-0.5 right-0.5 z-40 h-4 w-4 flex items-center justify-center rounded-sm transition-opacity",
          demand.is_manually_scheduled
            ? "opacity-90 hover:opacity-100"
            : "opacity-0 hover:opacity-80 group-hover:opacity-60"
        )}
      >
        {demand.is_manually_scheduled ? (
          <Pin className="h-2.5 w-2.5 fill-current" />
        ) : (
          <PinOff className="h-2.5 w-2.5" />
        )}
      </button>

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
    <div className="absolute top-14 right-4 z-50 w-80 bg-card border border-border rounded-xl p-4 shadow-2xl backdrop-blur-md space-y-4">
      <div className="flex items-center justify-between border-b border-border pb-2">
        <h4 className="font-semibold text-xs text-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Clock className="h-4 w-4 text-primary" />
          Configurar Expediente
        </h4>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xs">
          Fechar
        </button>
      </div>

      <div className="space-y-1.5">
        <Label className="text-[10px] text-muted-foreground uppercase font-bold">Dias Úteis</Label>
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
                    : "border-input hover:border-accent text-muted-foreground bg-transparent"
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
          <Label className="text-[10px] text-muted-foreground uppercase font-bold">Início</Label>
          <Input
            type="number"
            min={0}
            max={23}
            value={startHour}
            onChange={(e) => setStartHour(Math.min(23, Math.max(0, parseInt(e.target.value, 10) || 0)))}
            className="bg-background border-input text-sm h-8"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground uppercase font-bold">Término</Label>
          <Input
            type="number"
            min={0}
            max={23}
            value={endHour}
            onChange={(e) => setEndHour(Math.min(23, Math.max(0, parseInt(e.target.value, 10) || 0)))}
            className="bg-background border-input text-sm h-8"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground uppercase font-bold">Almoço Início</Label>
          <Input
            type="number"
            min={0}
            max={23}
            value={lunchStart}
            onChange={(e) => setLunchStart(Math.min(23, Math.max(0, parseInt(e.target.value, 10) || 0)))}
            className="bg-background border-input text-sm h-8"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground uppercase font-bold">Almoço Fim</Label>
          <Input
            type="number"
            min={0}
            max={23}
            value={lunchEnd}
            onChange={(e) => setLunchEnd(Math.min(23, Math.max(0, parseInt(e.target.value, 10) || 0)))}
            className="bg-background border-input text-sm h-8"
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-[10px] text-muted-foreground uppercase font-bold">Fuso Horário</Label>
        <select
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          className="w-full bg-background border border-input rounded-md p-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
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
