import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogTitle, DialogHeader } from "@/components/ui/dialog";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoreHorizontal, X, Trash2, CheckCircle2, Calendar, Repeat } from "lucide-react";
import { RichEditor } from "@/components/rich-editor";
import { cn } from "@/lib/utils";
import { REMINDER_COLORS, RECURRENCE_TYPES } from "@/lib/reminders.functions";

export interface ReminderData {
  id?: string;
  title: string;
  content: string;
  color: "yellow" | "blue" | "green" | "purple" | "gray";
  date_time: string;
  recurrence_type: "none" | "daily" | "weekly" | "monthly" | "yearly";
  recurrence_interval: number;
  recurrence_end_date?: string | null;
  is_completed?: boolean;
}

const COLOR_HEADER: Record<string, string> = {
  yellow: "bg-[#d4a017] text-amber-950",
  blue:   "bg-[#2383e2] text-white",
  green:  "bg-[#0f9d58] text-white",
  purple: "bg-[#ab47bc] text-white",
  gray:   "bg-[#383838] text-white",
};

const COLOR_BORDER: Record<string, string> = {
  yellow: "border-[#d4a017]/40",
  blue:   "border-[#2383e2]/40",
  green:  "border-[#0f9d58]/40",
  purple: "border-[#ab47bc]/40",
  gray:   "border-[#383838]/40",
};

const COLOR_DOT: Record<string, string> = {
  yellow: "bg-[#d4a017]",
  blue:   "bg-[#2383e2]",
  green:  "bg-[#0f9d58]",
  purple: "bg-[#ab47bc]",
  gray:   "bg-[#383838]",
};

const RECURRENCE_LABELS: Record<string, string> = {
  none: "Única (Não repete)",
  daily: "Diária",
  weekly: "Semanal",
  monthly: "Mensal",
  yearly: "Anual",
};

interface ReminderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData?: Partial<ReminderData> | null;
  onSave: (reminder: ReminderData) => Promise<void> | void;
  onDelete?: (id: string) => Promise<void> | void;
  onComplete?: (id: string) => Promise<void> | void;
}

export function ReminderDialog({
  open,
  onOpenChange,
  initialData,
  onSave,
  onDelete,
  onComplete,
}: ReminderDialogProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [color, setColor] = useState<ReminderData["color"]>("yellow");
  const [dateTime, setDateTime] = useState("");
  const [recurrenceType, setRecurrenceType] = useState<ReminderData["recurrence_type"]>("none");
  const [recurrenceInterval, setRecurrenceInterval] = useState(1);
  const [endMode, setEndMode] = useState<"never" | "count" | "date">("never");
  const [repeatCount, setRepeatCount] = useState(5);
  const [endDateStr, setEndDateStr] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(initialData?.title || "");
      setContent(initialData?.content || "");
      setColor(initialData?.color || "yellow");
      setRecurrenceType(initialData?.recurrence_type || "none");
      setRecurrenceInterval(initialData?.recurrence_interval || 1);

      if (initialData?.recurrence_end_date) {
        setEndMode("date");
        const dtEnd = new Date(initialData.recurrence_end_date);
        const y = dtEnd.getFullYear();
        const m = String(dtEnd.getMonth() + 1).padStart(2, "0");
        const d = String(dtEnd.getDate()).padStart(2, "0");
        setEndDateStr(`${y}-${m}-${d}`);
      } else {
        setEndMode("never");
        setEndDateStr("");
      }

      if (initialData?.date_time) {
        // Format ISO for datetime-local input
        const dt = new Date(initialData.date_time);
        const y = dt.getFullYear();
        const m = String(dt.getMonth() + 1).padStart(2, "0");
        const d = String(dt.getDate()).padStart(2, "0");
        const hh = String(dt.getHours()).padStart(2, "0");
        const mm = String(dt.getMinutes()).padStart(2, "0");
        setDateTime(`${y}-${m}-${d}T${hh}:${mm}`);
      } else {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, "0");
        const d = String(now.getDate()).padStart(2, "0");
        const hh = String(now.getHours()).padStart(2, "0");
        const mm = String(now.getMinutes()).padStart(2, "0");
        setDateTime(`${y}-${m}-${d}T${hh}:${mm}`);
      }
    }
  }, [open, initialData]);

  async function handleSave() {
    if (!title.trim()) return;
    setIsSaving(true);

    let finalEndDate: string | null = null;
    if (recurrenceType !== "none") {
      if (endMode === "date" && endDateStr) {
        finalEndDate = new Date(`${endDateStr}T23:59:59`).toISOString();
      } else if (endMode === "count" && repeatCount > 0) {
        const dt = new Date(dateTime);
        const times = Math.max(1, repeatCount - 1);
        const interval = recurrenceInterval || 1;
        if (recurrenceType === "daily") {
          dt.setDate(dt.getDate() + times * interval);
        } else if (recurrenceType === "weekly") {
          dt.setDate(dt.getDate() + 7 * times * interval);
        } else if (recurrenceType === "monthly") {
          dt.setMonth(dt.getMonth() + times * interval);
        } else if (recurrenceType === "yearly") {
          dt.setFullYear(dt.getFullYear() + times * interval);
        }
        dt.setHours(23, 59, 59, 999);
        finalEndDate = dt.toISOString();
      }
    }

    try {
      await onSave({
        id: initialData?.id,
        title: title.trim(),
        content,
        color,
        date_time: new Date(dateTime).toISOString(),
        recurrence_type: recurrenceType,
        recurrence_interval: recurrenceInterval,
        recurrence_end_date: finalEndDate,
        is_completed: initialData?.is_completed || false,
      });
      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  }

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleConfirmDeleteSingle() {
    if (!initialData?.id) return;
    setIsDeleting(true);
    try {
      if (recurrenceType !== "none") {
        const dt = new Date(dateTime);
        const interval = recurrenceInterval || 1;
        if (recurrenceType === "daily") {
          dt.setDate(dt.getDate() + interval);
        } else if (recurrenceType === "weekly") {
          dt.setDate(dt.getDate() + 7 * interval);
        } else if (recurrenceType === "monthly") {
          dt.setMonth(dt.getMonth() + interval);
        } else if (recurrenceType === "yearly") {
          dt.setFullYear(dt.getFullYear() + interval);
        }

        await onSave({
          id: initialData.id,
          title: title.trim(),
          content,
          color,
          date_time: dt.toISOString(),
          recurrence_type: recurrenceType,
          recurrence_interval: recurrenceInterval,
          recurrence_end_date: initialData.recurrence_end_date,
          is_completed: false,
        });
      } else {
        if (onDelete) await onDelete(initialData.id);
      }
      setDeleteConfirmOpen(false);
      onOpenChange(false);
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleConfirmDeleteSeries() {
    if (!initialData?.id || !onDelete) return;
    setIsDeleting(true);
    try {
      await onDelete(initialData.id);
      setDeleteConfirmOpen(false);
      onOpenChange(false);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className={cn(
          "sm:max-w-[440px] p-0 overflow-hidden border shadow-2xl rounded-2xl bg-[#1e1e1e] text-foreground transition-all duration-200 [&>button:last-child]:hidden",
          COLOR_BORDER[color]
        )}>
          <DialogHeader className="sr-only">
            <DialogTitle>Lembrete</DialogTitle>
          </DialogHeader>

          {/* Windows Sticky Notes Banner Header */}
          <div className={cn(
            "h-10 px-3 flex items-center justify-between font-medium select-none shadow-sm transition-colors",
            COLOR_HEADER[color]
          )}>
            <div className="flex items-center gap-2 text-xs font-semibold tracking-wide">
              <span className="h-2 w-2 rounded-full bg-white/70 animate-pulse" />
              <span>LEMBRETE</span>
            </div>

            <div className="flex items-center gap-1">
              {/* Popover Settings (...) */}
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="h-7 w-7 rounded-md hover:bg-black/20 flex items-center justify-center transition-colors cursor-pointer"
                    title="Configurações e Recorrência"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-72 p-3 bg-[#262626] border border-white/10 text-foreground rounded-xl shadow-xl space-y-3 z-50">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Cor do Post-it</Label>
                    <div className="flex items-center gap-2 pt-1">
                      {REMINDER_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setColor(c)}
                          className={cn(
                            "h-6 w-6 rounded-full transition-all cursor-pointer border border-white/20",
                            COLOR_DOT[c],
                            color === c && "ring-2 ring-white scale-110 shadow-md"
                          )}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="border-t border-white/10 pt-2 space-y-2">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recorrência</Label>
                    <select
                      value={recurrenceType}
                      onChange={(e) => setRecurrenceType(e.target.value as any)}
                      className="w-full bg-[#1e1e1e] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      {RECURRENCE_TYPES.map((rt) => (
                        <option key={rt} value={rt}>
                          {RECURRENCE_LABELS[rt]}
                        </option>
                      ))}
                    </select>

                    {recurrenceType !== "none" && (
                      <div className="space-y-2 pt-2 border-t border-white/5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] text-muted-foreground font-medium">Repetir a cada:</span>
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min={1}
                              max={365}
                              value={recurrenceInterval}
                              onChange={(e) => setRecurrenceInterval(Math.max(1, parseInt(e.target.value) || 1))}
                              className="w-14 bg-[#1e1e1e] border border-white/10 rounded px-2 py-1 text-xs text-center text-foreground"
                            />
                            <span className="text-[11px] text-muted-foreground">
                              {recurrenceType === "daily" ? "dia(s)" : recurrenceType === "weekly" ? "semana(s)" : recurrenceType === "monthly" ? "mês(es)" : "ano(s)"}
                            </span>
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <span className="text-[11px] text-muted-foreground font-medium">Término da Repetição:</span>
                          <select
                            value={endMode}
                            onChange={(e) => setEndMode(e.target.value as any)}
                            className="w-full bg-[#1e1e1e] border border-white/10 rounded-lg px-2.5 py-1 text-xs text-foreground"
                          >
                            <option value="never">Sem término (Sempre repete)</option>
                            <option value="count">Repetir por X dias / vezes</option>
                            <option value="date">Até uma data específica</option>
                          </select>

                          {endMode === "count" && (
                            <div className="flex items-center justify-between gap-2 pt-1">
                              <span className="text-[11px] text-muted-foreground">Repetir por:</span>
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  min={1}
                                  max={365}
                                  value={repeatCount}
                                  onChange={(e) => setRepeatCount(Math.max(1, parseInt(e.target.value) || 1))}
                                  className="w-16 bg-[#1e1e1e] border border-white/10 rounded px-2 py-1 text-xs text-center text-foreground"
                                />
                                <span className="text-[11px] text-muted-foreground">
                                  {recurrenceType === "daily" ? "dias" : recurrenceType === "weekly" ? "semanas" : recurrenceType === "monthly" ? "meses" : "anos"}
                                </span>
                              </div>
                            </div>
                          )}

                          {endMode === "date" && (
                            <div className="pt-1">
                              <Input
                                type="date"
                                value={endDateStr}
                                onChange={(e) => setEndDateStr(e.target.value)}
                                className="bg-[#1e1e1e] border-white/10 text-xs h-8"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-white/10 pt-2 space-y-1.5">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Data e Horário Inicial</Label>
                    <Input
                      type="datetime-local"
                      value={dateTime}
                      onChange={(e) => setDateTime(e.target.value)}
                      className="bg-[#1e1e1e] border-white/10 text-xs h-8"
                    />
                  </div>
                </PopoverContent>
              </Popover>

              {/* Close Button */}
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="h-7 w-7 rounded-md hover:bg-black/20 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Post-it Body */}
          <div className="p-4 space-y-3 bg-[#1e1e1e]">
            <input
              type="text"
              placeholder="Título do lembrete..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-transparent text-base font-bold text-foreground placeholder:text-muted-foreground/50 outline-none border-b border-white/10 pb-2"
              autoFocus
            />

            <div className="min-h-[140px] border border-white/5 rounded-xl bg-[#242424] p-1">
              <RichEditor
                content={content}
                onChange={setContent}
                placeholder="Digite suas anotações ou checklist..."
                borderless
              />
            </div>

            {/* Footer controls */}
            <div className="flex items-center justify-between pt-2 border-t border-white/10">
              <div className="flex items-center gap-1.5">
                {initialData?.id && onDelete && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteConfirmOpen(true)}
                    className="h-8 w-8 text-destructive hover:bg-destructive/10 cursor-pointer"
                    title="Excluir Lembrete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
                {initialData?.id && onComplete && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      await onComplete(initialData.id!);
                      onOpenChange(false);
                    }}
                    className="h-8 px-2.5 text-xs gap-1.5 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 cursor-pointer"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Concluir</span>
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onOpenChange(false)}
                  className="h-8 text-xs cursor-pointer"
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={!title.trim() || isSaving}
                  onClick={handleSave}
                  className="h-8 px-4 text-xs font-semibold bg-primary hover:bg-primary/90 cursor-pointer shadow-md"
                >
                  {isSaving ? "Salvando..." : "Salvar Lembrete"}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="sm:max-w-[400px] p-5 bg-[#202020] border border-white/10 text-foreground rounded-2xl shadow-2xl space-y-4 [&>button:last-child]:hidden z-[60]">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold text-foreground flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-destructive" />
              <span>{recurrenceType !== "none" ? "Excluir Lembrete Recorrente" : "Excluir Lembrete"}</span>
            </DialogTitle>
            <p className="text-xs text-muted-foreground pt-1 leading-relaxed">
              {recurrenceType !== "none" ? (
                <>O lembrete <strong className="text-foreground">“{title}”</strong> possui repetição. Como deseja realizar a exclusão?</>
              ) : (
                <>Tem certeza que deseja excluir o lembrete <strong className="text-foreground">“{title}”</strong>? Esta ação não pode ser desfeita.</>
              )}
            </p>
          </DialogHeader>

          {recurrenceType !== "none" ? (
            <div className="grid grid-cols-1 gap-2 pt-1">
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDeleteSingle}
                className="flex flex-col p-3 rounded-xl border border-white/10 bg-[#262626] hover:bg-[#2e2e2e] hover:border-amber-400/40 transition-all text-left cursor-pointer group"
              >
                <span className="text-xs font-bold text-foreground group-hover:text-amber-400 transition-colors">Excluir apenas este lembrete</span>
                <span className="text-[11px] text-muted-foreground">Remove o lembrete desta data. As repetições futuras continuarão normalmente.</span>
              </button>

              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDeleteSeries}
                className="flex flex-col p-3 rounded-xl border border-white/10 bg-[#262626] hover:bg-[#2e2e2e] hover:border-destructive/40 transition-all text-left cursor-pointer group"
              >
                <span className="text-xs font-bold text-destructive">Excluir todas as repetições futuras</span>
                <span className="text-[11px] text-muted-foreground">Remove permanentemente toda a série deste lembrete recorrente.</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setDeleteConfirmOpen(false)}
                className="h-8 text-xs cursor-pointer"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={isDeleting}
                onClick={handleConfirmDeleteSeries}
                className="h-8 px-4 text-xs font-semibold bg-destructive hover:bg-destructive/90 text-white cursor-pointer shadow-md"
              >
                {isDeleting ? "Excluindo..." : "Excluir Lembrete"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
