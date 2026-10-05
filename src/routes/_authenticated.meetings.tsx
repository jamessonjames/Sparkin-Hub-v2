import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Video } from "lucide-react";
import { ClientMeetingsPanel } from "@/components/client-meetings-panel";
import { supabase } from "@/integrations/supabase/client";
import { useUserContext } from "@/contexts/user-context";

export const Route = createFileRoute("/_authenticated/meetings")({
  beforeLoad: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/auth" });
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();
    const role = roleData?.role || "collaborator";
    if (role !== "owner" && role !== "admin") {
      throw redirect({ to: "/" });
    }
  },
  component: MeetingsPage,
});

function MeetingsPage() {
  const { isAdminOrOwner, loading } = useUserContext();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !isAdminOrOwner) {
      navigate({ to: "/", replace: true });
    }
  }, [loading, isAdminOrOwner, navigate]);

  if (!isAdminOrOwner) {
    return null;
  }

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
