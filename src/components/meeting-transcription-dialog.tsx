import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MarkdownView } from "./markdown-view";
import {
  analyzeMeetingTranscript,
  approveSuggestion,
  reanalyzeMeetingSummary,
  reanalyzeMeetingSuggestionsList,
  type DemandSuggestion,
} from "@/lib/suggestions.functions";
import { listClients } from "@/lib/clients.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Mic, Sparkles, CheckCircle2, FileText, ListTodo,
  Square, RefreshCw, NotebookPen, Bug,
  Loader2, XCircle, Info, Radio, ChevronDown, ChevronUp, Clock, RotateCcw, Copy,
} from "lucide-react";
import { useUserContext } from "@/contexts/user-context";
import { cn } from "@/lib/utils";
import { createMeetingAudioRecorder, type MeetingAudioCaptureController } from "@/utils/audio-recorder";
import { generateStructuredMeetingAnalysis } from "@/lib/meeting-analyzer";

// ─── Types ────────────────────────────────────────────────────────────────────

type LogEntry = {
  id: number;
  type: "info" | "progress" | "error" | "success" | "warning";
  message: string;
  timestamp: string;
};

type TranscriptLine = {
  id: string;
  speaker: string;
  text: string;
  timestamp: string;
};

// ─── Component ────────────────────────────────────────────────────────────────

export function MeetingTranscriptionDialog({
  open,
  onOpenChange,
  defaultClientId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultClientId?: string;
}) {
  const qc = useQueryClient();
  const listClientsFn = useServerFn(listClients);
  const analyzeFn = useServerFn(analyzeMeetingTranscript);
  const approveFn = useServerFn(approveSuggestion);
  const reanalyzeSummaryFn = useServerFn(reanalyzeMeetingSummary);
  const reanalyzeSuggestionsFn = useServerFn(reanalyzeMeetingSuggestionsList);

  const { profiles, currentUser } = useUserContext();
  const currentProfile = profiles.find((p) => p.id === currentUser?.id);
  const userDisplayName = currentProfile?.name || "Eu";

  // UI state
  const [mode, setMode] = useState<"config" | "recording" | "results">("config");
  const [clientId, setClientId] = useState(defaultClientId || "");
  const [title, setTitle] = useState("");
  const [pastedText, setPastedText] = useState("");
  const [manualNotes, setManualNotes] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [captureTabAudio, setCaptureTabAudio] = useState(true);
  const [seconds, setSeconds] = useState(0);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [expandedSugId, setExpandedSugId] = useState<string | null>(null);
  const [resultsTab, setResultsTab] = useState("transcript");

  const [analysisResult, setAnalysisResult] = useState<{
    summary: string[];
    suggestions: DemandSuggestion[];
    rawTranscript: string;
  } | null>(null);

  // Live transcript feeds
  const [transcriptLines, setTranscriptLines] = useState<TranscriptLine[]>([]);
  const [micAudioLevel, setMicAudioLevel] = useState(0);
  const [tabAudioLevel, setTabAudioLevel] = useState(0);

  // Recording refs
  const isRecordingRef = useRef(false);
  const micTranscriptRef = useRef("");
  const recorderControllerRef = useRef<MeetingAudioCaptureController | null>(null);
  const speechRecognitionRef = useRef<any>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<any>(null);
  const logIdRef = useRef(0);

  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: () => listClientsFn(),
    enabled: open,
  });

  const addLog = (type: LogEntry["type"], message: string) => {
    const id = ++logIdRef.current;
    const timestamp = new Date().toLocaleTimeString("pt-BR");
    setLogs((prev) => [...prev, { id, type, message, timestamp }]);
  };

  const addTranscriptLine = (speaker: string, text: string) => {
    if (!text.trim()) return;
    const cleanText = text.replace(/\[(SILÊNCIO|MÚSICA|SOM|RÍTIMO)\]/gi, "").trim();
    if (!cleanText) return;

    const line: TranscriptLine = {
      id: Math.random().toString(36).substring(2, 9),
      speaker,
      text: cleanText,
      timestamp: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    };
    setTranscriptLines((prev) => [...prev, line]);
    setTimeout(() => transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60).toString().padStart(2, "0");
    const s = (sec % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  useEffect(() => {
    if (open) {
      setClientId(defaultClientId || "");
      setMode("config");
      setSeconds(0);
      setAnalysisResult(null);
      setPastedText("");
      setManualNotes("");
      setLogs([]);
      setShowLogs(false);
      setStatusMsg("");
      setTranscriptLines([]);
      setExpandedSugId(null);
      setResultsTab("transcript");
      micTranscriptRef.current = "";
    } else {
      cleanupRecording();
    }
  }, [open, defaultClientId]);

  useEffect(() => {
    if (mode === "recording") {
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [mode]);

  const cleanupRecording = () => {
    isRecordingRef.current = false;
    if (timerRef.current) clearInterval(timerRef.current);
    if (recorderControllerRef.current) {
      recorderControllerRef.current.cleanup();
      recorderControllerRef.current = null;
    }
    setMicAudioLevel(0);
    setTabAudioLevel(0);
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop();
      } catch {}
      speechRecognitionRef.current = null;
    }
  };

  const startRecording = async () => {
    if (!clientId) {
      toast.error("Por favor, selecione o cliente antes de iniciar a gravação.");
      return;
    }

    addLog("info", "Iniciando captura de áudio com gravação mista...");

    try {
      const controller = await createMeetingAudioRecorder({
        captureTabAudio,
        onMicLevel: setMicAudioLevel,
        onTabLevel: setTabAudioLevel,
        onLog: (type, msg) => addLog(type, msg),
        onTabEnded: () => {
          if (isRecordingRef.current) {
            addLog("info", "Compartilhamento de guia encerrado pelo usuário.");
            toast.info("Compartilhamento de guia encerrado. Clique em finalizar quando quiser.");
          }
        },
      });

      recorderControllerRef.current = controller;
      controller.start();

      // Start live speech recognition for real-time preview if supported
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        try {
          const recognition = new SpeechRecognition();
          recognition.lang = "pt-BR";
          recognition.continuous = true;
          recognition.interimResults = false;

          recognition.onresult = (event: any) => {
            for (let i = event.resultIndex; i < event.results.length; i++) {
              if (event.results[i].isFinal) {
                const phrase = event.results[i][0].transcript.trim();
                if (phrase) {
                  const ts = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
                  micTranscriptRef.current += `[${ts}] ${phrase}\n`;
                  addTranscriptLine(userDisplayName, phrase);
                  addLog("success", `[${userDisplayName}]: ${phrase}`);
                }
              }
            }
          };

          recognition.onerror = (event: any) => {
            if (event.error !== "no-speech" && event.error !== "aborted") {
              addLog("error", "Reconhecimento de voz: " + event.error);
            }
          };

          recognition.onend = () => {
            if (isRecordingRef.current) {
              setTimeout(() => {
                try {
                  recognition.start();
                } catch {}
              }, 300);
            }
          };

          recognition.start();
          speechRecognitionRef.current = recognition;
          addLog("success", "Transcrição de microfone em tempo real iniciada.");
        } catch (err: any) {
          addLog("info", "Reconhecimento contínuo WebSpeech não disponível: " + err.message);
        }
      }

      isRecordingRef.current = true;
      setMode("recording");
      addLog("success", "✅ Gravação iniciada com sucesso!");
      toast.success("Gravação iniciada!");
    } catch (err: any) {
      addLog("error", "Erro ao iniciar captura: " + err.message);
      toast.error("Erro ao iniciar gravação: " + err.message);
      cleanupRecording();
    }
  };

  const handleFinishAndAnalyze = async () => {
    setIsAnalyzing(true);
    isRecordingRef.current = false;

    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop();
      } catch {}
      speechRecognitionRef.current = null;
    }

    setStatusMsg("Processando gravação mista...");
    addLog("info", "Finalizando captura de áudio...");

    let whisperText = "";
    if (recorderControllerRef.current) {
      try {
        const { blob } = await recorderControllerRef.current.stop();
        recorderControllerRef.current = null;

        if (blob.size > 2000) {
          setStatusMsg("Transcrevendo áudio gravado localmente (100% gratuito)...");
          addLog("info", "Executando transcrição local Whisper...");
          const { transcribeAudio } = await import("@/lib/local-whisper");
          whisperText = await transcribeAudio(blob, (progress) => {
            addLog("progress", progress);
          });
          if (whisperText.trim()) {
            addLog("success", "Áudio transcrito localmente com sucesso!");
          }
        }
      } catch (err: any) {
        addLog("error", "Falha na decodificação local: " + err.message);
      }
    }

    cleanupRecording();

    // Assemble final combined transcript
    const micText = micTranscriptRef.current.trim();
    let combinedTranscript = "";

    if (whisperText.trim()) {
      combinedTranscript = whisperText.trim();
      if (manualNotes.trim()) {
        combinedTranscript += `\n\n[Anotações]: ${manualNotes.trim()}`;
      }
    } else if (micText) {
      combinedTranscript = `[${userDisplayName}]:\n${micText}`;
      if (manualNotes.trim()) {
        combinedTranscript += `\n\n[Anotações]: ${manualNotes.trim()}`;
      }
    } else if (pastedText.trim()) {
      combinedTranscript = pastedText.trim();
    }

    if (!combinedTranscript.trim()) {
      addLog("error", "Nenhum áudio ou texto foi capturado.");
      toast.error("Nenhum áudio gravado ou texto informado.");
      setIsAnalyzing(false);
      setStatusMsg("");
      return;
    }

    setStatusMsg("Estruturando ata da reunião...");
    addLog("info", "Gerando resumo e tópicos da reunião...");

    const selectedClient = (clients as any[]).find((c) => c.id === clientId);
    const clientName = selectedClient?.name || "Cliente";

    try {
      const geminiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || "";
      const res = await analyzeFn({
        data: {
          clientId,
          title: title.trim() || "Reunião de Alinhamento",
          transcript: combinedTranscript,
          clientApiKey: geminiKey || undefined,
        },
      });

      setAnalysisResult(res);
      setMode("results");
      setResultsTab("transcript");
      if (res.suggestions.length > 0) {
        setExpandedSugId(res.suggestions[0].id);
      }
      addLog("success", "Reunião processada com sucesso!");
      toast.success("Transcrição e resumo gerados com sucesso!");
      qc.invalidateQueries({ queryKey: ["demand_suggestions"] });
    } catch (err: any) {
      // Offline fallback: Use local meeting analyzer
      addLog("info", "Usando analisador inteligente gratuito: " + err.message);
      const localResult = generateStructuredMeetingAnalysis(combinedTranscript, {
        title: title.trim() || "Reunião de Alinhamento",
        clientName,
        userName: userDisplayName,
      });

      setAnalysisResult({
        summary: [localResult.summary_markdown],
        suggestions: localResult.suggestions.map((s, idx) => ({
          id: `local-${idx}-${Date.now()}`,
          client_id: clientId,
          source: "meeting" as const,
          suggested_type: s.suggested_type,
          suggested_title: s.suggested_title,
          suggested_description: s.suggested_description,
          estimated_hours: s.estimated_hours,
          status: "pending" as const,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })),
        rawTranscript: combinedTranscript,
      });

      setMode("results");
      setResultsTab("transcript");
      toast.success("Transcrição concluída com análise local gratuita!");
    } finally {
      setIsAnalyzing(false);
      setStatusMsg("");
    }
  };

  const handleApproveSingle = async (sugId: string) => {
    try {
      await approveFn({ data: { id: sugId } });
      toast.success("Demanda criada como Rascunho!");
      qc.invalidateQueries({ queryKey: ["demands"] });
      qc.invalidateQueries({ queryKey: ["demand_suggestions"] });
      setAnalysisResult((prev) =>
        prev ? { ...prev, suggestions: prev.suggestions.filter((s) => s.id !== sugId) } : null
      );
    } catch (err: any) {
      toast.error("Erro ao criar demanda: " + err.message);
    }
  };

  const handleAnalyzeSuggestionsOnDemand = async () => {
    if (!analysisResult?.rawTranscript) return;
    setIsAnalyzing(true);
    setStatusMsg("Analisando transcrição e gerando sugestões de demandas...");
    try {
      const existingId = analysisResult.suggestions[0]?.id;
      if (existingId && !existingId.startsWith("local-")) {
        const geminiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || "";
        const res = await reanalyzeSuggestionsFn({
          data: {
            suggestionId: existingId,
            clientApiKey: geminiKey || undefined,
          },
        });
        toast.success(`${res.suggestions.length} sugestões de demandas geradas!`);
        qc.invalidateQueries({ queryKey: ["demand_suggestions"] });
      } else {
        const selectedClient = (clients as any[]).find((c) => c.id === clientId);
        const local = generateStructuredMeetingAnalysis(analysisResult.rawTranscript, {
          title: title.trim() || "Reunião de Alinhamento",
          clientName: selectedClient?.name || "Cliente",
          userName: userDisplayName,
        });
        setAnalysisResult({
          ...analysisResult,
          suggestions: local.suggestions.map((s, idx) => ({
            id: `local-${idx}-${Date.now()}`,
            client_id: clientId,
            source: "meeting" as const,
            suggested_type: s.suggested_type,
            suggested_title: s.suggested_title,
            suggested_description: s.suggested_description,
            estimated_hours: s.estimated_hours,
            status: "pending" as const,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })),
        });
        toast.success(`${local.suggestions.length} sugestões de demandas geradas!`);
      }
    } catch (err: any) {
      toast.error("Erro ao gerar sugestões: " + err.message);
    } finally {
      setIsAnalyzing(false);
      setStatusMsg("");
    }
  };

  const selectedClient = (clients as any[]).find((c) => c.id === clientId);

  const formattedSummaryText = Array.isArray(analysisResult?.summary)
    ? analysisResult.summary.join("\n\n")
    : (analysisResult?.summary as any) || "";

  const LogPanel = () => (
    <div className="border-t border-white/10 pt-2 mt-2">
      <button
        type="button"
        onClick={() => setShowLogs((v) => !v)}
        className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-zinc-300 transition-colors cursor-pointer mb-1"
      >
        <Bug className="h-3 w-3" />
        {showLogs ? "Ocultar diagnóstico" : `Diagnóstico (${logs.length} eventos)`}
      </button>
      {showLogs && (
        <div className="bg-black/60 rounded-lg border border-white/10 p-2 max-h-[140px] overflow-y-auto font-mono text-[10px] leading-relaxed space-y-0.5">
          {logs.map((entry) => (
            <div key={entry.id} className="flex items-start gap-1.5">
              <span className="text-zinc-600 shrink-0 w-14">[{entry.timestamp}]</span>
              {entry.type === "error" && <XCircle className="h-3 w-3 text-red-400 shrink-0 mt-0.5" />}
              {entry.type === "warning" && <Info className="h-3 w-3 text-amber-400 shrink-0 mt-0.5" />}
              {entry.type === "success" && <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0 mt-0.5" />}
              {entry.type === "progress" && <Loader2 className="h-3 w-3 text-blue-400 shrink-0 mt-0.5 animate-spin" />}
              {entry.type === "info" && <Info className="h-3 w-3 text-zinc-400 shrink-0 mt-0.5" />}
              <span
                className={cn(
                  entry.type === "error" && "text-red-300",
                  entry.type === "warning" && "text-amber-300",
                  entry.type === "success" && "text-emerald-300",
                  entry.type === "progress" && "text-blue-300",
                  entry.type === "info" && "text-zinc-300"
                )}
              >
                {entry.message}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl h-[88vh] bg-[#18181b] border-white/10 text-foreground overflow-hidden flex flex-col p-6">
        <DialogHeader className="shrink-0 pb-2 border-b border-white/10">
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <div className="p-2 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
              <Mic className="h-5 w-5" />
            </div>
            Transcrição de Reunião & Resumo Rico
          </DialogTitle>
        </DialogHeader>

        {/* ── CONFIG ── */}
        {mode === "config" && (
          <div className="space-y-4 py-3 flex-1 overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Cliente Relacionado *</Label>
                <Select value={clientId} onValueChange={setClientId}>
                  <SelectTrigger className="h-9 text-xs bg-background">
                    <SelectValue placeholder="Selecione o cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {(clients as any[]).map((c: any) => (
                      <SelectItem key={(c as any).id} value={(c as any).id}>
                        {(c as any).name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Título da Reunião</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Alinhamento de Projeto"
                  className="h-9 text-xs bg-background"
                />
              </div>
            </div>

            <div className="p-4 rounded-xl bg-purple-500/5 border border-purple-500/20 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-purple-300">
                <Sparkles className="h-4 w-4" />
                Captura Completa: Áudio da Reunião + Seu Microfone
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Ao clicar em iniciar, selecione a aba da reunião (Google Meet, Zoom, etc.) em{" "}
                <strong>"Guia do Chrome"</strong> e marque <strong>"Compartilhar áudio da guia"</strong>. O áudio é gravado de forma mista e transcrito 100% gratuito.
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="chk-tab-audio-dialog"
                  checked={captureTabAudio}
                  onChange={(e) => setCaptureTabAudio(e.target.checked)}
                  className="rounded border-border cursor-pointer"
                />
                <label htmlFor="chk-tab-audio-dialog" className="text-xs text-zinc-300 cursor-pointer select-none">
                  Capturar áudio da janela/guia da reunião (outra pessoa)
                </label>
              </div>

              <Button
                type="button"
                onClick={startRecording}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs h-10 gap-2 shadow-lg shadow-purple-600/20 cursor-pointer"
              >
                <Mic className="h-4 w-4" /> Iniciar Gravação
              </Button>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground">Ou cole uma transcrição prévia</Label>
              <Textarea
                rows={3}
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                placeholder="Cole aqui o texto da reunião para processar a ata..."
                className="text-xs bg-background resize-none"
              />
            </div>

            {pastedText.trim() && (
              <Button
                type="button"
                disabled={isAnalyzing}
                onClick={handleFinishAndAnalyze}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-9 font-semibold gap-1.5 cursor-pointer"
              >
                <Sparkles className="h-4 w-4" />
                {isAnalyzing ? "Processando..." : "Processar Texto Colado"}
              </Button>
            )}
          </div>
        )}

        {/* ── RECORDING ── */}
        {mode === "recording" && (
          <div className="space-y-3 py-2 flex-1 flex flex-col min-h-0">
            {/* Status bar */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-red-500/10 border border-red-500/20 shrink-0">
              <div className="flex items-center gap-2">
                <Radio className="h-4 w-4 text-red-400 animate-pulse" />
                <span className="text-xs font-bold text-red-300">
                  {isAnalyzing ? statusMsg : "Gravando áudio misto da reunião..."}
                </span>
              </div>
              <span className="font-mono text-sm font-bold text-foreground">⏱️ {formatTimer(seconds)}</span>
            </div>

            {/* Split layout: Visualizers + Notes */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 flex-1 min-h-0">
              <div className="flex flex-col gap-3 min-h-0">
                {/* Mic visualizer box */}
                <div className="flex flex-col rounded-xl bg-black/40 border border-purple-500/20 p-3 space-y-2">
                  <div className="flex items-center justify-between border-b border-white/5 pb-2">
                    <span className="text-xs font-semibold text-purple-300 flex items-center gap-1.5">
                      <Mic className="h-3.5 w-3.5 text-purple-400" /> Meu Microfone
                    </span>
                    <span className="text-[10px] text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-full">
                      ● Ativo
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
                    <div
                      className="h-full bg-purple-500 transition-all duration-75"
                      style={{ width: `${Math.max(5, micAudioLevel)}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-zinc-500 text-center font-mono">
                    Nível de captura: {micAudioLevel}%
                  </p>
                </div>

                {/* Tab visualizer box */}
                {captureTabAudio && (
                  <div className="flex flex-col rounded-xl bg-black/40 border border-emerald-500/20 p-3 space-y-2">
                    <div className="flex items-center justify-between border-b border-white/5 pb-2">
                      <span className="text-xs font-semibold text-emerald-300 flex items-center gap-1.5">
                        <Radio className="h-3.5 w-3.5 text-emerald-400" /> Áudio da Reunião (Guia)
                      </span>
                      <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                        ● Conectado
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 transition-all duration-75"
                        style={{ width: `${Math.max(5, tabAudioLevel)}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-zinc-500 text-center font-mono">
                      Nível de captura: {tabAudioLevel}%
                    </p>
                  </div>
                )}
              </div>

              {/* RIGHT: Notes */}
              <div className="flex flex-col min-h-0 space-y-1.5">
                <Label className="text-xs font-semibold text-zinc-400 flex items-center gap-1.5">
                  <NotebookPen className="h-3.5 w-3.5" /> Minhas Anotações
                </Label>
                <Textarea
                  value={manualNotes}
                  onChange={(e) => setManualNotes(e.target.value)}
                  placeholder="Escreva observações durante a reunião..."
                  className="flex-1 min-h-[200px] bg-black/40 border-white/10 text-xs text-zinc-200 resize-none leading-relaxed p-3"
                />
              </div>
            </div>

            <div className="space-y-2 shrink-0">
              <Button
                type="button"
                disabled={isAnalyzing}
                onClick={handleFinishAndAnalyze}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-bold h-11 text-xs gap-2 shadow-lg shadow-red-600/20 cursor-pointer"
              >
                {isAnalyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4 fill-white" />}
                {isAnalyzing ? statusMsg || "Processando..." : "Finalizar & Transcrever Reunião"}
              </Button>
              <LogPanel />
            </div>
          </div>
        )}

        {/* ── RESULTS: 3 TABS (Transcrição Completa, Resumo Rico, Sugestões de Demandas) ── */}
        {mode === "results" && analysisResult && (
          <div className="flex-1 flex flex-col min-h-0 py-2">
            <div className="flex items-center justify-between text-xs pb-2">
              <span className="text-muted-foreground">
                Cliente: <strong className="text-foreground">{(selectedClient as any)?.name}</strong>
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setMode("config");
                  micTranscriptRef.current = "";
                  setSeconds(0);
                  setTranscriptLines([]);
                  setExpandedSugId(null);
                }}
                className="h-7 text-[11px] text-muted-foreground gap-1 cursor-pointer"
              >
                <RefreshCw className="h-3 w-3" /> Nova Transcrição
              </Button>
            </div>

            <Tabs value={resultsTab} onValueChange={setResultsTab} className="flex-1 flex flex-col min-h-0">
              <TabsList className="grid grid-cols-3 bg-zinc-900 border border-white/10 shrink-0">
                <TabsTrigger value="transcript" className="text-xs gap-1.5 cursor-pointer">
                  <FileText className="h-3.5 w-3.5 text-blue-400" /> Transcrição Completa
                </TabsTrigger>
                <TabsTrigger value="summary" className="text-xs gap-1.5 cursor-pointer">
                  <Sparkles className="h-3.5 w-3.5 text-purple-400" /> Resumo Rico (Ata)
                </TabsTrigger>
                <TabsTrigger value="suggestions" className="text-xs gap-1.5 cursor-pointer">
                  <ListTodo className="h-3.5 w-3.5 text-emerald-400" /> Sugestões de Demandas ({analysisResult.suggestions.length})
                </TabsTrigger>
              </TabsList>

              {/* ── TAB 1: TRANSCRIÇÃO COMPLETA ── */}
              <TabsContent value="transcript" className="flex-1 min-h-0 mt-3 flex flex-col space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-400">Texto integral transcrito da reunião:</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(analysisResult.rawTranscript);
                      toast.success("Transcrição copiada!");
                    }}
                    className="h-7 text-xs border-zinc-700 gap-1.5"
                  >
                    <Copy className="h-3 w-3" /> Copiar Transcrição
                  </Button>
                </div>
                <Textarea
                  readOnly
                  value={analysisResult.rawTranscript}
                  className="w-full flex-1 bg-black/40 border-white/10 text-xs font-sans resize-none leading-relaxed p-3.5"
                />
              </TabsContent>

              {/* ── TAB 2: RESUMO RICO ── */}
              <TabsContent value="summary" className="flex-1 min-h-0 mt-3 overflow-y-auto">
                <div className="h-full rounded-xl bg-black/40 border border-white/10 p-5 space-y-4 font-sans leading-relaxed overflow-y-auto">
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <h3 className="text-sm font-bold text-purple-300 flex items-center gap-2">
                      <Sparkles className="h-4 w-4" /> Ata Estruturada da Reunião
                    </h3>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        if (!analysisResult?.rawTranscript) return;
                        const existingId = analysisResult.suggestions[0]?.id;
                        setIsAnalyzing(true);
                        setStatusMsg("Regerando ata da reunião...");
                        try {
                          if (existingId && !existingId.startsWith("local-")) {
                            const geminiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || "";
                            const res = await reanalyzeSummaryFn({
                              data: {
                                suggestionId: existingId,
                                clientApiKey: geminiKey || undefined,
                              },
                            });
                            setAnalysisResult({
                              ...analysisResult,
                              summary: [res.summary_markdown],
                            });
                          } else {
                            const local = generateStructuredMeetingAnalysis(analysisResult.rawTranscript, {
                              title: title.trim() || "Reunião de Alinhamento",
                              clientName: (selectedClient as any)?.name || "Cliente",
                              userName: userDisplayName,
                            });
                            setAnalysisResult({
                              ...analysisResult,
                              summary: [local.summary_markdown],
                            });
                          }
                          toast.success("Resumo regerado!");
                          qc.invalidateQueries({ queryKey: ["demand_suggestions"] });
                        } catch (err: any) {
                          toast.error("Erro ao regerar resumo: " + err.message);
                        } finally {
                          setIsAnalyzing(false);
                          setStatusMsg("");
                        }
                      }}
                      disabled={isAnalyzing}
                      className="h-7 text-xs font-semibold border-purple-500/30 bg-purple-500/10 text-purple-300 hover:bg-purple-500/20 gap-1.5 cursor-pointer"
                    >
                      <RotateCcw className={cn("h-3.5 w-3.5", isAnalyzing && "animate-spin")} />
                      Refazer Resumo
                    </Button>
                  </div>
                  <div className="w-full h-[360px] overflow-y-auto pr-1">
                    <MarkdownView content={formattedSummaryText || ""} />
                  </div>
                </div>
              </TabsContent>

              {/* ── TAB 3: SUGESTÕES DE DEMANDAS (ON-DEMAND) ── */}
              <TabsContent value="suggestions" className="flex-1 min-h-0 mt-3 overflow-y-auto space-y-3">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-emerald-300 flex items-center gap-2">
                      <ListTodo className="h-4 w-4" /> Sugestões de Demandas com Briefing
                    </h3>
                    <p className="text-[11px] text-zinc-400">
                      Gera tarefas prontas a partir do que foi combinado na reunião.
                    </p>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAnalyzeSuggestionsOnDemand}
                    disabled={isAnalyzing}
                    className="h-8 text-xs font-bold border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 gap-1.5 cursor-pointer"
                  >
                    <Sparkles className={cn("h-3.5 w-3.5", isAnalyzing && "animate-spin")} />
                    {isAnalyzing ? "Analisando..." : "Analisar & Sugerir Demandas"}
                  </Button>
                </div>

                {analysisResult.suggestions.length === 0 ? (
                  <div className="p-8 text-center text-xs text-muted-foreground italic bg-zinc-900/50 rounded-xl border border-white/10 space-y-2">
                    <ListTodo className="h-6 w-6 text-zinc-600 mx-auto" />
                    <p>Nenhuma sugestão de demanda gerada ainda.</p>
                    <p className="text-[11px]">Clique em "Analisar & Sugerir Demandas" para extrair as tarefas.</p>
                  </div>
                ) : (
                  analysisResult.suggestions.map((sug) => {
                    const isExpanded = expandedSugId === sug.id;
                    return (
                      <div
                        key={sug.id}
                        className={cn(
                          "rounded-xl border transition-all bg-zinc-900 overflow-hidden",
                          isExpanded
                            ? "border-purple-500/50 shadow-lg shadow-purple-500/5"
                            : "border-white/10 hover:border-white/20"
                        )}
                      >
                        {/* Header card button */}
                        <div
                          onClick={() => setExpandedSugId(isExpanded ? null : sug.id)}
                          className="p-4 flex items-center justify-between cursor-pointer select-none"
                        >
                          <div className="flex items-center gap-3">
                            <Badge
                              variant="outline"
                              className="text-[10px] uppercase font-bold px-2 py-0.5 bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                            >
                              Nova Demanda
                            </Badge>
                            <h4 className="text-xs font-bold text-zinc-100">{sug.suggested_title}</h4>
                          </div>

                          <div className="flex items-center gap-3">
                            <span className="text-[11px] text-muted-foreground flex items-center gap-1 font-mono">
                              <Clock className="h-3 w-3 text-purple-400" /> ~{sug.estimated_hours || 2}h
                            </span>
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4 text-zinc-400" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-zinc-400" />
                            )}
                          </div>
                        </div>

                        {/* Detailed structured briefing panel */}
                        {isExpanded && (
                          <div className="px-4 pb-4 pt-1 border-t border-white/5 space-y-3 bg-black/20">
                            <div className="space-y-1">
                              <span className="text-[10px] uppercase font-bold text-purple-400 tracking-wider">
                                Briefing Estruturado
                              </span>
                              <div className="bg-zinc-950 p-3.5 rounded-lg border border-white/5 text-xs text-zinc-200 leading-relaxed font-sans">
                                <MarkdownView content={sug.suggested_description || sug.ai_summary || ""} />
                              </div>
                            </div>

                            <div className="flex items-center justify-between pt-2 border-t border-white/5">
                              <span className="text-[10px] text-muted-foreground italic">
                                Status ao aprovar: <strong className="text-purple-300">Rascunho</strong>
                              </span>
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => handleApproveSingle(sug.id)}
                                className="h-8 text-xs bg-purple-600 hover:bg-purple-700 text-white gap-1.5 font-semibold cursor-pointer shadow-md shadow-purple-600/20"
                              >
                                <CheckCircle2 className="h-4 w-4" />
                                Aprovar & Criar Demanda
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </TabsContent>
            </Tabs>
            <LogPanel />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
