/**
 * Utility for prioritized automatic scheduling of demands.
 * Timezone: America/Sao_Paulo (Brasilia) by default.
 */

export interface SchedulingConfig {
  workingDays: number[]; // 0 = Sunday, 1 = Monday, etc. Default [1, 2, 3, 4, 5]
  startHour: number;     // e.g. 9
  endHour: number;       // e.g. 18
  lunchStart: number;    // e.g. 13
  lunchEnd: number;      // e.g. 14
  timezone: string;      // default 'America/Sao_Paulo'
}

export const DEFAULT_CONFIG: SchedulingConfig = {
  workingDays: [1, 2, 3, 4, 5],
  startHour: 9,
  endHour: 18,
  lunchStart: 13,
  lunchEnd: 14,
  timezone: "America/Sao_Paulo"
};

export const PRIORITY_WEIGHT = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1
};

/** Get the current time in the target timezone */
export function getTzTime(timezone = "America/Sao_Paulo"): Date {
  const d = new Date();
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric", month: "numeric", day: "numeric",
      hour: "numeric", minute: "numeric", second: "numeric",
      hour12: false
    });
    const parts = formatter.formatToParts(d);
    const getPart = (type: string) => parseInt(parts.find(p => p.type === type)?.value ?? "0", 10);
    return new Date(
      getPart("year"),
      getPart("month") - 1,
      getPart("day"),
      getPart("hour"),
      getPart("minute"),
      getPart("second")
    );
  } catch (e) {
    return new Date(); // Fallback to local system time
  }
}

/** Check if a specific hour/date is a valid working slot */
export function isValidSlot(date: Date, config: SchedulingConfig): boolean {
  const day = date.getDay();
  if (!config.workingDays.includes(day)) return false;
  
  const hour = date.getHours();
  if (hour < config.startHour || hour >= config.endHour) return false;
  if (hour >= config.lunchStart && hour < config.lunchEnd) return false;
  
  return true;
}

/** Move the date forward to the next valid 30-minute working slot */
export function getNextSlot(date: Date, config: SchedulingConfig): Date {
  const next = new Date(date);
  
  let safety = 0;
  while (safety < 2000) {
    next.setMinutes(next.getMinutes() + 30);
    if (isValidSlot(next, config)) {
      return next;
    }
    safety++;
  }
  return next;
}

/** Helper to convert date to local YYYY-MM-DD string */
function toISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Format a Date object to YYYY-MM-DDTHH:mm:ss with the correct local timezone offset */
export function formatTzString(date: Date): string {
  const tzo = -date.getTimezoneOffset();
  const dif = tzo >= 0 ? "+" : "-";
  const pad = (num: number) => String(Math.floor(Math.abs(num))).padStart(2, "0");
  
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  
  return `${y}-${m}-${d}T${hh}:${mm}:${ss}${dif}${pad(tzo / 60)}:${pad(tzo % 60)}`;
}

/** Parse a date string safely avoiding UTC midnight shifting on YYYY-MM-DD */
export function safeParseDate(dateStr: string): Date {
  if (!dateStr) return new Date();
  
  // If it's a date-only format like YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d, 12, 0, 0); // local noon fallback
  }
  
  const cleaned = dateStr.replace(" ", "T");
  const parsed = new Date(cleaned);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }
  return new Date(dateStr);
}

export interface UnscheduledDemand {
  id: string;
  title: string;
  priority: "low" | "medium" | "high" | "urgent";
  status: string;
  due_date: string | null;
  estimated_hours?: number | null;
  created_at: string;
}

/** Helper to block slots occupied by a demand */
function blockSlots(startDate: Date, durationHours: number, takenSlots: Set<string>) {
  const steps = Math.ceil(durationHours / 0.5);
  const current = new Date(startDate);
  for (let i = 0; i < steps; i++) {
    takenSlots.add(formatTzString(current));
    current.setMinutes(current.getMinutes() + 30);
  }
}

/** Helper to check if slots are free for a demand */
function areSlotsFree(startDate: Date, durationHours: number, takenSlots: Set<string>): boolean {
  const steps = Math.ceil(durationHours / 0.5);
  const current = new Date(startDate);
  for (let i = 0; i < steps; i++) {
    if (takenSlots.has(formatTzString(current))) {
      return false;
    }
    current.setMinutes(current.getMinutes() + 30);
  }
  return true;
}

/**
 * Runs the Prioritized 30-Minute Scheduling Algorithm.
 * 1. Fixed demands (has due_date with time component) are locked first.
 * 2. Day-constrained demands (due_date of 10 chars, YYYY-MM-DD) are scheduled on that day's next free slot.
 * 3. Floating demands (due_date is null) are auto-scheduled in remaining slots.
 */
export function scheduleDemands(
  demands: UnscheduledDemand[],
  config: SchedulingConfig = DEFAULT_CONFIG
): Record<string, string> {
  const active = demands.filter(d => d.status !== "concluido");
  
  // Categorize demands
  const fixed = active.filter(d => d.due_date && d.due_date.length > 10);
  const dayConstrained = active.filter(d => d.due_date && d.due_date.length === 10);
  const floating = active.filter(d => d.due_date === null);
  
  const scheduledTimes: Record<string, string> = {}; // demandId -> ISO string
  const takenSlots = new Set<string>();

  // 1. Lock all fully fixed demands in their requested slots and block their times
  for (const demand of fixed) {
    if (demand.due_date) {
      const parsedDate = safeParseDate(demand.due_date);
      const slotKey = formatTzString(parsedDate);
      scheduledTimes[demand.id] = slotKey;
      
      const duration = demand.estimated_hours ? Number(demand.estimated_hours) : 1.0;
      blockSlots(parsedDate, duration, takenSlots);
    }
  }

  const now = getTzTime(config.timezone);

  // 2. Schedule day-constrained demands (first available slot on their chosen day)
  const sortedDayConstrained = [...dayConstrained].sort((a, b) => {
    const pwA = PRIORITY_WEIGHT[a.priority] ?? 2;
    const pwB = PRIORITY_WEIGHT[b.priority] ?? 2;
    if (pwA !== pwB) return pwB - pwA;
    return a.created_at.localeCompare(b.created_at);
  });

  for (const demand of sortedDayConstrained) {
    const duration = demand.estimated_hours ? Number(demand.estimated_hours) : 1.0;
    const targetDayStr = demand.due_date!; // YYYY-MM-DD
    
    // Start scanning slots on this day from working hours start
    const dayStart = new Date(`${targetDayStr}T${String(config.startHour).padStart(2, "0")}:00:00`);
    
    // If target day is today, start from now (rounded to next 30-min slot)
    let searchStart = new Date(dayStart);
    if (targetDayStr === toISO(now)) {
      const nowSlot = new Date(now);
      const mins = nowSlot.getMinutes();
      if (mins > 0 && mins <= 30) {
        nowSlot.setMinutes(30, 0, 0);
      } else {
        if (mins > 30) {
          nowSlot.setHours(nowSlot.getHours() + 1);
        }
        nowSlot.setMinutes(0, 0, 0);
      }
      if (nowSlot.getTime() > dayStart.getTime()) {
        searchStart = nowSlot;
      }
    }
    
    let currentSearch = new Date(searchStart);
    let scheduled = false;
    let safety = 0;
    
    while (safety < 48) {
      if (currentSearch.getHours() >= config.endHour || toISO(currentSearch) !== targetDayStr) {
        break; // Passed end of working hours or target day
      }
      
      if (isValidSlot(currentSearch, config) && areSlotsFree(currentSearch, duration, takenSlots)) {
        const slotKey = formatTzString(currentSearch);
        scheduledTimes[demand.id] = slotKey;
        blockSlots(currentSearch, duration, takenSlots);
        scheduled = true;
        break;
      }
      
      currentSearch.setMinutes(currentSearch.getMinutes() + 30);
      safety++;
    }
    
    // Fallback if day is fully booked: use searchStart
    if (!scheduled) {
      let fallbackSearch = new Date(dayStart);
      if (targetDayStr === toISO(now)) {
        fallbackSearch = new Date(searchStart);
      }
      const slotKey = formatTzString(fallbackSearch);
      scheduledTimes[demand.id] = slotKey;
      blockSlots(fallbackSearch, duration, takenSlots);
    }
  }

  // 3. Schedule fully floating demands in remaining available future slots
  const sortedFloating = [...floating].sort((a, b) => {
    const pwA = PRIORITY_WEIGHT[a.priority] ?? 2;
    const pwB = PRIORITY_WEIGHT[b.priority] ?? 2;
    if (pwA !== pwB) return pwB - pwA;
    return a.created_at.localeCompare(b.created_at);
  });

  let nextAvailable = new Date(now);
  const mins = nextAvailable.getMinutes();
  if (mins > 0 && mins <= 30) {
    nextAvailable.setMinutes(30, 0, 0);
  } else {
    if (mins > 30) {
      nextAvailable.setHours(nextAvailable.getHours() + 1);
    }
    nextAvailable.setMinutes(0, 0, 0);
  }
  if (!isValidSlot(nextAvailable, config)) {
    nextAvailable = getNextSlot(nextAvailable, config);
  }

  for (const demand of sortedFloating) {
    const duration = demand.estimated_hours ? Number(demand.estimated_hours) : 1.0;
    
    let currentSearch = new Date(nextAvailable);
    let safety = 0;
    while (safety < 2000) {
      if (areSlotsFree(currentSearch, duration, takenSlots) && currentSearch.getTime() > now.getTime()) {
        const slotKey = formatTzString(currentSearch);
        scheduledTimes[demand.id] = slotKey;
        
        blockSlots(currentSearch, duration, takenSlots);
        
        nextAvailable = new Date(currentSearch);
        break;
      }
      currentSearch = getNextSlot(currentSearch, config);
      safety++;
    }
  }

  return scheduledTimes;
}
