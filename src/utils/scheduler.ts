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

/**
 * Retrieves the currently active scheduling config.
 * Checks localStorage if in a browser environment, falls back to DEFAULT_CONFIG.
 */
export function getStoredSchedulingConfig(): SchedulingConfig {
  if (typeof window !== "undefined") {
    try {
      const saved = localStorage.getItem("CreativeFlow_ScheduleConfig");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === "object") {
          return {
            workingDays: Array.isArray(parsed.workingDays) ? parsed.workingDays : DEFAULT_CONFIG.workingDays,
            startHour: typeof parsed.startHour === "number" ? parsed.startHour : DEFAULT_CONFIG.startHour,
            endHour: typeof parsed.endHour === "number" ? parsed.endHour : DEFAULT_CONFIG.endHour,
            lunchStart: typeof parsed.lunchStart === "number" ? parsed.lunchStart : DEFAULT_CONFIG.lunchStart,
            lunchEnd: typeof parsed.lunchEnd === "number" ? parsed.lunchEnd : DEFAULT_CONFIG.lunchEnd,
            timezone: typeof parsed.timezone === "string" ? parsed.timezone : DEFAULT_CONFIG.timezone,
          };
        }
      }
    } catch (e) {
      // Fallback
    }
  }
  return DEFAULT_CONFIG;
}


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
export function toISO(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Builds a standardized Brasília ISO datetime string (UTC-3).
 * Always attaches explicit '-03:00' offset so Supabase/PostgreSQL TIMESTAMPTZ
 * never shifts hours to UTC or local discrepancy.
 */
export function buildBrasiliaIso(dateStr: string, timeStr = "09:00"): string {
  const d = (dateStr || "").slice(0, 10);
  const cleanTime = (timeStr || "09:00").slice(0, 5);
  const t = cleanTime.length === 5 ? cleanTime : "09:00";
  return `${d}T${t}:00-03:00`;
}

/** Format a Date object to YYYY-MM-DDTHH:mm:ss-03:00 with explicit Brasília timezone offset */
export function formatTzString(date: Date): string {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const parts = formatter.formatToParts(date);
    const getVal = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
    const y = getVal("year");
    const m = getVal("month");
    const d = getVal("day");
    let hh = getVal("hour");
    if (hh === "24") hh = "00";
    const mm = getVal("minute");
    const ss = getVal("second");
    return `${y}-${m}-${d}T${hh}:${mm}:${ss}-03:00`;
  } catch (e) {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}-03:00`;
  }
}

/** Parse a date string safely, ensuring strings without timezone are treated as Brasília (-03:00) */
export function safeParseDate(dateStr: string): Date {
  if (!dateStr) return new Date();

  // If it's a date-only format like YYYY-MM-DD
  const dateOnlyMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})(?:T00:00:00(?:\.000)?(?:Z|[+-]\d{2}:\d{2})?)?$/);
  if (dateOnlyMatch) {
    const y = parseInt(dateOnlyMatch[1], 10);
    const m = parseInt(dateOnlyMatch[2], 10);
    const d = parseInt(dateOnlyMatch[3], 10);
    return new Date(y, m - 1, d, 12, 0, 0); // local noon fallback for date-only
  }

  let cleaned = dateStr.replace(" ", "T");
  // If string has no timezone offset (neither Z, nor + nor trailing -HH:MM), treat as Brasília time
  if (!cleaned.includes("Z") && !cleaned.includes("+") && !/[+-]\d{2}:\d{2}$/.test(cleaned)) {
    if (/T\d{2}:\d{2}(:\d{2})?/.test(cleaned)) {
      cleaned = `${cleaned}-03:00`;
    }
  }

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
  is_manually_scheduled?: boolean | null;
  deleted_at?: string | null;
}

/** Helper to block slots occupied by a demand or meeting */
export function blockSlots(startDate: Date, durationHours: number, takenSlots: Set<string>) {
  const steps = Math.ceil(durationHours / 0.5);
  const current = new Date(startDate);
  for (let i = 0; i < steps; i++) {
    takenSlots.add(formatTzString(current));
    current.setMinutes(current.getMinutes() + 30);
  }
}

/** Helper to check if slots are free for a demand */
export function areSlotsFree(startDate: Date, durationHours: number, takenSlots: Set<string>): boolean {
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

/** Check if all slots in the interval are valid working slots and free */
export function areWorkingSlotsFree(
  startDate: Date,
  durationHours: number,
  takenSlots: Set<string>,
  config: SchedulingConfig = DEFAULT_CONFIG
): boolean {
  const steps = Math.ceil(durationHours / 0.5);
  const current = new Date(startDate);
  for (let i = 0; i < steps; i++) {
    if (!isValidSlot(current, config)) return false;
    if (takenSlots.has(formatTzString(current))) return false;
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
  const active = demands.filter(d => !(d as any).deleted_at && (d.status === "nao_iniciado" || d.status === "fazendo" || (d.status === "com_ajustes" && d.is_manually_scheduled)));
  
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

/**
 * Priority-first rescheduler.
 * 1. Manually pinned demands (is_manually_scheduled = true) are locked to their exact slots.
 * 2. Day-targeted demands (has due_date from form modal) are scheduled starting on that target day,
 *    ordered by priority (urgent > high > medium > low), tie-break created_at ASC.
 * 3. Completely floating demands (no due_date) are scheduled in remaining slots from today by priority.
 */
export function scheduleByPriority(
  demands: UnscheduledDemand[],
  config: SchedulingConfig = DEFAULT_CONFIG,
  _fixed: UnscheduledDemand[] = []
): Record<string, string> {
  const active = [..._fixed, ...demands]
    .filter((d) => !(d as any).deleted_at && (d.status === "nao_iniciado" || d.status === "fazendo" || (d.status === "com_ajustes" && d.is_manually_scheduled)))
    .filter((d, i, arr) => arr.findIndex((x) => x.id === d.id) === i);

  // 1) Pinned demands (is_manually_scheduled = true and due_date exists)
  const pinned = active.filter(
    (d) => (d as any).is_manually_scheduled && d.due_date
  );

  // 2) Day-targeted demands (has due_date, but NOT is_manually_scheduled)
  const dayTargeted = active.filter(
    (d) => !((d as any).is_manually_scheduled && d.due_date) && d.due_date
  );

  // 3) Completely floating demands (no due_date at all)
  const floating = active.filter(
    (d) => !d.due_date
  );

  const scheduledTimes: Record<string, string> = {};
  const takenSlots = new Set<string>();

  // 1) Lock pinned demands into their exact slot
  for (const demand of pinned) {
    const parsed = safeParseDate(demand.due_date!);
    const duration = demand.estimated_hours ? Number(demand.estimated_hours) : 1.0;
    scheduledTimes[demand.id] = formatTzString(parsed);
    blockSlots(parsed, duration, takenSlots);
  }

  const now = getTzTime(config.timezone);

  // Priority weight DESC, tie-break created_at ASC (FIFO)
  const compareByPriority = (a: UnscheduledDemand, b: UnscheduledDemand) => {
    const pw = (PRIORITY_WEIGHT[b.priority] ?? 2) - (PRIORITY_WEIGHT[a.priority] ?? 2);
    if (pw !== 0) return pw;
    return (a.created_at ?? "").localeCompare(b.created_at ?? "");
  };

  // 2) Group day-targeted demands by target date string YYYY-MM-DD
  const dayGroups = new Map<string, UnscheduledDemand[]>();
  for (const d of dayTargeted) {
    const parsed = safeParseDate(d.due_date!);
    const dayStr = toISO(parsed);
    const list = dayGroups.get(dayStr) ?? [];
    list.push(d);
    dayGroups.set(dayStr, list);
  }

  // Sort dates chronologically
  const sortedDates = Array.from(dayGroups.keys()).sort();

  for (const dayStr of sortedDates) {
    const groupDemands = dayGroups.get(dayStr)!;
    groupDemands.sort(compareByPriority);

    const [y, m, d] = dayStr.split("-").map(Number);
    const dayStart = new Date(y, m - 1, d, config.startHour, 0, 0);

    let searchCursor = new Date(dayStart);

    if (!isValidSlot(searchCursor, config)) {
      searchCursor = getNextSlot(searchCursor, config);
    }

    for (const demand of groupDemands) {
      const duration = demand.estimated_hours ? Number(demand.estimated_hours) : 1.0;
      let search = new Date(searchCursor);
      let placed: Date | null = null;
      let safety = 0;
      while (safety < 2000) {
        if (isValidSlot(search, config) && areSlotsFree(search, duration, takenSlots)) {
          placed = new Date(search);
          break;
        }
        search = getNextSlot(search, config);
        safety++;
      }

      if (placed) {
        scheduledTimes[demand.id] = formatTzString(placed);
        blockSlots(placed, duration, takenSlots);
      }
    }
  }

  // 3) Schedule completely floating demands (no due_date)
  const sortedFloating = [...floating].sort(compareByPriority);

  let cursor = new Date(now);
  const mins = cursor.getMinutes();
  if (mins > 0 && mins <= 30) cursor.setMinutes(30, 0, 0);
  else {
    if (mins > 30) cursor.setHours(cursor.getHours() + 1);
    cursor.setMinutes(0, 0, 0);
  }
  if (!isValidSlot(cursor, config)) cursor = getNextSlot(cursor, config);

  for (const demand of sortedFloating) {
    const duration = demand.estimated_hours ? Number(demand.estimated_hours) : 1.0;
    let search = new Date(cursor);
    let placed: Date | null = null;
    let safety = 0;
    while (safety < 5000) {
      if (isValidSlot(search, config) && areSlotsFree(search, duration, takenSlots)) {
        placed = new Date(search);
        break;
      }
      search = getNextSlot(search, config);
      safety++;
    }

    if (placed) {
      scheduledTimes[demand.id] = formatTzString(placed);
      blockSlots(placed, duration, takenSlots);
    }
  }

  return scheduledTimes;
}

/** Helper to get next working day YYYY-MM-DD string */
export function getNextWorkingDayStr(startDate: Date, config: SchedulingConfig = DEFAULT_CONFIG): string {
  const next = new Date(startDate);
  next.setDate(next.getDate() + 1);
  let safety = 0;
  while (safety < 30) {
    if (config.workingDays.includes(next.getDay())) {
      return toISO(next);
    }
    next.setDate(next.getDate() + 1);
    safety++;
  }
  return toISO(next);
}

/**
 * Calculates the target date for a demand moved to "com_ajustes" (Com Ajuste).
 * Evaluates whether Today has at least 2.0 hours of unbooked working capacity remaining.
 * - If YES (before 16:00 and >= 2.0 hours free today): returns Today's date string YYYY-MM-DD.
 * - If NO (after 16:00 or < 2.0 hours free today): returns Next Working Day's date string YYYY-MM-DD.
 */
export function getAdjustmentTargetDate(
  allDemands: { due_date: string | null; estimated_hours?: number | null; status: string }[],
  config: SchedulingConfig = DEFAULT_CONFIG
): string {
  const now = getTzTime(config.timezone);
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  const todayStr = toISO(now);

  // Check condition 1: Must be before config.endHour - 2 (e.g., before 16:00)
  const isTimeSuitable = (currentHour + currentMinute / 60) <= (config.endHour - 2);

  if (!isTimeSuitable) {
    return getNextWorkingDayStr(now, config);
  }

  // Check condition 2: Count booked hours for today
  let bookedHoursToday = 0;
  for (const d of allDemands) {
    if ((d as any).deleted_at) continue;
    if (d.status === "concluido" || d.status === "para_analise" || d.status === "rascunho") continue;
    if (d.due_date && d.due_date.slice(0, 10) === todayStr) {
      bookedHoursToday += d.estimated_hours ? Number(d.estimated_hours) : 1.0;
    }
  }

  // Total working hours per day
  const totalWorkingHours = (config.endHour - config.startHour) - (config.lunchEnd - config.lunchStart);
  
  // Remaining working hours from now until endHour
  const remainingWorkdayHours = Math.max(0, config.endHour - Math.max(config.startHour, currentHour + currentMinute / 60));
  
  const freeHoursToday = Math.min(totalWorkingHours - bookedHoursToday, remainingWorkdayHours);

  if (freeHoursToday >= 2.0) {
    return todayStr;
  } else {
    return getNextWorkingDayStr(now, config);
  }
}

export interface AvailableSlotResult {
  dateStr: string;           // YYYY-MM-DD
  timeStr: string;           // HH:mm
  fullIso: string;           // YYYY-MM-DDTHH:mm:ss-03:00
  isOvertime: boolean;       // true if scheduled outside 09:00-18:00 because day is full
  nextFreeWorkingSlot?: {    // Alternative next working day slot if day is full
    dateStr: string;
    timeStr: string;
    fullIso: string;
  };
}

/**
 * Checks if a specific day is full and cannot fit a demand of durationHours within working hours.
 */
export function isDayFullForWorkingHours(
  targetDayStr: string,
  durationHours: number = 1.0,
  existingDemands: { id?: string; due_date: string | null; estimated_hours?: number | null; status?: string; deleted_at?: string | null }[] = [],
  existingMeetings: { id?: string; due_date: string | null; estimated_hours?: number | null; deleted_at?: string | null }[] = [],
  config: SchedulingConfig = DEFAULT_CONFIG
): boolean {
  const activeCfg = (config && config !== DEFAULT_CONFIG) ? config : getStoredSchedulingConfig();
  const [y, m, d] = targetDayStr.split("-").map(Number);
  const targetDate = new Date(y, m - 1, d);
  if (!activeCfg.workingDays.includes(targetDate.getDay())) return true; // weekends are full for normal hours

  const takenSlots = new Set<string>();
  for (const meet of existingMeetings) {
    if ((meet as any).deleted_at) continue;
    if (meet.due_date && meet.due_date.slice(0, 10) === targetDayStr) {
      blockSlots(safeParseDate(meet.due_date), meet.estimated_hours ? Number(meet.estimated_hours) : 1.0, takenSlots);
    }
  }
  for (const dem of existingDemands) {
    if ((dem as any).deleted_at) continue;
    if (dem.status === "concluido" || dem.status === "para_analise" || dem.status === "rascunho" || (dem.status === "com_ajustes" && !(dem as any).is_manually_scheduled)) continue;
    if (dem.due_date && dem.due_date.slice(0, 10) === targetDayStr) {
      blockSlots(safeParseDate(dem.due_date), dem.estimated_hours ? Number(dem.estimated_hours) : 1.0, takenSlots);
    }
  }

  // Scan all 30m slots on targetDay between startHour and endHour
  const cursor = new Date(y, m - 1, d, activeCfg.startHour, 0, 0);
  while (cursor.getHours() < activeCfg.endHour) {
    if (areWorkingSlotsFree(cursor, durationHours, takenSlots, activeCfg)) {
      const endCandidate = new Date(cursor.getTime() + durationHours * 3600 * 1000);
      if (endCandidate.getHours() < activeCfg.endHour || (endCandidate.getHours() === activeCfg.endHour && endCandidate.getMinutes() === 0)) {
        return false; // Found a free business slot!
      }
    }
    cursor.setMinutes(cursor.getMinutes() + 30);
  }
  return true; // No free business slot
}

/**
 * Finds the next available working slot for a demand with durationHours.
 * If preferredDateStr is supplied:
 *   - If the day has space within the configured working hours, returns that slot (isOvertime = false).
 *   - If the day is full within configured working hours, calculates next free slot on the next working day,
 *     and also provides the first free slot after configured endHour on preferredDate (isOvertime = true).
 * If preferredDateStr is not supplied:
 *   - Finds next available working slot starting from now/next working day within configured working hours.
 */
export function findNextAvailableWorkingSlot(
  durationHours: number = 1.0,
  preferredDateStr?: string | null,
  existingDemands: { id?: string; due_date: string | null; estimated_hours?: number | null; status?: string; assignee_user_id?: string | null; deleted_at?: string | null }[] = [],
  existingMeetings: { id?: string; due_date: string | null; estimated_hours?: number | null; deleted_at?: string | null }[] = [],
  config: SchedulingConfig = DEFAULT_CONFIG
): AvailableSlotResult {
  const activeCfg = (config && config !== DEFAULT_CONFIG) ? config : getStoredSchedulingConfig();
  const now = getTzTime(activeCfg.timezone);
  const nowDayStr = toISO(now);

  const takenSlots = new Set<string>();
  for (const meet of existingMeetings) {
    if ((meet as any).deleted_at) continue;
    if (meet.due_date) {
      blockSlots(safeParseDate(meet.due_date), meet.estimated_hours ? Number(meet.estimated_hours) : 1.0, takenSlots);
    }
  }
  for (const dem of existingDemands) {
    if ((dem as any).deleted_at) continue;
    if (dem.status === "concluido" || dem.status === "para_analise" || dem.status === "rascunho" || (dem.status === "com_ajustes" && !(dem as any).is_manually_scheduled)) continue;
    if (dem.due_date) {
      blockSlots(safeParseDate(dem.due_date), dem.estimated_hours ? Number(dem.estimated_hours) : 1.0, takenSlots);
    }
  }

  // Helper to find first free working slot on or after a given day
  const findFreeInDays = (startDayStr: string, limitDays = 30, allowPastSlotsOnTarget = false): { dateStr: string; timeStr: string; fullIso: string } | null => {
    const [y, m, d] = startDayStr.split("-").map(Number);
    const checkDate = new Date(y, m - 1, d);

    for (let dayOffset = 0; dayOffset < limitDays; dayOffset++) {
      if (activeCfg.workingDays.includes(checkDate.getDay())) {
        const checkDayStr = toISO(checkDate);
        let cursor = new Date(checkDate.getFullYear(), checkDate.getMonth(), checkDate.getDate(), activeCfg.startHour, 0, 0);

        // If checking today and we do NOT allow past slots, cursor cannot be in the past
        if (checkDayStr === nowDayStr && !allowPastSlotsOnTarget) {
          const currentHourDec = now.getHours() + now.getMinutes() / 60;
          if (currentHourDec > activeCfg.startHour) {
            const next30Mins = Math.ceil(now.getMinutes() / 30) * 30;
            cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0);
            cursor.setMinutes(next30Mins, 0, 0);
          }
        }

        while (cursor.getHours() < activeCfg.endHour) {
          if (areWorkingSlotsFree(cursor, durationHours, takenSlots, activeCfg)) {
            const endCand = new Date(cursor.getTime() + durationHours * 3600 * 1000);
            if (endCand.getHours() < activeCfg.endHour || (endCand.getHours() === activeCfg.endHour && endCand.getMinutes() === 0)) {
              const timeStr = `${String(cursor.getHours()).padStart(2, "0")}:${String(cursor.getMinutes()).padStart(2, "0")}`;
              return {
                dateStr: checkDayStr,
                timeStr,
                fullIso: buildBrasiliaIso(checkDayStr, timeStr),
              };
            }
          }
          cursor.setMinutes(cursor.getMinutes() + 30);
        }
      }
      checkDate.setDate(checkDate.getDate() + 1);
    }
    return null;
  };

  // If a specific preferred day was given
  if (preferredDateStr) {
    const isFull = isDayFullForWorkingHours(preferredDateStr, durationHours, existingDemands, existingMeetings, activeCfg);
    if (!isFull) {
      // Target day has free capacity within configured business hours: search entire day starting at activeCfg.startHour
      const freeSlot = findFreeInDays(preferredDateStr, 1, true);
      if (freeSlot && freeSlot.dateStr === preferredDateStr) {
        return {
          dateStr: freeSlot.dateStr,
          timeStr: freeSlot.timeStr,
          fullIso: freeSlot.fullIso,
          isOvertime: false,
        };
      }
    }

    // Preferred day is genuinely full within business hours!
    // 1) Calculate overtime slot on preferredDateStr (starts from activeCfg.endHour or first free slot after activeCfg.endHour)
    const [py, pm, pd] = preferredDateStr.split("-").map(Number);
    let overtimeCursor = new Date(py, pm - 1, pd, activeCfg.endHour, 0, 0);
    while (!areSlotsFree(overtimeCursor, durationHours, takenSlots) && overtimeCursor.getHours() < 23) {
      overtimeCursor.setMinutes(overtimeCursor.getMinutes() + 30);
    }
    const overtimeTimeStr = `${String(overtimeCursor.getHours()).padStart(2, "0")}:${String(overtimeCursor.getMinutes()).padStart(2, "0")}`;

    // 2) Calculate next free slot in upcoming working days
    const nextWorkingDay = new Date(py, pm - 1, pd);
    nextWorkingDay.setDate(nextWorkingDay.getDate() + 1);
    const nextFree = findFreeInDays(toISO(nextWorkingDay), 30, false);

    return {
      dateStr: preferredDateStr,
      timeStr: overtimeTimeStr,
      fullIso: buildBrasiliaIso(preferredDateStr, overtimeTimeStr),
      isOvertime: true,
      nextFreeWorkingSlot: nextFree || undefined,
    };
  }

  // No preferredDateStr: Auto-schedule to next working day or today
  const freeSlot = findFreeInDays(nowDayStr, 30, false);
  if (freeSlot) {
    return {
      dateStr: freeSlot.dateStr,
      timeStr: freeSlot.timeStr,
      fullIso: freeSlot.fullIso,
      isOvertime: false,
    };
  }

  // Absolute fallback
  const nextWorkDay = getNextWorkingDayStr(now, activeCfg);
  const fallbackTime = `${String(activeCfg.startHour).padStart(2, "0")}:00`;
  return {
    dateStr: nextWorkDay,
    timeStr: fallbackTime,
    fullIso: buildBrasiliaIso(nextWorkDay, fallbackTime),
    isOvertime: false,
  };
}

/**
 * Reorders demands on a specific day by priority and registration order.
 * - Priority: urgent (4) > high (3) > medium (2) > low (1)
 * - Tie-break: created_at ASC (FIFO)
 * - Fixed meetings and pinned demands (is_manually_scheduled = true) stay in their places.
 * - The remaining demands are placed into the earliest available slots starting at startHour,
 *   respecting duration, skipping meetings, and skipping lunch (lunchStart - lunchEnd).
 * - If working hours overflow, they continue after endHour sequentially without overlapping.
 */
export function reorderDayDemandsByPriority(
  targetDayStr: string,
  dayDemands: { id: string; priority: string; created_at: string; due_date: string | null; estimated_hours?: number | null; is_manually_scheduled?: boolean | null; status?: string }[],
  meetingsOnDay: { due_date: string | null; estimated_hours?: number | null }[] = [],
  config: SchedulingConfig = DEFAULT_CONFIG
): { id: string; due_date: string; is_manually_scheduled?: boolean }[] {
  const activeCfg = (config && config !== DEFAULT_CONFIG) ? config : getStoredSchedulingConfig();
  const updates: { id: string; due_date: string; is_manually_scheduled?: boolean }[] = [];
  const takenSlots = new Set<string>();

  // 1. Block meetings
  for (const m of meetingsOnDay) {
    if ((m as any).deleted_at) continue;
    if (m.due_date && m.due_date.slice(0, 10) === targetDayStr) {
      blockSlots(safeParseDate(m.due_date), m.estimated_hours ? Number(m.estimated_hours) : 1.0, takenSlots);
    }
  }

  // 2. Filter active demands on this day
  const activeDemands = dayDemands.filter((d) => {
    if ((d as any).deleted_at) return false;
    if (d.status === "concluido" || d.status === "para_analise" || d.status === "rascunho" || (d.status === "com_ajustes" && !d.is_manually_scheduled)) return false;
    return !d.due_date || d.due_date.slice(0, 10) === targetDayStr;
  });

  // 3. Keep pinned demands in place and block their slots
  const pinned = activeDemands.filter((d) => Boolean(d.is_manually_scheduled));
  for (const p of pinned) {
    const dt = safeParseDate(p.due_date!);
    const dur = p.estimated_hours ? Number(p.estimated_hours) : 1.0;
    blockSlots(dt, dur, takenSlots);
  }

  // 4. Sort unpinned demands by Priority DESC, created_at ASC
  const unpinned = activeDemands.filter((d) => !d.is_manually_scheduled);
  unpinned.sort((a, b) => {
    const pwA = (PRIORITY_WEIGHT as any)[a.priority] ?? 2;
    const pwB = (PRIORITY_WEIGHT as any)[b.priority] ?? 2;
    if (pwA !== pwB) return pwB - pwA;
    return (a.created_at || "").localeCompare(b.created_at || "");
  });

  // 5. Pack unpinned demands into the day
  const [y, m, d] = targetDayStr.split("-").map(Number);
  let cursor = new Date(y, m - 1, d, activeCfg.startHour, 0, 0);

  for (const dem of unpinned) {
    const dur = dem.estimated_hours ? Number(dem.estimated_hours) : 1.0;
    let placed: Date | null = null;
    let search = new Date(cursor);
    let safety = 0;

    // Search during business hours first
    while (safety < 48 && search.getHours() < activeCfg.endHour) {
      if (areWorkingSlotsFree(search, dur, takenSlots, activeCfg)) {
        const endCand = new Date(search.getTime() + dur * 3600 * 1000);
        if (endCand.getHours() < activeCfg.endHour || (endCand.getHours() === activeCfg.endHour && endCand.getMinutes() === 0)) {
          placed = new Date(search);
          break;
        }
      }
      search.setMinutes(search.getMinutes() + 30);
      safety++;
    }

    // If business hours full, search after business hours (from activeCfg.endHour onward)
    if (!placed) {
      search = new Date(y, m - 1, d, activeCfg.endHour, 0, 0);
      safety = 0;
      while (safety < 48 && search.getHours() < 24) {
        if (areSlotsFree(search, dur, takenSlots)) {
          placed = new Date(search);
          break;
        }
        search.setMinutes(search.getMinutes() + 30);
        safety++;
      }
    }

    if (placed) {
      const newIso = formatTzString(placed);
      if (dem.due_date !== newIso) {
        updates.push({
          id: dem.id,
          due_date: newIso,
          is_manually_scheduled: false,
        });
      }
      blockSlots(placed, dur, takenSlots);
      // Advance cursor for next item
      cursor = new Date(placed.getTime() + dur * 3600 * 1000);
    }
  }

  return updates;
}


