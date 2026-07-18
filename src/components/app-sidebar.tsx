import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, Users, ListChecks, Plus, UserCircle, CalendarDays, Settings, DollarSign } from "lucide-react";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { listClients } from "@/lib/clients.functions";
import { supabase } from "@/integrations/supabase/client";
import { useUserContext } from "@/contexts/user-context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type NavItem = { title: string; to: string; icon: typeof LayoutDashboard; exact?: boolean };
const NAV_ITEMS: NavItem[] = [
  { title: "Dashboard", to: "/", icon: LayoutDashboard, exact: true },
  { title: "Clientes", to: "/clients", icon: Users },
  { title: "Financeiro", to: "/finance", icon: DollarSign },
  { title: "Demandas", to: "/demands", icon: ListChecks },
  { title: "Agenda", to: "/agenda", icon: CalendarDays },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const { currentUserRole } = useUserContext();
  const isAdminOrOwner = currentUserRole === "owner" || currentUserRole === "admin";
  const listFn = useServerFn(listClients);
  const { data: clients } = useQuery({
    queryKey: ["clients"],
    queryFn: () => listFn(),
  });

  const [systemName, setSystemName] = useState("Creative Flow");
  const [faviconUrl, setFaviconUrl] = useState("");

  useEffect(() => {
    const handleBrandingChange = () => {
      const savedName = localStorage.getItem("CF_SystemName") || "Creative Flow";
      const savedFavicon = localStorage.getItem("CF_Favicon") || "";
      setSystemName(savedName);
      setFaviconUrl(savedFavicon);
    };
    handleBrandingChange();
    window.addEventListener("systemBrandingChanged", handleBrandingChange);
    return () => {
      window.removeEventListener("systemBrandingChanged", handleBrandingChange);
    };
  }, []);

  const isActive = (path: string, exact?: boolean) =>
    exact ? pathname === path : pathname === path || pathname.startsWith(path + "/");

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center justify-between px-2 py-1">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-md overflow-hidden grid place-items-center font-display font-bold shrink-0">
              {faviconUrl ? (
                <img src={faviconUrl} alt="logo" className="h-full w-full object-contain" />
              ) : (
                <div className="h-full w-full bg-primary/20 text-primary grid place-items-center">
                  {systemName.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            {!collapsed && (
              <div className="font-display font-bold text-sm text-foreground">{systemName}</div>
            )}
          </div>
          {!collapsed && (
            <Link
              to="/admin"
              title="Painel Admin"
              className={cn(
                "p-1.5 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors shrink-0",
                pathname.startsWith("/admin") && "text-primary bg-zinc-800/60"
              )}
            >
              <Settings className="h-4 w-4" />
            </Link>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navegação</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.filter(item => isAdminOrOwner || (item.to !== "/finance" && item.to !== "/clients")).map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton asChild isActive={isActive(item.to, item.exact)}>
                    <Link to={item.to} className="flex items-center gap-2">
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isAdminOrOwner && (
          <SidebarGroup>
            <SidebarGroupLabel className="flex items-center justify-between">
              <span>Clientes</span>
              {!collapsed && (
                <Link
                  to="/clients/new"
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Novo cliente"
                >
                  <Plus className="h-3.5 w-3.5" />
                </Link>
              )}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {(clients ?? []).slice(0, 20).map((c) => (
                  <SidebarMenuItem key={c.id}>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname === `/clients/${c.id}`}
                      size="sm"
                    >
                      <Link
                        to="/clients/$id"
                        params={{ id: c.id }}
                        className="flex items-center gap-2"
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-primary/60 shrink-0" />
                        {!collapsed && <span className="truncate">{c.name}</span>}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
                {(clients?.length ?? 0) === 0 && !collapsed && (
                  <div className="px-2 py-1 text-xs text-muted-foreground">
                    Nenhum cliente ainda.
                  </div>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>


    </Sidebar>
  );
}