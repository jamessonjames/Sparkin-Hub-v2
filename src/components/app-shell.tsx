import type { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./app-sidebar";
import { BottomNav } from "./bottom-nav";
import { DemandOverlayProvider } from "@/contexts/demand-overlay";
import { DemandOverlayRenderer } from "@/components/demand-overlay-renderer";
import { ClientFormDialog } from "@/components/client-form-dialog";
import { UserProvider } from "@/contexts/user-context";
import { useNavigate, Link, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { LogOut, UserCircle, ChevronDown, Download, Eye, Star, Mic, Globe, UserX } from "lucide-react";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useUserContext } from "@/contexts/user-context";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useAutoScheduler } from "@/hooks/use-auto-scheduler";
import { MeetingTranscriptionDialog } from "@/components/meeting-transcription-dialog";
import { useQueryClient } from "@tanstack/react-query";

function AutoSchedulerGate() {
  useAutoScheduler();
  return null;
}

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

function HeaderUserWorkSelector() {
  const { currentUserRole, selectedUserId, setSelectedUserId, defaultUserId, setDefaultUserId, profiles, currentUser } = useUserContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isAgendaPage = pathname.startsWith("/agenda");
  const isAdminOrOwner = currentUserRole === "owner" || currentUserRole === "admin";

  useEffect(() => {
    if (isAgendaPage && (selectedUserId === "all" || selectedUserId === "unassigned")) {
      setSelectedUserId(defaultUserId || currentUser?.id || null);
    }
  }, [isAgendaPage, selectedUserId, defaultUserId, currentUser, setSelectedUserId]);

  if (!isAdminOrOwner || !currentUser?.id || profiles.length === 0) return null;

  const activeUserId = selectedUserId ?? currentUser.id;
  const isDefaultUser = defaultUserId ? defaultUserId === activeUserId : activeUserId === currentUser.id;
  const activeProfile = profiles.find((p) => p.id === activeUserId);

  return (
    <div className="flex items-center gap-1.5 bg-zinc-900/90 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs shadow-xs transition-colors mr-2">
      <div className="flex items-center gap-1 text-zinc-400 select-none">
        <Eye className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
        <span className="text-[11px] font-semibold tracking-tight text-zinc-400 hidden sm:inline uppercase">Visão:</span>
      </div>

      <Select
        value={selectedUserId || currentUser.id}
        onValueChange={(val) => setSelectedUserId(val)}
      >
        <SelectTrigger className="h-6 text-xs bg-transparent border-0 focus:ring-0 text-zinc-200 font-semibold py-0 px-1 hover:bg-zinc-800/50 rounded transition-colors w-auto min-w-[110px] shadow-none">
          <SelectValue placeholder="Selecione..." />
        </SelectTrigger>
        <SelectContent align="end" className="bg-zinc-950 border border-zinc-800 text-zinc-200 min-w-[200px]">
          <SelectItem
            value="all"
            disabled={isAgendaPage}
            className="text-xs font-semibold text-zinc-200 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <div className="flex items-center gap-2">
              <Globe className="h-3.5 w-3.5 text-zinc-400" />
              <span>Todos os Responsáveis</span>
            </div>
          </SelectItem>
          <SelectItem
            value="unassigned"
            disabled={isAgendaPage}
            className="text-xs font-semibold text-zinc-200 cursor-pointer border-b border-zinc-800/80 pb-1.5 mb-1.5 rounded-none disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <div className="flex items-center gap-2">
              <UserX className="h-3.5 w-3.5 text-zinc-400" />
              <span>Sem Responsável</span>
            </div>
          </SelectItem>
          <SelectItem value={currentUser.id} className="text-xs font-semibold text-zinc-200 cursor-pointer">
            {profiles.find(p => p.id === currentUser.id)?.name ?? "Meu perfil"} (Eu)
          </SelectItem>
          {profiles.filter(p => p.id !== currentUser.id).map((p) => (
            <SelectItem key={p.id} value={p.id} className="text-xs text-zinc-300 cursor-pointer">
              {p.name ?? p.email}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <button
        type="button"
        className={cn(
          "p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-amber-400 transition-colors cursor-pointer ml-0.5",
          isDefaultUser && "text-amber-400 hover:text-amber-500"
        )}
        title={isDefaultUser ? "Visão padrão ativa no Hub" : "Definir este usuário como meu padrão ao abrir o Hub"}
        onClick={() => {
          if (isDefaultUser && defaultUserId) {
            setDefaultUserId(null);
            toast.info("Padrão removido. O sistema voltará a selecionar você.");
          } else {
            setDefaultUserId(activeUserId);
            const name = activeProfile?.name ?? "este perfil";
            toast.success(`"${name}" definido como visão padrão ao abrir o Hub!`);
          }
        }}
      >
        <Star className={cn("h-3.5 w-3.5", isDefaultUser && "fill-amber-400 text-amber-400")} />
      </button>
    </div>
  );
}

const ROLE_LABELS: Record<string, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  collaborator: "Colaborador",
};

let deferredInstallPrompt: any = null;
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
  });
}

export function AppShell({ children, title }: { children: ReactNode; title?: string }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const clientMatch = pathname.match(/\/clients\/([a-f0-9-]+)/i);
  const activeClientId = clientMatch ? clientMatch[1] : undefined;

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string | null>(null);
  const [isStandalone, setIsStandalone] = useState(true);
  const [isGlobalMeetingOpen, setIsGlobalMeetingOpen] = useState(false);

  useEffect(() => {
    setIsStandalone(window.matchMedia("(display-mode: standalone)").matches);
  }, []);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        setCurrentUser(data.user);

        supabase
          .from("profiles")
          .select("name")
          .eq("id", data.user.id)
          .maybeSingle()
          .then(({ data: profile }) => {
            if (profile?.name) setCurrentUserName(profile.name);
          });
        
        supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", data.user.id)
          .maybeSingle()
          .then(({ data: roleData }) => {
            if (roleData) {
              setCurrentUserRole(roleData.role);
            }
          });
      }
    });
  }, []);

  const qc = useQueryClient();

  useEffect(() => {
    let demandsTimer: any = null;
    let clientsTimer: any = null;

    const channel = supabase
      .channel("realtime-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "demands" }, () => {
        if (typeof document !== "undefined" && document.hidden) return;
        if (demandsTimer) clearTimeout(demandsTimer);
        demandsTimer = setTimeout(() => {
          qc.invalidateQueries({ queryKey: ["demands"] });
        }, 3000);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "clients" }, () => {
        if (typeof document !== "undefined" && document.hidden) return;
        if (clientsTimer) clearTimeout(clientsTimer);
        clientsTimer = setTimeout(() => {
          qc.invalidateQueries({ queryKey: ["clients"] });
        }, 3000);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "user_roles" }, () => {
        qc.invalidateQueries({ queryKey: ["user_roles"] });
      })
      .subscribe();

    return () => {
      if (demandsTimer) clearTimeout(demandsTimer);
      if (clientsTimer) clearTimeout(clientsTimer);
      supabase.removeChannel(channel);
    };
  }, [qc]);

  const displayName = currentUserName || currentUser?.email || "";

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <UserProvider>
    <AutoSchedulerGate />
    <DemandOverlayProvider>
      <SidebarProvider>
        <div className="min-h-screen flex w-full bg-background">
          <AppSidebar />
          <div className="flex-1 flex flex-col min-w-0">
            <header className="h-14 border-b border-border flex items-center justify-between px-4 sticky top-0 z-30 bg-background/80 backdrop-blur">
              <div className="flex items-center gap-3">
                <SidebarTrigger />
                {title && <h1 className="font-display font-semibold text-foreground">{title}</h1>}
              </div>
              
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsGlobalMeetingOpen(true)}
                  className="h-8 text-xs font-medium border-purple-500/30 text-purple-300 hover:bg-purple-500/10 gap-1.5 mr-2 cursor-pointer"
                  title="Transcrever áudio/anotações de reunião"
                >
                  <Mic className="h-3.5 w-3.5 text-purple-400" />
                  <span className="hidden md:inline">Transcrever Reunião</span>
                </Button>

                <HeaderUserWorkSelector />
                {currentUser && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="flex items-center gap-2 hover:opacity-85 transition-opacity focus:outline-none cursor-pointer text-left py-1 px-2 rounded-lg hover:bg-zinc-800/40 border border-transparent hover:border-zinc-800/60 select-none">
                        <UserCircle className="h-5 w-5 text-muted-foreground shrink-0" />
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-zinc-300 shrink-0">
                            {displayName}
                          </span>
                          {currentUserRole && (
                            <span
                              className={cn(
                                "text-[9px] font-extrabold px-1.5 py-0.5 rounded-full uppercase tracking-wider shrink-0",
                                currentUserRole === "owner" && "bg-amber-500/10 text-amber-400 border border-amber-500/20",
                                currentUserRole === "admin" && "bg-blue-500/10 text-blue-400 border border-blue-500/20",
                                currentUserRole === "collaborator" && "bg-zinc-800 text-zinc-400 border border-zinc-700/60"
                              )}
                            >
                              {ROLE_LABELS[currentUserRole] || currentUserRole}
                            </span>
                          )}
                        </div>
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      </button>
                    </DropdownMenuTrigger>
                    
                    <DropdownMenuContent align="end" className="w-48 bg-zinc-950 border border-zinc-850 text-zinc-200">
                      <DropdownMenuItem asChild>
                        <Link
                          to="/profile"
                          className="flex items-center gap-2 w-full cursor-pointer hover:bg-zinc-850/60 focus:bg-zinc-850/60 py-2 text-zinc-300"
                        >
                          <UserCircle className="h-4 w-4 text-zinc-400" />
                          <span>Configurações</span>
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={signOut}
                        className="flex items-center gap-2 w-full cursor-pointer text-red-400 hover:text-red-300 hover:bg-zinc-850/60 focus:bg-zinc-850/60 py-2"
                      >
                        <LogOut className="h-4 w-4" />
                        <span>Sair</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </header>
            <main className="flex-1 min-w-0 pb-16 md:pb-0 flex flex-col overflow-auto">
               <div className="w-full flex flex-col flex-1">{children}</div>
            </main>
          </div>
          <BottomNav />
        </div>
        {/* Global demand overlay — persists across page navigation */}
        <DemandOverlayRenderer />
        <ClientFormDialog />
        <MeetingTranscriptionDialog
          open={isGlobalMeetingOpen}
          onOpenChange={setIsGlobalMeetingOpen}
          defaultClientId={activeClientId}
        />
      </SidebarProvider>
    </DemandOverlayProvider>
    </UserProvider>
  );
}
