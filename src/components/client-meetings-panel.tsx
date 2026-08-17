import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMeetings, type Meeting } from "@/lib/meetings.functions";
import { MeetingDialog } from "./meeting-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Video, Plus, Search, LayoutGrid, List as ListIcon, Calendar, Clock,
  Sparkles, FileText, ChevronRight
} from "lucide-react";
import { cn } from "@/lib/utils";

function stripHtml(html?: string | null): string {
  if (!html) return "";
  if (typeof window === "undefined") return html.replace(/<[^>]+>/g, " ").trim();
  const div = document.createElement("div");
  div.innerHTML = html;
  return (div.textContent || "").replace(/\s+/g, " ").trim();
}

function formatDate(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function ClientMeetingsPanel({ clientId }: { clientId?: string }) {
  const qc = useQueryClient();
  const listMeetingsFn = useServerFn(listMeetings);

  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [meetingDialogOpen, setMeetingDialogOpen] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);

  const { data: meetings = [], isPending } = useQuery({
    queryKey: ["meetings", clientId],
    queryFn: () => listMeetingsFn({ data: clientId ? { clientId } : {} }),
    staleTime: 5 * 60 * 1000,
  });

  const filteredMeetings = useMemo(() => {
    if (!search.trim()) return meetings;
    const term = search.toLowerCase();
    return meetings.filter(
      (m) =>
        m.title.toLowerCase().includes(term) ||
        (m.notes && stripHtml(m.notes).toLowerCase().includes(term)) ||
        (m.ai_summary && stripHtml(m.ai_summary).toLowerCase().includes(term))
    );
  }, [meetings, search]);

  const handleOpenNew = () => {
    setSelectedMeeting(null);
    setMeetingDialogOpen(true);
  };

  const handleOpenEdit = (m: Meeting) => {
    setSelectedMeeting(m);
    setMeetingDialogOpen(true);
  };

  return (
    <div className="space-y-4 pb-8">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            type="text"
            placeholder="Buscar em reuniões..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-4 py-2 text-xs bg-zinc-900/60 border-zinc-800 text-foreground placeholder:text-muted-foreground rounded-xl"
          />
        </div>

        <div className="flex items-center gap-2">
          {/* View Mode Toggle */}
          <div className="flex items-center bg-zinc-900/80 p-0.5 rounded-xl border border-zinc-800">
            <button
              onClick={() => setViewMode("grid")}
              className={cn(
                "p-1.5 rounded-lg text-xs transition-all",
                viewMode === "grid" ? "bg-zinc-800 text-purple-400 font-bold" : "text-muted-foreground hover:text-foreground"
              )}
              title="Visualização em Grade"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={cn(
                "p-1.5 rounded-lg text-xs transition-all",
                viewMode === "list" ? "bg-zinc-800 text-purple-400 font-bold" : "text-muted-foreground hover:text-foreground"
              )}
              title="Visualização em Lista"
            >
              <ListIcon className="h-3.5 w-3.5" />
            </button>
          </div>

          <Button
            onClick={handleOpenNew}
            size="sm"
            className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold gap-1.5 rounded-xl shadow-sm"
          >
            <Plus className="h-3.5 w-3.5" /> Nova reunião
          </Button>
        </div>
      </div>

      {/* Content */}
      {isPending ? (
        <div className="py-12 text-center text-xs text-muted-foreground">Carregando reuniões...</div>
      ) : filteredMeetings.length === 0 ? (
        <div className="py-16 text-center border border-dashed border-zinc-800 rounded-2xl bg-zinc-900/20 space-y-3">
          <div className="h-10 w-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center mx-auto border border-purple-500/20">
            <Video className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-bold text-zinc-300">Nenhuma reunião encontrada</p>
            <p className="text-xs text-muted-foreground">
              {search ? "Tente buscar com outro termo." : "Agende reuniões diretamente aqui ou pela Agenda."}
            </p>
          </div>
          <Button
            size="sm"
            onClick={handleOpenNew}
            className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold gap-1.5 rounded-xl"
          >
            <Plus className="h-3.5 w-3.5" /> Agendar primeira reunião
          </Button>
        </div>
      ) : viewMode === "grid" ? (
        /* Grid View */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {filteredMeetings.map((m) => {
            const previewText = stripHtml(m.notes || m.ai_summary) || "Sem anotações registradas...";
            return (
              <div
                key={m.id}
                onClick={() => handleOpenEdit(m)}
                className="group p-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-900 hover:border-purple-500/40 transition-all cursor-pointer flex flex-col justify-between space-y-3 select-none shadow-sm"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-300 border border-purple-500/20 text-[10px] font-bold">
                      <Video className="h-3 w-3 text-purple-400" /> Reunião
                    </span>
                    <span className="text-[10px] text-zinc-400 font-semibold flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {m.estimated_hours}h
                    </span>
                  </div>

                  <h4 className="text-sm font-bold text-zinc-100 group-hover:text-purple-300 transition-colors line-clamp-1">
                    {m.title}
                  </h4>
                  {!clientId && <p className="text-[10px] font-semibold text-purple-300">{m.clients?.name || "Reunião avulsa"}</p>}

                  <p className="text-xs text-zinc-400 line-clamp-3 leading-relaxed">
                    {previewText}
                  </p>
                </div>

                <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between text-[11px] text-zinc-400">
                  <span className="flex items-center gap-1 font-medium">
                    <Calendar className="h-3 w-3" /> {formatDate(m.due_date)}
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 text-zinc-500 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* List View */
        <div className="space-y-2">
          {filteredMeetings.map((m) => (
            <div
              key={m.id}
              onClick={() => handleOpenEdit(m)}
              className="group p-3.5 rounded-xl border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-900 hover:border-purple-500/40 transition-all cursor-pointer flex items-center justify-between gap-3 select-none"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-9 w-9 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center shrink-0 border border-purple-500/20">
                  <Video className="h-4.5 w-4.5" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs font-bold text-zinc-100 group-hover:text-purple-300 transition-colors truncate">
                    {m.title}
                  </h4>
                  <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                    {stripHtml(m.notes || m.ai_summary) || "Sem anotações"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4 shrink-0 text-xs text-zinc-400">
                <span className="font-medium flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> {formatDate(m.due_date)}
                </span>
                <span className="font-semibold px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-[10px]">
                  {m.estimated_hours}h
                </span>
                <ChevronRight className="h-4 w-4 text-zinc-500 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Meeting Dialog */}
      <MeetingDialog
        open={meetingDialogOpen}
        onOpenChange={setMeetingDialogOpen}
        meeting={selectedMeeting}
        defaultClientId={clientId}
        onSuccess={() => qc.invalidateQueries({ queryKey: ["meetings", clientId] })}
      />
    </div>
  );
}
