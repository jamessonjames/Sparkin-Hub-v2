import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MarkdownView } from "./markdown-view";
import {
  analyzeMeetingTranscript,
  approveSuggestion,
  transcribeAudioChunk,
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
  Loader2, XCircle, Info, Radio, ChevronDown, ChevronUp, Clock, Calendar, RotateCcw,
} from "lucide-react";
import { useUserContext } from "@/contexts/user-context";
import { cn } from "@/lib/utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getSupportedMimeType(): string {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return types.find((t) => MediaRecorder.isTypeSupported(t)) ?? "audio/webm";
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

type LogEntry = {
  id: number;
  type: "info" | "progress" | "error" | "success";
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
  const transcribeFn = useServerFn(transcribeAudioChunk);
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

  const [analysisResult, setAnalysisResult] = useState<{
    summary: string[];
    suggestions: DemandSuggestion[];
    rawTranscript: string;
  } | null>(null);

  // Live transcript feeds
  const [transcriptLines, setTranscriptLines] = useState<TranscriptLine[]>([]);
  const [isTranscribingTab, setIsTranscribingTab] = useState(false);

  // Recording refs
  const isRecordingRef = useRef(false);
  const micTranscriptRef = useRef("");
  const currentTabRecorderRef = useRef<MediaRecorder | null>(null);
  const tabMasterChunksRef = useRef<Blob[]>([]);
  const displayStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const speechRecognitionRef = useRef<any>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const tabPcmCleanupRef = useRef<(() => void) | null>(null);
  const tabTranscriptAccumulatorRef = useRef<string>(""); // accumulates transcribed text from 10-min chunks
  const tabChunkIntervalRef = useRef<any>(null);          // 10-min interval timer
  const tabCurrentChunksRef = useRef<Blob[]>([]);         // blobs since last 10-min send

  const [micAudioLevel, setMicAudioLevel] = useState(0);  // 0-100 for visualizer
  const [tabAudioLevel, setTabAudioLevel] = useState(0);  // 0-100 for visualizer
  const micVisualizerRef = useRef<any>(null);             // cleanup for mic visualizer
  const tabVisualizerRef = useRef<any>(null);             // cleanup for tab visualizer

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
      setIsTranscribingTab(false);
      setExpandedSugId(null);
      micTranscriptRef.current = "";
      tabMasterChunksRef.current = [];
      tabTranscriptAccumulatorRef.current = "";
      tabCurrentChunksRef.current = [];
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
    if (tabChunkIntervalRef.current) { clearInterval(tabChunkIntervalRef.current); tabChunkIntervalRef.current = null; }
    if (micVisualizerRef.current) { micVisualizerRef.current(); micVisualizerRef.current = null; }
    if (tabVisualizerRef.current) { tabVisualizerRef.current(); tabVisualizerRef.current = null; }
    setMicAudioLevel(0);
    setTabAudioLevel(0);
    if (speechRecognitionRef.current) {
      try { speechRecognitionRef.current.stop(); } catch {}
      speechRecognitionRef.current = null;
    }
    if (currentTabRecorderRef.current && currentTabRecorderRef.current.state !== "inactive") {
      try { currentTabRecorderRef.current.stop(); } catch {}
      currentTabRecorderRef.current = null;
    }
    if (tabPcmCleanupRef.current) {
      tabPcmCleanupRef.current();
      tabPcmCleanupRef.current = null;
    }
    if (displayStreamRef.current) {
      displayStreamRef.current.getTracks().forEach((t) => t.stop());
      displayStreamRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
  };

  // ── Audio level visualizer helper ─────────────────────────────────────────
  const startAudioVisualizer = (
    stream: MediaStream,
    onLevel: (level: number) => void
  ): (() => void) => {
    try {
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      let rafId: number;
      const tick = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        onLevel(Math.min(100, Math.round(avg * 2.5)));
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
      return () => { cancelAnimationFrame(rafId); source.disconnect(); ctx.close(); };
    } catch {
      return () => {};
    }
  };

  // ── Continuous tab recorder with 10-min background Gemini chunks ──────────
  const startTabContinuousRecorder = (clientName: string) => {
    if (!isRecordingRef.current || !displayStreamRef.current) return;
    const audioTrack = displayStreamRef.current.getAudioTracks()[0];
    if (!audioTrack || audioTrack.readyState !== "live") return;

    try {
      const mimeType = getSupportedMimeType();
      const tabStream = new MediaStream([audioTrack]);
      const recorder = new MediaRecorder(tabStream, { mimeType });
      currentTabRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          tabCurrentChunksRef.current.push(e.data);
          tabMasterChunksRef.current.push(e.data);
        }
      };

      recorder.start(1000); // collect data every 1s into ondataavailable
      addLog("info", "Gravação da aba iniciada. Transcrição a cada 10 minutos em background.");

      // Start tab audio visualizer
      tabVisualizerRef.current = startAudioVisualizer(tabStream, setTabAudioLevel);

      // Every 10 minutes: flush current chunks to Gemini silently
      const INTERVAL_MS = 10 * 60 * 1000;
      let chunkStartTime = new Date(); // track when this chunk period started
      tabChunkIntervalRef.current = setInterval(async () => {
        if (!isRecordingRef.current) return;
        const chunkStart = chunkStartTime;
        const chunkEnd = new Date();
        chunkStartTime = chunkEnd; // next interval starts from now

        const chunksToSend = [...tabCurrentChunksRef.current];
        tabCurrentChunksRef.current = []; // reset for next interval
        if (chunksToSend.length === 0) return;

        const chunkBlob = new Blob(chunksToSend, { type: mimeType });
        if (chunkBlob.size < 5000) return; // skip near-silent/empty chunks

        const tsStart = chunkStart.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        const tsEnd = chunkEnd.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        addLog("info", `[Aba] Transcrevendo trecho ${tsStart} → ${tsEnd} em background...`);
        try {
          const audioBase64 = await blobToBase64(chunkBlob);
          const mimeBase = mimeType.split(";")[0] || "audio/webm";
          const geminiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || "";
          const res = await transcribeFn({
            data: { audioBase64, mimeType: mimeBase, clientApiKey: geminiKey || undefined },
          });
          if (res.text && res.text.trim()) {
            // Store with timestamp range for chronological merge
            tabTranscriptAccumulatorRef.current +=
              (tabTranscriptAccumulatorRef.current ? "\n" : "") +
              `[${tsStart} → ${tsEnd}]\n${res.text.trim()}`;
            addLog("success", `[Aba] Trecho ${tsStart} → ${tsEnd} transcrito e salvo.`);
          }
        } catch (err: any) {
          addLog("error", "[Aba] Erro ao transcrever trecho: " + err.message);
          // Put chunks back so they merge with next interval
          tabCurrentChunksRef.current = [...chunksToSend, ...tabCurrentChunksRef.current];
        }
      }, INTERVAL_MS);
    } catch (err: any) {
      addLog("error", "Erro ao iniciar gravação da aba: " + err.message);
    }
  };

  const startRecording = async () => {
    if (!clientId) {
      toast.error("Por favor, selecione o cliente antes de iniciar a gravação.");
      return;
    }

    const selectedClient = (clients as any[]).find((c) => c.id === clientId);
    const clientName = selectedClient?.name || "Cliente";

    addLog("info", "Iniciando gravação...");

    let hasTabStream = false;
    if (captureTabAudio && navigator.mediaDevices?.getDisplayMedia) {
      try {
        addLog("info", "Selecione a aba da reunião e marque 'Compartilhar áudio da guia'.");
        toast.info("Selecione a aba e marque 'Compartilhar áudio da guia'.", { duration: 7000 });
        const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        displayStreamRef.current = displayStream;

        const audioTracks = displayStream.getAudioTracks();
        if (audioTracks.length === 0) {
          addLog("error", "Áudio da aba não capturado — você marcou 'Compartilhar áudio da guia'?");
          toast.error("Marque 'Compartilhar áudio da guia' na janela do Chrome.");
        } else {
          hasTabStream = true;
          addLog("success", `Áudio da reunião capturado (${audioTracks.length} faixas).`);

          const videoTrack = displayStream.getVideoTracks()[0];
          if (videoTrack) {
            videoTrack.onended = () => {
              if (isRecordingRef.current) {
                addLog("info", "Compartilhamento de aba encerrado.");
                toast.info("Compartilhamento encerrado. Clique em Finalizar para transcrever.");
              }
            };
          }
        }
      } catch (err: any) {
        addLog("info", "Áudio da aba não compartilhado — gravando apenas microfone.");
      }
    }

    try {
      addLog("info", "Solicitando acesso ao microfone...");
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      micStreamRef.current = micStream;
      addLog("success", "Microfone conectado.");
    } catch (err: any) {
      addLog("error", "Erro ao acessar microfone: " + err.message);
      toast.error("Não foi possível acessar o microfone.");
      cleanupRecording();
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.lang = "pt-BR";
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onresult = (event: any) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            const phrase = event.results[i][0].transcript.trim();
            if (phrase) {
              // Store with precise timestamp for chronological merge at the end
              const ts = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
              micTranscriptRef.current += `[${ts}] ${phrase}\n`;
              addLog("success", `[Eu]: ${phrase}`);
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
            try { recognition.start(); } catch {}
          }, 300);
        }
      };

      try {
        recognition.start();
        speechRecognitionRef.current = recognition;
        addLog("success", "Transcrição de microfone em tempo real iniciada.");
      } catch (err: any) {
        addLog("error", "Erro ao iniciar reconhecimento de voz: " + err.message);
      }
    }

    isRecordingRef.current = true;
    setMode("recording");
    addLog("success", "✅ Gravação iniciada.");
    toast.success("Gravação iniciada!");

    // Start mic audio visualizer
    if (micStreamRef.current) {
      micVisualizerRef.current = startAudioVisualizer(micStreamRef.current, setMicAudioLevel);
    }

    if (hasTabStream) {
      startTabContinuousRecorder(clientName);
    }
  };

  const handleFinishAndAnalyze = async () => {
    setIsAnalyzing(true);
    isRecordingRef.current = false;

    if (speechRecognitionRef.current) {
      try { speechRecognitionRef.current.stop(); } catch {}
      await new Promise((r) => setTimeout(r, 500));
      try { speechRecognitionRef.current.abort(); } catch {}
      speechRecognitionRef.current = null;
    }

    if (currentTabRecorderRef.current && currentTabRecorderRef.current.state !== "inactive") {
      try { currentTabRecorderRef.current.stop(); } catch {}
    }

    // Stop 10-min interval and visualizers
    if (tabChunkIntervalRef.current) { clearInterval(tabChunkIntervalRef.current); tabChunkIntervalRef.current = null; }
    if (micVisualizerRef.current) { micVisualizerRef.current(); micVisualizerRef.current = null; }
    if (tabVisualizerRef.current) { tabVisualizerRef.current(); tabVisualizerRef.current = null; }
    setMicAudioLevel(0); setTabAudioLevel(0);

    setStatusMsg("Processando áudios finais...");
    addLog("info", "Finalizando gravação...");

    // Flush remaining tab chunks (less than 10 min) to Gemini
    const remainingChunks = [...tabCurrentChunksRef.current];
    tabCurrentChunksRef.current = [];
    if (remainingChunks.length > 0) {
      const mimeType = getSupportedMimeType();
      const remainingBlob = new Blob(remainingChunks, { type: mimeType });
      if (remainingBlob.size > 5000) {
        const finalEnd = new Date();
        const tsFinalEnd = finalEnd.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        addLog("info", `[Aba] Transcrevendo trecho final até ${tsFinalEnd}...`);
        try {
          const audioBase64 = await blobToBase64(remainingBlob);
          const mimeBase = mimeType.split(";")[0] || "audio/webm";
          const geminiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || "";
          const res = await transcribeFn({
            data: { audioBase64, mimeType: mimeBase, clientApiKey: geminiKey || undefined },
          });
          if (res.text && res.text.trim()) {
            tabTranscriptAccumulatorRef.current +=
              (tabTranscriptAccumulatorRef.current ? "\n" : "") +
              `[... → ${tsFinalEnd}]\n${res.text.trim()}`;
            addLog("success", "[Aba] Trecho final transcrito.");
          }
        } catch (err: any) {
          addLog("error", "[Aba] Erro ao transcrever trecho final: " + err.message);
        }
      }
    }

    if (displayStreamRef.current) { displayStreamRef.current.getTracks().forEach((t) => t.stop()); displayStreamRef.current = null; }
    if (micStreamRef.current) { micStreamRef.current.getTracks().forEach((t) => t.stop()); micStreamRef.current = null; }

    // Build combined transcript with timestamps so Gemini can interleave chronologically
    let combinedTranscript = "";
    const micText = micTranscriptRef.current.trim();
    const tabText = tabTranscriptAccumulatorRef.current.trim();

    if (micText && tabText) {
      // Provide both streams with timestamps and ask Gemini to interleave chronologically
      combinedTranscript =
        `INSTRUÇÃO PARA ANÁLISE: As falas abaixo vêm de duas fontes captadas simultaneamente.` +
        ` Cada linha do microfone tem um timestamp exato [HH:MM:SS].` +
        ` As falas do cliente (aba) têm intervalos de tempo [início → fim].` +
        ` Ao analisar, INTERCALE as falas em ordem cronológica para reconstruir o diálogo real da reunião.\n\n` +
        `=== MICROFONE — ${userDisplayName} (Eu) ===\n` +
        `${micText}\n\n` +
        `=== ÁUDIO DA ABA — Cliente ===\n` +
        `${tabText}`;
    } else if (micText) {
      combinedTranscript = `[${userDisplayName} (Eu)]:\n${micText}`;
    } else if (tabText) {
      combinedTranscript = `[Cliente (Aba)]:\n${tabText}`;
    } else if (transcriptLines.length > 0) {
      combinedTranscript = transcriptLines.map((l) => `[${l.speaker}]: ${l.text}`).join("\n\n");
    }

    if (manualNotes.trim()) {
      combinedTranscript += `\n\n[${userDisplayName} (Eu) — Anotações]: ${manualNotes.trim()}`;
    }
    if (pastedText.trim() && !combinedTranscript.trim()) {
      combinedTranscript = pastedText.trim();
    }

    if (!combinedTranscript.trim()) {
      addLog("error", "Nenhum conteúdo capturado para análise.");
      toast.error("Nenhum áudio ou texto foi capturado.");
      setIsAnalyzing(false);
      setStatusMsg("");
      return;
    }

    setStatusMsg("Analisando reunião com Inteligência Artificial...");
    addLog("info", "Enviando transcrição para análise da IA...");

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
      if (res.suggestions.length > 0) {
        setExpandedSugId(res.suggestions[0].id);
      }
      addLog("success", "Reunião analisada com sucesso!");
      toast.success("Reunião analisada com sucesso!");
      qc.invalidateQueries({ queryKey: ["demand_suggestions"] });
    } catch (err: any) {
      addLog("error", "Erro na análise de IA: " + err.message);
      toast.error("Erro na análise de IA: " + err.message);
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

  const selectedClient = (clients as any[]).find((c) => c.id === clientId);

  // Formatted continuous markdown summary string
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
              {entry.type === "success" && <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0 mt-0.5" />}
              {entry.type === "progress" && <Loader2 className="h-3 w-3 text-blue-400 shrink-0 mt-0.5 animate-spin" />}
              {entry.type === "info" && <Info className="h-3 w-3 text-zinc-400 shrink-0 mt-0.5" />}
              <span className={cn(
                entry.type === "error" && "text-red-300",
                entry.type === "success" && "text-emerald-300",
                entry.type === "progress" && "text-blue-300",
                entry.type === "info" && "text-zinc-300",
              )}>
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
      <DialogContent className="sm:max-w-4xl h-[85vh] bg-[#18181b] border-white/10 text-foreground overflow-hidden flex flex-col p-6">

        <DialogHeader className="shrink-0 pb-2 border-b border-white/10">
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <div className="p-2 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
              <Mic className="h-5 w-5" />
            </div>
            Transcrição Inteligente de Reunião
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
                      <SelectItem key={(c as any).id} value={(c as any).id}>{(c as any).name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Título da Reunião</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Alinhamento Semanal" className="h-9 text-xs bg-background" />
              </div>
            </div>

            <div className="p-4 rounded-xl bg-purple-500/5 border border-purple-500/20 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-purple-300">
                <Sparkles className="h-4 w-4" />
                Captura de Reunião + Seu Microfone
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Ao iniciar, selecione a aba onde está a reunião (Google Meet, Zoom, YouTube) e certifique-se de marcar <strong>"Compartilhar áudio da guia"</strong>.
              </p>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="chk-tab-audio" checked={captureTabAudio} onChange={(e) => setCaptureTabAudio(e.target.checked)} className="rounded border-border cursor-pointer" />
                <label htmlFor="chk-tab-audio" className="text-xs text-zinc-300 cursor-pointer select-none">
                  Capturar áudio da aba da reunião
                </label>
              </div>



              <Button type="button" onClick={startRecording} className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs h-10 gap-2 shadow-lg shadow-purple-600/20 cursor-pointer">
                <Mic className="h-4 w-4" /> Iniciar Gravação
              </Button>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground">Ou cole a transcrição / ata pronta</Label>
              <Textarea rows={3} value={pastedText} onChange={(e) => setPastedText(e.target.value)} placeholder="Cole aqui a transcrição prévia..." className="text-xs bg-background resize-none" />
            </div>

            {pastedText.trim() && (
              <Button type="button" disabled={isAnalyzing} onClick={handleFinishAndAnalyze} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-9 font-semibold gap-1.5 cursor-pointer">
                <Sparkles className="h-4 w-4" />
                {isAnalyzing ? "Analisando..." : "Analisar Texto Colado"}
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
                  {isAnalyzing ? statusMsg : "Transcrição em Tempo Real..."}
                </span>
                {isTranscribingTab && (
                  <span className="text-[10px] text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> Transcrevendo áudio da reunião...
                  </span>
                )}
              </div>
              <span className="font-mono text-sm font-bold text-foreground">⏱️ {formatTimer(seconds)}</span>
            </div>

            {/* Split layout: Live Transcript Feed (LEFT) vs Notes (RIGHT) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 flex-1 min-h-0">
              {/* LEFT: Audio Visualizer Boxes */}
              <div className="flex flex-col gap-3 min-h-0">

                {/* Mic visualizer box */}
                <div className="flex flex-col rounded-xl bg-black/40 border border-purple-500/20 p-3 space-y-2">
                  <div className="flex items-center justify-between border-b border-white/5 pb-2">
                    <span className="text-xs font-semibold text-purple-300 flex items-center gap-1.5">
                      <Mic className="h-3.5 w-3.5 text-purple-400" /> Meu Microfone
                    </span>
                    <span className="text-[10px] text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-full">
                      ● Capturando
                    </span>
                  </div>
                  <div className="flex items-end justify-center gap-[3px] h-14">
                    {Array.from({ length: 24 }).map((_, i) => {
                      const height = Math.max(4, micAudioLevel > 0
                        ? Math.round((micAudioLevel / 100) * 56 * (0.4 + 0.6 * Math.abs(Math.sin(i * 0.8))))
                        : 4 + Math.round(Math.sin(Date.now() / 800 + i) * 2));
                      return (
                        <div
                          key={i}
                          className="w-1.5 rounded-full bg-purple-400 transition-all duration-75"
                          style={{ height: `${height}px`, opacity: micAudioLevel > 5 ? 0.9 : 0.3 }}
                        />
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-zinc-500 text-center">
                    {micAudioLevel > 5 ? "🎙️ Captando voz..." : "Aguardando áudio do microfone..."}
                  </p>
                </div>

                {/* Tab visualizer box */}
                {captureTabAudio && (
                  <div className="flex flex-col rounded-xl bg-black/40 border border-emerald-500/20 p-3 space-y-2">
                    <div className="flex items-center justify-between border-b border-white/5 pb-2">
                      <span className="text-xs font-semibold text-emerald-300 flex items-center gap-1.5">
                        <Radio className="h-3.5 w-3.5 text-emerald-400" /> Áudio da Reunião (Aba)
                      </span>
                      <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                        ● Gravando
                      </span>
                    </div>
                    <div className="flex items-end justify-center gap-[3px] h-14">
                      {Array.from({ length: 24 }).map((_, i) => {
                        const height = Math.max(4, tabAudioLevel > 0
                          ? Math.round((tabAudioLevel / 100) * 56 * (0.4 + 0.6 * Math.abs(Math.sin(i * 0.9 + 1))))
                          : 4);
                        return (
                          <div
                            key={i}
                            className="w-1.5 rounded-full bg-emerald-400 transition-all duration-75"
                            style={{ height: `${height}px`, opacity: tabAudioLevel > 5 ? 0.9 : 0.3 }}
                          />
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-zinc-500 text-center">
                      {tabAudioLevel > 5 ? "🔊 Áudio da reunião detectado..." : "Aguardando áudio da aba..."}
                      {" · Transcrição automática a cada 10 min"}
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
                  className="flex-1 min-h-[260px] bg-black/40 border-white/10 text-xs text-zinc-200 resize-none leading-relaxed p-3"
                />
              </div>
            </div>

            <div className="space-y-2 shrink-0">
              <Button type="button" disabled={isAnalyzing} onClick={handleFinishAndAnalyze}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-bold h-11 text-xs gap-2 shadow-lg shadow-red-600/20 cursor-pointer">
                {isAnalyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4 fill-white" />}
                {isAnalyzing ? statusMsg || "Processando..." : "Finalizar & Transcrever Reunião"}
              </Button>
              <LogPanel />
            </div>
          </div>
        )}

        {/* ── RESULTS ── */}
        {mode === "results" && analysisResult && (
          <div className="flex-1 flex flex-col min-h-0 py-2">
            <div className="flex items-center justify-between text-xs pb-2">
              <span className="text-muted-foreground">
                Cliente: <strong className="text-foreground">{(selectedClient as any)?.name}</strong>
              </span>
              <Button variant="ghost" size="sm"
                onClick={() => { setMode("config"); micTranscriptRef.current = ""; tabMasterChunksRef.current = []; setSeconds(0); setTranscriptLines([]); setExpandedSugId(null); }}
                className="h-7 text-[11px] text-muted-foreground gap-1 cursor-pointer">
                <RefreshCw className="h-3 w-3" /> Nova Transcrição
              </Button>
            </div>

            <Tabs defaultValue="summary" className="flex-1 flex flex-col min-h-0">
              <TabsList className="grid grid-cols-3 bg-zinc-900 border border-white/10 shrink-0">
                <TabsTrigger value="summary" className="text-xs gap-1.5 cursor-pointer">
                  <Sparkles className="h-3.5 w-3.5 text-purple-400" /> Ata da Reunião
                </TabsTrigger>
                <TabsTrigger value="suggestions" className="text-xs gap-1.5 cursor-pointer">
                  <ListTodo className="h-3.5 w-3.5 text-emerald-400" /> Sugestões de Demandas ({analysisResult.suggestions.length})
                </TabsTrigger>
                <TabsTrigger value="transcript" className="text-xs gap-1.5 cursor-pointer">
                  <FileText className="h-3.5 w-3.5" /> Transcrição Bruta
                </TabsTrigger>
              </TabsList>

              {/* 1. SINGLE FORMATTED CONTINUOUS TEXT ATA DE REUNIÃO */}
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
                        if (!existingId) {
                          toast.error("Nenhuma reunião salva para refazer resumo.");
                          return;
                        }
                        setIsAnalyzing(true);
                        setStatusMsg("Refazendo resumo/ata da reunião com IA...");
                        try {
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
                          toast.success("Resumo/Ata regerado com IA!");
                          qc.invalidateQueries({ queryKey: ["demand_suggestions"] });
                        } catch (err: any) {
                          toast.error("Erro ao refazer resumo: " + err.message);
                        } finally {
                          setIsAnalyzing(false);
                          setStatusMsg("");
                        }
                      }}
                      disabled={isAnalyzing}
                      className="h-7 text-xs font-semibold border-purple-500/30 bg-purple-500/10 text-purple-300 hover:bg-purple-500/20 gap-1.5 cursor-pointer"
                    >
                      <RotateCcw className={cn("h-3.5 w-3.5", isAnalyzing && "animate-spin")} />
                      Refazer Resumo IA
                    </Button>
                  </div>
                  <div className="w-full h-[360px] overflow-y-auto pr-1">
                    <MarkdownView content={formattedSummaryText || ""} />
                  </div>
                </div>
              </TabsContent>

              {/* 2. RICH BRIEFING SUGGESTIONS LIST & EXPANDED DETAIL VIEW */}
              <TabsContent value="suggestions" className="flex-1 min-h-0 mt-3 overflow-y-auto space-y-3">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <h3 className="text-sm font-bold text-emerald-300 flex items-center gap-2">
                    <ListTodo className="h-4 w-4" /> Sugestões de Demandas Geradas
                  </h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      if (!analysisResult?.rawTranscript) return;
                      const existingId = analysisResult.suggestions[0]?.id;
                      if (!existingId) {
                        toast.error("Nenhuma reunião salva para refazer sugestões.");
                        return;
                      }
                      setIsAnalyzing(true);
                      setStatusMsg("Refazendo sugestões de demandas com IA...");
                      try {
                        const geminiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || "";
                        await reanalyzeSuggestionsFn({
                          data: {
                            suggestionId: existingId,
                            clientApiKey: geminiKey || undefined,
                          },
                        });
                        toast.success("Sugestões de demandas regeradas pela IA!");
                        qc.invalidateQueries({ queryKey: ["demand_suggestions"] });
                      } catch (err: any) {
                        toast.error("Erro ao refazer sugestões: " + err.message);
                      } finally {
                        setIsAnalyzing(false);
                        setStatusMsg("");
                      }
                    }}
                    disabled={isAnalyzing}
                    className="h-7 text-xs font-semibold border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 gap-1.5 cursor-pointer"
                  >
                    <RotateCcw className={cn("h-3.5 w-3.5", isAnalyzing && "animate-spin")} />
                  </Button>
                </div>
                {analysisResult.suggestions.length === 0 ? (
                  <div className="p-8 text-center text-xs text-muted-foreground italic bg-zinc-900/50 rounded-xl border border-white/10">
                    Nenhuma sugestão de demanda detectada na reunião.
                  </div>
                ) : (
                  analysisResult.suggestions.map((sug) => {
                    const isExpanded = expandedSugId === sug.id;
                    return (
                      <div
                        key={sug.id}
                        className={cn(
                          "rounded-xl border transition-all bg-zinc-900 overflow-hidden",
                          isExpanded ? "border-purple-500/50 shadow-lg shadow-purple-500/5" : "border-white/10 hover:border-white/20"
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
                              className={cn(
                                "text-[10px] uppercase font-bold px-2 py-0.5",
                                sug.suggested_type === "AJUSTE_DEMANDA"
                                  ? "bg-amber-500/10 text-amber-300 border-amber-500/30"
                                  : "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                              )}
                            >
                              {sug.suggested_type === "AJUSTE_DEMANDA" ? "Ajuste" : "Nova Demanda"}
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
                                Briefing da IA
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

              {/* 3. RAW TRANSCRIPT */}
              <TabsContent value="transcript" className="flex-1 min-h-0 mt-3">
                <Textarea readOnly value={analysisResult.rawTranscript}
                  className="w-full h-full min-h-[220px] bg-black/40 border-white/10 text-xs font-mono resize-none leading-relaxed" />
              </TabsContent>
            </Tabs>
            <LogPanel />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
