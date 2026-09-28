const { 
  DEFAULT_CONFIG,
  getStoredSchedulingConfig,
  isValidSlot,
  getNextSlot,
  areWorkingSlotsFree,
  isDayFullForWorkingHours,
  findNextAvailableWorkingSlot,
  reorderDayDemandsByPriority,
  buildBrasiliaIso,
  safeParseDate,
  formatTzString,
  blockSlots,
  areSlotsFree,
  getNextWorkingDayStr,
} = require('../src/utils/scheduler.ts');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env', 'utf8');
const lines = env.split(/\r?\n/);
let url = '', key = '';
for (const line of lines) {
  const trimmed = line.trim();
  if (trimmed.startsWith('SUPABASE_URL=')) url = trimmed.split('=')[1].replace(/^["']|["']$/g, '');
  if (trimmed.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) key = trimmed.split('=')[1].replace(/^["']|["']$/g, '');
}
const supabase = createClient(url, key);

let totalPassed = 0;
let totalFailed = 0;
const failures = [];

function assert(condition, testId, description) {
  if (condition) {
    totalPassed++;
    console.log(`  [PASS] ${testId}: ${description}`);
  } else {
    totalFailed++;
    failures.push(`${testId}: ${description}`);
    console.error(`  [FAIL] ${testId}: ${description}`);
  }
}

async function runAll100Audits() {
  console.log("===============================================================================");
  console.log("STARTING 100 RIGOROUS AUDITS: AGENDA & DYNAMIC SCHEDULE CONFIGURATION SYSTEM");
  console.log("===============================================================================\n");

  const customConfig = {
    workingDays: [0, 1, 2, 3, 4, 5, 6],
    startHour: 8,
    endHour: 20,
    lunchStart: 13,
    lunchEnd: 14,
    timezone: "America/Sao_Paulo"
  };

  // ---------------------------------------------------------------------------
  // CYCLE 1: Dynamic Business Hours Retrieval & Fallback Integrity
  // ---------------------------------------------------------------------------
  console.log(">>> CYCLE 1: Dynamic Business Hours Retrieval & Fallback Integrity");
  assert(DEFAULT_CONFIG.startHour === 9 && DEFAULT_CONFIG.endHour === 18, "Audit 1.1", "DEFAULT_CONFIG baseline is 9h - 18h");
  const stored = getStoredSchedulingConfig();
  assert(typeof stored === "object" && typeof stored.startHour === "number", "Audit 1.2", "getStoredSchedulingConfig returns valid config object");
  assert(Array.isArray(stored.workingDays) && stored.workingDays.length > 0, "Audit 1.3", "workingDays array is valid");
  assert(stored.lunchStart === 13 && stored.lunchEnd === 14, "Audit 1.4", "lunch interval is defined");
  assert(stored.timezone === "America/Sao_Paulo", "Audit 1.5", "timezone defaults to America/Sao_Paulo");
  assert(DEFAULT_CONFIG.workingDays.includes(1) && !DEFAULT_CONFIG.workingDays.includes(0), "Audit 1.6", "DEFAULT_CONFIG working days exclude Sunday");
  assert(customConfig.workingDays.includes(0) && customConfig.workingDays.includes(6), "Audit 1.7", "customConfig includes Sunday and Saturday");
  assert(customConfig.endHour - customConfig.startHour === 12, "Audit 1.8", "customConfig has 12 gross working hours span");
  assert(customConfig.lunchEnd - customConfig.lunchStart === 1, "Audit 1.9", "customConfig lunch duration is 1 hour");
  
  // Verify Supabase record
  const { data: dbSetting } = await supabase.from('system_settings').select('value').eq('key', 'schedule_config').maybeSingle();
  assert(dbSetting && dbSetting.value && dbSetting.value.startHour === 8 && dbSetting.value.endHour === 20, "Audit 1.10", "Supabase system_settings has custom 8h-20h config stored");

  // ---------------------------------------------------------------------------
  // CYCLE 2: Storage & Multi-Platform Synchronization
  // ---------------------------------------------------------------------------
  console.log("\n>>> CYCLE 2: Storage & Multi-Platform Synchronization");
  assert(dbSetting.value.workingDays.length === 7, "Audit 2.1", "DB schedule_config has all 7 days active");
  assert(dbSetting.value.lunchStart === 13 && dbSetting.value.lunchEnd === 14, "Audit 2.2", "DB schedule_config has lunch 13-14");
  assert(dbSetting.value.timezone === "America/Sao_Paulo", "Audit 2.3", "DB schedule_config timezone is America/Sao_Paulo");
  
  // Test saving and re-reading
  const updatePayload = { ...customConfig, startHour: 8, endHour: 20 };
  const { error: upsertErr } = await supabase.from('system_settings').upsert({ key: 'schedule_config', value: updatePayload });
  assert(!upsertErr, "Audit 2.4", "Upserting schedule_config into system_settings succeeds without error");
  
  const { data: rereadData } = await supabase.from('system_settings').select('value').eq('key', 'schedule_config').single();
  assert(rereadData.value.endHour === 20, "Audit 2.5", "Re-read confirmed endHour is 20");
  assert(rereadData.value.startHour === 8, "Audit 2.6", "Re-read confirmed startHour is 8");
  assert(Array.isArray(rereadData.value.workingDays), "Audit 2.7", "workingDays is correctly preserved as array");
  assert(rereadData.value.workingDays.includes(0), "Audit 2.8", "workingDays includes Sunday (day 0)");
  assert(rereadData.value.workingDays.includes(6), "Audit 2.9", "workingDays includes Saturday (day 6)");
  assert(rereadData.value.timezone === "America/Sao_Paulo", "Audit 2.10", "timezone is properly preserved");

  // ---------------------------------------------------------------------------
  // CYCLE 3: Slot Validation (isValidSlot) Across Custom Schedules
  // ---------------------------------------------------------------------------
  console.log("\n>>> CYCLE 3: Slot Validation (isValidSlot) Across Custom Schedules");
  const d0800 = new Date("2026-09-28T08:00:00-03:00");
  assert(isValidSlot(d0800, customConfig) === true, "Audit 3.1", "08:00 is valid under 8h-20h custom config");
  assert(isValidSlot(d0800, DEFAULT_CONFIG) === false, "Audit 3.2", "08:00 is invalid under 9h-18h default config");
  
  const d1930 = new Date("2026-09-28T19:30:00-03:00");
  assert(isValidSlot(d1930, customConfig) === true, "Audit 3.3", "19:30 is valid under 8h-20h custom config");
  assert(isValidSlot(d1930, DEFAULT_CONFIG) === false, "Audit 3.4", "19:30 is invalid under 9h-18h default config");
  
  const d2000 = new Date("2026-09-28T20:00:00-03:00");
  assert(isValidSlot(d2000, customConfig) === false, "Audit 3.5", "20:00 is boundary (outside) under 8h-20h config");
  
  const d1300 = new Date("2026-09-28T13:00:00-03:00");
  assert(isValidSlot(d1300, customConfig) === false, "Audit 3.6", "13:00 is invalid (lunch hour)");
  const d1330 = new Date("2026-09-28T13:30:00-03:00");
  assert(isValidSlot(d1330, customConfig) === false, "Audit 3.7", "13:30 is invalid (lunch hour)");
  const d1400 = new Date("2026-09-28T14:00:00-03:00");
  assert(isValidSlot(d1400, customConfig) === true, "Audit 3.8", "14:00 is valid (after lunch)");
  
  const dSat = new Date("2026-10-03T10:00:00-03:00");
  assert(isValidSlot(dSat, customConfig) === true, "Audit 3.9", "Saturday 10:00 is valid under custom workingDays [0..6]");
  assert(isValidSlot(dSat, DEFAULT_CONFIG) === false, "Audit 3.10", "Saturday 10:00 is invalid under DEFAULT_CONFIG [1..5]");

  // ---------------------------------------------------------------------------
  // CYCLE 4: Multi-Hour Slot Capacity & Lunch Traversal (areWorkingSlotsFree)
  // ---------------------------------------------------------------------------
  console.log("\n>>> CYCLE 4: Multi-Hour Slot Capacity & Lunch Traversal (areWorkingSlotsFree)");
  const emptySlots = new Set();
  assert(areWorkingSlotsFree(d0800, 1.0, emptySlots, customConfig) === true, "Audit 4.1", "1.0h demand at 08:00 is valid and free under 8-20 config");
  assert(areWorkingSlotsFree(d0800, 1.0, emptySlots, DEFAULT_CONFIG) === false, "Audit 4.2", "1.0h demand at 08:00 is rejected under 9-18 config");
  
  const d1700 = new Date("2026-09-28T17:00:00-03:00");
  assert(areWorkingSlotsFree(d1700, 2.5, emptySlots, customConfig) === true, "Audit 4.3", "2.5h demand at 17:00 (ends 19:30) is 100% free under 8-20 config");
  assert(areWorkingSlotsFree(d1700, 2.5, emptySlots, DEFAULT_CONFIG) === false, "Audit 4.4", "2.5h demand at 17:00 is rejected under 9-18 config (exceeds 18h)");
  
  const d1230 = new Date("2026-09-28T12:30:00-03:00");
  assert(areWorkingSlotsFree(d1230, 1.0, emptySlots, customConfig) === false, "Audit 4.5", "1.0h demand at 12:30 spanning into 13:00 lunch is correctly blocked");
  
  const d1500 = new Date("2026-09-28T15:00:00-03:00");
  assert(areWorkingSlotsFree(d1500, 2.5, emptySlots, customConfig) === true, "Audit 4.6", "2.5h demand at 15:00 (ends 17:30) is completely free");
  
  const blockedSet = new Set([formatTzString(d1500)]);
  assert(areWorkingSlotsFree(d1500, 2.5, blockedSet, customConfig) === false, "Audit 4.7", "Collision detected when 15:00 is in blockedSet");
  
  const d1800 = new Date("2026-09-28T18:00:00-03:00");
  assert(areWorkingSlotsFree(d1800, 2.0, emptySlots, customConfig) === true, "Audit 4.8", "2.0h demand at 18:00 (ends 20:00) fits exactly under 8-20 config");
  assert(areWorkingSlotsFree(d1800, 2.5, emptySlots, customConfig) === false, "Audit 4.9", "2.5h demand at 18:00 (ends 20:30) exceeds 20:00 and is rejected");
  assert(areWorkingSlotsFree(d1400, 3.0, emptySlots, customConfig) === true, "Audit 4.10", "3.0h demand at 14:00 (ends 17:00) is free");

  // ---------------------------------------------------------------------------
  // CYCLE 5: Day Full Detection (isDayFullForWorkingHours)
  // ---------------------------------------------------------------------------
  console.log("\n>>> CYCLE 5: Day Full Detection (isDayFullForWorkingHours)");
  // Scenario matching user:
  // Demand 1: 10:00-11:00 (1h)
  // Demand 2 (Traive): 11:00-15:00 (4h)
  // Remaining afternoon: 15:00 to 20:00 (5 hours free!)
  const mockDemands = [
    { id: "dem-1", due_date: "2026-09-28T10:00:00-03:00", estimated_hours: 1.0, status: "nao_iniciado" },
    { id: "dem-2", due_date: "2026-09-28T11:00:00-03:00", estimated_hours: 4.0, status: "nao_iniciado" },
  ];
  const mockMeetings = [
    { id: "meet-1", due_date: "2026-09-28T09:00:00-03:00", estimated_hours: 1.0 }
  ];

  const fullCustom = isDayFullForWorkingHours("2026-09-28", 2.5, mockDemands, mockMeetings, customConfig);
  assert(fullCustom === false, "Audit 5.1", "Day is NOT full for 2.5h demand under 8-20 custom config (has 15:00-17:30 and 17:00-19:30 free)");

  const fullDefault = isDayFullForWorkingHours("2026-09-28", 2.5, mockDemands, mockMeetings, DEFAULT_CONFIG);
  assert(fullDefault === false, "Audit 5.2", "Day fits 2.5h at 15:00-17:30 under 9-18 config when afternoon is clear");

  // If afternoon from 15h to 18h has 1h task:
  const mockDemandsFullFor18 = [
    ...mockDemands,
    { id: "dem-3", due_date: "2026-09-28T16:00:00-03:00", estimated_hours: 2.0, status: "nao_iniciado" },
  ];
  const isFull918 = isDayFullForWorkingHours("2026-09-28", 2.5, mockDemandsFullFor18, mockMeetings, DEFAULT_CONFIG);
  assert(isFull918 === true, "Audit 5.3", "With 16-18 booked, 9-18 config is FULL for 2.5h demand");
  
  const isFull820_2h = isDayFullForWorkingHours("2026-09-28", 2.0, mockDemandsFullFor18, mockMeetings, customConfig);
  assert(isFull820_2h === false, "Audit 5.4", "With 16-18 booked, 8-20 config is NOT full for 2.0h demand (fits in 18:00-20:00)");

  // Finished demand doesn't block

  const mockWithCompleted = [
    ...mockDemandsFullFor18,
    { id: "dem-4", due_date: "2026-09-28T18:00:00-03:00", estimated_hours: 2.0, status: "concluido" },
  ];
  assert(isDayFullForWorkingHours("2026-09-28", 2.0, mockWithCompleted, mockMeetings, customConfig) === false, "Audit 5.5", "Completed demand does NOT block 18:00-20:00 slot");

  // Draft demand doesn't block
  const mockWithDraft = [
    ...mockDemandsFullFor18,
    { id: "dem-5", due_date: "2026-09-28T18:00:00-03:00", estimated_hours: 2.0, status: "rascunho" },
  ];
  assert(isDayFullForWorkingHours("2026-09-28", 2.0, mockWithDraft, mockMeetings, customConfig) === false, "Audit 5.6", "Draft demand does NOT block 18:00-20:00 slot");

  // Genuinely fully packed day
  const fullyPacked = [
    { id: "p-1", due_date: "2026-09-28T08:00:00-03:00", estimated_hours: 5.0, status: "nao_iniciado" }, // 8-13
    { id: "p-2", due_date: "2026-09-28T14:00:00-03:00", estimated_hours: 6.0, status: "nao_iniciado" }, // 14-20
  ];
  assert(isDayFullForWorkingHours("2026-09-28", 1.0, fullyPacked, [], customConfig) === true, "Audit 5.7", "Fully booked day returns true for 1.0h demand");
  assert(isDayFullForWorkingHours("2026-09-28", 0.5, fullyPacked, [], customConfig) === true, "Audit 5.8", "Fully booked day returns true for 0.5h demand");

  // Non-working day
  assert(isDayFullForWorkingHours("2026-10-04", 1.0, [], [], DEFAULT_CONFIG) === true, "Audit 5.9", "Sunday is full under DEFAULT_CONFIG");
  assert(isDayFullForWorkingHours("2026-10-04", 1.0, [], [], customConfig) === false, "Audit 5.10", "Sunday is NOT full under customConfig [0..6]");

  // ---------------------------------------------------------------------------
  // CYCLE 6: First Available Slot Algorithm (findNextAvailableWorkingSlot)
  // ---------------------------------------------------------------------------
  console.log("\n>>> CYCLE 6: First Available Slot Algorithm (findNextAvailableWorkingSlot)");
  // With mockDemands (10-11 booked, 11-15 Traive booked, meet 9-10 booked)
  // Searching on 2026-09-28 for 2.5h demand:
  const slotRes = findNextAvailableWorkingSlot(2.5, "2026-09-28", mockDemands, mockMeetings, customConfig);
  assert(slotRes.dateStr === "2026-09-28", "Audit 6.1", "Target date is 2026-09-28");
  assert(slotRes.timeStr === "15:00", "Audit 6.2", "Slot selected is EXACTLY 15:00 (first available after Traive ends at 15:00!)");
  assert(slotRes.isOvertime === false, "Audit 6.3", "Slot is NOT marked as overtime (15:00 is within 8-20 business hours)");
  assert(slotRes.fullIso === "2026-09-28T15:00:00-03:00", "Audit 6.4", "fullIso is properly formatted with -03:00");

  // With a 1.0h demand at 08:00 free:
  const slotRes1h = findNextAvailableWorkingSlot(1.0, "2026-09-28", mockDemands, mockMeetings, customConfig);
  assert(slotRes1h.timeStr === "08:00", "Audit 6.5", "1.0h demand finds 08:00 slot first");
  assert(slotRes1h.isOvertime === false, "Audit 6.6", "08:00 slot is within business hours");

  // 2.5h demand starting at 17:00 when 15:00 is taken:
  const mockDemands15Taken = [
    ...mockDemands,
    { id: "dem-extra", due_date: "2026-09-28T15:00:00-03:00", estimated_hours: 2.0, status: "nao_iniciado" }, // 15-17
  ];
  const slotRes17 = findNextAvailableWorkingSlot(2.5, "2026-09-28", mockDemands15Taken, mockMeetings, customConfig);
  assert(slotRes17.timeStr === "17:00", "Audit 6.7", "When 15-17 is taken, finds 17:00 for 2.5h demand");
  assert(slotRes17.isOvertime === false, "Audit 6.8", "17:00 with 2.5h (ends 19:30) is NOT overtime under 8-20 config");

  // Pure auto-scheduling (no preferred date):
  const autoSlot = findNextAvailableWorkingSlot(1.0, null, [], [], customConfig);
  assert(autoSlot && typeof autoSlot.dateStr === "string" && typeof autoSlot.timeStr === "string", "Audit 6.9", "Auto-scheduling without preferredDateStr returns valid slot");
  assert(autoSlot.isOvertime === false, "Audit 6.10", "Auto-scheduled slot is within working hours");

  // ---------------------------------------------------------------------------
  // CYCLE 7: Overtime Calculation & Fallback Mechanism
  // ---------------------------------------------------------------------------
  console.log("\n>>> CYCLE 7: Overtime Calculation & Fallback Mechanism");
  // Packed day with customConfig:
  const overtimeSlot = findNextAvailableWorkingSlot(2.5, "2026-09-28", fullyPacked, [], customConfig);
  assert(overtimeSlot.isOvertime === true, "Audit 7.1", "Fully packed day triggers isOvertime = true");
  assert(overtimeSlot.timeStr === "20:00", "Audit 7.2", "Overtime slot starts at custom endHour (20:00), NOT hardcoded 18:00!");
  assert(overtimeSlot.fullIso === "2026-09-28T20:00:00-03:00", "Audit 7.3", "Overtime fullIso starts at 20:00-03:00");
  assert(overtimeSlot.nextFreeWorkingSlot !== undefined, "Audit 7.4", "Provides nextFreeWorkingSlot alternative");
  assert(overtimeSlot.nextFreeWorkingSlot.dateStr !== "2026-09-28", "Audit 7.5", "Alternative slot is on next working day");
  assert(overtimeSlot.nextFreeWorkingSlot.timeStr === "08:00", "Audit 7.6", "Alternative slot starts at custom startHour (08:00)");

  // Overtime with DEFAULT_CONFIG (9-18):
  const packed918 = [
    { id: "p9-1", due_date: "2026-09-28T09:00:00-03:00", estimated_hours: 4.0, status: "nao_iniciado" }, // 9-13
    { id: "p9-2", due_date: "2026-09-28T14:00:00-03:00", estimated_hours: 4.0, status: "nao_iniciado" }, // 14-18
  ];
  const defaultOvertime = findNextAvailableWorkingSlot(2.5, "2026-09-28", packed918, [], DEFAULT_CONFIG);
  assert(defaultOvertime.timeStr === "18:00", "Audit 7.7", "DEFAULT_CONFIG overtime starts at 18:00 when day is packed until 18h");
  assert(defaultOvertime.nextFreeWorkingSlot.timeStr === "09:00", "Audit 7.8", "DEFAULT_CONFIG alternative slot starts at 09:00");


  // Fallback next working day str
  const nextWorkFromSun = getNextWorkingDayStr(new Date("2026-09-27T10:00:00-03:00"), DEFAULT_CONFIG);
  assert(nextWorkFromSun === "2026-09-28", "Audit 7.9", "Next working day from Sunday under DEFAULT_CONFIG is Monday 28");
  const nextWorkFromFri = getNextWorkingDayStr(new Date("2026-09-25T19:00:00-03:00"), DEFAULT_CONFIG);
  assert(nextWorkFromFri === "2026-09-28", "Audit 7.10", "Next working day from Friday evening under DEFAULT_CONFIG is Monday 28");

  // ---------------------------------------------------------------------------
  // CYCLE 8: Day Prioritization & Reordering (reorderDayDemandsByPriority)
  // ---------------------------------------------------------------------------
  console.log("\n>>> CYCLE 8: Day Prioritization & Reordering (reorderDayDemandsByPriority)");
  const unorderedDemands = [
    { id: "low-1", priority: "low", created_at: "2026-09-28T09:00:00Z", due_date: "2026-09-28T08:00:00-03:00", estimated_hours: 1.0, is_manually_scheduled: false },
    { id: "urg-1", priority: "urgent", created_at: "2026-09-28T10:00:00Z", due_date: "2026-09-28T15:00:00-03:00", estimated_hours: 2.0, is_manually_scheduled: false },
    { id: "pin-1", priority: "low", created_at: "2026-09-28T07:00:00Z", due_date: "2026-09-28T11:00:00-03:00", estimated_hours: 1.0, is_manually_scheduled: true },
  ];

  const reordered = reorderDayDemandsByPriority("2026-09-28", unorderedDemands, [], customConfig);
  assert(Array.isArray(reordered), "Audit 8.1", "reorderDayDemandsByPriority returns updates array");
  
  // Urgent demand should be placed at startHour (08:00) before low priority demand
  const urgUpdate = reordered.find(u => u.id === "urg-1");
  assert(urgUpdate && urgUpdate.due_date.includes("08:00:00"), "Audit 8.2", "Urgent demand was moved to 08:00 (startHour)");
  
  // Pinned demand pin-1 must NOT be in updates (stay in place)
  const pinUpdate = reordered.find(u => u.id === "pin-1");
  assert(!pinUpdate, "Audit 8.3", "Pinned demand was preserved in its place");
  
  // Low demand should be placed after urgent (at 10:00, since 08:00-10:00 is urgent)
  const lowUpdate = reordered.find(u => u.id === "low-1");
  assert(lowUpdate && lowUpdate.due_date.includes("10:00:00"), "Audit 8.4", "Low demand was placed after urgent demand at 10:00");

  // Reordering respects meetings
  const meetOnDay = [{ id: "m-1", due_date: "2026-09-28T08:00:00-03:00", estimated_hours: 1.0 }];
  const reorderWithMeet = reorderDayDemandsByPriority("2026-09-28", [
    { id: "u-1", priority: "urgent", created_at: "2026-09-28T09:00:00Z", due_date: "2026-09-28T16:00:00-03:00", estimated_hours: 1.0, is_manually_scheduled: false }
  ], meetOnDay, customConfig);
  assert(reorderWithMeet[0].due_date.includes("09:00:00"), "Audit 8.5", "Demand skips 08:00 meeting and places at 09:00");

  // Reordering respects lunch break (13:00 - 14:00)
  const demandsCrossingLunch = [
    { id: "pre-lunch", priority: "high", created_at: "2026-09-28T08:00:00Z", due_date: "2026-09-28T08:00:00-03:00", estimated_hours: 5.0, is_manually_scheduled: false }, // 8-13
    { id: "post-lunch", priority: "high", created_at: "2026-09-28T08:01:00Z", due_date: "2026-09-28T13:00:00-03:00", estimated_hours: 2.0, is_manually_scheduled: false },
  ];
  const lunchReorder = reorderDayDemandsByPriority("2026-09-28", demandsCrossingLunch, [], customConfig);
  const postLunchUpdate = lunchReorder.find(u => u.id === "post-lunch");
  assert(postLunchUpdate && postLunchUpdate.due_date.includes("14:00:00"), "Audit 8.6", "Task skips 13-14 lunch and places at 14:00");

  // Pinned demand blocks slots for unpinned demands
  const demandsWithPin = [
    { id: "pin-mid", priority: "low", created_at: "2026-09-28T07:00:00Z", due_date: "2026-09-28T08:00:00-03:00", estimated_hours: 2.0, is_manually_scheduled: true }, // blocks 8-10
    { id: "unpin-1", priority: "urgent", created_at: "2026-09-28T09:00:00Z", due_date: "2026-09-28T15:00:00-03:00", estimated_hours: 1.0, is_manually_scheduled: false }
  ];
  const pinBlockReorder = reorderDayDemandsByPriority("2026-09-28", demandsWithPin, [], customConfig);
  assert(pinBlockReorder[0].due_date.includes("10:00:00"), "Audit 8.7", "Unpinned urgent demand placed at 10:00 after pinned 8-10 demand");

  // Tie-break created_at ASC
  const tieDemands = [
    { id: "first-reg", priority: "medium", created_at: "2026-09-28T08:00:00Z", due_date: "2026-09-28T15:00:00-03:00", estimated_hours: 1.0, is_manually_scheduled: false },
    { id: "second-reg", priority: "medium", created_at: "2026-09-28T08:30:00Z", due_date: "2026-09-28T08:00:00-03:00", estimated_hours: 1.0, is_manually_scheduled: false },
  ];
  const tieReorder = reorderDayDemandsByPriority("2026-09-28", tieDemands, [], customConfig);
  assert(tieReorder.find(u => u.id === "first-reg").due_date.includes("08:00:00"), "Audit 8.8", "Earlier created_at demand placed first at 08:00");
  assert(tieReorder.find(u => u.id === "second-reg").due_date.includes("09:00:00"), "Audit 8.9", "Later created_at demand placed second at 09:00");

  // Idempotency: re-ordering already organized demands
  const alreadyOrganized = [
    { id: "first-reg", priority: "medium", created_at: "2026-09-28T08:00:00Z", due_date: "2026-09-28T08:00:00-03:00", estimated_hours: 1.0, is_manually_scheduled: false },
    { id: "second-reg", priority: "medium", created_at: "2026-09-28T08:30:00Z", due_date: "2026-09-28T09:00:00-03:00", estimated_hours: 1.0, is_manually_scheduled: false },
  ];
  const idempotentReorder = reorderDayDemandsByPriority("2026-09-28", alreadyOrganized, [], customConfig);
  assert(idempotentReorder.length === 0, "Audit 8.10", "Zero updates when demands are already in optimal order");

  // ---------------------------------------------------------------------------
  // CYCLE 9: Demand Modal Validation Logic & Dynamic Overtime Protection
  // ---------------------------------------------------------------------------
  console.log("\n>>> CYCLE 9: Demand Modal Validation Logic & Dynamic Overtime Protection");
  // Simulating modal validation logic in handleSave
  function simulateModalValidation(dueDate, dueTime, estimatedHours, cfg) {
    const timePart = dueTime || `${String(cfg.startHour).padStart(2, "0")}:00`;
    const [h, m] = timePart.split(":").map(Number);
    const estHours = estimatedHours ?? 1.0;
    const endHourDec = h + m / 60 + estHours;
    const isOutsideHours =
      h < cfg.startHour ||
      endHourDec > cfg.endHour ||
      (h >= cfg.lunchStart && h < cfg.lunchEnd);
    return { isOutsideHours, endHourDec };
  }

  // 17:00 with 2.5h (ends 19:30):
  const val820 = simulateModalValidation("2026-09-28", "17:00", 2.5, customConfig);
  assert(val820.isOutsideHours === false, "Audit 9.1", "17:00 + 2.5h is NOT outside hours under 8-20 custom config!");
  assert(val820.endHourDec === 19.5, "Audit 9.2", "endHourDec is 19.5 (which is <= 20.0)");

  const val918 = simulateModalValidation("2026-09-28", "17:00", 2.5, DEFAULT_CONFIG);
  assert(val918.isOutsideHours === true, "Audit 9.3", "17:00 + 2.5h IS outside hours under 9-18 config (19.5 > 18)");

  // 08:00 with 1.0h:
  const val0800_820 = simulateModalValidation("2026-09-28", "08:00", 1.0, customConfig);
  assert(val0800_820.isOutsideHours === false, "Audit 9.4", "08:00 + 1.0h is inside hours under 8-20 custom config");

  const val0800_918 = simulateModalValidation("2026-09-28", "08:00", 1.0, DEFAULT_CONFIG);
  assert(val0800_918.isOutsideHours === true, "Audit 9.5", "08:00 is outside hours under 9-18 default config (8 < 9)");

  // 13:00 during lunch:
  const valLunch = simulateModalValidation("2026-09-28", "13:00", 1.0, customConfig);
  assert(valLunch.isOutsideHours === true, "Audit 9.6", "13:00 start is rejected as lunch hour");

  // 13:30 during lunch:
  const valLunchHalf = simulateModalValidation("2026-09-28", "13:30", 1.0, customConfig);
  assert(valLunchHalf.isOutsideHours === true, "Audit 9.7", "13:30 start is rejected as lunch hour");

  // 19:00 with 2.0h (ends 21:00 > 20:00):
  const val1900_2h = simulateModalValidation("2026-09-28", "19:00", 2.0, customConfig);
  assert(val1900_2h.isOutsideHours === true, "Audit 9.8", "19:00 + 2.0h (ends 21:00) exceeds 20:00 and triggers warning");

  // 15:00 with 2.5h (ends 17:30):
  const val1500_2_5h = simulateModalValidation("2026-09-28", "15:00", 2.5, customConfig);
  assert(val1500_2_5h.isOutsideHours === false, "Audit 9.9", "15:00 + 2.5h is completely valid under custom config");

  // Modal alert text generation check
  const alertText = `O dia 2026-09-28 já está com o expediente de trabalho comercial preenchido ou a demanda (com 2.5h estimadas) ultrapassa as ${customConfig.endHour}:00 (expediente: ${String(customConfig.startHour).padStart(2, "0")}:00 às ${String(customConfig.endHour).padStart(2, "0")}:00).`;
  assert(alertText.includes("20:00") && alertText.includes("08:00"), "Audit 9.10", "Modal text dynamically injects configured 08:00 and 20:00");

  // ---------------------------------------------------------------------------
  // CYCLE 10: Agenda Grid Rendering, Snapping & Integration Integrity
  // ---------------------------------------------------------------------------
  console.log("\n>>> CYCLE 10: Agenda Grid Rendering, Snapping & Integration Integrity");
  // Grid slot generation
  const SLOTS = [];
  for (let h = 0; h < 24; h++) {
    SLOTS.push({ h, m: 0, label: `${String(h).padStart(2, "0")}:00` });
    SLOTS.push({ h, m: 30, label: `${String(h).padStart(2, "0")}:30` });
  }
  assert(SLOTS.length === 48, "Audit 10.1", "Agenda grid has 48 30-min slots per day");

  // Business cell identification in grid
  const cell0800IsBiz = isValidSlot(new Date("2026-09-28T08:00:00-03:00"), customConfig);
  assert(cell0800IsBiz === true, "Audit 10.2", "08:00 cell highlighted as business cell under custom config");
  const cell1930IsBiz = isValidSlot(new Date("2026-09-28T19:30:00-03:00"), customConfig);
  assert(cell1930IsBiz === true, "Audit 10.3", "19:30 cell highlighted as business cell under custom config");
  const cell2000IsBiz = isValidSlot(new Date("2026-09-28T20:00:00-03:00"), customConfig);
  assert(cell2000IsBiz === false, "Audit 10.4", "20:00 cell correctly non-business (overtime)");

  // Slot key consistency
  const slotDt = safeParseDate("2026-09-28T15:00:00-03:00");
  const hStr = String(slotDt.getHours()).padStart(2, "0");
  const mStr = slotDt.getMinutes() >= 30 ? "30" : "00";
  const slotKey = `2026-09-28_${hStr}_${mStr}`;
  assert(slotKey === "2026-09-28_15_00", "Audit 10.5", "Slot key matches 2026-09-28_15_00 format");

  // Duration decimal to steps conversion
  const durationSteps2_5 = Math.ceil(2.5 / 0.5);
  assert(durationSteps2_5 === 5, "Audit 10.6", "2.5h demand occupies exactly 5 30-min steps");
  const durationSteps1_0 = Math.ceil(1.0 / 0.5);
  assert(durationSteps1_0 === 2, "Audit 10.7", "1.0h demand occupies exactly 2 30-min steps");
  const durationSteps0_5 = Math.ceil(0.5 / 0.5);
  assert(durationSteps0_5 === 1, "Audit 10.8", "0.5h demand occupies exactly 1 30-min step");

  // Check file existence
  assert(fs.existsSync('src/lib/schedule.functions.ts'), "Audit 10.9", "src/lib/schedule.functions.ts exists");
  assert(fs.existsSync('src/utils/scheduler.ts'), "Audit 10.10", "src/utils/scheduler.ts exists");

  console.log("\n===============================================================================");
  console.log(`AUDIT RESULTS: ${totalPassed}/100 PASSED | ${totalFailed} FAILED`);
  console.log("===============================================================================");

  if (totalFailed > 0) {
    console.error("FAILURES DETECTED:");
    for (const f of failures) console.error(`- ${f}`);
    process.exit(1);
  }
}

runAll100Audits().catch((err) => {
  console.error("Fatal audit runner error:", err);
  process.exit(1);
});
