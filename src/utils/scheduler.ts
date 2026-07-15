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

/** Move the date forward to the next valid working slot */
export function getNextSlot(date: Date, config: SchedulingConfig): Date {
  const next = new Date(date);
  next.setMinutes(0, 0, 0);
  
  // Try adding 1 hour increments until we find a valid slot
  let safety = 0;
  while (safety < 1000) {
    next.setHours(next.getHours() + 1);
    if (isValidSlot(next, config)) {
      return next;
    }
    safety++;
  }
  return next;
}

/** Format a Date object to YYYY-MM-DDTHH:mm:ss in ISO style but local-like timezone */
export function formatTzString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${y}-${m}-${d}T${hh}:${mm}:${ss}`;
}

export interface UnscheduledDemand {
  id: string;
  title: string;
  priority: "low" | "medium" | "high" | "urgent";
  status: string;
  due_date: string | null; // Current due date string (if any)
  created_at: string;
}

/**
 * Runs the Prioritized Scheduling Algorithm.
 * 1. Filters active demands (status !== 'concluido').
 * 2. Sorts them:
 *    - Urgent > High > Medium > Low
 *    - By requested datetime (if set)
 *    - By created_at (earliest first)
 * 3. Assigns slots:
 *    - If a demand has an explicit slot requested, we try to assign it.
 *    - If the slot is taken, or if no slot is requested, we find the next available future slot.
 *    - High priority demands will reserve slots first, naturally "pushing" lower priority demands.
 */
export function scheduleDemands(
  demands: UnscheduledDemand[],
  config: SchedulingConfig = DEFAULT_CONFIG
): Record<string, string> {
  const active = demands.filter(d => d.status !== "concluido");
  
  // Sort by priority (descending weight), then by requested due_date (if any), then by created_at
  const sorted = [...active].sort((a, b) => {
    const pwA = PRIORITY_WEIGHT[a.priority] ?? 2;
    const pwB = PRIORITY_WEIGHT[b.priority] ?? 2;
    
    if (pwA !== pwB) return pwB - pwA; // Higher priority first
    
    if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
    if (a.due_date) return -1;
    if (b.due_date) return 1;
    
    return a.created_at.localeCompare(b.created_at);
  });

  const now = getTzTime(config.timezone);
  
  // Get the start of the next slot relative to "now"
  let nextAvailable = new Date(now);
  nextAvailable.setMinutes(0, 0, 0);
  if (!isValidSlot(nextAvailable, config)) {
    nextAvailable = getNextSlot(nextAvailable, config);
  }

  const scheduledTimes: Record<string, string> = {}; // demandId -> ISO string
  const takenSlots = new Set<string>();

  for (const demand of sorted) {
    let targetSlot: Date | null = null;

    if (demand.due_date) {
      // Parse the user's requested date & time
      const requested = new Date(demand.due_date);
      
      // Make sure the requested slot is in the future relative to "now"
      if (requested.getTime() > now.getTime() && isValidSlot(requested, config)) {
        targetSlot = requested;
      }
    }

    if (targetSlot) {
      const slotKey = formatTzString(targetSlot);
      if (!takenSlots.has(slotKey)) {
        scheduledTimes[demand.id] = slotKey;
        takenSlots.add(slotKey);
        continue;
      }
    }

    // Find the next available slot
    let currentSearch = new Date(nextAvailable);
    let safety = 0;
    while (safety < 1000) {
      const searchKey = formatTzString(currentSearch);
      if (!takenSlots.has(searchKey) && currentSearch.getTime() > now.getTime()) {
        scheduledTimes[demand.id] = searchKey;
        takenSlots.add(searchKey);
        // Advance nextAvailable to avoid redundant checks next time
        nextAvailable = new Date(currentSearch);
        break;
      }
      currentSearch = getNextSlot(currentSearch, config);
      safety++;
    }
  }

  return scheduledTimes;
}
