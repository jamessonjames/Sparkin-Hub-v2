import type { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./app-sidebar";
import { BottomNav } from "./bottom-nav";
import { DemandOverlayProvider } from "@/contexts/demand-overlay";
import { DemandOverlayRenderer } from "@/components/demand-overlay-renderer";
import { ClientFormDialog } from "@/components/client-form-dialog";
import { UserProvider } from "@/contexts/user-context";
import { useNavigate, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { LogOut, UserCircle, ChevronDown, Download } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { useAutoScheduler } from "@/hooks/use-auto-scheduler";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

const ROLE_LABELS: Record<string, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  collaborator: "Colaborador",
};

export function AppShell({ children, title }: { children: ReactNode; title?: string }) {
  const navigate = useNavigate();
  useAutoScheduler();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string | null>(null);
  const [isStandalone, setIsStandalone] = useState(true);
  const deferredPromptRef = useRef<any>(null);

  useEffect(() => {
    setIsStandalone(window.matchMedia("(display-mode: standalone)").matches);

    const handler = (e: Event) => {
      e.preventDefault();
      deferredPromptRef.current = e;
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
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

  const displayName = currentUserName || currentUser?.email || "";

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <UserProvider>
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
                {!isStandalone && (
                  <button
                    onClick={async () => {
                      if (deferredPromptRef.current) {
                        deferredPromptRef.current.prompt();
                        const result = await deferredPromptRef.current.userChoice;
                        if (result.outcome === "accepted") setIsStandalone(true);
                      }
                    }}
                    title="Instalar aplicativo"
                    className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-zinc-800/40 transition-colors cursor-pointer"
                  >
                    <Download className="h-4 w-4" />
                  </button>
                )}
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
            <main className="flex-1 min-w-0 pb-16 md:pb-0 flex flex-col overflow-auto">{children}</main>
          </div>
          <BottomNav />
        </div>
        {/* Global demand overlay — persists across page navigation */}
        <DemandOverlayRenderer />
        <ClientFormDialog />
      </SidebarProvider>
    </DemandOverlayProvider>
    </UserProvider>
  );
}
