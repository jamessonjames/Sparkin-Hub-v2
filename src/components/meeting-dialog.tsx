import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Video, Calendar, Clock, Mic, Sparkles, FileText, Trash2, Save,
  Square, Loader2, CheckCircle2
} from "lucide-react";
import { listClients } from "@/lib/clients.functions";
import { upsertMeeting, deleteMeeting, type Meeting } from "@/lib/meetings.functions";
import { RichEditor } from "./rich-editor";
import { MarkdownView } from "./markdown-view";
import {
  analyzeMeetingTranscript,
  type DemandSuggestion
} from "@/lib/suggestions.functions";

interface MeetingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meeting?: Meeting | null;
  defaultSlotDateTime?: string;
  defaultClientId?: string;
  onSuccess?: () => void;
}

function getSupportedMimeType(): string {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return types.find((t) => MediaRecorder.isTypeSupported(t)) ?? "audio/webm";
}

function toLocalDateTime(value?: string) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return value?.slice(0, 16) || "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function MeetingDialog({
  open,
  onOpenChange,
  meeting,
  defaultSlotDateTime,
  defaultClientId,
  onSuccess,
}: MeetingDialogProps) {
  const qc = useQueryClient();
  const listClientsFn = useServerFn(listClients);
  const upsertMeetingFn = useServerFn(upsertMeeting);
  const deleteMeetingFn = useServerFn(deleteMeeting);
  const analyzeFn = useServerFn(analyzeMeetingTranscript);

  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: () => listClientsFn(),
    staleTime: 5 * 60 * 1000,
  });

  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState<string>("none");
  const [dueDate, setDueDate] = useState("");
  const [estimatedHours, setEstimatedHours] = useState(1.0);
  const [notes, setNotes] = useState("");
  const [aiSummary, setAiSummary] = useState("");
  const [rawTranscript, setRawTranscript] = useState("");
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("notes");

  // Audio recording & AI transcription states
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [suggestions, setSuggestions] = useState<DemandSuggestion[]>([]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (open) {
      if (meeting) {
        setTitle(meeting.title || "");
        setClientId(meeting.client_id || "none");
        setDueDate(toLocalDateTime(meeting.due_date));
        setEstimatedHours(meeting.estimated_hours || 1.0);
        setNotes(meeting.notes || "");
        setAiSummary(meeting.ai_summary || "");
        setRawTranscript(meeting.transcript || "");
      } else {
        const nowIso = defaultSlotDateTime?.slice(0, 16) || toLocalDateTime();
        setTitle("");
        setClientId(defaultClientId || "none");
        setDueDate(nowIso);
        setEstimatedHours(1.0);
        setNotes("");
        setAiSummary("");
        setRawTranscript("");
      }
      setIsRecording(false);
      setRecordingSeconds(0);
      setSuggestions([]);
    }
  }, [open, meeting, defaultSlotDateTime, defaultClientId]);

  // Handle recording timer
  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => setRecordingSeconds((s) => s + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording]);

  const handleStartRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getSupportedMimeType();
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.start(1000);
      setIsRecording(true);
      setRecordingSeconds(0);
      toast.info("Gravação de áudio iniciada.");
    } catch (err: any) {
      toast.error("Não foi possível acessar o microfone: " + (err.message || err));
    }
  };

  const handleStopRecording = async () => {
    if (!mediaRecorderRef.current || !isRecording) return;
    setIsRecording(false);

    setIsTranscribing(true);
    toast.info("Transcrevendo localmente, sem consumir créditos de IA...");

    try {
      const recorder = mediaRecorderRef.current;
      await new Promise<void>((resolve) => {
        recorder.addEventListener("stop", () => resolve(), { once: true });
        recorder.stop();
      });
      recorder.stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || getSupportedMimeType() });
      const { transcribeAudio } = await import("@/lib/local-whisper");
      const text = (await transcribeAudio(blob, (message) => toast.info(message, { id: "local-transcription" }))).trim();
      toast.dismiss("local-transcription");

      if (text) {
        setRawTranscript((prev) => (prev ? `${prev}\n${text}` : text));
        toast.success("Áudio transcrito localmente com sucesso!");
      } else {
        toast.warning("Nenhuma fala foi identificada no áudio.");
      }
    } catch (err: any) {
      toast.error("Erro na transcrição: " + (err.message || "Tente novamente."));
    } finally {
      setIsTranscribing(false);
      setIsAnalyzing(false);
    }
  };

  const handleAnalyze = async () => {
    if (!rawTranscript.trim() || clientId === "none") return;
    setIsAnalyzing(true);
    try {
      const result = await analyzeFn({
        data: { clientId, title: title.trim() || "Reunião", transcript: rawTranscript },
      });
      setAiSummary(result.summary?.join("\n") || "");
      setRawTranscript(result.rawTranscript || rawTranscript);
      setSuggestions(result.suggestions || []);
      toast.success("Resumo e sugestões gerados.");
    } catch (err: any) {
      toast.error(err.message || "Não foi possível gerar a análise.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error("Por favor, digite um título para a reunião.");
      return;
    }
    if (!dueDate) {
      toast.error("Por favor, selecione a data e horário da reunião.");
      return;
    }

    setSaving(true);
    try {
      await upsertMeetingFn({
        data: {
          id: meeting?.id,
          title: title.trim(),
          client_id: clientId === "none" ? null : clientId,
          // datetime-local has no timezone; convert in the browser so 09:00 remains
          // 09:00 in the user's timezone when persisted as timestamptz.
          due_date: new Date(dueDate).toISOString(),
          estimated_hours: Number(estimatedHours),
          notes,
          ai_summary: aiSummary,
          transcript: rawTranscript,
        },
      });

      toast.success(meeting ? "Reunião atualizada com sucesso!" : "Reunião criada com sucesso!");
      qc.invalidateQueries({ queryKey: ["demands"] });
      qc.invalidateQueries({ queryKey: ["meetings"] });
      onOpenChange(false);
      onSuccess?.();
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar reunião.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!meeting?.id) return;
    if (!confirm("Tem certeza que deseja excluir esta reunião?")) return;

    setSaving(true);
    try {
      await deleteMeetingFn({ data: { id: meeting.id } });
      toast.success("Reunião excluída.");
      qc.invalidateQueries({ queryKey: ["demands"] });
      qc.invalidateQueries({ queryKey: ["meetings"] });
      onOpenChange(false);
      onSuccess?.();
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir reunião.");
    } finally {
      setSaving(false);
    }
  };

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[760px] max-h-[90vh] p-0 bg-[#18181b] border border-zinc-800 text-foreground rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <DialogHeader className="p-4 border-b border-zinc-800/80 bg-zinc-900/60 shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <div className="h-8 w-8 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center shrink-0 border border-purple-500/20">
                <Video className="h-4 w-4" />
              </div>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Título da reunião..."
                className="bg-transparent border-none text-base font-bold text-foreground focus-visible:ring-0 p-0 h-auto placeholder:text-zinc-500"
              />
            </div>
          </div>

          {/* Properties Bar */}
          <div className="flex items-center gap-3 pt-3 flex-wrap text-xs text-zinc-400">
            {/* Client */}
            <div className="flex items-center gap-1.5">
              <Label className="text-[11px] font-semibold text-zinc-400">Cliente:</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger className="h-7 text-xs bg-zinc-900 border-zinc-700 text-zinc-200 min-w-[140px]">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                  <SelectItem value="none">Nenhum / Avulsa (Geral)</SelectItem>
                  {clients.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date Time */}
            <div className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-zinc-400" />
              <Input
                type="datetime-local"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                onClick={(e) => { try { e.currentTarget.showPicker?.(); } catch {} }}
                className="h-7 text-xs bg-zinc-900 border-zinc-700 text-zinc-200 w-auto cursor-pointer"
              />
            </div>

            {/* Duration */}
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-zinc-400" />
              <Label className="text-[11px] font-semibold text-zinc-400">Duração:</Label>
              <Select
                value={String(estimatedHours)}
                onValueChange={(val) => setEstimatedHours(Number(val))}
              >
                <SelectTrigger className="h-7 text-xs bg-zinc-900 border-zinc-700 text-zinc-200 w-[90px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                  <SelectItem value="0.5">0.5h (30m)</SelectItem>
                  <SelectItem value="1">1.0h (1h)</SelectItem>
                  <SelectItem value="1.5">1.5h (1h30m)</SelectItem>
                  <SelectItem value="2">2.0h (2h)</SelectItem>
                  <SelectItem value="3">3.0h (3h)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </DialogHeader>

        {/* Notes and transcription are available only after the meeting exists. */}
        {meeting?.id ? (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <div className="px-4 pt-2 border-b border-zinc-800/80 bg-zinc-900/40">
            <TabsList className="bg-zinc-900 border border-zinc-800 p-1 rounded-xl h-auto gap-1">
              <TabsTrigger value="notes" className="text-xs font-semibold gap-1.5">
                <FileText className="h-3.5 w-3.5" /> Anotações Manuais
              </TabsTrigger>
              <TabsTrigger value="ai_transcription" className="text-xs font-semibold gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-purple-400" /> Transcrição & IA
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {/* Tab 1: Manual Notes */}
            <TabsContent value="notes" className="m-0 h-full flex flex-col">
              <RichEditor
                content={notes}
                onChange={setNotes}
                placeholder="Faça anotações em tempo real sobre a reunião..."
              />
            </TabsContent>

            {/* Tab 2: AI Transcription & Recording */}
            <TabsContent value="ai_transcription" className="m-0 space-y-4">
              {/* Recording Controls Card */}
              <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/60 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  {isRecording ? (
                    <div className="h-10 w-10 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center animate-pulse border border-red-500/40">
                      <Mic className="h-5 w-5" />
                    </div>
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-zinc-800 text-zinc-400 flex items-center justify-center border border-zinc-700">
                      <Mic className="h-5 w-5" />
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-bold text-zinc-200">
                      {isRecording ? `Gravando áudio (${formatTimer(recordingSeconds)})` : "Transcrição local gratuita"}
                    </p>
                    <p className="text-[11px] text-zinc-400">
                      {isRecording ? "Fale normalmente. Clique em encerrar para transcrever." : "O áudio é transcrito no seu navegador, sem créditos de IA."}
                    </p>
                  </div>
                </div>

                {isRecording ? (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={handleStopRecording}
                    className="gap-1.5 text-xs font-bold"
                  >
                    <Square className="h-3.5 w-3.5" /> Encerrar e Transcrever
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={handleStartRecording}
                    disabled={isTranscribing || isAnalyzing}
                    className="gap-1.5 text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white"
                  >
                    {isTranscribing ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Transcrevendo...
                      </>
                    ) : (
                      <>
                        <Mic className="h-3.5 w-3.5" /> Iniciar Gravação
                      </>
                    )}
                  </Button>
                )}
              </div>

              {/* AI Summary Section */}
              {aiSummary ? (
                <div className="p-4 rounded-xl border border-purple-500/30 bg-purple-950/20 space-y-2">
                  <div className="flex items-center gap-2 text-purple-400 font-bold text-xs">
                    <Sparkles className="h-4 w-4" /> Resumo Gerado por IA
                  </div>
                  <div className="text-xs text-zinc-200 prose prose-invert max-w-none">
                    <MarkdownView content={aiSummary} />
                  </div>
                </div>
              ) : null}

              {/* Transcript Text Output */}
              {rawTranscript ? (
                <div className="p-3 rounded-xl border border-zinc-800 bg-zinc-900/40 space-y-1.5">
                  <p className="text-xs font-bold text-zinc-300">Transcrição Completa:</p>
                  <p className="text-xs text-zinc-400 whitespace-pre-wrap leading-relaxed">{rawTranscript}</p>
                </div>
              ) : null}

              {rawTranscript && (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
                  <p className="text-[11px] text-zinc-400">
                    O resumo e as sugestões usam o Gemini e exigem um cliente vinculado.
                  </p>
                  <Button size="sm" onClick={handleAnalyze} disabled={isAnalyzing || clientId === "none"} className="gap-1.5 text-xs">
                    {isAnalyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    Gerar resumo e sugestões
                  </Button>
                </div>
              )}

              {suggestions.length > 0 && (
                <div className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
                  <p className="flex items-center gap-1.5 text-xs font-bold text-zinc-300"><CheckCircle2 className="h-4 w-4" /> Sugestões enviadas para a Triagem</p>
                  {suggestions.map((suggestion) => (
                    <div key={suggestion.id} className="rounded-lg border border-zinc-800 p-2 text-xs text-zinc-300">{suggestion.suggested_title}</div>
                  ))}
                </div>
              )}
            </TabsContent>
          </div>
        </Tabs>
        ) : (
          <div className="flex min-h-[110px] flex-1 items-center justify-center border-t border-zinc-800/80 px-6 text-center">
            <p className="max-w-md text-xs leading-relaxed text-zinc-500">
              Depois de criar a reunião, clique nela na Agenda ou em Reuniões para adicionar anotações, gravar e transcrever o áudio.
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="p-3.5 border-t border-zinc-800/80 bg-zinc-900/60 flex items-center justify-between shrink-0">
          <div>
            {meeting?.id && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDelete}
                disabled={saving}
                className="text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" /> Excluir
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={saving}
              className="text-xs border-zinc-700 hover:bg-zinc-800"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className="text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white gap-1.5"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {meeting ? "Salvar Alterações" : "Criar Reunião"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
