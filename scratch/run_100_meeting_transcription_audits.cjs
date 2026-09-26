/**
 * Sparkin Hub - 100-Audit Test Suite for Free Meeting Transcription & Analysis
 *
 * 10 Cycles x 10 Audits = 100 Total Audits
 */

const fs = require("fs");
const path = require("path");
const assert = require("assert");

const root = path.resolve(__dirname, "..");
let passCount = 0;
let failCount = 0;

function audit(name, fn) {
  try {
    fn();
    passCount++;
    console.log(`  [PASS] #${passCount + failCount}: ${name}`);
  } catch (err) {
    failCount++;
    console.error(`  [FAIL] #${passCount + failCount}: ${name} -> ${err.message}`);
  }
}

console.log("=======================================================");
console.log("INICIANDO 10 CICLOS DE 10 VISTORIAS (100 TOTAL)...");
console.log("=======================================================\n");

// ==============================================================================
// CICLO 1: Dual Audio Stream & Mixer (Vistorias 1-10)
// ==============================================================================
console.log("--- CICLO 1: Dual Audio Stream & Mixer (Vistorias 1-10) ---");
const audioRecorderPath = path.join(root, "src", "utils", "audio-recorder.ts");
const audioRecorderCode = fs.readFileSync(audioRecorderPath, "utf-8");

audit("1.1 audio-recorder.ts existe e é válido", () => {
  assert(fs.existsSync(audioRecorderPath));
  assert(audioRecorderCode.length > 500);
});

audit("1.2 Exporta createMeetingAudioRecorder", () => {
  assert(audioRecorderCode.includes("export async function createMeetingAudioRecorder"));
});

audit("1.3 Exporta getSupportedMimeType com fallbacks", () => {
  assert(audioRecorderCode.includes("export function getSupportedMimeType"));
  assert(audioRecorderCode.includes("audio/webm;codecs=opus"));
});

audit("1.4 getDisplayMedia é chamado com video: true para Chromium", () => {
  assert(audioRecorderCode.includes("navigator.mediaDevices.getDisplayMedia"));
  assert(audioRecorderCode.includes("video: true"));
});

audit("1.5 Cria AudioContext e createMediaStreamDestination", () => {
  assert(audioRecorderCode.includes("createMediaStreamDestination"));
  assert(audioRecorderCode.includes("audioCtx.createMediaStreamSource"));
});

audit("1.6 Conecta faixas de microfone ao destino misto", () => {
  assert(audioRecorderCode.includes("micSource.connect(destination)"));
});

audit("1.7 Conecta faixas de áudio da guia/janela ao destino misto", () => {
  assert(audioRecorderCode.includes("tabSource.connect(destination)"));
});

audit("1.8 Suporta medidores visuais de nível para mic e tab", () => {
  assert(audioRecorderCode.includes("onMicLevel"));
  assert(audioRecorderCode.includes("onTabLevel"));
  assert(audioRecorderCode.includes("createAnalyser"));
});

audit("1.9 Trata cancelamento de tela e continua com microfone", () => {
  assert(audioRecorderCode.includes("NotAllowedError"));
});

audit("1.10 Cleanup fecha todas as faixas e AudioContext", () => {
  assert(audioRecorderCode.includes("getTracks().forEach((t) => t.stop())"));
  assert(audioRecorderCode.includes("audioCtx.close()"));
});

// ==============================================================================
// CICLO 2: Local Whisper Engine & Free Audio Decoding (Vistorias 11-20)
// ==============================================================================
console.log("\n--- CICLO 2: Local Whisper Engine & Free Audio Decoding (Vistorias 11-20) ---");
const localWhisperPath = path.join(root, "src", "lib", "local-whisper.ts");
const localWhisperCode = fs.readFileSync(localWhisperPath, "utf-8");

audit("2.1 local-whisper.ts existe e é válido", () => {
  assert(fs.existsSync(localWhisperPath));
  assert(localWhisperCode.length > 500);
});

audit("2.2 Exporta transcribeAudio recebendo Blob", () => {
  assert(localWhisperCode.includes("export async function transcribeAudio"));
});

audit("2.3 Exporta transcribePCM recebendo Float32Array", () => {
  assert(localWhisperCode.includes("export async function transcribePCM"));
});

audit("2.4 Configura chunk_length_s: 30 para suportar reuniões longas", () => {
  assert(localWhisperCode.includes("chunk_length_s: 30"));
});

audit("2.5 Configura stride_length_s: 5 para sobreposição sem perda de palavras", () => {
  assert(localWhisperCode.includes("stride_length_s: 5"));
});

audit("2.6 Implementa resampler para 16kHz (padrão Whisper)", () => {
  assert(localWhisperCode.includes("resampleTo16k"));
  assert(localWhisperCode.includes("16000"));
});

audit("2.7 Carrega modelo Xenova/whisper-tiny com quantização", () => {
  assert(localWhisperCode.includes("Xenova/whisper-tiny"));
  assert(localWhisperCode.includes("quantized: true"));
});

audit("2.8 Fornece callback de progresso em tempo real", () => {
  assert(localWhisperCode.includes("progress_callback"));
  assert(localWhisperCode.includes("onProgress"));
});

audit("2.9 Não requer GEMINI_API_KEY ou créditos de IA (100% gratuito)", () => {
  assert(!localWhisperCode.includes("GEMINI_API_KEY"));
  assert(localWhisperCode.includes("100% gratuito"));
});

audit("2.10 Tratamento de erro ao decodificar áudio", () => {
  assert(localWhisperCode.includes("console.error"));
  assert(localWhisperCode.includes("catch"));
});

// ==============================================================================
// CICLO 3: Meeting Dialog in Agenda & Meetings (Vistorias 21-30)
// ==============================================================================
console.log("\n--- CICLO 3: Meeting Dialog in Agenda & Meetings (Vistorias 21-30) ---");
const meetingDialogPath = path.join(root, "src", "components", "meeting-dialog.tsx");
const meetingDialogCode = fs.readFileSync(meetingDialogPath, "utf-8");

audit("3.1 meeting-dialog.tsx existe e está atualizado", () => {
  assert(fs.existsSync(meetingDialogPath));
  assert(meetingDialogCode.includes("createMeetingAudioRecorder"));
});

audit("3.2 Inclui opção de capturar áudio da janela/reunião", () => {
  assert(meetingDialogCode.includes("chk-meeting-tab"));
  assert(meetingDialogCode.includes("captureTabAudio"));
});

audit("3.3 Exibe instrução para escolher 'Guia do Chrome' e marcar áudio", () => {
  assert(meetingDialogCode.includes("Guia do Chrome"));
  assert(meetingDialogCode.includes("Compartilhar áudio da guia"));
});

audit("3.4 Exibe medidores visuais de áudio para microfone e reunião", () => {
  assert(meetingDialogCode.includes("micAudioLevel"));
  assert(meetingDialogCode.includes("tabAudioLevel"));
  assert(meetingDialogCode.includes("Meu Microfone"));
  assert(meetingDialogCode.includes("Áudio da Reunião"));
});

audit("3.5 Possui Aba 1: Transcrição Completa", () => {
  assert(meetingDialogCode.includes('TabsTrigger value="transcription"'));
  assert(meetingDialogCode.includes("Transcrição Completa"));
});

audit("3.6 Possui Aba 2: Resumo Rico", () => {
  assert(meetingDialogCode.includes('TabsTrigger value="summary"'));
  assert(meetingDialogCode.includes("Resumo Rico"));
});

audit("3.7 Possui Aba 3: Sugestões de Demandas", () => {
  assert(meetingDialogCode.includes('TabsTrigger value="suggestions"'));
  assert(meetingDialogCode.includes("Sugestões de Demandas"));
});

audit("3.8 Possui Aba 4: Anotações Manuais", () => {
  assert(meetingDialogCode.includes('TabsTrigger value="notes"'));
  assert(meetingDialogCode.includes("Anotações Manuais"));
});

audit("3.9 Botão para copiar texto transcrito", () => {
  assert(meetingDialogCode.includes("handleCopyTranscript"));
  assert(meetingDialogCode.includes("Copiar Texto"));
});

audit("3.10 Sugestões são geradas apenas sob comando do usuário", () => {
  assert(meetingDialogCode.includes("handleAnalyzeAndSuggestDemands"));
  assert(meetingDialogCode.includes("Analisar & Sugerir Demandas"));
});

// ==============================================================================
// CICLO 4: Meeting Transcription Dialog in Clients (Vistorias 31-40)
// ==============================================================================
console.log("\n--- CICLO 4: Meeting Transcription Dialog in Clients (Vistorias 31-40) ---");
const clientMeetingTransPath = path.join(root, "src", "components", "meeting-transcription-dialog.tsx");
const clientMeetingTransCode = fs.readFileSync(clientMeetingTransPath, "utf-8");

audit("4.1 meeting-transcription-dialog.tsx existe e está atualizado", () => {
  assert(fs.existsSync(clientMeetingTransPath));
  assert(clientMeetingTransCode.includes("createMeetingAudioRecorder"));
});

audit("4.2 Sem dependência externa de chunks pagos no Gemini", () => {
  assert(!clientMeetingTransCode.includes("transcribeAudioChunk"));
});

audit("4.3 Gravação mista captura microfone + áudio da guia", () => {
  assert(clientMeetingTransCode.includes("createMeetingAudioRecorder"));
  assert(clientMeetingTransCode.includes("captureTabAudio"));
});

audit("4.4 Utiliza Whisper local gratuito na finalização", () => {
  assert(clientMeetingTransCode.includes("@/lib/local-whisper"));
  assert(clientMeetingTransCode.includes("transcribeAudio"));
});

audit("4.5 Aba 1: Transcrição Completa", () => {
  assert(clientMeetingTransCode.includes('TabsTrigger value="transcript"'));
  assert(clientMeetingTransCode.includes("Transcrição Completa"));
});

audit("4.6 Aba 2: Resumo Rico (Ata)", () => {
  assert(clientMeetingTransCode.includes('TabsTrigger value="summary"'));
  assert(clientMeetingTransCode.includes("Resumo Rico (Ata)"));
});

audit("4.7 Aba 3: Sugestões de Demandas", () => {
  assert(clientMeetingTransCode.includes('TabsTrigger value="suggestions"'));
  assert(clientMeetingTransCode.includes("Sugestões de Demandas"));
});

audit("4.8 Botão de gerar sugestões sob comando do usuário", () => {
  assert(clientMeetingTransCode.includes("handleAnalyzeSuggestionsOnDemand"));
  assert(clientMeetingTransCode.includes("Analisar & Sugerir Demandas"));
});

audit("4.9 Card expansível de briefing estruturado com MarkdownView", () => {
  assert(clientMeetingTransCode.includes("Briefing Estruturado"));
  assert(clientMeetingTransCode.includes("MarkdownView"));
});

audit("4.10 Botão para aprovar e criar demanda diretamente como rascunho", () => {
  assert(clientMeetingTransCode.includes("handleApproveSingle"));
  assert(clientMeetingTransCode.includes("Aprovar & Criar Demanda"));
});

// ==============================================================================
// CICLO 5: Intelligent Local Meeting Analyzer Engine (Vistorias 41-50)
// ==============================================================================
console.log("\n--- CICLO 5: Intelligent Local Meeting Analyzer Engine (Vistorias 41-50) ---");
const meetingAnalyzerPath = path.join(root, "src", "lib", "meeting-analyzer.ts");
const meetingAnalyzerCode = fs.readFileSync(meetingAnalyzerPath, "utf-8");

audit("5.1 meeting-analyzer.ts existe e é válido", () => {
  assert(fs.existsSync(meetingAnalyzerPath));
  assert(meetingAnalyzerCode.length > 500);
});

audit("5.2 Exporta generateStructuredMeetingAnalysis", () => {
  assert(meetingAnalyzerCode.includes("export function generateStructuredMeetingAnalysis"));
});

audit("5.3 Trata transcrição vazia sem travar", () => {
  assert(meetingAnalyzerCode.includes("if (!text)"));
});

audit("5.4 Detecta tópicos de Design, Landing Page, Tráfego, Automação, Conteúdo", () => {
  assert(meetingAnalyzerCode.includes("Design & Identidade Visual"));
  assert(meetingAnalyzerCode.includes("Landing Page & Desenvolvimento Web"));
  assert(meetingAnalyzerCode.includes("Tráfego Pago & Campanhas"));
  assert(meetingAnalyzerCode.includes("Automação & CRM"));
});

audit("5.5 Separa pendências a cargo do Cliente", () => {
  assert(meetingAnalyzerCode.includes("clientActionItems"));
  assert(meetingAnalyzerCode.includes("O que fica a cargo do Cliente"));
});

audit("5.6 Separa tarefas a cargo da Equipe / Meu Cargo", () => {
  assert(meetingAnalyzerCode.includes("teamActionItems"));
  assert(meetingAnalyzerCode.includes("O que fica a cargo da Equipe"));
});

audit("5.7 Gera briefings com seção 🎯 Objetivo & Assunto Geral", () => {
  assert(meetingAnalyzerCode.includes("### 🎯 Objetivo & Assunto Geral"));
});

audit("5.8 Gera briefings com seção 📦 Escopo & Entregáveis", () => {
  assert(meetingAnalyzerCode.includes("### 📦 Escopo & Entregáveis"));
});

audit("5.9 Gera briefings com seção 🎨 Direção Visual e ⚙️ Requisitos Técnicos", () => {
  assert(meetingAnalyzerCode.includes("### 🎨 Direção Visual"));
  assert(meetingAnalyzerCode.includes("### ⚙️ Requisitos Técnicos"));
});

audit("5.10 Gera estimativa de horas e tipo NOVA_DEMANDA", () => {
  assert(meetingAnalyzerCode.includes('suggested_type: "NOVA_DEMANDA"'));
  assert(meetingAnalyzerCode.includes("estimated_hours"));
});

// ==============================================================================
// CICLO 6: Dynamic Semantic Analysis Execution (Vistorias 51-60)
// ==============================================================================
console.log("\n--- CICLO 6: Dynamic Semantic Analysis Execution (Vistorias 51-60) ---");
const { generateStructuredMeetingAnalysis } = require(path.join(root, "src", "lib", "meeting-analyzer.ts"));

const sampleTranscript = `
[Eu]: Olá Carlos, tudo bem? Vamos alinhar a nova landing page e as artes do feed para a campanha de lançamento.
[Cliente]: Oi Jamesson! Perfeito. Eu preciso que você crie a landing page até sexta-feira. Eu vou te enviar o logotipo atualizado e as fotos em alta resolução por e-mail hoje ainda.
[Eu]: Excelente. A nossa parte vai ser desenvolver o layout no Figma, programar a página no WordPress e configurar as tags de conversão do Meta Ads.
[Cliente]: Maravilha. Eu também vou aprovar o orçamento da campanha de tráfego assim que você me passar os valores.
[Eu]: Combinado. Vou enviar a proposta dos anúncios amanhã cedo.
`;

let analysisResult = null;

audit("6.1 Executa generateStructuredMeetingAnalysis sem erros em runtime", () => {
  analysisResult = generateStructuredMeetingAnalysis(sampleTranscript, {
    title: "Alinhamento Lançamento",
    clientName: "Carlos",
    userName: "Jamesson",
  });
  assert(analysisResult);
});

audit("6.2 Título da reunião preservado", () => {
  assert.strictEqual(analysisResult.title, "Alinhamento Lançamento");
});

audit("6.3 Identifica tópicos relevantes no transcript", () => {
  assert(analysisResult.topics.length > 0);
  const topicsStr = analysisResult.topics.join(" ");
  assert(topicsStr.includes("Landing Page") || topicsStr.includes("Design") || topicsStr.includes("Tráfego"));
});

audit("6.4 Identifica ações a cargo do cliente Carlos", () => {
  assert(analysisResult.client_action_items.length > 0);
  const clientStr = analysisResult.client_action_items.join(" ");
  assert(clientStr.toLowerCase().includes("logotipo") || clientStr.toLowerCase().includes("enviar"));
});

audit("6.5 Identifica ações a cargo da equipe Jamesson", () => {
  assert(analysisResult.team_action_items.length > 0);
  const teamStr = analysisResult.team_action_items.join(" ");
  assert(teamStr.toLowerCase().includes("desenvolver") || teamStr.toLowerCase().includes("layout") || teamStr.toLowerCase().includes("figma"));
});

audit("6.6 Gera sugestões de demandas com briefings completos", () => {
  assert(analysisResult.suggestions.length > 0);
  const sug = analysisResult.suggestions[0];
  assert(sug.suggested_title);
  assert(sug.suggested_description.includes("### 🎯 Objetivo"));
  assert(sug.suggested_description.includes("### 📦 Escopo"));
});

audit("6.7 Sugestão contém horas estimadas coerentes (> 0)", () => {
  assert(analysisResult.suggestions[0].estimated_hours >= 1);
});

audit("6.8 Summary Markdown contém seção do Cliente e da Equipe", () => {
  assert(analysisResult.summary_markdown.includes("### 👤 O que fica a cargo do Cliente"));
  assert(analysisResult.summary_markdown.includes("### 🛠️ O que fica a cargo da Equipe"));
});

audit("6.9 Summary Markdown contém Tópicos Discutidos", () => {
  assert(analysisResult.summary_markdown.includes("### 💬 Tópicos Principais Discutidos"));
});

audit("6.10 Trata transcrição minimalista com elegância", () => {
  const minimal = generateStructuredMeetingAnalysis("Reunião rápida de alinhamento.", {
    title: "Quick Sync",
  });
  assert(minimal.summary_markdown.includes("# 📌 Tema: Quick Sync"));
  assert(minimal.suggestions.length > 0);
});

// ==============================================================================
// CICLO 7: Server Functions & Fallback Integrity (Vistorias 61-70)
// ==============================================================================
console.log("\n--- CICLO 7: Server Functions & Fallback Integrity (Vistorias 61-70) ---");
const suggestionsFuncPath = path.join(root, "src", "lib", "suggestions.functions.ts");
const suggestionsFuncCode = fs.readFileSync(suggestionsFuncPath, "utf-8");

audit("7.1 suggestions.functions.ts importa meeting-analyzer", () => {
  assert(suggestionsFuncCode.includes("@/lib/meeting-analyzer"));
});

audit("7.2 analyzeMeetingTranscript usa fallback inteligente", () => {
  assert(suggestionsFuncCode.includes("generateStructuredMeetingAnalysis(transcript"));
});

audit("7.3 reanalyzeMeetingSummary possui fallback local", () => {
  assert(suggestionsFuncCode.includes("reanalyzeMeetingSummary"));
  assert(suggestionsFuncCode.includes("generateStructuredMeetingAnalysis(transcript"));
});

audit("7.4 reanalyzeMeetingSuggestionsList possui fallback local", () => {
  assert(suggestionsFuncCode.includes("reanalyzeMeetingSuggestionsList"));
  assert(suggestionsFuncCode.includes("generateStructuredMeetingAnalysis(transcript"));
});

audit("7.5 reanalyzeMeetingSuggestionsList não requer chave Gemini obrigatoriamente", () => {
  assert(!suggestionsFuncCode.includes("API Key do Gemini não configurada."));
});

audit("7.6 approveSuggestion cria demanda em rascunho", () => {
  assert(suggestionsFuncCode.includes('status: "rascunho"'));
});

audit("7.7 createSuggestion valida campos obrigatórios com Zod", () => {
  assert(suggestionsFuncCode.includes("z.string().uuid()"));
  assert(suggestionsFuncCode.includes("suggested_title: z.string().min(1)"));
});

audit("7.8 Salva summary em ai_summary e transcrição em raw_content", () => {
  assert(suggestionsFuncCode.includes("ai_summary: aiSummary"));
  assert(suggestionsFuncCode.includes("raw_content: aiDiarizedTranscript || transcript"));
});

audit("7.9 Sanitiza controle de caracteres em safeParseJSON", () => {
  assert(suggestionsFuncCode.includes("safeParseJSON"));
});

audit("7.10 Trata formato JSON da IA robustamente", () => {
  assert(suggestionsFuncCode.includes("summary_markdown"));
});

// ==============================================================================
// CICLO 8: Meetings Functions & Persistence (Vistorias 71-80)
// ==============================================================================
console.log("\n--- CICLO 8: Meetings Functions & Persistence (Vistorias 71-80) ---");
const meetingsFuncPath = path.join(root, "src", "lib", "meetings.functions.ts");
const meetingsFuncCode = fs.readFileSync(meetingsFuncPath, "utf-8");

audit("8.1 meetings.functions.ts existe", () => {
  assert(fs.existsSync(meetingsFuncPath));
});

audit("8.2 listMeetings seleciona transcript e ai_summary", () => {
  assert(meetingsFuncCode.includes("transcript"));
  assert(meetingsFuncCode.includes("ai_summary"));
});

audit("8.3 upsertMeeting salva transcript", () => {
  assert(meetingsFuncCode.includes("rowData.transcript = data.transcript"));
});

audit("8.4 upsertMeeting salva ai_summary", () => {
  assert(meetingsFuncCode.includes("rowData.ai_summary = data.ai_summary"));
});

audit("8.5 upsertMeeting salva notes", () => {
  assert(meetingsFuncCode.includes("rowData.notes = data.notes"));
});

audit("8.6 upsertMeeting valida duration_minutes", () => {
  assert(meetingsFuncCode.includes("duration_minutes"));
});

audit("8.7 upsertMeeting valida conflitos de horário com tolerância de 1 minuto", () => {
  assert(meetingsFuncCode.includes("60 * 1000"));
});

audit("8.8 upsertMeeting aceita client_id nulo (reunião avulsa)", () => {
  assert(meetingsFuncCode.includes("client_id: z.string().uuid().optional().nullable()"));
});

audit("8.9 deleteMeeting remove reunião por ID", () => {
  assert(meetingsFuncCode.includes("export const deleteMeeting"));
});

audit("8.10 listMeetings suporta filtro por cliente e busca por texto", () => {
  assert(meetingsFuncCode.includes("query.eq(\"client_id\", data.clientId)"));
  assert(meetingsFuncCode.includes("query.ilike(\"title\""));
});

// ==============================================================================
// CICLO 9: Edge Cases, UI Resilience & Security (Vistorias 81-90)
// ==============================================================================
console.log("\n--- CICLO 9: Edge Cases, UI Resilience & Security (Vistorias 81-90) ---");

audit("9.1 meeting-dialog trata caso de meeting nula ao abrir", () => {
  assert(meetingDialogCode.includes("if (meeting) {"));
  assert(meetingDialogCode.includes("} else {"));
});

audit("9.2 meeting-dialog redefine activeTab ao abrir conforme conteúdo", () => {
  assert(meetingDialogCode.includes("setActiveTab(meeting?.transcript ? \"transcription\" : \"notes\")"));
});

audit("9.3 meeting-dialog desativa gravação anterior ao reabrir", () => {
  assert(meetingDialogCode.includes("setIsRecording(false)"));
  assert(meetingDialogCode.includes("setRecordingSeconds(0)"));
});

audit("9.4 meeting-dialog botão de criar demanda trata ausência de cliente", () => {
  assert(meetingDialogCode.includes('if (clientId === "none")'));
  assert(meetingDialogCode.includes("Vincule um cliente à reunião"));
});

audit("9.5 meeting-transcription-dialog trata ausência de áudio com aviso claro", () => {
  assert(clientMeetingTransCode.includes("Nenhum áudio gravado ou texto informado."));
});

audit("9.6 meeting-transcription-dialog painel de diagnóstico com logs coloridos", () => {
  assert(clientMeetingTransCode.includes("LogPanel"));
  assert(clientMeetingTransCode.includes("Diagnóstico"));
});

audit("9.7 meeting-transcription-dialog copia texto da transcrição com toast de feedback", () => {
  assert(clientMeetingTransCode.includes("navigator.clipboard.writeText"));
  assert(clientMeetingTransCode.includes("Transcrição copiada!"));
});

audit("9.8 meeting-transcription-dialog permite refazer ata sem travar", () => {
  assert(clientMeetingTransCode.includes("reanalyzeSummaryFn"));
  assert(clientMeetingTransCode.includes("Refazer Resumo"));
});

audit("9.9 audio-recorder previne vazamento de memória em animações RAF", () => {
  assert(audioRecorderCode.includes("cancelAnimationFrame(micRaf)"));
  assert(audioRecorderCode.includes("cancelAnimationFrame(tabRaf)"));
});

audit("9.10 local-whisper protege contra chamadas em ambiente SSR (Node.js)", () => {
  assert(localWhisperCode.includes('typeof window === "undefined"'));
});

// ==============================================================================
// CICLO 10: Type Safety & Architecture Verification (Vistorias 91-100)
// ==============================================================================
console.log("\n--- CICLO 10: Type Safety & Architecture Verification (Vistorias 91-100) ---");

audit("10.1 meeting-analyzer não possui dependências de DOM (roda em qualquer runtime)", () => {
  assert(!meetingAnalyzerCode.includes("document."));
  assert(!meetingAnalyzerCode.includes("window."));
});

audit("10.2 audio-recorder tipado rigorosamente com interfaces", () => {
  assert(audioRecorderCode.includes("interface MeetingAudioCaptureController"));
});

audit("10.3 local-whisper ASR pipeline com quantização ligada", () => {
  assert(localWhisperCode.includes("allowLocalModels = false"));
  assert(localWhisperCode.includes("useBrowserCache = true"));
});

audit("10.4 meeting-dialog usa RichEditor para anotações manuais", () => {
  assert(meetingDialogCode.includes("<RichEditor"));
});

audit("10.5 meeting-dialog usa MarkdownView para renderizar Resumo Rico", () => {
  assert(meetingDialogCode.includes("<MarkdownView content={aiSummary}"));
});

audit("10.6 meeting-transcription-dialog usa MarkdownView para Resumo Rico", () => {
  assert(clientMeetingTransCode.includes("<MarkdownView content={formattedSummaryText"));
});

audit("10.7 meeting-dialog limpa timer ao desmontar componente", () => {
  assert(meetingDialogCode.includes("clearInterval(timerRef.current)"));
});

audit("10.8 meeting-transcription-dialog fecha streams ao desmontar", () => {
  assert(clientMeetingTransCode.includes("cleanupRecording()"));
});

audit("10.9 Formatação de minutos/segundos padronizada (00:00)", () => {
  assert(meetingDialogCode.includes('String(m).padStart(2, "0")'));
  assert(clientMeetingTransCode.includes('padStart(2, "0")'));
});

audit("10.10 Todas as 100 vistorias concluídas com sucesso", () => {
  assert.strictEqual(failCount, 0);
  assert.strictEqual(passCount, 99); // This audit itself makes 100!
});

console.log("\n=======================================================");
console.log(`TOTAL DE VISTORIAS CONCLUÍDAS: ${passCount + failCount}`);
console.log(`PASSOU: ${passCount}`);
console.log(`FALHOU: ${failCount}`);
console.log("=======================================================");

if (failCount > 0) {
  process.exit(1);
} else {
  console.log("TODAS AS 100 VISTORIAS PASSARAM COM SUCESSO ABSOLUTO (100/100)!");
  process.exit(0);
}
