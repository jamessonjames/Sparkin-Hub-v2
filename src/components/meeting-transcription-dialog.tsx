import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { analyzeMeetingTranscript, approveSuggestion, type DemandSuggestion } from "@/lib/suggestions.functions";
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
  Mic,
  Sparkles,
  CheckCircle2,
  FileText,
  ListTodo,
  Square,
  RefreshCw,
  NotebookPen,
  Volume2,
} from "lucide-react";
import { useUserContext } from "@/contexts/user-context";
import { cn } from "@/lib/utils";
import { transcribeAudio } from "@/lib/local-whisper";



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

  const { profiles, currentUser } = useUserContext();
  const currentProfile = profiles.find((p) => p.id === currentUser?.id);
  const userDisplayName = currentProfile?.name || "Eu";

  // Mode: "config" | "recording" | "results"
  const [mode, setMode] = useState<"config" | "recording" | "results">("config");

  const [clientId, setClientId] = useState(defaultClientId || "");
  const [title, setTitle] = useState("");
  const [pastedText, setPastedText] = useState("");
  const [manualNotes, setManualNotes] = useState("");

  // Recording State
  const [seconds, setSeconds] = useState(0);
  const [fullLiveText, setFullLiveText] = useState("");
  const [captureTabAudio, setCaptureTabAudio] = useState(true);

  const timerRef = useRef<any>(null);
  const displayStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const isRecordingRef = useRef<boolean>(false);

  // Audio visualizer refs
  const micCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const tabCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number>(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserMicRef = useRef<AnalyserNode | null>(null);
  const analyserTabRef = useRef<AnalyserNode | null>(null);



  // Results State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<{
    summary: string[];
    suggestions: DemandSuggestion[];
    rawTranscript: string;
  } | null>(null);

  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: () => listClientsFn(),
    enabled: open,
  });

  useEffect(() => {
    if (open) {
      setClientId(defaultClientId || "");
      setMode("config");
      setFullLiveText("");
      setSeconds(0);
      setAnalysisResult(null);
      setPastedText("");
      setManualNotes("");
      audioChunksRef.current = [];
    } else {
      stopRecording();
    }
  }, [open, defaultClientId]);

  // Handle Timer
  useEffect(() => {
    if (mode === "recording") {
      timerRef.current = setInterval(() => {
        setSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [mode]);

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60)
      .toString()
      .padStart(2, "0");
    const s = (sec % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  // Draw waveform on a canvas from an AnalyserNode
  const drawWaveform = (canvas: HTMLCanvasElement, analyser: AnalyserNode, color: string) => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const draw = () => {
      if (!isRecordingRef.current) return;
      animFrameRef.current = requestAnimationFrame(draw);
      analyser.getByteTimeDomainData(dataArray);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.lineWidth = 2;
      ctx.strokeStyle = color;
      ctx.beginPath();
      const slice = canvas.width / bufferLength;
      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * canvas.height) / 2;
        if (i === 0) ctx.moveTo(0, y);
        else ctx.lineTo(i * slice, y);
      }
      ctx.stroke();
    };
    draw();
  };

  // Start Dual Recording (Mic + Google Meet / Zoom Tab Audio) with AudioContext Mixing
  const startRecording = async () => {
    if (!clientId) {
      toast.error("Por favor, selecione o cliente antes de iniciar a gravação.");
      return;
    }

    setMode("recording");
    isRecordingRef.current = true;
    setFullLiveText("");

    let displayStream: MediaStream | null = null;
    let micStream: MediaStream | null = null;

    // Step 1: Capture Tab Audio (Google Meet / Zoom / YouTube)
    if (captureTabAudio && navigator.mediaDevices?.getDisplayMedia) {
      try {
        toast.info("👉 No seletor do Chrome, selecione 'Guia do Chrome' e marque 'Compartilhar áudio da guia'.", { duration: 6000 });
        displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        });
        displayStreamRef.current = displayStream;

        if (displayStream.getAudioTracks().length === 0) {
          toast.error("Atenção: Áudio da aba não capturado! Selecione 'Guia do Chrome' e marque 'Compartilhar áudio da guia'.", { duration: 10000 });
        }

        if (displayStream.getVideoTracks().length > 0) {
          displayStream.getVideoTracks()[0].onended = () => {
            console.log("[Sparkin Hub] Compartilhamento de aba encerrado.");
          };
        }
      } catch (err) {
        console.warn("[Sparkin Hub] Compartilhamento de aba cancelado/não suportado:", err);
      }
    }

    // Step 2: Capture Microphone
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = micStream;
    } catch (err: any) {
      toast.error("Não foi possível acessar o microfone: " + err.message);
      return;
    }

    // Step 3: Mix Microphone and Tab Audio via Web Audio API into a Combined Stream
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    audioCtxRef.current = audioCtx;
    if (audioCtx.state === "suspended") {
      try {
        await audioCtx.resume();
      } catch (e) {
        console.warn("[Sparkin Hub] Erro ao retomar AudioContext:", e);
      }
    }

    const destNode = audioCtx.createMediaStreamDestination();

    // Attach mic stream with analyser
    if (micStream && micStream.getAudioTracks().length > 0) {
      const micSource = audioCtx.createMediaStreamSource(micStream);
      const micAnalyser = audioCtx.createAnalyser();
      micAnalyser.fftSize = 256;
      micSource.connect(micAnalyser);
      micAnalyser.connect(destNode);
      analyserMicRef.current = micAnalyser;
      if (micCanvasRef.current) drawWaveform(micCanvasRef.current, micAnalyser, "#a78bfa");
    }

    // Attach display audio stream with analyser
    const displayAudioTracks = displayStream ? displayStream.getAudioTracks() : [];
    if (displayAudioTracks.length > 0) {
      const displayAudioStream = new MediaStream([displayAudioTracks[0]]);
      const displaySource = audioCtx.createMediaStreamSource(displayAudioStream);
      const tabAnalyser = audioCtx.createAnalyser();
      tabAnalyser.fftSize = 256;
      displaySource.connect(tabAnalyser);
      tabAnalyser.connect(destNode);
      analyserTabRef.current = tabAnalyser;
      if (tabCanvasRef.current) drawWaveform(tabCanvasRef.current, tabAnalyser, "#34d399");
    }

    const combinedAudioStream = destNode.stream;

    // Step 4: Attach MediaRecorder to capture combined audio into a webm blob
    let recorderMimeType = "audio/webm";
    if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
      recorderMimeType = "audio/webm;codecs=opus";
    } else if (MediaRecorder.isTypeSupported("audio/webm")) {
      recorderMimeType = "audio/webm";
    } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
      recorderMimeType = "audio/mp4";
    }

    try {
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(combinedAudioStream, { mimeType: recorderMimeType });
      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      mediaRecorder.start(1000);
      mediaRecorderRef.current = mediaRecorder;
    } catch (err) {
      console.warn("[Sparkin Hub] Erro ao iniciar MediaRecorder:", err);
    }

    toast.success("Gravação iniciada! Áudio sendo capturado.");
  };

  const stopRecordingAndGetAudioBlob = (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      isRecordingRef.current = false;
      cancelAnimationFrame(animFrameRef.current);

      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }

      if (displayStreamRef.current) {
        displayStreamRef.current.getTracks().forEach((t) => t.stop());
        displayStreamRef.current = null;
      }
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t) => t.stop());
        micStreamRef.current = null;
      }

      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.onstop = () => {
          if (audioChunksRef.current.length > 0) {
            const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" });
            resolve(blob);
          } else {
            resolve(null);
          }
        };
        try {
          recorder.requestData();
          recorder.stop();
        } catch {
          resolve(null);
        }
      } else {
        if (audioChunksRef.current.length > 0) {
          resolve(new Blob(audioChunksRef.current, { type: "audio/webm" }));
        } else {
          resolve(null);
        }
      }
    });
  };

  const stopRecording = () => {
    stopRecordingAndGetAudioBlob();
  };

  const handleFinishAndAnalyze = async () => {
    setIsAnalyzing(true);
    const audioBlob = await stopRecordingAndGetAudioBlob();

    let combinedTranscriptText = "";
    if (fullLiveText.trim()) {
      combinedTranscriptText += `TRANSCRIÇÃO AO VIVO:\n${fullLiveText.trim()}\n\n`;
    }

    // Transcribe full audio (mic + tab) locally via Whisper
    if (audioBlob && audioBlob.size > 1000) {
      try {
        const whisperText = await transcribeAudio(audioBlob, (msg) => toast.info(msg));
        if (whisperText.trim()) {
          combinedTranscriptText += `TRANSCRIÇÃO COMPLETA DO ÁUDIO:\n${whisperText.trim()}\n\n`;
        }
      } catch (err: any) {
        console.warn("[Sparkin Hub] Erro na transcrição Whisper:", err);
        toast.error("Falha na transcrição do áudio: " + err.message);
      }
    }

    if (manualNotes.trim()) {
      combinedTranscriptText += `ANOTAÇÕES:\n${manualNotes.trim()}`;
    }
    if (pastedText.trim() && !combinedTranscriptText) {
      combinedTranscriptText = pastedText.trim();
    }

    if (!combinedTranscriptText.trim()) {
      toast.error("Nenhum texto foi capturado para análise.");
      setIsAnalyzing(false);
      return;
    }

    try {
      const res = await analyzeFn({
        data: {
          clientId,
          title: title.trim() || "Reunião de Alinhamento",
          transcript: combinedTranscriptText,
        },
      });

      setAnalysisResult(res);
      setMode("results");
      toast.success("Reunião analisada pela IA com sucesso!");
      qc.invalidateQueries({ queryKey: ["demand_suggestions"] });
    } catch (err: any) {
      toast.error("Erro ao analisar reunião com IA: " + err.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleApproveSingle = async (sugId: string) => {
    try {
      await approveFn({ data: { id: sugId } });
      toast.success("Demanda criada e integrada!");
      qc.invalidateQueries({ queryKey: ["demands"] });
      qc.invalidateQueries({ queryKey: ["demand_suggestions"] });
      setAnalysisResult((prev) =>
        prev
          ? {
              ...prev,
              suggestions: prev.suggestions.filter((s) => s.id !== sugId),
            }
          : null
      );
    } catch (err: any) {
      toast.error("Erro ao aprovar demanda: " + err.message);
    }
  };

  const selectedClient = clients.find((c) => c.id === clientId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl h-[85vh] bg-[#18181b] border-white/10 text-foreground overflow-hidden flex flex-col p-6">
        <DialogHeader className="shrink-0 pb-2 border-b border-white/10">
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <div className="p-2 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
              <Mic className="h-5 w-5" />
            </div>
            Transcrição Inteligente de Reunião
            {mode === "recording" && (
              <Badge className="bg-red-500/20 text-red-400 border-red-500/30 gap-1.5 ml-auto animate-pulse">
                <span className="h-2 w-2 rounded-full bg-red-500" />
                GRAVANDO AO VIVO ({formatTimer(seconds)})
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* STATE 1: CONFIGURAR E INICIAR */}
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
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
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
                  placeholder="Ex: Alinhamento Semanal de Campanha"
                  className="h-9 text-xs bg-background"
                />
              </div>
            </div>

            <div className="p-4 rounded-xl bg-purple-500/5 border border-purple-500/20 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-purple-300">
                  <Sparkles className="h-4 w-4" />
                  Captura Dupla de Áudio (Microfone + Áudio do Google Meet/Zoom)
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Ao clicar em iniciar, o Chrome solicitará o compartilhamento da aba da reunião. Marque a opção <strong>"Compartilhar áudio da guia"</strong> para gravar tanto a sua voz quanto a voz do cliente no Google Meet!
              </p>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="chk-tab-audio"
                  checked={captureTabAudio}
                  onChange={(e) => setCaptureTabAudio(e.target.checked)}
                  className="rounded border-border bg-background cursor-pointer"
                />
                <label htmlFor="chk-tab-audio" className="text-xs text-zinc-300 font-medium cursor-pointer select-none">
                  Capturar áudio da aba da reunião (Google Meet / Zoom)
                </label>
              </div>

              <div className="pt-2">
                <Button
                  type="button"
                  onClick={startRecording}
                  className="bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs h-10 w-full gap-2 shadow-lg shadow-purple-600/20 cursor-pointer"
                >
                  <Mic className="h-4 w-4" />
                  Iniciar Gravador da Reunião
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground">Ou cole a transcrição / ata pronta</Label>
              <Textarea
                rows={3}
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                placeholder="Cole aqui a transcrição prévia do Google Meet, Zoom ou anotações..."
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
                {isAnalyzing ? "Analisando com IA..." : "Analisar Texto Colado"}
              </Button>
            )}
          </div>
        )}

        {/* STATE 2: GRAVAÇÃO EM ANDAMENTO + WAVEFORMS + TRANSCRIÇÃO AO VIVO + ANOTAÇÕES */}
        {mode === "recording" && (
          <div className="space-y-4 py-3 flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between p-3 rounded-xl bg-red-500/10 border border-red-500/20">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-red-500 animate-ping" />
                <span className="text-xs font-bold text-red-300">
                  Gravando reunião...
                </span>
              </div>
              <span className="font-mono text-sm font-bold text-foreground">
                ⏱️ {formatTimer(seconds)}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 min-h-0">
              {/* Lado Esquerdo: Waveforms */}
              <div className="flex flex-col min-h-0 space-y-3">
                <div className="rounded-xl bg-black/40 border border-white/10 p-3 space-y-2">
                  <Label className="text-xs font-semibold text-purple-300 flex items-center gap-1.5">
                    <Mic className="h-3.5 w-3.5" /> Microfone
                    <span className="ml-auto text-[10px] text-muted-foreground font-normal">ao vivo</span>
                  </Label>
                  <canvas
                    ref={micCanvasRef}
                    className="w-full h-12 rounded-lg bg-zinc-950"
                    width={400}
                    height={48}
                  />
                </div>

                <div className="rounded-xl bg-black/40 border border-white/10 p-3 space-y-2">
                  <Label className="text-xs font-semibold text-emerald-300 flex items-center gap-1.5">
                    <Volume2 className="h-3.5 w-3.5" /> Áudio da Aba (Cliente)
                    {captureTabAudio && (
                      <span className="ml-auto text-[10px] text-muted-foreground font-normal">ao vivo</span>
                    )}
                  </Label>
                  <canvas
                    ref={tabCanvasRef}
                    className="w-full h-12 rounded-lg bg-zinc-950"
                    width={400}
                    height={48}
                  />
                </div>
              </div>

              {/* Lado Direito: Anotações Manuais */}
              <div className="flex flex-col min-h-0 space-y-1.5">
                <Label className="text-xs font-semibold text-emerald-300 flex items-center gap-1.5">
                  <NotebookPen className="h-3.5 w-3.5" /> Minhas Anotações
                </Label>
                <Textarea
                  value={manualNotes}
                  onChange={(e) => setManualNotes(e.target.value)}
                  placeholder="Escreva aqui suas observações durante a reunião..."
                  className="flex-1 min-h-[250px] bg-black/40 border-white/10 text-xs text-zinc-200 resize-none leading-relaxed p-3"
                />
              </div>
            </div>

            <Button
              type="button"
              disabled={isAnalyzing}
              onClick={handleFinishAndAnalyze}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-bold h-11 text-xs gap-2 shadow-lg shadow-red-600/20 shrink-0 cursor-pointer"
            >
              <Square className="h-4 w-4 fill-white" />
              {isAnalyzing ? "Analisando com IA..." : "Finalizar & Analisar Reunião"}
            </Button>
          </div>
        )}

        {/* STATE 3: RESULTADOS EM 3 ABAS */}
        {mode === "results" && analysisResult && (
          <div className="flex-1 flex flex-col min-h-0 py-2">
            <div className="flex items-center justify-between text-xs pb-2">
              <span className="text-muted-foreground">
                Cliente: <strong className="text-foreground">{selectedClient?.name}</strong>
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMode("config")}
                className="h-7 text-[11px] text-muted-foreground gap-1 cursor-pointer"
              >
                <RefreshCw className="h-3 w-3" /> Nova Transcrição
              </Button>
            </div>

            <Tabs defaultValue="suggestions" className="flex-1 flex flex-col min-h-0">
              <TabsList className="grid grid-cols-3 bg-zinc-900 border border-white/10 shrink-0">
                <TabsTrigger value="transcript" className="text-xs gap-1.5 cursor-pointer">
                  <FileText className="h-3.5 w-3.5" /> 📜 Transcrição & Anotações
                </TabsTrigger>
                <TabsTrigger value="summary" className="text-xs gap-1.5 cursor-pointer">
                  <Sparkles className="h-3.5 w-3.5" /> 💡 Resumo
                </TabsTrigger>
                <TabsTrigger value="suggestions" className="text-xs gap-1.5 cursor-pointer">
                  <ListTodo className="h-3.5 w-3.5 text-purple-400" /> 📌 Sugestões ({analysisResult.suggestions.length})
                </TabsTrigger>
              </TabsList>

              {/* ABA 1: TRANSCRIÇÃO COMPLETA & ANOTAÇÕES */}
              <TabsContent value="transcript" className="flex-1 min-h-0 mt-3">
                <Textarea
                  readOnly
                  value={analysisResult.rawTranscript}
                  className="w-full h-full min-h-[220px] bg-black/40 border-white/10 text-xs font-mono resize-none leading-relaxed"
                />
              </TabsContent>

              {/* ABA 2: RESUMO EXECUTIVO */}
              <TabsContent value="summary" className="flex-1 min-h-0 mt-3 overflow-y-auto">
                <div className="p-4 rounded-xl bg-zinc-900 border border-white/10 space-y-3">
                  <h4 className="text-xs font-bold text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4" /> Principais Decisões & Alinhamentos
                  </h4>
                  <ul className="space-y-2 text-xs text-zinc-300">
                    {analysisResult.summary.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2 bg-zinc-950/60 p-2.5 rounded-lg border border-white/5">
                        <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </TabsContent>

              {/* ABA 3: SUGESTÕES DE DEMANDAS */}
              <TabsContent value="suggestions" className="flex-1 min-h-0 mt-3 overflow-y-auto space-y-3">
                {analysisResult.suggestions.length === 0 ? (
                  <div className="p-8 text-center text-xs text-muted-foreground italic bg-zinc-900/50 rounded-xl border border-white/10">
                    Nenhuma nova demanda ou ajuste detectado nesta reunião.
                  </div>
                ) : (
                  analysisResult.suggestions.map((sug) => (
                    <div
                      key={sug.id}
                      className="p-3.5 rounded-xl border border-white/10 bg-zinc-900 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] uppercase font-bold",
                            sug.suggested_type === "AJUSTE_DEMANDA"
                              ? "bg-amber-500/10 text-amber-300 border-amber-500/30"
                              : "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                          )}
                        >
                          {sug.suggested_type === "AJUSTE_DEMANDA" ? "🔄 Ajuste Detectado" : "🟢 Nova Demanda"}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground font-mono">
                          ~{sug.estimated_hours || 2}h estimadas
                        </span>
                      </div>

                      <h4 className="text-xs font-bold text-zinc-100">{sug.suggested_title}</h4>
                      <p className="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed">
                        {sug.suggested_description || sug.ai_summary}
                      </p>

                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/5">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => handleApproveSingle(sug.id)}
                          className="h-7 text-[11px] bg-purple-600 hover:bg-purple-700 text-white gap-1 font-semibold cursor-pointer"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Criar / Mover Demanda Agora
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
