import type { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./app-sidebar";
import { BottomNav } from "./bottom-nav";
import { DemandOverlayProvider } from "@/contexts/demand-overlay";
import { DemandOverlayRenderer } from "@/components/demand-overlay-renderer";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AppShell({ children, title }: { children: ReactNode; title?: string }) {
  const navigate = useNavigate();

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
              
              <Button
                variant="ghost"
                size="sm"
                onClick={signOut}
                className="text-xs text-muted-foreground hover:text-foreground gap-1.5 h-8 px-2 hover:bg-zinc-800/40 cursor-pointer"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Sair</span>
              </Button>
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