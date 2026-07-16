import type { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./app-sidebar";
import { BottomNav } from "./bottom-nav";
import { DemandOverlayProvider } from "@/contexts/demand-overlay";
import { DemandOverlayRenderer } from "@/components/demand-overlay-renderer";
import { useNavigate, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { LogOut, UserCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

const ROLE_LABELS: Record<string, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  collaborator: "Colaborador",
};

export function AppShell({ children, title }: { children: ReactNode; title?: string }) {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        setCurrentUser(data.user);
        
        // Query current user role
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

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
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
              
              <div className="flex items-center gap-4">
                {currentUser && (
                  <div className="flex items-center gap-2">
                    <Link
                      to="/profile"
                      title="Minha Conta"
                      className="hover:opacity-80 transition-opacity flex items-center gap-2"
                    >
                      <UserCircle className="h-5 w-5 text-muted-foreground hover:text-primary transition-colors cursor-pointer shrink-0" />
                      <span className="text-xs text-zinc-300 hidden md:inline shrink-0 select-none">
                        {currentUser.email}
                      </span>
                    </Link>
                    {currentUserRole && (
                      <span
                        className={cn(
                          "text-[9px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider select-none shrink-0",
                          currentUserRole === "owner" && "bg-amber-500/10 text-amber-400 border border-amber-500/20",
                          currentUserRole === "admin" && "bg-blue-500/10 text-blue-400 border border-blue-500/20",
                          currentUserRole === "collaborator" && "bg-zinc-800 text-zinc-400 border border-zinc-700/60"
                        )}
                      >
                        {ROLE_LABELS[currentUserRole] || currentUserRole}
                      </span>
                    )}
                    <span className="h-4 w-px bg-zinc-800 hidden md:block mx-1" />
                  </div>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={signOut}
                  className="text-xs text-muted-foreground hover:text-foreground gap-1.5 h-8 px-2 hover:bg-zinc-800/40 cursor-pointer"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="hidden sm:inline">Sair</span>
                </Button>
              </div>
            </header>
            <main className="flex-1 min-w-0 pb-16 md:pb-0">{children}</main>
          </div>
          <BottomNav />
        </div>
        {/* Global demand overlay — persists across page navigation */}
        <DemandOverlayRenderer />
      </SidebarProvider>
    </DemandOverlayProvider>
  );
}