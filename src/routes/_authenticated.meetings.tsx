import { createFileRoute } from "@tanstack/react-router";
import { Video } from "lucide-react";
import { ClientMeetingsPanel } from "@/components/client-meetings-panel";

export const Route = createFileRoute("/_authenticated/meetings")({
  component: MeetingsPage,
});

function MeetingsPage() {
  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 p-6">
      <div className="flex items-center gap-3 border-b border-border/40 pb-4">
        <div className="rounded-xl border border-purple-500/30 bg-purple-500/20 p-2.5 text-purple-400">
          <Video className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reuniões</h1>
          <p className="text-xs text-muted-foreground">Reuniões de clientes e reuniões avulsas em um só lugar.</p>
        </div>
      </div>
      <ClientMeetingsPanel />
    </div>
  );
}
