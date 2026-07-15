import type { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./app-sidebar";
import { BottomNav } from "./bottom-nav";
import { DemandOverlayProvider } from "@/contexts/demand-overlay";
import { DemandOverlayRenderer } from "@/components/demand-overlay-renderer";

export function AppShell({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <DemandOverlayProvider>
      <SidebarProvider>
        <div className="min-h-screen flex w-full bg-background">
          <AppSidebar />
          <div className="flex-1 flex flex-col min-w-0">
            <header className="h-14 border-b border-border flex items-center gap-3 px-4 sticky top-0 z-30 bg-background/80 backdrop-blur">
              <SidebarTrigger />
              {title && <h1 className="font-display font-semibold text-foreground">{title}</h1>}
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