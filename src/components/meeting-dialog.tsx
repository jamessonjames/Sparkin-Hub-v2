import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Video, Calendar, Clock, Mic, Sparkles, FileText, Trash2, Save,
  Square, Loader2, CheckCircle2, ListTodo, Copy, Volume2, Info, ChevronDown, ChevronUp, Radio
} from "lucide-react";
import { listClients } from "@/lib/clients.functions";
import { upsertMeeting, deleteMeeting, type Meeting } from "@/lib/meetings.functions";
import { createDemand } from "@/lib/demands.functions";
import { RichEditor } from "./rich-editor";
import { MarkdownView } from "./markdown-view";
import { useUserContext } from "@/contexts/user-context";
import { createMeetingAudioRecorder, type MeetingAudioCaptureController } from "@/utils/audio-recorder";
import { generateStructuredMeetingAnalysis, type MeetingAnalysisResult } from "@/lib/meeting-analyzer";

interface MeetingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meeting?: Meeting | null;
  defaultSlotDateTime?: string;
  defaultClientId?: string;
  defaultAssigneeId?: string;
  onSuccess?: () => void;
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
  defaultAssigneeId,
  onSuccess,
}: MeetingDialogProps) {
  const qc = useQueryClient();
  const { profiles, currentUser } = useUserContext();
  const listClientsFn = useServerFn(listClients);
  const upsertMeetingFn = useServerFn(upsertMeeting);
  const deleteMeetingFn = useServerFn(deleteMeeting);
  const createDemandFn = useServerFn(createDemand);

  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: () => listClientsFn(),
    staleTime: 5 * 60 * 1000,
  });

  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState<string>("none");
  const [assigneeUserId, setAssigneeUserId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [estimatedHours, setEstimatedHours] = useState(1.0);
  const [notes, setNotes] = useState("");
  const [aiSummary, setAiSummary] = useState("");
  const [rawTranscript, setRawTranscript] = useState("");
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("transcription");

  // Audio recording & capture states
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [captureTabAudio, setCaptureTabAudio] = useState(true);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [micAudioLevel, setMicAudioLevel] = useState(0);
  const [tabAudioLevel, setTabAudioLevel] = useState(0);
  const [hasTabAudioDetected, setHasTabAudioDetected] = useState(false);

  // Suggestions state
  const [suggestions, setSuggestions] = useState<MeetingAnalysisResult["suggestions"]>([]);
  const [expandedSugIndex, setExpandedSugIndex] = useState<number | null>(0);
  const [approvingIndices, setApprovingIndices] = useState<number[]>([]);

  const recorderControllerRef = useRef<MeetingAudioCaptureController | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (open) {
      if (meeting) {
        setTitle(meeting.title || "");
        setClientId(meeting.client_id || "none");
        setAssigneeUserId(meeting.assignee_user_id || meeting.created_by_user_id || currentUser?.id || "");
        setDueDate(toLocalDateTime(meeting.due_date));
        setEstimatedHours(meeting.estimated_hours || 1.0);
        setNotes(meeting.notes || "");
        setAiSummary(meeting.ai_summary || "");
        setRawTranscript(meeting.transcript || "");
      } else {
        const nowIso = defaultSlotDateTime?.slice(0, 16) || toLocalDateTime();
        setTitle("");
        setClientId(defaultClientId || "none");
        setAssigneeUserId(defaultAssigneeId || currentUser?.id || "");
        setDueDate(nowIso);
        setEstimatedHours(1.0);
        setNotes("");
        setAiSummary("");
        setRawTranscript("");
      }
      setIsRecording(false);
      setRecordingSeconds(0);
      setSuggestions([]);
      setActiveTab(meeting?.transcript ? "transcription" : "notes");
    } else {
      if (recorderControllerRef.current) {
        recorderControllerRef.current.cleanup();
        recorderControllerRef.current = null;
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [open, meeting, defaultSlotDateTime, defaultClientId, defaultAssigneeId, currentUser?.id]);

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
      setRecordingSeconds(0);
      const controller = await createMeetingAudioRecorder({
        captureTabAudio,
        onMicLevel: setMicAudioLevel,
        onTabLevel: setTabAudioLevel,
        onLog: (type, msg) => {
          if (type === "warning") toast.warning(msg);
          if (type === "error") toast.error(msg);
        },
      });

      recorderControllerRef.current = controller;
      setHasTabAudioDetected(controller.hasTabAudio);
      controller.start();
      setIsRecording(true);
      toast.success(
        controller.hasTabAudio
          ? "Gravação iniciada: capturando seu microfone e a janela/guia da reunião!"
          : "Gravação iniciada com seu microfone."
      );
    } catch (err: any) {
      toast.error("Erro ao iniciar gravação: " + (err.message || err));
    }
  };

  const handleStopRecording = async () => {
    if (!recorderControllerRef.current || !isRecording) return;
    setIsRecording(false);
    setIsTranscribing(true);
    toast.info("Processando e transcrevendo áudio localmente (100% gratuito)...", { id: "transcribing-toast" });

    try {
      const { blob } = await recorderControllerRef.current.stop();
      recorderControllerRef.current = null;

      const { transcribeAudio } = await import("@/lib/local-whisper");
      const text = await transcribeAudio(blob, (progress) => {
        toast.info(progress, { id: "transcribing-toast" });
      });

      toast.dismiss("transcribing-toast");

      if (text.trim()) {
        const fullTranscript = rawTranscript ? `${rawTranscript}\n\n${text}` : text;
        setRawTranscript(fullTranscript);

        // Pre-generate structured summary locally
        const selectedClient = clients.find((c: any) => c.id === clientId);
        const analysis = generateStructuredMeetingAnalysis(fullTranscript, {
          title: title.trim() || "Reunião de Alinhamento",
          clientName: selectedClient?.name || "Cliente",
          userName: currentUser?.name || "Equipe",
        });
        setAiSummary(analysis.summary_markdown);

        toast.success("Áudio transcrito e ata gerada com sucesso!");
        setActiveTab("transcription");
      } else {
        toast.warning("Nenhuma fala compreensível identificada no áudio gravado.");
      }
    } catch (err: any) {
      toast.dismiss("transcribing-toast");
      toast.error("Erro na transcrição: " + (err.message || "Tente novamente."));
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleGenerateSummary = () => {
    if (!rawTranscript.trim()) {
      toast.warning("Grave ou adicione uma transcrição antes de gerar o resumo.");
      return;
    }
    const selectedClient = clients.find((c: any) => c.id === clientId);
    const analysis = generateStructuredMeetingAnalysis(rawTranscript, {
      title: title.trim() || "Reunião de Alinhamento",
      clientName: selectedClient?.name || "Cliente",
      userName: currentUser?.name || "Equipe",
    });
    setAiSummary(analysis.summary_markdown);
    toast.success("Resumo rico estruturado com sucesso!");
    setActiveTab("summary");
  };

  const handleAnalyzeAndSuggestDemands = () => {
    if (!rawTranscript.trim()) {
      toast.warning("Grave ou adicione uma transcrição antes de sugerir demandas.");
      return;
    }
    setIsAnalyzing(true);
    try {
      const selectedClient = clients.find((c: any) => c.id === clientId);
      const analysis = generateStructuredMeetingAnalysis(rawTranscript, {
        title: title.trim() || "Reunião de Alinhamento",
        clientName: selectedClient?.name || "Cliente",
        userName: currentUser?.name || "Equipe",
      });

      setSuggestions(analysis.suggestions);
      if (analysis.suggestions.length > 0) {
        setExpandedSugIndex(0);
        toast.success(`${analysis.suggestions.length} sugestões de demandas extraídas da reunião!`);
      } else {
        toast.info("Nenhuma demanda imediata detectada na transcrição.");
      }
      setActiveTab("suggestions");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleApproveSuggestion = async (index: number) => {
    const sug = suggestions[index];
    if (!sug) return;
    if (clientId === "none") {
      toast.error("Vincule um cliente à reunião antes de criar a demanda.");
      return;
    }

    setApprovingIndices((prev) => [...prev, index]);
    try {
      await createDemandFn({
        data: {
          client_id: clientId,
          title: sug.suggested_title,
          description: sug.suggested_description,
          status: "rascunho",
          priority: "medium",
          estimated_hours: sug.estimated_hours || 2.0,
          assignee_user_id: assigneeUserId || currentUser?.id || null,
        },
      });

      toast.success(`Demanda "${sug.suggested_title}" criada com sucesso!`);
      qc.invalidateQueries({ queryKey: ["demands"] });
      // Remove approved suggestion from list
      setSuggestions((prev) => prev.filter((_, i) => i !== index));
    } catch (err: any) {
      toast.error("Erro ao criar demanda: " + (err.message || err));
    } finally {
      setApprovingIndices((prev) => prev.filter((i) => i !== index));
    }
  };

  const handleCopyTranscript = () => {
    if (!rawTranscript) return;
    navigator.clipboard.writeText(rawTranscript);
    toast.success("Transcrição copiada para a área de transferência!");
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
          assignee_user_id: assigneeUserId || currentUser?.id || null,
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
      <DialogContent className="sm:max-w-[840px] max-h-[92vh] p-0 bg-[#18181b] border border-zinc-800 text-foreground rounded-2xl shadow-2xl overflow-hidden flex flex-col">
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

            {/* Assignee */}
            <div className="flex items-center gap-1.5">
              <Label className="text-[11px] font-semibold text-zinc-400">Responsável:</Label>
              <Select value={assigneeUserId} onValueChange={setAssigneeUserId}>
                <SelectTrigger className="h-7 min-w-[130px] border-zinc-700 bg-zinc-900 text-xs text-zinc-200">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent className="border-zinc-800 bg-zinc-900 text-zinc-200">
                  {profiles.map((profile: any) => (
                    <SelectItem key={profile.id} value={profile.id}>
                      {profile.name || profile.email}
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
                onClick={(e) => {
                  try {
                    e.currentTarget.showPicker?.();
                  } catch {}
                }}
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

        {/* 4 Tabs: 1) Transcrição Completa, 2) Resumo Rico, 3) Sugestões de Demandas, 4) Anotações Manuais */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <div className="px-4 pt-2 border-b border-zinc-800/80 bg-zinc-900/40 shrink-0">
            <TabsList className="bg-zinc-900 border border-zinc-800 p-1 rounded-xl h-auto gap-1">
              <TabsTrigger value="transcription" className="text-xs font-semibold gap-1.5 cursor-pointer">
                <FileText className="h-3.5 w-3.5 text-blue-400" /> Transcrição Completa
              </TabsTrigger>
              <TabsTrigger value="summary" className="text-xs font-semibold gap-1.5 cursor-pointer">
                <Sparkles className="h-3.5 w-3.5 text-purple-400" /> Resumo Rico
              </TabsTrigger>
              <TabsTrigger value="suggestions" className="text-xs font-semibold gap-1.5 cursor-pointer">
                <ListTodo className="h-3.5 w-3.5 text-emerald-400" /> Sugestões de Demandas
                {suggestions.length > 0 && (
                  <Badge variant="outline" className="ml-1 text-[10px] py-0 px-1 border-emerald-500/30 text-emerald-300">
                    {suggestions.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="notes" className="text-xs font-semibold gap-1.5 cursor-pointer">
                <Video className="h-3.5 w-3.5 text-zinc-400" /> Anotações Manuais
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto p-4 min-h-0">
            {/* ── TAB 1: TRANSCRIÇÃO COMPLETA ── */}
            <TabsContent value="transcription" className="m-0 space-y-4">
              {/* Dual Audio Recording Box */}
              <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/60 space-y-3">
                <div className="flex items-center justify-between gap-3">
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
                        {isRecording ? `Gravando Reunião (${formatTimer(recordingSeconds)})` : "Gravação de Reunião & Transcrição Gratuita"}
                      </p>
                      <p className="text-[11px] text-zinc-400">
                        {isRecording
                          ? "Capturando fala de ambas as partes. Clique em encerrar quando terminar."
                          : "Transcreve sua voz e o áudio da reunião localmente, 100% gratuito e sem custos."}
                      </p>
                    </div>
                  </div>

                  {isRecording ? (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={handleStopRecording}
                      className="gap-1.5 text-xs font-bold shadow-lg shadow-red-600/20"
                    >
                      <Square className="h-3.5 w-3.5 fill-white" /> Encerrar e Transcrever
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={handleStartRecording}
                      disabled={isTranscribing || isAnalyzing}
                      className="gap-1.5 text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white shadow-lg shadow-purple-600/20"
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

                {/* Tab Audio Option & Helpful Tip */}
                {!isRecording && (
                  <div className="pt-2 border-t border-zinc-800/60 space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="chk-meeting-tab"
                        checked={captureTabAudio}
                        onChange={(e) => setCaptureTabAudio(e.target.checked)}
                        className="rounded border-zinc-700 cursor-pointer"
                      />
                      <label htmlFor="chk-meeting-tab" className="text-xs text-zinc-300 font-medium cursor-pointer select-none">
                        Capturar áudio da reunião (Google Meet, Zoom, Teams ou aba do Chrome)
                      </label>
                    </div>
                    {captureTabAudio && (
                      <div className="flex items-start gap-1.5 text-[11px] text-purple-300/90 bg-purple-950/20 border border-purple-500/20 rounded-lg p-2.5 leading-relaxed">
                        <Info className="h-4 w-4 shrink-0 text-purple-400 mt-0.5" />
                        <span>
                          <strong>Dica Importante:</strong> Na tela de compartilhamento que o Chrome abrir, selecione a aba da reunião em <strong>"Guia do Chrome"</strong> e confirme que a caixa <strong>"Compartilhar áudio da guia"</strong> está marcada.
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Audio Visualizers during recording */}
                {isRecording && (
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-zinc-800">
                    {/* Mic Visualizer */}
                    <div className="rounded-lg bg-black/40 border border-purple-500/20 p-2.5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Mic className="h-4 w-4 text-purple-400" />
                        <span className="text-[11px] font-semibold text-purple-300">Meu Microfone</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div
                          className="h-2 rounded-full bg-purple-500 transition-all duration-75"
                          style={{ width: `${Math.max(8, micAudioLevel)}px` }}
                        />
                        <span className="text-[10px] text-zinc-500 font-mono">{micAudioLevel}%</span>
                      </div>
                    </div>

                    {/* Tab Audio Visualizer */}
                    <div className="rounded-lg bg-black/40 border border-emerald-500/20 p-2.5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Volume2 className="h-4 w-4 text-emerald-400" />
                        <span className="text-[11px] font-semibold text-emerald-300">Áudio da Reunião</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div
                          className="h-2 rounded-full bg-emerald-500 transition-all duration-75"
                          style={{ width: `${Math.max(8, tabAudioLevel)}px` }}
                        />
                        <span className="text-[10px] text-zinc-500 font-mono">{tabAudioLevel}%</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Full Verbatim Transcript Content */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5 text-blue-400" /> Texto Transcrito da Reunião:
                  </Label>
                  {rawTranscript && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCopyTranscript}
                      className="h-7 text-xs text-zinc-400 hover:text-zinc-200 gap-1.5"
                    >
                      <Copy className="h-3 w-3" /> Copiar Texto
                    </Button>
                  )}
                </div>

                <textarea
                  value={rawTranscript}
                  onChange={(e) => setRawTranscript(e.target.value)}
                  placeholder="A transcrição das falas da reunião aparecerá aqui após o término da gravação. Você também pode colar o texto aqui..."
                  className="w-full min-h-[220px] rounded-xl bg-zinc-950/60 border border-zinc-800 p-3.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-purple-500 leading-relaxed font-sans"
                />
              </div>

              {/* Action Bar at bottom of transcription */}
              {rawTranscript && (
                <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-zinc-800 bg-zinc-900/40">
                  <span className="text-[11px] text-zinc-400">
                    Deseja gerar a ata estruturada ou extrair demandas?
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleGenerateSummary}
                      className="text-xs border-zinc-700 gap-1.5"
                    >
                      <Sparkles className="h-3.5 w-3.5 text-purple-400" /> Gerar Resumo Rico
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleAnalyzeAndSuggestDemands}
                      className="text-xs bg-purple-600 hover:bg-purple-700 text-white gap-1.5"
                    >
                      <ListTodo className="h-3.5 w-3.5" /> Analisar & Sugerir Demandas
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>

            {/* ── TAB 2: RESUMO RICO (ATA DA REUNIÃO) ── */}
            <TabsContent value="summary" className="m-0 space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
                <div>
                  <h3 className="text-xs font-bold text-purple-300 flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4 text-purple-400" /> Ata & Resumo Rico da Reunião
                  </h3>
                  <p className="text-[11px] text-zinc-400">
                    Organização automática de tópicos, pendências do cliente e tarefas da equipe.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleGenerateSummary}
                  disabled={!rawTranscript.trim()}
                  className="h-7 text-xs border-purple-500/30 bg-purple-500/10 text-purple-300 hover:bg-purple-500/20 gap-1.5"
                >
                  <Sparkles className="h-3.5 w-3.5" /> Atualizar Resumo
                </Button>
              </div>

              {aiSummary ? (
                <div className="p-4 rounded-xl border border-purple-500/20 bg-purple-950/10">
                  <div className="text-xs text-zinc-200 leading-relaxed max-w-none">
                    <MarkdownView content={aiSummary} />
                  </div>
                </div>
              ) : (
                <div className="p-10 text-center rounded-xl border border-zinc-800 bg-zinc-900/40 text-xs text-zinc-500 space-y-2">
                  <Sparkles className="h-6 w-6 text-zinc-600 mx-auto" />
                  <p>Nenhum resumo gerado ainda.</p>
                  <p className="text-[11px]">Grave uma reunião ou cole a transcrição na primeira aba e clique em "Gerar Resumo Rico".</p>
                </div>
              )}
            </TabsContent>

            {/* ── TAB 3: SUGESTÕES DE DEMANDAS (SOB COMANDO DO USUÁRIO) ── */}
            <TabsContent value="suggestions" className="m-0 space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
                <div>
                  <h3 className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                    <ListTodo className="h-4 w-4 text-emerald-400" /> Sugestões de Demandas com Briefing
                  </h3>
                  <p className="text-[11px] text-zinc-400">
                    O sistema analisa a transcrição e sugere tarefas acionáveis apenas quando solicitado por você.
                  </p>
                </div>

                <Button
                  size="sm"
                  onClick={handleAnalyzeAndSuggestDemands}
                  disabled={isAnalyzing || !rawTranscript.trim()}
                  className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 shadow-md shadow-emerald-600/20 font-bold"
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Analisando...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3.5 w-3.5" /> Analisar & Sugerir Demandas
                    </>
                  )}
                </Button>
              </div>

              {suggestions.length === 0 ? (
                <div className="p-10 text-center rounded-xl border border-zinc-800 bg-zinc-900/40 text-xs text-zinc-500 space-y-2">
                  <ListTodo className="h-6 w-6 text-zinc-600 mx-auto" />
                  <p className="font-semibold text-zinc-400">Nenhuma sugestão gerada ainda.</p>
                  <p className="text-[11px] max-w-sm mx-auto">
                    Para que o sistema analise a reunião e gere briefings prontos para criação de tarefas, clique no botão verde acima.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {suggestions.map((sug, idx) => {
                    const isExpanded = expandedSugIndex === idx;
                    const isApproving = approvingIndices.includes(idx);

                    return (
                      <div
                        key={idx}
                        className="rounded-xl border border-zinc-800 bg-zinc-900/60 overflow-hidden transition-all"
                      >
                        {/* Card Header */}
                        <div
                          onClick={() => setExpandedSugIndex(isExpanded ? null : idx)}
                          className="p-3.5 flex items-center justify-between cursor-pointer select-none hover:bg-zinc-800/40"
                        >
                          <div className="flex items-center gap-2.5">
                            <Badge className="bg-emerald-500/10 text-emerald-300 border-emerald-500/30 text-[10px]">
                              Nova Demanda
                            </Badge>
                            <span className="text-xs font-bold text-zinc-200">{sug.suggested_title}</span>
                          </div>

                          <div className="flex items-center gap-3">
                            <span className="text-[11px] text-zinc-400 font-mono flex items-center gap-1">
                              <Clock className="h-3 w-3 text-purple-400" /> ~{sug.estimated_hours || 2}h
                            </span>
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4 text-zinc-400" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-zinc-400" />
                            )}
                          </div>
                        </div>

                        {/* Expanded Briefing Details */}
                        {isExpanded && (
                          <div className="p-3.5 border-t border-zinc-800 bg-zinc-950/40 space-y-3">
                            <div className="text-xs text-zinc-300 leading-relaxed font-sans">
                              <MarkdownView content={sug.suggested_description} />
                            </div>

                            <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between">
                              <span className="text-[11px] text-zinc-500 italic">
                                Será criada como rascunho vinculada ao cliente selecionado.
                              </span>
                              <Button
                                size="sm"
                                onClick={() => handleApproveSuggestion(idx)}
                                disabled={isApproving}
                                className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-1.5"
                              >
                                {isApproving ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                )}
                                Aprovar & Criar Demanda
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* ── TAB 4: ANOTAÇÕES MANUAIS ── */}
            <TabsContent value="notes" className="m-0 h-full flex flex-col">
              <RichEditor
                content={notes}
                onChange={setNotes}
                placeholder="Faça anotações em tempo real durante a reunião..."
              />
            </TabsContent>
          </div>
        </Tabs>

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
