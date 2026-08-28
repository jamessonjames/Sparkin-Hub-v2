import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { listDemands, batchUpdateDueDates, updateDemand } from "@/lib/demands.functions";
import { LoadingSpinner } from "@/components/loading-spinner";
import { listClients } from "@/lib/clients.functions";
import { listReminders, upsertReminder, completeReminder, deleteReminder } from "@/lib/reminders.functions";
import { ReminderDialog, type ReminderData } from "@/components/reminder-dialog";
import { AgendaSlotModal } from "@/components/agenda-slot-modal";
import { listProfiles } from "@/lib/users.functions";
import { supabase } from "@/integrations/supabase/client";
import { useDemandOverlay } from "@/contexts/demand-overlay";
import { useUserContext } from "@/contexts/user-context";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { ChevronLeft, ChevronRight, Settings, Clock, Calendar as CalendarIcon, Save, Pencil, Trash2, Pin, PinOff, CheckCircle2, Check, Repeat, Star, Video } from "lucide-react";
import { MeetingDialog } from "@/components/meeting-dialog";
import { listMeetings, upsertMeeting, type Meeting } from "@/lib/meetings.functions";
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
  rectIntersection,
} from "@dnd-kit/core";
import {
  scheduleByPriority,
  DEFAULT_CONFIG,
  type SchedulingConfig,
  formatTzString,
  getTzTime,
  isValidSlot,
  getNextSlot,
  safeParseDate,
} from "@/utils/scheduler";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/agenda")({
  head: () => ({ meta: [{ title: "Agenda — Sparkin Hub" }] }),
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
  if (event.over && String(event.over.id).startsWith("slot_")) {
    return String(event.over.id);
  }

  const pointerEvt = event.activatorEvent as MouseEvent | TouchEvent | PointerEvent;
  if (pointerEvt && typeof (pointerEvt as any).clientX === "number" && typeof document !== "undefined") {
    const cursorX = (pointerEvt as MouseEvent).clientX + event.delta.x;
    const cursorY = (pointerEvt as MouseEvent).clientY + event.delta.y;

    const slots = Array.from(document.querySelectorAll<HTMLElement>("[data-agenda-slot-id]"));
    const hit = slots.find((el) => {
      const r = el.getBoundingClientRect();
      return cursorX >= r.left && cursorX <= r.right && cursorY >= r.top && cursorY <= r.bottom;
    });

    if (hit?.dataset.agendaSlotId) {
      return hit.dataset.agendaSlotId;
    }
  }

  return null;
}

// Live DOM collision detection using real-time getBoundingClientRect to account for scroll position
const customCollisionDetection = (args: any) => {
  const { pointerCoordinates, droppableContainers } = args;

  if (pointerCoordinates && typeof document !== "undefined") {
    const px = pointerCoordinates.x;
    const py = pointerCoordinates.y;

    const containerList = Array.isArray(droppableContainers)
      ? droppableContainers
      : typeof droppableContainers?.values === "function"
      ? Array.from(droppableContainers.values())
      : [];

    for (const container of containerList) {
      if (!container || !String(container.id).startsWith("slot_")) continue;
      const node = container.node?.current;
      if (node) {
        const r = node.getBoundingClientRect();
        if (px >= r.left && px <= r.right && py >= r.top && py <= r.bottom) {
          return [{ id: container.id, data: container.data }];
        }
      }
    }
  }

  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length > 0) return pointerCollisions;
  return rectIntersection(args);
};

function AgendaPage() {
  const listFn = useServerFn(listDemands);
  const clientsFn = useServerFn(listClients);
  const listMeetingsFn = useServerFn(listMeetings);
  const upsertMeetingFn = useServerFn(upsertMeeting);
  const batchUpdateFn = useServerFn(batchUpdateDueDates);
  const updateFn = useServerFn(updateDemand);
  const overlay = useDemandOverlay();
  const qc = useQueryClient();
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const { currentUserRole, selectedUserId, setSelectedUserId, defaultUserId, setDefaultUserId, profiles, currentUser } = useUserContext();
  const isAdminOrOwner = currentUserRole === "owner" || currentUserRole === "admin";
  const activeUserId = selectedUserId ?? currentUser?.id ?? null;
  const isDefaultUser = defaultUserId ? defaultUserId === activeUserId : activeUserId === currentUser?.id;

  const targetAgendaUserId = (selectedUserId && selectedUserId !== "all" && selectedUserId !== "unassigned")
    ? selectedUserId
    : (currentUser?.id ?? null);

  const { data: demands = [], isPending: demandsLoading } = useQuery({
    queryKey: ["demands", targetAgendaUserId, isAdminOrOwner],
    queryFn: () => listFn({ data: isAdminOrOwner && targetAgendaUserId ? { assigneeUserId: targetAgendaUserId, includeUnassigned: false } : {} }),
    staleTime: 1 * 60 * 1000,
  });

  const { data: allClients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: () => clientsFn(),
  });

  const { data: meetings = [] } = useQuery({
    queryKey: ["meetings", targetAgendaUserId],
    queryFn: () => listMeetingsFn({ data: targetAgendaUserId ? { assigneeUserId: targetAgendaUserId } : {} }),
    staleTime: 60 * 1000,
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

  // Live real-time clock state (updates every 5s + instantly on tab focus with 0 DB queries)
  const [now, setNow] = useState(() => getTzTime(config.timezone));

  useEffect(() => {
    const updateClock = () => setNow(getTzTime(config.timezone));
    const interval = setInterval(updateClock, 5000);
    window.addEventListener("focus", updateClock);
    document.addEventListener("visibilitychange", updateClock);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", updateClock);
      document.removeEventListener("visibilitychange", updateClock);
    };
  }, [config.timezone]);

  const today = now;
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
    const meetingBlocks = meetings.map((meeting) => ({
      id: `meeting-block:${meeting.id}`,
      title: meeting.title,
      priority: "urgent" as const,
      status: "nao_iniciado",
      due_date: meeting.due_date,
      estimated_hours: meeting.estimated_hours,
      created_at: meeting.created_at || meeting.due_date,
      is_manually_scheduled: true,
    }));
    return scheduleByPriority(items as any, config, meetingBlocks);
  }, [demands, meetings, config]);

  // Persistence handled globally by useAutoScheduler hook (mounted in AppShell).

  const listRemindersFn = useServerFn(listReminders);
  const upsertReminderFn = useServerFn(upsertReminder);
  const completeReminderFn = useServerFn(completeReminder);
  const deleteReminderFn = useServerFn(deleteReminder);

  const { data: reminders = [] } = useQuery({
    queryKey: ["reminders", activeUserId],
    queryFn: () => listRemindersFn({ data: isAdminOrOwner && activeUserId ? { assigneeUserId: activeUserId } : {} }),
    staleTime: 1 * 60 * 1000,
  });

  // Slot modal state (Choice between Nova Demanda or Novo Lembrete)
  const [slotModalOpen, setSlotModalOpen] = useState(false);
  const [selectedSlotDateTime, setSelectedSlotDateTime] = useState<string>("");
  const isDragOrResizeInProgressRef = useRef(false);

  // Reminder dialog state
  const [reminderDialogOpen, setReminderDialogOpen] = useState(false);
  const [editingReminder, setEditingReminder] = useState<Partial<ReminderData> | null>(null);

  // Meeting dialog state
  const [meetingDialogOpen, setMeetingDialogOpen] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);

  const meetingsBySlot = useMemo(() => {
    const map = new Map<string, Meeting[]>();
    for (const meeting of meetings) {
      const dt = new Date(meeting.due_date);
      if (Number.isNaN(dt.getTime())) continue;
      const hStr = String(dt.getHours()).padStart(2, "0");
      const mStr = dt.getMinutes() >= 30 ? "30" : "00";
      const key = `${toISO(dt)}_${hStr}_${mStr}`;
      map.set(key, [...(map.get(key) || []), meeting]);
    }
    return map;
  }, [meetings]);

  // Group demands by date/hour/minute slot for display (ACTIVE STATUSES ONLY)
  const demandsBySlot = useMemo(() => {
    const map = new Map<string, AgendaDemand>();
    for (const d of demands) {
      if (d.status !== "nao_iniciado" && d.status !== "fazendo" && d.status !== "com_ajustes") continue;
      // If it's a date-only adjustment, render it in DaySummaryPill at the top of the day
      if (d.status === "com_ajustes" && !d.is_manually_scheduled) {
        continue;
      }
      const finalDate = scheduledMap[d.id] ?? d.due_date;
      if (finalDate) {
        const dt = safeParseDate(finalDate);
        const hStr = String(dt.getHours()).padStart(2, "0");
        const mStr = dt.getMinutes() >= 30 ? "30" : "00";
        const key = `${toISO(dt)}_${hStr}_${mStr}`;
        map.set(key, { ...(d as AgendaDemand), due_date: finalDate });
      }
    }
    return map;
  }, [demands, scheduledMap]);

  // Group concluida, para_analise, com_ajustes & sem_responsavel demands for day header summary pill
  const daySummaryDemands = useMemo(() => {
    const map = new Map<string, { concluida: AgendaDemand[]; para_analise: AgendaDemand[]; com_ajustes: AgendaDemand[]; sem_responsavel: AgendaDemand[] }>();
    for (const d of demands) {
      const isUnassigned = !d.assignee_user_id;
      const isDateOnlyAdjustment = d.status === "com_ajustes" && !d.is_manually_scheduled;

      if (d.status === "concluido" || d.status === "para_analise" || isDateOnlyAdjustment || (isAdminOrOwner && isUnassigned)) {
        if (d.status === "com_ajustes" && d.is_manually_scheduled) continue;

        const dateKey = d.due_date ? toISO(safeParseDate(d.due_date)) : todayISO;
        const entry = map.get(dateKey) || { concluida: [], para_analise: [], com_ajustes: [], sem_responsavel: [] };
        
        if (isAdminOrOwner && isUnassigned && d.status !== "concluido" && d.status !== "para_analise") {
          entry.sem_responsavel.push(d as AgendaDemand);
        } else if (d.status === "concluido") {
          entry.concluida.push(d as AgendaDemand);
        } else if (d.status === "para_analise") {
          entry.para_analise.push(d as AgendaDemand);
        } else if (d.status === "com_ajustes") {
          entry.com_ajustes.push(d as AgendaDemand);
        }
        map.set(dateKey, entry);
      }
    }
    return map;
  }, [demands, isAdminOrOwner]);

  // Group active reminders by slot (including recurring occurrences)
  const remindersBySlot = useMemo(() => {
    const map = new Map<string, ReminderData[]>();
    for (const _r of reminders) {
      const r = _r as any;
      if (r.is_completed) continue;
      
      const startDt = new Date(r.date_time);
      const hStr = String(startDt.getHours()).padStart(2, "0");
      const mStr = startDt.getMinutes() >= 30 ? "30" : "00";

      if (!r.recurrence_type || r.recurrence_type === "none") {
        const key = `${toISO(startDt)}_${hStr}_${mStr}`;
        const arr = map.get(key) || [];
        arr.push(r as ReminderData);
        map.set(key, arr);
      } else {
        const endLimit = r.recurrence_end_date ? new Date(r.recurrence_end_date) : new Date(startDt.getTime() + 90 * 86400000);
        const curr = new Date(startDt);
        const interval = r.recurrence_interval || 1;
        let safetyCounter = 0;

        while (curr <= endLimit && safetyCounter < 120) {
          safetyCounter++;
          const key = `${toISO(curr)}_${hStr}_${mStr}`;
          const arr = map.get(key) || [];
          arr.push(r as ReminderData);
          map.set(key, arr);

          if (r.recurrence_type === "daily") {
            curr.setDate(curr.getDate() + interval);
          } else if (r.recurrence_type === "weekly") {
            curr.setDate(curr.getDate() + 7 * interval);
          } else if (r.recurrence_type === "monthly") {
            curr.setMonth(curr.getMonth() + interval);
          } else if (r.recurrence_type === "yearly") {
            curr.setFullYear(curr.getFullYear() + interval);
          } else {
            break;
          }
        }
      }
    }
    return map;
  }, [reminders]);

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

    qc.setQueryData<typeof demands>(["demands", targetAgendaUserId, isAdminOrOwner], (prev) =>
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
          estimated_credits: dObj.estimated_credits,
          internal_notes: dObj.internal_notes,
          assignee_user_id: dObj.assignee_user_id,
          client_edition_id: dObj.client_edition_id,
          price: dObj.price,
        },
      });
      qc.invalidateQueries({ queryKey: ["demands"] });
    } catch (e) {
      console.error(e);
      toast.error("Erro ao atualizar o tempo estimado.");
      qc.invalidateQueries({ queryKey: ["demands"] });
    }
  }

  async function handleTogglePin(demandId: string, nextValue: boolean) {
    const currentDemand = demands.find((d) => d.id === demandId) as AgendaDemand | undefined;
    const effectiveDueDate = currentDemand ? (scheduledMap[demandId] ?? currentDemand.due_date ?? null) : null;

    qc.setQueryData<typeof demands>(["demands", targetAgendaUserId, isAdminOrOwner], (prev) =>
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
      qc.invalidateQueries({ queryKey: ["demands"] });
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
    setTimeout(() => {
      scrollToCurrentTime();
    }, 50);
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
      // Demands in concluido, para_analise, rascunho or cancelado do not occupy time grid slots
      if (demand.status === "concluido" || demand.status === "para_analise" || demand.status === "rascunho" || demand.status === "cancelado") continue;

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

  const [recurrenceDragState, setRecurrenceDragState] = useState<{
    open: boolean;
    reminder: ReminderData | null;
    targetDateTime: string;
  } | null>(null);

  function handleDragStart(e: DragStartEvent) {
    isDragOrResizeInProgressRef.current = true;
    setActiveDragId(String(e.active.id));
  }

  async function handleConfirmSingleRecurrence() {
    if (!recurrenceDragState?.reminder || !recurrenceDragState?.targetDateTime) return;
    const rem = recurrenceDragState.reminder;
    const targetDt = recurrenceDragState.targetDateTime;

    try {
      await upsertReminderFn({
        data: {
          title: rem.title,
          content: rem.content || "",
          color: rem.color,
          date_time: targetDt,
          recurrence_type: "none",
          recurrence_interval: 1,
          is_completed: false,
        },
      });
      toast.success("Lembrete desta ocorrência movido!");
      qc.invalidateQueries({ queryKey: ["reminders"] });
    } catch (err: any) {
      toast.error("Erro ao mover ocorrência");
    } finally {
      setRecurrenceDragState(null);
    }
  }

  async function handleConfirmSeriesRecurrence() {
    if (!recurrenceDragState?.reminder || !recurrenceDragState?.targetDateTime) return;
    const rem = recurrenceDragState.reminder;
    const targetDt = recurrenceDragState.targetDateTime;

    try {
      await upsertReminderFn({
        data: {
          id: rem.id,
          title: rem.title,
          content: rem.content || "",
          color: rem.color,
          date_time: targetDt,
          recurrence_type: rem.recurrence_type,
          recurrence_interval: rem.recurrence_interval || 1,
          recurrence_end_date: rem.recurrence_end_date,
          is_completed: rem.is_completed || false,
        },
      });
      toast.success("Toda a série de lembretes foi movida!");
      qc.invalidateQueries({ queryKey: ["reminders"] });
    } catch (err: any) {
      toast.error("Erro ao mover série de lembretes");
    } finally {
      setRecurrenceDragState(null);
    }
  }

function getDemandDurationHours(demand: any): number {
  if (demand.estimated_hours) {
    const num = Number(demand.estimated_hours);
    if (!isNaN(num) && num > 0) return num;
  }
  return 1.0;
}

function blockSlots(startDate: Date, durationHours: number, takenSlots: Set<string>) {
  const slotCount = Math.ceil(durationHours / 0.5);
  const cursor = new Date(startDate);
  for (let i = 0; i < slotCount; i++) {
    const hStr = String(cursor.getHours()).padStart(2, "0");
    const mStr = String(cursor.getMinutes() >= 30 ? 30 : 0).padStart(2, "0");
    const key = `${toISO(cursor)}_${hStr}_${mStr}`;
    takenSlots.add(key);
    cursor.setMinutes(cursor.getMinutes() + 30);
  }
}

function areSlotsFree(startDate: Date, durationHours: number, takenSlots: Set<string>): boolean {
  const slotCount = Math.ceil(durationHours / 0.5);
  const cursor = new Date(startDate);
  for (let i = 0; i < slotCount; i++) {
    const hStr = String(cursor.getHours()).padStart(2, "0");
    const mStr = String(cursor.getMinutes() >= 30 ? 30 : 0).padStart(2, "0");
    const key = `${toISO(cursor)}_${hStr}_${mStr}`;
    if (takenSlots.has(key)) return false;
    cursor.setMinutes(cursor.getMinutes() + 30);
  }
  return true;
}

  function calculateCascadingPushDown(
    droppedDemandId: string,
    targetDate: Date,
    allDemands: AgendaDemand[],
    cfg: SchedulingConfig
  ): { id: string; due_date: string; is_manually_scheduled?: boolean }[] {
    const updates: { id: string; due_date: string; is_manually_scheduled?: boolean }[] = [];
    const droppedDemand = allDemands.find((d) => d.id === droppedDemandId);
    if (!droppedDemand) return updates;

    const droppedDurationHours = getDemandDurationHours(droppedDemand);
    const formattedDroppedDate = formatTzString(targetDate);

    // 1. Position the manually dropped demand at targetDate
    updates.push({
      id: droppedDemandId,
      due_date: formattedDroppedDate,
      is_manually_scheduled: true,
    });

    const droppedEnd = addHours(targetDate, droppedDurationHours);

    // 2. Block all fixed Meetings in takenSlots so they are NEVER moved or overwritten
    const takenSlots = new Set<string>();
    for (const meeting of meetings) {
      if (meeting.due_date) {
        const mStart = safeParseDate(meeting.due_date);
        const mDur = meeting.estimated_hours ? Number(meeting.estimated_hours) : 1.0;
        blockSlots(mStart, mDur, takenSlots);
      }
    }

    // 3. Block the dropped demand's slot
    blockSlots(targetDate, droppedDurationHours, takenSlots);

    // 4. Collect active demands to reschedule
    const activeDemands = allDemands.filter((d) => {
      if (d.id === droppedDemandId) return false;
      if (d.status === "concluido" || d.status === "para_analise" || d.status === "rascunho") return false;
      if (!d.due_date) return false;
      return true;
    });

    // Block active demands that were scheduled BEFORE targetDate
    for (const d of activeDemands) {
      if (d.due_date) {
        const dt = safeParseDate(d.due_date);
        if (dt.getTime() < targetDate.getTime()) {
          const dur = getDemandDurationHours(d);
          blockSlots(dt, dur, takenSlots);
        }
      }
    }

    // Filter demands that need to be re-allocated in the cascade (demands at or after targetDate)
    const demandsToCascade = activeDemands.filter((d) => {
      if (!d.due_date) return false;
      const dt = safeParseDate(d.due_date);
      const dur = getDemandDurationHours(d);
      const dEnd = addHours(dt, dur);
      return rangesOverlap(targetDate, droppedEnd, dt, dEnd) || dt.getTime() >= targetDate.getTime();
    });

    demandsToCascade.sort((a, b) => {
      const dtA = safeParseDate(a.due_date!).getTime();
      const dtB = safeParseDate(b.due_date!).getTime();
      return dtA - dtB;
    });

    // 5. Cascade allocation cursor starts right after droppedDemand
    let search = new Date(droppedEnd);
    if (!isValidSlot(search, cfg)) {
      search = getNextSlot(search, cfg);
    }

    for (const d of demandsToCascade) {
      const dur = getDemandDurationHours(d);
      let safety = 0;

      while (safety < 2000) {
        if (isValidSlot(search, cfg) && areSlotsFree(search, dur, takenSlots)) {
          const newSlotStr = formatTzString(search);
          if (newSlotStr !== d.due_date) {
            updates.push({
              id: d.id,
              due_date: newSlotStr,
              is_manually_scheduled: false,
            });
          }
          blockSlots(search, dur, takenSlots);
          search = addHours(search, dur);
          if (!isValidSlot(search, cfg)) {
            search = getNextSlot(search, cfg);
          }
          break;
        }
        search = getNextSlot(search, cfg);
        safety++;
      }
    }

    return updates;
  }

  async function handleDragEnd(e: DragEndEvent) {
    setActiveDragId(null);
    setTimeout(() => {
      isDragOrResizeInProgressRef.current = false;
    }, 250);

    const { active } = e;
    const targetSlotId = getSlotIdFromDragEnd(e);
    if (!targetSlotId) return;

    const activeIdStr = String(active.id);
    const targetDate = parseSlotId(targetSlotId);
    if (!targetDate) return;

    if (activeIdStr.startsWith("reminder:")) {
      const parts = activeIdStr.split(":");
      const reminderId = parts[1];
      const rem = reminders.find((r) => (r as any).id === reminderId) as any;
      if (!rem) return;

      const formattedTarget = formatTzString(targetDate);

      if (rem.recurrence_type && rem.recurrence_type !== "none") {
        setRecurrenceDragState({
          open: true,
          reminder: rem as ReminderData,
          targetDateTime: formattedTarget,
        });
      } else {
        qc.setQueryData<any>(["reminders", activeUserId], (prev: any) =>
          (prev ?? []).map((r: any) => (r.id === reminderId ? { ...r, date_time: formattedTarget } : r))
        );
        try {
          await upsertReminderFn({
            data: {
              id: rem.id,
              title: rem.title,
              content: rem.content || "",
              color: (rem.color as any) || "yellow",
              date_time: formattedTarget,
              recurrence_type: rem.recurrence_type as any,
              recurrence_interval: rem.recurrence_interval || 1,
              recurrence_end_date: rem.recurrence_end_date,
              is_completed: rem.is_completed || false,
            },
          });
          toast.success("Lembrete reagendado!");
          qc.invalidateQueries({ queryKey: ["reminders"] });
        } catch (err) {
          toast.error("Erro ao reagendar lembrete");
          qc.invalidateQueries({ queryKey: ["reminders"] });
        }
      }
      return;
    }

    const targetEnd = addHours(targetDate, 1);
    for (const meeting of meetings) {
      const meetingStart = new Date(meeting.due_date);
      const meetingEnd = addHours(meetingStart, meeting.estimated_hours || 1);
      if (rangesOverlap(targetDate, targetEnd, meetingStart, meetingEnd)) {
        return { ok: false as const, message: `Horário ocupado pela reunião “${meeting.title}”. Escolha um intervalo livre.` };
      }
    }

    if (activeIdStr.startsWith("meeting:")) {
      const meetingId = activeIdStr.slice("meeting:".length);
      const meeting = meetings.find((item) => item.id === meetingId);
      if (!meeting) return;

      const nextDate = targetDate.toISOString();
      qc.setQueryData<Meeting[]>(["meetings", targetAgendaUserId], (previous) =>
        (previous || []).map((item) => item.id === meetingId ? { ...item, due_date: nextDate } : item)
      );

      try {
        await upsertMeetingFn({
          data: {
            id: meeting.id,
            client_id: meeting.client_id || null,
            title: meeting.title,
            due_date: nextDate,
            estimated_hours: meeting.estimated_hours,
            notes: meeting.notes || "",
            transcript: meeting.transcript || "",
            ai_summary: meeting.ai_summary || "",
            audio_url: meeting.audio_url || null,
            assignee_user_id: meeting.assignee_user_id || targetAgendaUserId,
          },
        });
        toast.success("Reunião reagendada!");
        qc.invalidateQueries({ queryKey: ["meetings"] });
      } catch (err) {
        toast.error("Erro ao reagendar reunião.");
        qc.invalidateQueries({ queryKey: ["meetings"] });
      }
      return;
    }

    const demandId = activeIdStr.replace(/^pill_demand:/, "");

    const conflict = findSchedulingConflict(demandId, targetDate);
    if (!conflict.ok) {
      toast.error(conflict.message);
      return;
    }

    const updates = calculateCascadingPushDown(demandId, targetDate, demands as AgendaDemand[], config);
    if (updates.length === 0) return;

    qc.setQueryData<typeof demands>(["demands", targetAgendaUserId, isAdminOrOwner], (prev) => {
      const updateMap = new Map(updates.map(u => [u.id, u]));
      return (prev ?? []).map((d) => {
        const patch = updateMap.get(d.id);
        if (patch) {
          return {
            ...d,
            due_date: patch.due_date,
            is_manually_scheduled: patch.is_manually_scheduled ?? d.is_manually_scheduled,
          } as any;
        }
        return d;
      });
    });

    try {
      await batchUpdateFn({ data: { updates } });
      toast.success(updates.length > 1 ? "Demanda posicionada! Agenda reajustada com sucesso." : "Demanda posicionada!");
      qc.invalidateQueries({ queryKey: ["demands"] });
    } catch (err) {
      toast.error("Erro ao reagendar demanda");
      qc.invalidateQueries({ queryKey: ["demands"] });
    }
  }

  const activeDragDemand = useMemo(() => {
    if (!activeDragId || activeDragId.startsWith("reminder:") || activeDragId.startsWith("meeting:")) return null;
    const realId = activeDragId.startsWith("pill_demand:") ? activeDragId.replace("pill_demand:", "") : activeDragId;
    const demand = demands.find((d) => d.id === realId) as AgendaDemand | undefined;
    if (!demand) return null;
    return { ...demand, due_date: getEffectiveDueDate(demand) };
  }, [activeDragId, demands, scheduledMap]);

  const activeDragReminder = useMemo(() => {
    if (!activeDragId || !activeDragId.startsWith("reminder:")) return null;
    const remId = activeDragId.split(":")[1];
    return (reminders.find((r) => (r as any).id === remId) as any) || null;
  }, [activeDragId, reminders]);

  const activeDragMeeting = useMemo(() => {
    if (!activeDragId?.startsWith("meeting:")) return null;
    return meetings.find((meeting) => meeting.id === activeDragId.slice("meeting:".length)) || null;
  }, [activeDragId, meetings]);

  async function handleSaveReminder(data: ReminderData) {
    try {
      await upsertReminderFn({ data });
      toast.success("Lembrete salvo com sucesso!");
      qc.invalidateQueries({ queryKey: ["reminders"] });
    } catch (err: any) {
      toast.error(err?.message || "Erro ao salvar lembrete");
    }
  }

  async function handleCompleteReminder(id: string) {
    try {
      await completeReminderFn({ data: { id } });
      toast.success("Lembrete concluído!");
      qc.invalidateQueries({ queryKey: ["reminders"] });
    } catch (err: any) {
      toast.error(err?.message || "Erro ao concluir lembrete");
    }
  }

  async function handleDeleteReminder(id: string) {
    try {
      await deleteReminderFn({ data: { id } });
      toast.success("Lembrete removido!");
      qc.invalidateQueries({ queryKey: ["reminders"] });
    } catch (err: any) {
      toast.error(err?.message || "Erro ao remover lembrete");
    }
  }

  function handleSlotClick(iso: string, hour: number, minute: number) {
    if (isDragOrResizeInProgressRef.current) return;
    const slotIso = `${iso}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    setSelectedSlotDateTime(slotIso);
    setSlotModalOpen(true);
  }

  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToCurrentTime = useCallback(() => {
    requestAnimationFrame(() => {
      setTimeout(() => {
        if (scrollRef.current && viewMode !== "month") {
          const now = new Date();
          const currentHourDecimal = now.getHours() + now.getMinutes() / 60;
          // Scroll to ~1.5 hours before current time so current time line is in view
          const targetHour = Math.max(0, currentHourDecimal - 1.5);
          const top = Math.round(targetHour * 80);
          scrollRef.current.scrollTop = top;
        }
      }, 60);
    });
  }, [viewMode]);

  useEffect(() => {
    if (!demandsLoading) {
      scrollToCurrentTime();
    }
  }, [viewMode, demandsLoading, scrollToCurrentTime]);

  const clientsForOverlay = useMemo(() => {
    return allClients.map((c: any) => ({ id: c.id, name: c.name }));
  }, [allClients]);

  if (demandsLoading) return <LoadingSpinner />;

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
                    onClick={() => overlay.openNew(
                      clientsForOverlay,
                      undefined,
                      "nao_iniciado",
                      undefined,
                      isAdminOrOwner && activeUserId ? activeUserId : undefined,
                      `${iso}T12:00:00`,
                      1.0
                    )}
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
                const summary = daySummaryDemands.get(iso);
                return (
                  <div key={iso} className="flex-1 text-center py-1.5 border-l border-border/40 min-w-[120px] flex flex-col items-center">
                    <div className="text-[10px] font-bold text-muted-foreground tracking-wider">
                      {viewMode === "day" ? WEEKDAY_NAMES[day.getDay()] : DAYS_SHORT[day.getDay()]}
                    </div>
                    <div className={cn(
                      "mx-auto mt-0.5 h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold",
                      isToday ? "bg-primary text-primary-foreground font-black" : "text-foreground"
                    )}>
                      {day.getDate()}
                    </div>
                    {summary && (summary.concluida.length > 0 || summary.para_analise.length > 0 || (summary.com_ajustes && summary.com_ajustes.length > 0) || (summary.sem_responsavel && summary.sem_responsavel.length > 0)) && (
                      <DaySummaryPill
                        summary={summary}
                        isDraggingActive={!!activeDragId}
                        onOpenDemand={(id) => overlay.open(id, clientsForOverlay)}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Scrollable grid */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto">
              <div className="flex relative">
                
                {/* Hour labels */}
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
                  const currentSecond = today.getSeconds();
                  const timePointerTopPx = ((currentHour * 3600 + currentMinute * 60 + currentSecond) / 3600) * 80;

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
                        const remindersInSlot = remindersBySlot.get(slotKey) || [];
                        const meetingsInSlot = meetingsBySlot.get(slotKey) || [];
                        const isBusiness = isValidSlot(new Date(`${iso}T${hStr}:${mStr}:00`), config);

                        return (
                          <DroppableHourCell
                            key={index}
                            id={`slot_${iso}_${hStr}_${mStr}`}
                            isBusiness={isBusiness}
                            onClick={() => handleSlotClick(iso, slot.h, slot.m)}
                          >
                            {demand && (
                              <DraggableDemandCard
                                demand={demand}
                                onResize={handleResizeDemand}
                                onTogglePin={handleTogglePin}
                                onClick={() => {
                                  const dAny = demand as any;
                                  if (dAny.internal_notes && dAny.internal_notes.includes('"is_meeting":true')) {
                                    let parsedPayload: any = {};
                                    try { parsedPayload = JSON.parse(dAny.internal_notes); } catch {}
                                    setSelectedMeeting({
                                      id: demand.id,
                                      client_id: dAny.client_id,
                                      title: demand.title,
                                      due_date: demand.due_date || "",
                                      estimated_hours: demand.estimated_hours ? Number(demand.estimated_hours) : 1.0,
                                      notes: parsedPayload.notes || "",
                                      audio_url: parsedPayload.audio_url || null,
                                      ai_summary: parsedPayload.ai_summary || null,
                                    });
                                    setMeetingDialogOpen(true);
                                  } else {
                                    overlay.open(demand.id, clientsForOverlay);
                                  }
                                }}
                                isDragOrResizeRef={isDragOrResizeInProgressRef}
                              />
                            )}

                            {meetingsInSlot.map((meeting) => (
                              <DraggableMeetingCard
                                key={meeting.id}
                                meeting={meeting}
                                onClick={() => {
                                  setSelectedMeeting(meeting);
                                  setSelectedSlotDateTime("");
                                  setMeetingDialogOpen(true);
                                }}
                                hasDemandInSlot={!!demand}
                              />
                            ))}

                            {remindersInSlot.map((rem) => (
                              <DraggableReminderCard
                                key={`${rem.id}_${slotKey}`}
                                reminder={rem}
                                slotDateTime={`${iso}T${hStr}:${mStr}:00`}
                                hasDemandInSlot={!!demand}
                                onClick={() => {
                                  setEditingReminder(rem);
                                  setReminderDialogOpen(true);
                                }}
                                onComplete={() => handleCompleteReminder(rem.id!)}
                              />
                            ))}
                          </DroppableHourCell>
                        );
                      })}

                      {/* Time pointer */}
                      {isToday && (
                        <div
                          className="absolute left-0 right-0 z-20 pointer-events-none transition-all duration-500 ease-out"
                          style={{ top: `${timePointerTopPx}px` }}
                        >
                          <div className="relative flex items-center">
                            <div className="h-2.5 w-2.5 rounded-full bg-red-500 -ml-1 shrink-0 shadow-sm shadow-red-500/50" />
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

        <DragOverlay dropAnimation={null} className="pointer-events-none z-50">
          {activeDragDemand ? (
            <AgendaDemandCardPreview demand={activeDragDemand} />
          ) : activeDragReminder ? (
            <ReminderPostItCardPreview reminder={activeDragReminder} />
          ) : activeDragMeeting ? (
            <MeetingCardPreview meeting={activeDragMeeting} />
          ) : null}
        </DragOverlay>

        {/* Slot choice modal (Nova Demanda, Nova Reunião, Adicionar Lembrete) */}
        <AgendaSlotModal
          open={slotModalOpen}
          onOpenChange={setSlotModalOpen}
          slotDateTime={selectedSlotDateTime}
          onCreateDemand={() => {
            overlay.openNew(
              clientsForOverlay,
              undefined,
              "nao_iniciado",
              undefined,
              isAdminOrOwner && activeUserId ? activeUserId : undefined,
              selectedSlotDateTime,
              1.0
            );
          }}
          onCreateMeeting={() => {
            setSelectedMeeting(null);
            setMeetingDialogOpen(true);
          }}
          onCreateReminder={() => {
            setEditingReminder({
              date_time: selectedSlotDateTime,
              color: "yellow",
              recurrence_type: "none",
            });
            setReminderDialogOpen(true);
          }}
        />

        {/* Meeting Dialog */}
        <MeetingDialog
          open={meetingDialogOpen}
          onOpenChange={setMeetingDialogOpen}
          meeting={selectedMeeting}
        defaultSlotDateTime={selectedSlotDateTime}
        defaultAssigneeId={targetAgendaUserId || undefined}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ["meetings"] });
            qc.invalidateQueries({ queryKey: ["demands"] });
          }}
        />

        {/* Reminder dialog */}
        <ReminderDialog
          open={reminderDialogOpen}
          onOpenChange={setReminderDialogOpen}
          initialData={editingReminder}
          onSave={handleSaveReminder}
          onDelete={handleDeleteReminder}
          onComplete={handleCompleteReminder}
        />

        {/* Recurrence drag modal */}
        {recurrenceDragState && (
          <RecurrenceDragModal
            open={recurrenceDragState.open}
            onOpenChange={(op) => !op && setRecurrenceDragState(null)}
            reminderTitle={recurrenceDragState.reminder?.title || ""}
            onConfirmSingle={handleConfirmSingleRecurrence}
            onConfirmSeries={handleConfirmSeriesRecurrence}
          />
        )}

      </div>
    </DndContext>
  );
}

function DroppableHourCell({
  id,
  isBusiness,
  onClick,
  children,
}: {
  id: string;
  isBusiness: boolean;
  onClick?: (e: React.MouseEvent) => void;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      data-agenda-slot-id={id}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest("[data-demand-card]") || target.closest("[data-reminder-card]")) {
          return;
        }
        if (onClick) onClick(e);
      }}
      className={cn(
        "h-10 border-t border-border/15 p-0.5 relative transition-colors duration-150 cursor-pointer hover:bg-white/5",
        !isBusiness && "bg-muted/30 opacity-70",
        isOver && (isBusiness ? "bg-primary/25 border-t-primary" : "bg-red-500/10 border-t-red-700")
      )}
    >
      {children}
    </div>
  );
}

function DraggablePillItem({
  demand,
  onOpenDemand,
}: {
  demand: AgendaDemand;
  onOpenDemand: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `pill_demand:${demand.id}`,
  });

  const isUnassigned = !(demand as any).assignee_user_id;

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        if (isDragging) return;
        e.stopPropagation();
        onOpenDemand(demand.id);
      }}
      className={cn(
        "p-2 rounded-lg text-xs cursor-grab active:cursor-grabbing transition-colors flex items-center justify-between group select-none",
        isUnassigned ? "bg-[#25282c] hover:bg-[#2e3238] border border-slate-500/40" :
        demand.status === "com_ajustes" ? "bg-[#33261a] hover:bg-[#402f20] border border-amber-500/40" :
        demand.status === "para_analise" ? "bg-[#2a2433] hover:bg-[#342b40] border border-purple-500/30" :
        "bg-[#1a2820] hover:bg-[#203328] border border-emerald-500/30",
        isDragging && "opacity-40"
      )}
    >
      <div className="min-w-0 flex-1">
        <p className={cn(
          "font-semibold truncate",
          isUnassigned ? "text-slate-200" :
          demand.status === "com_ajustes" ? "text-amber-200" :
          demand.status === "para_analise" ? "text-purple-200" : "text-emerald-200 line-through"
        )}>
          {demand.title}
        </p>
        <div className="flex items-center justify-between text-[10px] mt-0.5 font-medium">
          {isUnassigned ? (
            <span className="text-slate-400 flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
              Sem Responsável
            </span>
          ) : demand.status === "com_ajustes" ? (
            <span className="text-amber-400 flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              Com Ajuste
            </span>
          ) : demand.status === "para_analise" ? (
            <span className="text-purple-400 flex items-center gap-1">
              <Clock className="h-3 w-3 shrink-0" />
              Em Análise
            </span>
          ) : (
            <span className="text-emerald-400 flex items-center gap-1">
              <Check className="h-3 w-3 shrink-0 stroke-[2.5]" />
              Concluída
            </span>
          )}
          <span className="text-muted-foreground/75 text-[9px] truncate ml-2">{demand.clients?.name ?? ""}</span>
        </div>
      </div>
    </div>
  );
}

function DaySummaryPill({
  summary,
  isDraggingActive,
  onOpenDemand,
}: {
  summary: {
    concluida: AgendaDemand[];
    para_analise: AgendaDemand[];
    com_ajustes?: AgendaDemand[];
    sem_responsavel?: AgendaDemand[];
  };
  isDraggingActive?: boolean;
  onOpenDemand: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const comAjustesList = summary.com_ajustes || [];
  const semResponsavelList = summary.sem_responsavel || [];
  const totalCount = summary.concluida.length + summary.para_analise.length + comAjustesList.length + semResponsavelList.length;
  if (totalCount === 0) return null;

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="mt-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-[#222222] hover:bg-[#2a2a2a] text-foreground border border-white/10 flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer truncate max-w-[95%]"
          title="Ver demandas fora da grade do dia"
        >
          {semResponsavelList.length > 0 && (
            <span className="flex items-center gap-1 text-slate-300 font-semibold truncate">
              <span className="h-2 w-2 rounded-full bg-slate-400 shrink-0" />
              <span>{semResponsavelList.length} sem resp.</span>
            </span>
          )}

          {semResponsavelList.length > 0 && (comAjustesList.length > 0 || summary.concluida.length > 0 || summary.para_analise.length > 0) && (
            <span className="text-white/20 text-[9px]">•</span>
          )}

          {comAjustesList.length > 0 && (
            <span className="flex items-center gap-1 text-amber-400 font-semibold truncate">
              <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0 animate-pulse" />
              <span>{comAjustesList.length} {comAjustesList.length === 1 ? "com ajuste" : "com ajustes"}</span>
            </span>
          )}

          {comAjustesList.length > 0 && (summary.concluida.length > 0 || summary.para_analise.length > 0) && (
            <span className="text-white/20 text-[9px]">•</span>
          )}

          {summary.para_analise.length > 0 && (
            <span className="flex items-center gap-1 text-purple-400 font-semibold truncate">
              <Clock className="h-3 w-3 text-purple-400 shrink-0 stroke-[2.5]" />
              <span>{summary.para_analise.length} em análise</span>
            </span>
          )}

          {summary.para_analise.length > 0 && summary.concluida.length > 0 && (
            <span className="text-white/20 text-[9px]">•</span>
          )}

          {summary.concluida.length > 0 && (
            <span className="flex items-center gap-1 text-emerald-400 font-semibold truncate">
              <Check className="h-3 w-3 text-emerald-400 shrink-0 stroke-[2.5]" />
              <span>{summary.concluida.length} {summary.concluida.length === 1 ? "concluído" : "concluídos"}</span>
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="center"
        className={cn(
          "w-64 p-3 bg-[#222222] border border-white/10 text-foreground rounded-xl shadow-2xl space-y-2.5 z-50 transition-opacity duration-150",
          isDraggingActive && "opacity-0 pointer-events-none"
        )}
      >
        <div className="flex items-center justify-between border-b border-white/10 pb-1.5 px-0.5">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Fora da Grade (Arrastável)</p>
          <span className="text-[10px] text-muted-foreground font-medium">{totalCount} no total</span>
        </div>
        <div className="space-y-1.5 max-h-56 overflow-y-auto pr-0.5 scrollbar-thin">
          {semResponsavelList.map((d) => (
            <DraggablePillItem
              key={d.id}
              demand={d}
              onOpenDemand={(id) => {
                setOpen(false);
                onOpenDemand(id);
              }}
            />
          ))}
          {comAjustesList.map((d) => (
            <DraggablePillItem
              key={d.id}
              demand={d}
              onOpenDemand={(id) => {
                setOpen(false);
                onOpenDemand(id);
              }}
            />
          ))}
          {summary.para_analise.map((d) => (
            <DraggablePillItem
              key={d.id}
              demand={d}
              onOpenDemand={(id) => {
                setOpen(false);
                onOpenDemand(id);
              }}
            />
          ))}
          {summary.concluida.map((d) => (
            <DraggablePillItem
              key={d.id}
              demand={d}
              onOpenDemand={(id) => {
                setOpen(false);
                onOpenDemand(id);
              }}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function DraggableMeetingCard({
  meeting,
  onClick,
  hasDemandInSlot,
}: {
  meeting: Meeting;
  onClick: () => void;
  hasDemandInSlot?: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `meeting:${meeting.id}`,
  });

  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        if (!isDragging) onClick();
      }}
      className={cn(
        "relative z-10 mt-1 w-full cursor-grab rounded-md border-l-4 border-l-purple-500 bg-purple-600/90 px-2 py-1 text-left text-white shadow-sm hover:bg-purple-500 active:cursor-grabbing",
        hasDemandInSlot && "ml-1 w-[calc(100%-0.25rem)]",
        isDragging && "opacity-30"
      )}
      style={{ minHeight: `${Math.max(32, meeting.estimated_hours * 80 - 4)}px` }}
    >
      <span className="flex items-center gap-1 text-[10px] font-bold"><Video className="h-3 w-3" /> {meeting.title}</span>
      <span className="block truncate text-[9px] text-purple-100">{meeting.clients?.name || "Reunião avulsa"}</span>
    </button>
  );
}

function MeetingCardPreview({ meeting }: { meeting: Meeting }) {
  return (
    <div
      className="w-[180px] rounded-md border-l-4 border-l-purple-500 bg-purple-600 px-2 py-1 text-white shadow-2xl"
      style={{ minHeight: `${Math.max(32, meeting.estimated_hours * 80 - 4)}px` }}
    >
      <span className="flex items-center gap-1 text-[10px] font-bold"><Video className="h-3 w-3" /> {meeting.title}</span>
      <span className="block truncate text-[9px] text-purple-100">{meeting.clients?.name || "Reunião avulsa"}</span>
    </div>
  );
}

function DraggableReminderCard({
  reminder,
  slotDateTime,
  hasDemandInSlot,
  onClick,
  onComplete,
}: {
  reminder: ReminderData;
  slotDateTime: string;
  hasDemandInSlot?: boolean;
  onClick: () => void;
  onComplete: () => void;
}) {
  const dragId = `reminder:${reminder.id}:${slotDateTime}`;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: dragId,
  });

  const formattedTitle = useMemo(() => {
    const raw = reminder.title.trim();
    return raw.length > 15 ? `${raw.slice(0, 15)}...` : raw;
  }, [reminder.title]);

  const COLOR_TAG: Record<string, { bg: string; border: string; text: string; dot: string }> = {
    yellow: { bg: "bg-[#2b2416]", border: "border-[#d4a017]", text: "text-amber-300", dot: "bg-[#d4a017]" },
    blue:   { bg: "bg-[#162436]", border: "border-[#2383e2]", text: "text-blue-300",  dot: "bg-[#2383e2]" },
    green:  { bg: "bg-[#14291c]", border: "border-[#0f9d58]", text: "text-emerald-300", dot: "bg-[#0f9d58]" },
    purple: { bg: "bg-[#27182e]", border: "border-[#ab47bc]", text: "text-purple-300", dot: "bg-[#ab47bc]" },
    gray:   { bg: "bg-[#222222]", border: "border-[#666666]", text: "text-zinc-300",  dot: "bg-[#888888]" },
  };

  const style = COLOR_TAG[reminder.color] || COLOR_TAG.yellow;

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      data-reminder-card="true"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={cn(
        "z-30 h-5.5 px-2 rounded-full border text-[9.5px] font-bold shadow-md select-none flex items-center gap-1.5 cursor-grab active:cursor-grabbing hover:scale-105 transition-all truncate max-w-[120px]",
        hasDemandInSlot ? "absolute top-1 right-1" : "relative my-1 float-right",
        style.bg,
        style.border,
        style.text,
        isDragging && "opacity-40 scale-95 shadow-2xl rotate-2 z-50"
      )}
      title={`Lembrete: ${reminder.title}`}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full shrink-0 animate-pulse", style.dot)} />
      <span className="truncate max-w-[90px]">{formattedTitle}</span>
      {reminder.recurrence_type && reminder.recurrence_type !== "none" && (
        <span className="text-[8px] opacity-75 shrink-0" title="Recorrente">↻</span>
      )}
    </div>
  );
}

function ReminderPostItCardPreview({ reminder }: { reminder: ReminderData }) {
  const formattedTitle = useMemo(() => {
    const raw = reminder.title.trim();
    return raw.length > 15 ? `${raw.slice(0, 15)}...` : raw;
  }, [reminder.title]);

  const COLOR_TAG: Record<string, { bg: string; border: string; text: string; dot: string }> = {
    yellow: { bg: "bg-[#2b2416]", border: "border-[#d4a017]", text: "text-amber-300", dot: "bg-[#d4a017]" },
    blue:   { bg: "bg-[#162436]", border: "border-[#2383e2]", text: "text-blue-300",  dot: "bg-[#2383e2]" },
    green:  { bg: "bg-[#14291c]", border: "border-[#0f9d58]", text: "text-emerald-300", dot: "bg-[#0f9d58]" },
    purple: { bg: "bg-[#27182e]", border: "border-[#ab47bc]", text: "text-purple-300", dot: "bg-[#ab47bc]" },
    gray:   { bg: "bg-[#222222]", border: "border-[#666666]", text: "text-zinc-300",  dot: "bg-[#888888]" },
  };
  const style = COLOR_TAG[reminder.color] || COLOR_TAG.yellow;

  return (
    <div
      className={cn(
        "h-5.5 px-2 rounded-full border text-[9.5px] font-bold shadow-2xl select-none flex items-center gap-1.5 opacity-95 max-w-[120px]",
        style.bg,
        style.border,
        style.text
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", style.dot)} />
      <span className="truncate max-w-[90px]">{formattedTitle}</span>
    </div>
  );
}

function RecurrenceDragModal({
  open,
  onOpenChange,
  reminderTitle,
  onConfirmSingle,
  onConfirmSeries,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reminderTitle: string;
  onConfirmSingle: () => void;
  onConfirmSeries: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px] p-5 bg-[#202020] border border-white/10 text-foreground rounded-2xl shadow-2xl space-y-4 [&>button.absolute]:hidden z-50">
        <DialogHeader>
          <DialogTitle className="text-sm font-bold text-foreground flex items-center gap-2">
            <Repeat className="h-4 w-4 text-amber-400" />
            <span>Mover Lembrete Recorrente</span>
          </DialogTitle>
          <p className="text-xs text-muted-foreground pt-1">
            O lembrete <strong className="text-foreground">“{reminderTitle}”</strong> faz parte de uma série recorrente. Como deseja aplicar a mudança de horário?
          </p>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-2 pt-1">
          <button
            type="button"
            onClick={() => {
              onOpenChange(false);
              onConfirmSingle();
            }}
            className="flex flex-col p-3 rounded-xl border border-white/10 bg-[#262626] hover:bg-[#2e2e2e] hover:border-amber-400/40 transition-all text-left cursor-pointer group"
          >
            <span className="text-xs font-bold text-foreground group-hover:text-amber-400 transition-colors">Apenas esta ocorrência</span>
            <span className="text-[11px] text-muted-foreground">Mover somente o lembrete deste dia para o novo horário</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onOpenChange(false);
              onConfirmSeries();
            }}
            className="flex flex-col p-3 rounded-xl border border-white/10 bg-[#262626] hover:bg-[#2e2e2e] hover:border-primary/40 transition-all text-left cursor-pointer group"
          >
            <span className="text-xs font-bold text-foreground group-hover:text-primary transition-colors">Todas as próximas ocorrências</span>
            <span className="text-[11px] text-muted-foreground">Atualizar o horário padrão de toda a série recorrente</span>
          </button>
        </div>
      </DialogContent>
    </Dialog>
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
  isDragOrResizeRef,
  now,
}: {
  demand: any;
  now?: Date;
  onClick: () => void;
  onResize: (demandId: string, hours: number) => Promise<void>;
  onTogglePin: (demandId: string, nextValue: boolean) => Promise<void>;
  isDragOrResizeRef?: React.RefObject<boolean>;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: demand.id,
  });

  const [isResizing, setIsResizing] = useState(false);
  const [tempHours, setTempHours] = useState(demand.estimated_hours ? Number(demand.estimated_hours) : 1.0);

  const startResize = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsResizing(true);
    if (isDragOrResizeRef) {
      isDragOrResizeRef.current = true;
    }
    
    const startY = e.clientY;
    const startHours = demand.estimated_hours ? Number(demand.estimated_hours) : 1.0;
    
    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaY = moveEvent.clientY - startY;
      // 1 slot = 40px = 0.5 hours. So 80px = 1 hour.
      const deltaHours = Math.round((deltaY / 80) * 2) / 2; // round to nearest 0.5
      const newHours = Math.max(0.5, startHours + deltaHours);
      setTempHours(newHours);
    };
    
    const handleClickCapture = (clickEvent: MouseEvent) => {
      clickEvent.stopPropagation();
      clickEvent.preventDefault();
    };
    
    const handlePointerUp = async (upEvent: PointerEvent) => {
      upEvent.stopPropagation();
      window.removeEventListener("pointermove", handlePointerMove, { capture: true });
      window.removeEventListener("pointerup", handlePointerUp, { capture: true });
      window.removeEventListener("click", handleClickCapture, { capture: true });
      setIsResizing(false);
      
      const deltaY = upEvent.clientY - startY;
      const deltaHours = Math.round((deltaY / 80) * 2) / 2;
      const finalHours = Math.max(0.5, startHours + deltaHours);
      
      if (finalHours !== startHours) {
        await onResize(demand.id, finalHours);
      }

      setTimeout(() => {
        if (isDragOrResizeRef) {
          isDragOrResizeRef.current = false;
        }
      }, 250);
    };
    
    window.addEventListener("pointermove", handlePointerMove, { capture: true });
    window.addEventListener("pointerup", handlePointerUp, { capture: true });
    window.addEventListener("click", handleClickCapture, { capture: true });
  };

  // Compute if the event time has passed (Google Calendar style transparency)
  const isPast = useMemo(() => {
    if (!demand.due_date) return false;
    const start = new Date(demand.due_date);
    const hours = demand.estimated_hours ? Number(demand.estimated_hours) : 1.0;
    const end = new Date(start.getTime() + hours * 3600 * 1000);
    const currentClock = now || new Date();
    return end < currentClock;
  }, [demand.due_date, demand.estimated_hours, now]);

  // Calculate dynamic card height representing estimated time
  const displayHours = isResizing ? tempHours : (demand.estimated_hours ? Number(demand.estimated_hours) : 1.0);
  const slotsCount = displayHours / 0.5;
  const cardHeight = slotsCount * 40 - 4; // in pixels (each cell = 40px)

  // Compute time range for display under title (e.g. 09:30-10:30)
  const timeRange = useMemo(() => {
    if (!demand.due_date) return null;
    const dateObj = new Date(demand.due_date);
    if (isNaN(dateObj.getTime())) return null;
    const startStr = `${String(dateObj.getHours()).padStart(2, "0")}:${String(dateObj.getMinutes()).padStart(2, "0")}`;
    const endDate = new Date(dateObj.getTime() + displayHours * 3600 * 1000);
    const endStr = `${String(endDate.getHours()).padStart(2, "0")}:${String(endDate.getMinutes()).padStart(2, "0")}`;
    return `(${startStr}-${endStr})`;
  }, [demand.due_date, displayHours]);

  const isMeeting = Boolean((demand as any).internal_notes && (demand as any).internal_notes.includes('"is_meeting":true'));

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
        isMeeting
          ? "bg-[#6b21a8] text-white border-l-purple-300"
          : (STATUS_BG[demand.status] ?? "bg-[#38a1db] text-white"),
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
          <div className="font-semibold truncate leading-tight flex items-center gap-1">
            {isMeeting && <Video className="h-3 w-3 text-purple-200 shrink-0" />}
            <span className="truncate">{demand.title}</span>
          </div>
          {timeRange && (
            <div className="text-[9px] font-semibold opacity-90 truncate leading-tight tracking-tight mt-0.5">
              {timeRange}
            </div>
          )}
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
        onPointerDown={startResize}
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
