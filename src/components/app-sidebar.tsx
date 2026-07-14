import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  ListChecks,
  Settings as SettingsIcon,
  Plus,
  UserCircle,
} from "lucide-react";
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
import { Button } from "@/components/ui/button";

const NAV_ITEMS = [
  { title: "Dashboard", to: "/", icon: LayoutDashboard, exact: true },
  { title: "Clientes", to: "/clients", icon: Users },
  { title: "Demandas", to: "/demands", icon: ListChecks },
  { title: "Configurações", to: "/settings", icon: SettingsIcon },
] as const;

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const listFn = useServerFn(listClients);
  const { data: clients } = useQuery({
    queryKey: ["clients"],
    queryFn: () => listFn(),
  });

  const isActive = (path: string, exact?: boolean) =>
    exact ? pathname === path : pathname === path || pathname.startsWith(path + "/");

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1">
          <div className="h-8 w-8 rounded-md bg-primary/20 text-primary grid place-items-center font-display font-bold">
            S
          </div>
          {!collapsed && (
            <div className="font-display font-bold text-sm text-foreground">Creative Flow</div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navegação</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => (
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
      </SidebarContent>

      <SidebarFooter>
        <div className="flex items-center gap-2 p-2">
          <UserCircle className="h-5 w-5 text-muted-foreground shrink-0" />
          {!collapsed && (
            <Button variant="ghost" size="sm" onClick={signOut} className="text-xs h-7">
              Sair
            </Button>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}