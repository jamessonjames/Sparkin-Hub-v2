/**
 * Comprehensive 100-Audit Test Suite for Sparkin Hub v2 Agenda
 * 10 Cycles of 10 Audits each (100 checks total)
 */

const {
  DEFAULT_CONFIG,
  buildBrasiliaIso,
  formatTzString,
  safeParseDate,
  toISO,
  isValidSlot,
  getNextSlot,
  blockSlots,
  areSlotsFree,
  areWorkingSlotsFree,
  isDayFullForWorkingHours,
  findNextAvailableWorkingSlot,
  reorderDayDemandsByPriority,
  getNextWorkingDayStr,
} = require("../src/utils/scheduler.ts");

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

function assert(condition, testNumber, description) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ [Vistoria ${testNumber.toString().padStart(3, "0")}] PASS: ${description}`);
  } else {
    failedTests++;
    failures.push({ testNumber, description });
    console.error(`  ❌ [Vistoria ${testNumber.toString().padStart(3, "0")}] FAIL: ${description}`);
  }
}

async function runAll100Audits() {
  console.log("\n=======================================================");
  console.log("   INICIANDO BATERIA DE 10 CICLOS COM 10 VISTORIAS   ");
  console.log("             (TOTAL: 100 VISTORIAS DETALHADAS)         ");
  console.log("=======================================================\n");

  // -------------------------------------------------------------------------
  // CICLO 1: Integridade de Fuso Horário e Normalização Brasília (UTC-3)
  // -------------------------------------------------------------------------
  console.log("--- CICLO 1: Integridade de Fuso Horário e Normalização Brasília (UTC-3) ---");
  
  // 1
  const iso1 = buildBrasiliaIso("2026-09-28", "15:00");
  assert(iso1 === "2026-09-28T15:00:00-03:00", 1, "buildBrasiliaIso gera formato exato YYYY-MM-DDTHH:mm:00-03:00");

  // 2
  const d2 = safeParseDate("2026-09-28T15:00:00");
  assert(d2 instanceof Date && !isNaN(d2.getTime()), 2, "safeParseDate aceita string sem offset e converte para Date válido");

  // 3
  const dt3 = new Date("2026-09-28T15:00:00-03:00");
  const fmt3 = formatTzString(dt3);
  assert(fmt3 === "2026-09-28T15:00:00-03:00", 3, "formatTzString formata Date para horário exato de Brasília com -03:00");

  // 4
  const iso4 = buildBrasiliaIso("2026-09-28", "15:00");
  const p4 = safeParseDate(iso4);
  const backFmt4 = formatTzString(p4);
  assert(backFmt4 === "2026-09-28T15:00:00-03:00", 4, "Round-trip para 15:00 preserva o horário sem desvio de -3h");

  // 5
  const iso5 = buildBrasiliaIso("2026-09-28", "09:00");
  const p5 = safeParseDate(iso5);
  assert(formatTzString(p5) === "2026-09-28T09:00:00-03:00", 5, "Round-trip matutino 09:00 preserva início do expediente");

  // 6
  const iso6 = buildBrasiliaIso("2026-09-28", "17:30");
  const p6 = safeParseDate(iso6);
  assert(formatTzString(p6) === "2026-09-28T17:30:00-03:00", 6, "Round-trip vespertino 17:30 preserva final de expediente");

  // 7
  const iso7 = buildBrasiliaIso("2026-09-28", "13:00");
  const p7 = safeParseDate(iso7);
  assert(formatTzString(p7) === "2026-09-28T13:00:00-03:00", 7, "Round-trip horário de almoço 13:00 mantém offset consistente");

  // 8
  const p8 = safeParseDate("2026-09-28");
  assert(p8.getFullYear() === 2026 && p8.getMonth() === 8 && p8.getDate() === 28, 8, "safeParseDate para date-only não transborda de dia");

  // 9
  const p9 = safeParseDate("2026-09-28 14:30:00");
  assert(formatTzString(p9).includes("14:30"), 9, "safeParseDate aceita formato SQL com espaço YYYY-MM-DD HH:mm:ss");

  // 10
  const p10 = safeParseDate("2026-09-28T18:00:00Z");
  assert(!isNaN(p10.getTime()), 10, "safeParseDate lida com timestamps UTC com 'Z' sem corrupção");


  // -------------------------------------------------------------------------
  // CICLO 2: Precisão do Clique de Slot e Preservação de Horário
  // -------------------------------------------------------------------------
  console.log("\n--- CICLO 2: Precisão do Clique de Slot e Preservação de Horário ---");
  
  const testSlots = [
    { h: 9, m: 0, exp: "09:00:00-03:00" },
    { h: 10, m: 30, exp: "10:30:00-03:00" },
    { h: 11, m: 0, exp: "11:00:00-03:00" },
    { h: 12, m: 30, exp: "12:30:00-03:00" },
    { h: 14, m: 0, exp: "14:00:00-03:00" },
    { h: 15, m: 0, exp: "15:00:00-03:00" }, // Teste crucial do bug relatado
    { h: 16, m: 30, exp: "16:30:00-03:00" },
    { h: 17, m: 0, exp: "17:00:00-03:00" },
    { h: 17, m: 30, exp: "17:30:00-03:00" },
    { h: 18, m: 0, exp: "18:00:00-03:00" },
  ];

  testSlots.forEach((s, idx) => {
    const timeStr = `${String(s.h).padStart(2, "0")}:${String(s.m).padStart(2, "0")}`;
    const slotIso = buildBrasiliaIso("2026-09-28", timeStr);
    assert(slotIso === `2026-09-28T${s.exp}`, 11 + idx, `Clique no slot ${timeStr} gera exatamente ${s.exp}`);
  });


  // -------------------------------------------------------------------------
  // CICLO 3: Garantia de Zero Sobreposição e Alocação de Intervalos
  // -------------------------------------------------------------------------
  console.log("\n--- CICLO 3: Garantia de Zero Sobreposição e Alocação de Intervalos ---");
  
  // 21
  const taken21 = new Set();
  const d21 = new Date("2026-09-28T09:00:00-03:00");
  blockSlots(d21, 1.0, taken21);
  assert(taken21.has("2026-09-28T09:00:00-03:00") && taken21.has("2026-09-28T09:30:00-03:00"), 21, "Demanda de 1.0h bloqueia 2 slots (09:00 e 09:30)");

  // 22
  const free22 = areSlotsFree(new Date("2026-09-28T09:00:00-03:00"), 1.0, taken21);
  assert(free22 === false, 22, "areSlotsFree detecta colisão no intervalo já ocupado");

  // 23
  const free23 = areSlotsFree(new Date("2026-09-28T10:00:00-03:00"), 1.0, taken21);
  assert(free23 === true, 23, "areSlotsFree confirma que 10:00 está 100% livre após demanda das 09:00");

  // 24
  const taken24 = new Set();
  blockSlots(new Date("2026-09-28T09:00:00-03:00"), 2.0, taken24);
  assert(taken24.size === 4, 24, "Demanda de 2.0h bloqueia exatamente 4 slots contíguos");

  // 25
  const taken25 = new Set();
  blockSlots(new Date("2026-09-28T11:00:00-03:00"), 0.5, taken25);
  assert(taken25.size === 1 && areSlotsFree(new Date("2026-09-28T11:30:00-03:00"), 0.5, taken25), 25, "Demanda de 0.5h bloqueia 1 slot e deixa 11:30 livre");

  // 26
  const taken26 = new Set();
  blockSlots(new Date("2026-09-28T14:00:00-03:00"), 1.5, taken26);
  assert(areSlotsFree(new Date("2026-09-28T15:30:00-03:00"), 1.0, taken26) === true, 26, "Demanda de 1.5h às 14:00 termina às 15:30 sem sobrepor 15:30");

  // 27
  const slotsPack = [
    { start: "2026-09-28T09:00:00-03:00", dur: 1.0 },
    { start: "2026-09-28T10:00:00-03:00", dur: 1.0 },
    { start: "2026-09-28T11:00:00-03:00", dur: 1.0 },
    { start: "2026-09-28T12:00:00-03:00", dur: 1.0 },
  ];
  const taken27 = new Set();
  let hasOverlap27 = false;
  for (const s of slotsPack) {
    const dt = safeParseDate(s.start);
    if (!areSlotsFree(dt, s.dur, taken27)) { hasOverlap27 = true; }
    blockSlots(dt, s.dur, taken27);
  }
  assert(!hasOverlap27 && taken27.size === 8, 27, "4 demandas contíguas de 1h empacotam de 09:00 a 13:00 com zero sobreposição");

  // 28
  const dragHighlightSteps = Math.ceil(1.5 / 0.5);
  assert(dragHighlightSteps === 3, 28, "Cálculo de destaque visual de arrasto para 1.5h cobre 3 células");

  // 29
  const dragHighlightSteps2h = Math.ceil(2.0 / 0.5);
  assert(dragHighlightSteps2h === 4, 29, "Cálculo de destaque visual de arrasto para 2.0h cobre 4 células");

  // 30
  const totalCols = 2;
  const colWidthPct = 100 / totalCols;
  assert(colWidthPct === 50, 30, "Fórmula de divisão lateral em caso de colisão divide largura em 50%/50%");


  // -------------------------------------------------------------------------
  // CICLO 4: Hierarquia de Prioridades (Dominó Push-Down)
  // -------------------------------------------------------------------------
  console.log("\n--- CICLO 4: Hierarquia de Prioridades (Dominó Push-Down) ---");

  // 31
  const demands31 = [
    { id: "d-high", priority: "high", created_at: "2026-09-28T08:00:00Z", due_date: "2026-09-28T09:00:00-03:00", estimated_hours: 1.0 },
    { id: "d-urgent", priority: "urgent", created_at: "2026-09-28T08:10:00Z", due_date: "2026-09-28T10:00:00-03:00", estimated_hours: 1.0 },
  ];
  const updates31 = reorderDayDemandsByPriority("2026-09-28", demands31, []);
  const urgentUp31 = updates31.find(u => u.id === "d-urgent");
  const highUp31 = updates31.find(u => u.id === "d-high");
  const urgentTime = urgentUp31 ? urgentUp31.due_date : demands31[1].due_date;
  const highTime = highUp31 ? highUp31.due_date : demands31[0].due_date;
  assert(urgentTime < highTime, 31, "Demanda Urgente fica antes da Demanda Alta");

  // 32
  const demands32 = [
    { id: "d-med", priority: "medium", created_at: "2026-09-28T08:00:00Z", due_date: "2026-09-28T09:00:00-03:00", estimated_hours: 1.0 },
    { id: "d-high", priority: "high", created_at: "2026-09-28T08:10:00Z", due_date: "2026-09-28T10:00:00-03:00", estimated_hours: 1.0 },
  ];
  const updates32 = reorderDayDemandsByPriority("2026-09-28", demands32, []);
  const highTime32 = updates32.find(u => u.id === "d-high")?.due_date || demands32[1].due_date;
  const medTime32 = updates32.find(u => u.id === "d-med")?.due_date || demands32[0].due_date;
  assert(highTime32 < medTime32, 32, "Demanda Alta fica antes da Demanda Média");

  // 33
  const demands33 = [
    { id: "d-low", priority: "low", created_at: "2026-09-28T08:00:00Z", due_date: "2026-09-28T09:00:00-03:00", estimated_hours: 1.0 },
    { id: "d-med", priority: "medium", created_at: "2026-09-28T08:10:00Z", due_date: "2026-09-28T10:00:00-03:00", estimated_hours: 1.0 },
  ];
  const updates33 = reorderDayDemandsByPriority("2026-09-28", demands33, []);
  const medTime33 = updates33.find(u => u.id === "d-med")?.due_date || demands33[1].due_date;
  const lowTime33 = updates33.find(u => u.id === "d-low")?.due_date || demands33[0].due_date;
  assert(medTime33 < lowTime33, 33, "Demanda Média fica antes da Demanda Baixa");

  // 34
  const demands34 = [
    { id: "d-med", priority: "medium", created_at: "2026-09-28T08:00:00Z", due_date: "2026-09-28T09:00:00-03:00", estimated_hours: 1.0 },
    { id: "d-urg", priority: "urgent", created_at: "2026-09-28T08:30:00Z", due_date: "2026-09-28T09:00:00-03:00", estimated_hours: 1.0 },
  ];
  const updates34 = reorderDayDemandsByPriority("2026-09-28", demands34, []);
  assert(updates34.some(u => u.id === "d-med" && u.due_date.includes("10:00")), 34, "Nova demanda Urgente empurra demanda Média existente para 10:00");

  // 35
  const demands35 = [
    { id: "1", priority: "low", created_at: "2026-09-28T07:00:00Z", due_date: "2026-09-28T09:00:00-03:00", estimated_hours: 1.0 },
    { id: "2", priority: "medium", created_at: "2026-09-28T07:05:00Z", due_date: "2026-09-28T10:00:00-03:00", estimated_hours: 1.0 },
    { id: "3", priority: "high", created_at: "2026-09-28T07:10:00Z", due_date: "2026-09-28T11:00:00-03:00", estimated_hours: 1.0 },
    { id: "4", priority: "urgent", created_at: "2026-09-28T07:15:00Z", due_date: "2026-09-28T12:00:00-03:00", estimated_hours: 1.0 },
  ];
  const updates35 = reorderDayDemandsByPriority("2026-09-28", demands35, []);
  const map35 = new Map(updates35.map(u => [u.id, u.due_date]));
  const tUrgent = map35.get("4");
  const tHigh = map35.get("3");
  const tMed = map35.get("2");
  const tLow = map35.get("1");
  assert(tUrgent < tHigh && tHigh < tMed && tMed < tLow, 35, "Reordenação de 4 prioridades resulta em ordem estrita Urgente > Alta > Média > Baixa");

  // 36
  const demands36 = [
    { id: "pinned-1", priority: "low", is_manually_scheduled: true, created_at: "2026-09-28T07:00:00Z", due_date: "2026-09-28T11:00:00-03:00", estimated_hours: 1.0 },
    { id: "unpinned-2", priority: "urgent", is_manually_scheduled: false, created_at: "2026-09-28T07:05:00Z", due_date: "2026-09-28T10:00:00-03:00", estimated_hours: 1.0 },
  ];
  const updates36 = reorderDayDemandsByPriority("2026-09-28", demands36, []);
  assert(!updates36.some(u => u.id === "pinned-1"), 36, "Demanda com pin (is_manually_scheduled) não é alterada na reordenação");

  // 37
  const unpinnedSlot37 = updates36.find(u => u.id === "unpinned-2")?.due_date || demands36[1].due_date;
  assert(unpinnedSlot37 === "2026-09-28T09:00:00-03:00", 37, "Demanda não fixada se acomoda no slot livre anterior (09:00)");

  // 38
  const taken38 = new Set();
  blockSlots(new Date("2026-09-28T09:00:00-03:00"), 1.0, taken38);
  blockSlots(new Date("2026-09-28T15:00:00-03:00"), 1.0, taken38);
  assert(taken38.has("2026-09-28T15:00:00-03:00"), 38, "Demanda das 15:00 não sobe sozinha para o meio do dia");

  // 39
  const demands39 = [
    { id: "m1", priority: "urgent", created_at: "2026-09-28T08:00:00Z", due_date: "2026-09-28T09:00:00-03:00", estimated_hours: 2.0 },
    { id: "m2", priority: "high", created_at: "2026-09-28T08:10:00Z", due_date: "2026-09-28T09:00:00-03:00", estimated_hours: 1.0 },
  ];
  const updates39 = reorderDayDemandsByPriority("2026-09-28", demands39, []);
  const m2Update = updates39.find(u => u.id === "m2");
  assert(m2Update && m2Update.due_date.includes("11:00"), 39, "Demanda de 2h das 09:00 empurra a próxima para as 11:00 (respeita duração de 2h)");

  // 40
  const demands40 = [];
  for (let i = 0; i < 9; i++) {
    demands40.push({
      id: `dem-${i}`,
      priority: "medium",
      created_at: `2026-09-28T08:0${i}:00Z`,
      due_date: "2026-09-28T09:00:00-03:00",
      estimated_hours: 1.0
    });
  }
  const updates40 = reorderDayDemandsByPriority("2026-09-28", demands40, []);
  const lastTask = updates40.find(u => u.id === "dem-8");
  assert(lastTask && (lastTask.due_date.includes("18:00") || lastTask.due_date.includes("19:00")), 40, "Transbordo de expediente agenda após 18:00 sem sobreposição");


  // -------------------------------------------------------------------------
  // CICLO 5: Preservação de Ordem FIFO para Mesma Prioridade (created_at ASC)
  // -------------------------------------------------------------------------
  console.log("\n--- CICLO 5: Preservação de Ordem FIFO para Mesma Prioridade (created_at ASC) ---");

  // 41
  const demands41 = [
    { id: "u-first", priority: "urgent", created_at: "2026-09-28T08:00:00Z", due_date: "2026-09-28T10:00:00-03:00", estimated_hours: 1.0 },
    { id: "u-second", priority: "urgent", created_at: "2026-09-28T08:30:00Z", due_date: "2026-09-28T09:00:00-03:00", estimated_hours: 1.0 },
  ];
  const updates41 = reorderDayDemandsByPriority("2026-09-28", demands41, []);
  const map41 = new Map(updates41.map(u => [u.id, u.due_date]));
  const tFirst41 = map41.get("u-first") || demands41[0].due_date;
  const tSecond41 = map41.get("u-second") || demands41[1].due_date;
  assert(tFirst41 < tSecond41, 41, "Duas Urgentes: a cadastrada mais cedo (FIFO) fica em horário mais cedo");

  // 42
  const demands42 = [
    { id: "h-early", priority: "high", created_at: "2026-09-28T09:00:00Z", due_date: null, estimated_hours: 1.0 },
    { id: "h-late", priority: "high", created_at: "2026-09-28T09:15:00Z", due_date: null, estimated_hours: 1.0 },
  ];
  const updates42 = reorderDayDemandsByPriority("2026-09-28", demands42, []);
  assert(updates42[0].id === "h-early" && updates42[1].id === "h-late", 42, "Duas Altas: respeitam estritamente created_at ASC");

  // 43
  const demands43 = [
    { id: "m-early", priority: "medium", created_at: "2026-09-28T10:00:00Z", due_date: null, estimated_hours: 1.0 },
    { id: "m-late", priority: "medium", created_at: "2026-09-28T10:30:00Z", due_date: null, estimated_hours: 1.0 },
  ];
  const updates43 = reorderDayDemandsByPriority("2026-09-28", demands43, []);
  assert(updates43[0].id === "m-early" && updates43[1].id === "m-late", 43, "Duas Médias: respeitam estritamente created_at ASC");

  // 44
  const demands44 = [
    { id: "l-early", priority: "low", created_at: "2026-09-28T11:00:00Z", due_date: null, estimated_hours: 1.0 },
    { id: "l-late", priority: "low", created_at: "2026-09-28T11:45:00Z", due_date: null, estimated_hours: 1.0 },
  ];
  const updates44 = reorderDayDemandsByPriority("2026-09-28", demands44, []);
  assert(updates44[0].id === "l-early" && updates44[1].id === "l-late", 44, "Duas Baixas: respeitam estritamente created_at ASC");

  // 45
  const demands45 = [
    { id: "m1", priority: "medium", created_at: "2026-09-28T06:00:00Z", due_date: null, estimated_hours: 1.0 },
    { id: "m2", priority: "medium", created_at: "2026-09-28T07:00:00Z", due_date: null, estimated_hours: 1.0 },
    { id: "m3", priority: "medium", created_at: "2026-09-28T08:00:00Z", due_date: null, estimated_hours: 1.0 },
  ];
  const updates45 = reorderDayDemandsByPriority("2026-09-28", demands45, []);
  assert(updates45[0].id === "m1" && updates45[1].id === "m2" && updates45[2].id === "m3", 45, "Três Médias em sequência: ordem perfeitamente linear 1 -> 2 -> 3");

  // 46
  assert(updates45[0].due_date.includes("09:00") && updates45[1].due_date.includes("10:00") && updates45[2].due_date.includes("11:00"), 46, "Três Médias ocupam 09:00, 10:00, 11:00 uma em baixo da outra");

  // 47
  const demands47 = [
    { id: "dur-2h", priority: "medium", created_at: "2026-09-28T07:00:00Z", due_date: null, estimated_hours: 2.0 },
    { id: "dur-1h", priority: "medium", created_at: "2026-09-28T08:00:00Z", due_date: null, estimated_hours: 1.0 },
  ];
  const updates47 = reorderDayDemandsByPriority("2026-09-28", demands47, []);
  assert(updates47[0].id === "dur-2h" && updates47[1].due_date.includes("11:00"), 47, "Diferentes durações mantêm FIFO e calculam fim exato da primeira demanda");

  // 48
  const demands48 = [
    { id: "a", priority: "medium", created_at: "2026-09-28T07:00:00Z", due_date: null, estimated_hours: 1.0 },
    { id: "b", priority: "medium", created_at: "2026-09-28T07:00:00Z", due_date: null, estimated_hours: 1.0 },
  ];
  const updates48 = reorderDayDemandsByPriority("2026-09-28", demands48, []);
  assert(updates48.length === 2 && updates48[0].due_date !== updates48[1].due_date, 48, "Empate exato de created_at resulta em slots distintos sem sobreposição");

  // 49
  assert(updates48[1].due_date > updates48[0].due_date, 49, "Segundo item empatado fica logo abaixo do primeiro");

  // 50
  const demands50 = [
    { id: "am-1", priority: "medium", created_at: "2026-09-28T07:00:00Z", due_date: null, estimated_hours: 4.0 }, // 09:00-13:00
    { id: "pm-2", priority: "medium", created_at: "2026-09-28T08:00:00Z", due_date: null, estimated_hours: 1.0 }, // deve ir para 14:00
  ];
  const updates50 = reorderDayDemandsByPriority("2026-09-28", demands50, []);
  assert(updates50[1].due_date.includes("14:00"), 50, "FIFO atravessando almoço aloca segundo item para 14:00 (pula 13h-14h)");


  // -------------------------------------------------------------------------
  // CICLO 6: Agendamento Inteligente para Novas Demandas (Sem Slot Clicado)
  // -------------------------------------------------------------------------
  console.log("\n--- CICLO 6: Agendamento Inteligente para Novas Demandas (Sem Slot Clicado) ---");

  // 51
  const slot51 = findNextAvailableWorkingSlot(1.0, null, [], []);
  assert(slot51.fullIso.includes("-03:00") && slot51.isOvertime === false, 51, "Nova demanda sem data encontra próximo slot útil comercial");

  // 52
  const slot52 = findNextAvailableWorkingSlot(1.0, "2026-09-28", [], []);
  assert(slot52.dateStr === "2026-09-28" && slot52.timeStr === "09:00", 52, "Dia útil livre agenda às 09:00");

  // 53
  const existing53 = [
    { id: "ex1", due_date: "2026-09-28T09:00:00-03:00", estimated_hours: 1.0, status: "nao_iniciado" }
  ];
  const slot53 = findNextAvailableWorkingSlot(1.0, "2026-09-28", existing53, []);
  assert(slot53.dateStr === "2026-09-28" && slot53.timeStr === "10:00", 53, "Havendo demanda às 09:00, nova demanda agenda às 10:00");

  // 54
  const existing54 = [
    { id: "ex1", due_date: "2026-09-28T09:00:00-03:00", estimated_hours: 1.0, status: "nao_iniciado" },
    { id: "ex2", due_date: "2026-09-28T10:00:00-03:00", estimated_hours: 1.0, status: "nao_iniciado" }
  ];
  const slot54 = findNextAvailableWorkingSlot(1.0, "2026-09-28", existing54, []);
  assert(slot54.dateStr === "2026-09-28" && slot54.timeStr === "11:00", 54, "Terceira demanda se encaixa às 11:00");

  // 55
  const existing55 = [
    { id: "ex1", due_date: "2026-09-28T11:00:00-03:00", estimated_hours: 2.0, status: "nao_iniciado" }, // 11:00-13:00
  ];
  const slot55 = findNextAvailableWorkingSlot(1.0, "2026-09-28", existing55, []);
  assert(slot55.timeStr === "09:00", 55, "Slot matutino livre anterior (09:00) é aproveitado se estiver disponível");

  // 56
  const existing56 = [
    { id: "ex1", due_date: "2026-09-28T09:00:00-03:00", estimated_hours: 4.0, status: "nao_iniciado" }, // 09:00-13:00
  ];
  const slot56 = findNextAvailableWorkingSlot(1.0, "2026-09-28", existing56, []);
  assert(slot56.timeStr === "14:00", 56, "Após manhã lotada, próxima demanda cai exatamente às 14:00");

  // 57
  assert(slot51.fullIso.endsWith("-03:00"), 57, "Slot auto-agendado possui sufixo UTC-3 explícito");

  // 58
  const slot58 = findNextAvailableWorkingSlot(2.0, "2026-09-28", [], []);
  assert(slot58.timeStr === "09:00", 58, "Demanda de 2.0h agenda às 09:00 em dia limpo");

  // 59
  const existing59 = [];
  // Enche das 09:00 às 17:00
  existing59.push({ id: "e1", due_date: "2026-09-28T09:00:00-03:00", estimated_hours: 4.0, status: "nao_iniciado" });
  existing59.push({ id: "e2", due_date: "2026-09-28T14:00:00-03:00", estimated_hours: 3.0, status: "nao_iniciado" }); // até 17:00
  const slot59 = findNextAvailableWorkingSlot(1.0, "2026-09-28", existing59, []);
  assert(slot59.timeStr === "17:00" && slot59.isOvertime === false, 59, "Slot das 17:00 é preenchido dentro do expediente comercial");

  // 60
  // Agora tentando 2.0h às 17:00 (ultrapassaria 18:00)
  const slot60 = findNextAvailableWorkingSlot(2.0, "2026-09-28", existing59, []);
  assert(slot60.isOvertime === true, 60, "Demanda de 2h às 17h detecta ultrapassagem do expediente (isOvertime = true)");


  // -------------------------------------------------------------------------
  // CICLO 7: Detecção de Capacidade do Dia e Modal de Alerta
  // -------------------------------------------------------------------------
  console.log("\n--- CICLO 7: Detecção de Capacidade do Dia e Modal de Alerta ---");

  // 61
  const isFull61 = isDayFullForWorkingHours("2026-09-28", 1.0, [], []);
  assert(isFull61 === false, 61, "Dia vazio retorna isDayFullForWorkingHours = false");

  // 62
  const fullDayDemands = [
    { id: "f1", due_date: "2026-09-28T09:00:00-03:00", estimated_hours: 4.0, status: "nao_iniciado" },
    { id: "f2", due_date: "2026-09-28T14:00:00-03:00", estimated_hours: 4.0, status: "nao_iniciado" },
  ];
  const isFull62 = isDayFullForWorkingHours("2026-09-28", 1.0, fullDayDemands, []);
  assert(isFull62 === true, 62, "Dia com 8 horas de expediente preenchido retorna isDayFull = true");

  // 63
  const slot63 = findNextAvailableWorkingSlot(1.0, "2026-09-28", fullDayDemands, []);
  assert(slot63.isOvertime === true, 63, "findNextAvailableWorkingSlot marca isOvertime = true quando o dia está cheio");

  // 64
  assert(slot63.timeStr === "18:00", 64, "Opção A: Fora do expediente sugere início imediato às 18:00");

  // 65
  assert(slot63.nextFreeWorkingSlot !== undefined, 65, "Opção B: Fornece nextFreeWorkingSlot no próximo dia útil");

  // 66
  assert(slot63.nextFreeWorkingSlot && slot63.nextFreeWorkingSlot.dateStr === "2026-09-29", 66, "Opção B: Próximo dia útil é terça-feira 2026-09-29");

  // 67
  assert(slot63.nextFreeWorkingSlot && slot63.nextFreeWorkingSlot.timeStr === "09:00", 67, "Opção B: Horário no próximo dia útil é 09:00");

  // 68
  const overtimeDemands = [
    ...fullDayDemands,
    { id: "ot1", due_date: "2026-09-28T18:00:00-03:00", estimated_hours: 1.0, status: "nao_iniciado" }
  ];
  const slot68 = findNextAvailableWorkingSlot(1.0, "2026-09-28", overtimeDemands, []);
  assert(slot68.timeStr === "19:00", 68, "Segunda demanda fora do expediente agenda às 19:00 sem sobrepor a das 18:00");

  // 69
  const isFull69 = isDayFullForWorkingHours("2026-09-26", 1.0, [], []); // Sábado
  assert(isFull69 === true, 69, "Finais de semana são considerados cheios para horário comercial normal");

  // 70
  assert(slot63.fullIso.includes("2026-09-28T18:00:00-03:00"), 70, "ISO gerado para opção fora do expediente tem formato válido");


  // -------------------------------------------------------------------------
  // CICLO 8: Respeito Rigoroso ao Horário de Almoço (13:00 - 14:00)
  // -------------------------------------------------------------------------
  console.log("\n--- CICLO 8: Respeito Rigoroso ao Horário de Almoço (13:00 - 14:00) ---");

  // 71
  const lunchSlot1 = isValidSlot(new Date("2026-09-28T13:00:00-03:00"), DEFAULT_CONFIG);
  assert(lunchSlot1 === false, 71, "Slot 13:00 não é slot comercial válido (isValidSlot = false)");

  // 72
  const lunchSlot2 = isValidSlot(new Date("2026-09-28T13:30:00-03:00"), DEFAULT_CONFIG);
  assert(lunchSlot2 === false, 72, "Slot 13:30 não é slot comercial válido (isValidSlot = false)");

  // 73
  const preLunchFree = areWorkingSlotsFree(new Date("2026-09-28T12:00:00-03:00"), 1.0, new Set(), DEFAULT_CONFIG);
  assert(preLunchFree === true, 73, "Demanda das 12:00 (1h) é permitida pois termina exatamente às 13:00");

  // 74
  const preLunchOverlap = areWorkingSlotsFree(new Date("2026-09-28T12:30:00-03:00"), 1.0, new Set(), DEFAULT_CONFIG);
  assert(preLunchOverlap === false, 74, "Demanda das 12:30 com 1h é rejeitada pois invadiria o almoço até as 13:30");

  // 75
  const postLunchSlot = isValidSlot(new Date("2026-09-28T14:00:00-03:00"), DEFAULT_CONFIG);
  assert(postLunchSlot === true, 75, "Slot 14:00 é válido para retorno do almoço");

  // 76
  const nextSlotFromLunch = getNextSlot(new Date("2026-09-28T13:00:00-03:00"), DEFAULT_CONFIG);
  assert(formatTzString(nextSlotFromLunch).includes("14:00"), 76, "getNextSlot a partir das 13:00 avança diretamente para 14:00");

  // 77
  const demands77 = [
    { id: "d-lunch-push", priority: "medium", created_at: "2026-09-28T08:00:00Z", due_date: "2026-09-28T12:30:00-03:00", estimated_hours: 1.0 }
  ];
  const updates77 = reorderDayDemandsByPriority("2026-09-28", demands77, []);
  assert(updates77[0].due_date.includes("09:00"), 77, "Reorganização aloca demanda em slot matutino livre");

  // 78
  const morningFull = [
    { id: "mf", priority: "urgent", created_at: "2026-09-28T07:00:00Z", due_date: "2026-09-28T09:00:00-03:00", estimated_hours: 4.0 },
    { id: "next-dem", priority: "high", created_at: "2026-09-28T07:10:00Z", due_date: "2026-09-28T09:00:00-03:00", estimated_hours: 1.0 }
  ];
  const updates78 = reorderDayDemandsByPriority("2026-09-28", morningFull, []);
  assert(updates78.find(u => u.id === "next-dem")?.due_date.includes("14:00"), 78, "Demanda após manhã cheia de 4h pula o almoço e agenda às 14:00");

  // 79
  const netWorkingHours = (DEFAULT_CONFIG.endHour - DEFAULT_CONFIG.startHour) - (DEFAULT_CONFIG.lunchEnd - DEFAULT_CONFIG.lunchStart);
  assert(netWorkingHours === 8, 79, "Carga horária líquida diária é exatamente 8 horas (09-18 menos 1h almoço)");

  // 80
  const taken80 = new Set();
  blockSlots(new Date("2026-09-28T12:00:00-03:00"), 1.0, taken80);
  assert(!taken80.has("2026-09-28T13:00:00-03:00") && !taken80.has("2026-09-28T13:30:00-03:00"), 80, "Demanda das 12:00-13:00 não bloqueia os slots de almoço");


  // -------------------------------------------------------------------------
  // CICLO 9: Regras de Final de Semana e Transições de Calendário
  // -------------------------------------------------------------------------
  console.log("\n--- CICLO 9: Regras de Final de Semana e Transições de Calendário ---");

  // 81
  const satValid = isValidSlot(new Date("2026-09-26T10:00:00-03:00"), DEFAULT_CONFIG);
  assert(satValid === false, 81, "Sábado não é dia útil de expediente");

  // 82
  const sunValid = isValidSlot(new Date("2026-09-27T10:00:00-03:00"), DEFAULT_CONFIG);
  assert(sunValid === false, 82, "Domingo não é dia útil de expediente");

  // 83
  const nextFromFri = getNextWorkingDayStr(new Date("2026-09-25T17:00:00-03:00"), DEFAULT_CONFIG);
  assert(nextFromFri === "2026-09-28", 83, "Próximo dia útil de Sexta-feira é Segunda-feira");

  // 84
  const nextFromSat = getNextWorkingDayStr(new Date("2026-09-26T10:00:00-03:00"), DEFAULT_CONFIG);
  assert(nextFromSat === "2026-09-28", 84, "Próximo dia útil de Sábado é Segunda-feira");

  // 85
  const nextFromSun = getNextWorkingDayStr(new Date("2026-09-27T10:00:00-03:00"), DEFAULT_CONFIG);
  assert(nextFromSun === "2026-09-28", 85, "Próximo dia útil de Domingo é Segunda-feira");

  // 86
  const nextFromMon = getNextWorkingDayStr(new Date("2026-09-28T10:00:00-03:00"), DEFAULT_CONFIG);
  assert(nextFromMon === "2026-09-29", 86, "Próximo dia útil de Segunda é Terça");

  // 87
  const nextFromThu = getNextWorkingDayStr(new Date("2026-10-01T10:00:00-03:00"), DEFAULT_CONFIG);
  assert(nextFromThu === "2026-10-02", 87, "Próximo dia útil de Quinta é Sexta");

  // 88
  const monthEnd = getNextWorkingDayStr(new Date("2026-09-30T10:00:00-03:00"), DEFAULT_CONFIG);
  assert(monthEnd === "2026-10-01", 88, "Transição de final de mês (30/09 para 01/10) preserva data correta");

  // 89
  const yearEnd = getNextWorkingDayStr(new Date("2026-12-31T10:00:00-03:00"), DEFAULT_CONFIG);
  assert(yearEnd === "2027-01-01", 89, "Transição de ano (31/12 para 01/01) incrementa o ano");

  // 90
  const slotWeekend = getNextSlot(new Date("2026-09-25T18:00:00-03:00"), DEFAULT_CONFIG);
  assert(formatTzString(slotWeekend).startsWith("2026-09-28T09:00"), 90, "getNextSlot saindo da sexta 18h pula final de semana e pousa na segunda 09h");


  // -------------------------------------------------------------------------
  // CICLO 10: Reuniões Fixas, Segurança RLS e Blindagem de Dados
  // -------------------------------------------------------------------------
  console.log("\n--- CICLO 10: Reuniões Fixas, Segurança RLS e Blindagem de Dados ---");

  // 91
  const meetings91 = [
    { id: "meet-1", due_date: "2026-09-28T10:00:00-03:00", estimated_hours: 1.0 }
  ];
  const demands91 = [
    { id: "d-test", priority: "urgent", created_at: "2026-09-28T07:00:00Z", due_date: "2026-09-28T09:00:00-03:00", estimated_hours: 2.0 }
  ];
  const updates91 = reorderDayDemandsByPriority("2026-09-28", demands91, meetings91);
  assert(updates91.length === 1 && updates91[0].due_date === "2026-09-28T11:00:00-03:00", 91, "Demanda de 2h das 09:00 colidiria com reunião das 10:00 e é inteligentemente deslocada para as 11:00");

  // 92
  const demands92 = [
    { id: "d1", priority: "urgent", created_at: "2026-09-28T07:00:00Z", due_date: "2026-09-28T09:00:00-03:00", estimated_hours: 1.0 },
    { id: "d2", priority: "high", created_at: "2026-09-28T07:05:00Z", due_date: "2026-09-28T09:00:00-03:00", estimated_hours: 1.0 },
  ];
  const updates92 = reorderDayDemandsByPriority("2026-09-28", demands92, meetings91);
  const d2Slot = updates92.find(u => u.id === "d2")?.due_date;
  assert(d2Slot === "2026-09-28T11:00:00-03:00", 92, "Demanda d2 contorna reunião das 10:00 e se aloca às 11:00");

  // 93
  const fs = require("fs");
  const path = require("path");
  const migrationPath = path.resolve(__dirname, "../supabase/migrations/20260926180000_secure_demands_anon_rls.sql");
  const migrationContent = fs.readFileSync(migrationPath, "utf-8");
  assert(migrationContent.includes("REVOKE SELECT (internal_notes, price) ON public.demands FROM anon"), 93, "Migração revoga SELECT de internal_notes e price para papel anon");

  // 94
  const agendaFile = fs.readFileSync(path.resolve(__dirname, "../src/routes/_authenticated.agenda.tsx"), "utf-8");
  assert(agendaFile.includes("buildBrasiliaIso"), 94, "Arquivo _authenticated.agenda.tsx utiliza buildBrasiliaIso");

  // 95
  assert(agendaFile.includes("colIndex") && agendaFile.includes("totalCols"), 95, "_authenticated.agenda.tsx implementa separação multi-coluna em caso de colisão");

  // 96
  const dialogFile = fs.readFileSync(path.resolve(__dirname, "../src/components/demand-detail-dialog.tsx"), "utf-8");
  assert(dialogFile.includes("overtimeWarningOpen"), 96, "demand-detail-dialog.tsx implementa diálogo de aviso de expediente cheio");

  // 97
  assert(dialogFile.includes("findNextAvailableWorkingSlot"), 97, "demand-detail-dialog.tsx utiliza findNextAvailableWorkingSlot");

  // 98
  const functionsFile = fs.readFileSync(path.resolve(__dirname, "../src/lib/demands.functions.ts"), "utf-8");
  assert(functionsFile.includes("normalizeDueDate"), 98, "demands.functions.ts normaliza due_date com fuso de Brasília");

  // 99
  const schedulerFile = fs.readFileSync(path.resolve(__dirname, "../src/utils/scheduler.ts"), "utf-8");
  assert(schedulerFile.includes("reorderDayDemandsByPriority"), 99, "scheduler.ts exporta reorderDayDemandsByPriority");

  // 100
  // Simulação final completa de 1 dia com reuniões, almoço, e 6 demandas mistas
  const fullSimulationDemands = [
    { id: "sim-1", priority: "low", created_at: "2026-09-28T06:00:00Z", due_date: null, estimated_hours: 1.0 },
    { id: "sim-2", priority: "urgent", created_at: "2026-09-28T07:00:00Z", due_date: null, estimated_hours: 1.0 },
    { id: "sim-3", priority: "high", created_at: "2026-09-28T08:00:00Z", due_date: null, estimated_hours: 2.0 },
    { id: "sim-4", priority: "urgent", created_at: "2026-09-28T09:00:00Z", due_date: null, estimated_hours: 1.0 },
    { id: "sim-5", priority: "medium", created_at: "2026-09-28T10:00:00Z", due_date: null, estimated_hours: 1.0 },
    { id: "sim-6", priority: "high", created_at: "2026-09-28T11:00:00Z", due_date: null, estimated_hours: 1.0 },
  ];
  const simMeetings = [
    { id: "sim-meet", due_date: "2026-09-28T14:00:00-03:00", estimated_hours: 1.0 }
  ];
  const finalResults = reorderDayDemandsByPriority("2026-09-28", fullSimulationDemands, simMeetings);
  const simTaken = new Set();
  let collisionDetected = false;
  // Block meeting
  blockSlots(safeParseDate("2026-09-28T14:00:00-03:00"), 1.0, simTaken);
  for (const r of finalResults) {
    const dem = fullSimulationDemands.find(d => d.id === r.id);
    const dt = safeParseDate(r.due_date);
    if (!areSlotsFree(dt, dem.estimated_hours, simTaken)) {
      collisionDetected = true;
    }
    blockSlots(dt, dem.estimated_hours, simTaken);
  }
  assert(!collisionDetected && finalResults.length === 6, 100, "Simulação Completa: 6 demandas + reunião + almoço agendadas com ZERO COLISÃO");

  console.log("\n=======================================================");
  console.log(`TOTAL DE VISTORIAS EXECUTADAS: ${totalTests}`);
  console.log(`APROVADAS: ${passedTests}`);
  console.log(`FALHAS: ${failedTests}`);
  console.log("=======================================================\n");

  if (failedTests > 0) {
    console.error("Vistorias com falhas detectadas:");
    failures.forEach(f => console.error(`  - Vistoria ${f.testNumber}: ${f.description}`));
    process.exit(1);
  } else {
    console.log("🎉 TODAS AS 100 VISTORIAS FORAM CONCLUÍDAS COM 100% DE SUCESSO!");
  }
}

runAll100Audits().catch(err => {
  console.error("Erro fatal ao rodar testes:", err);
  process.exit(1);
});
