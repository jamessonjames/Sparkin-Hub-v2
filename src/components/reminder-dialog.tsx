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
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(initialData?.title || "");
      setContent(initialData?.content || "");
      setColor(initialData?.color || "yellow");
      setRecurrenceType(initialData?.recurrence_type || "none");
      setRecurrenceInterval(initialData?.recurrence_interval || 1);

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
    try {
      await onSave({
        id: initialData?.id,
        title: title.trim(),
        content,
        color,
        date_time: new Date(dateTime).toISOString(),
        recurrence_type: recurrenceType,
        recurrence_interval: recurrenceInterval,
        is_completed: initialData?.is_completed || false,
      });
      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(
        "sm:max-w-[440px] p-0 overflow-hidden border shadow-2xl rounded-2xl bg-[#1e1e1e] text-foreground transition-all duration-200",
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
              <PopoverContent align="end" className="w-64 p-3 bg-[#262626] border border-white/10 text-foreground rounded-xl shadow-xl space-y-3">
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

                <div className="border-t border-white/10 pt-2 space-y-1.5">
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
                </div>

                <div className="border-t border-white/10 pt-2 space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Data e Horário</Label>
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
                  onClick={() => onDelete(initialData.id!)}
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
                  onClick={() => onComplete(initialData.id!)}
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
  );
}
