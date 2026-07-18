import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, Users, ListChecks, Plus, CalendarDays, Settings, DollarSign, TrendingUp, GripVertical, ChevronDown, ChevronRight } from "lucide-react";
import { useState, useEffect, useRef } from "react";
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
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { listClients } from "@/lib/clients.functions";
import { saveSidebarOrder } from "@/lib/users.functions";
import { supabase } from "@/integrations/supabase/client";
import { useUserContext } from "@/contexts/user-context";
import { cn } from "@/lib/utils";

type NavItem = { title: string; to: string; icon: typeof LayoutDashboard; exact?: boolean };
const DEFAULT_NAV_ITEMS: NavItem[] = [
  { title: "Dashboard", to: "/", icon: LayoutDashboard, exact: true },
  { title: "Clientes", to: "/clients", icon: Users },
  { title: "Funil Comercial", to: "/crm", icon: TrendingUp },
  { title: "Financeiro", to: "/finance", icon: DollarSign },
  { title: "Demandas", to: "/demands", icon: ListChecks },
  { title: "Agenda", to: "/agenda", icon: CalendarDays },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const { currentUserRole, sidebarOrder, setSidebarOrder } = useUserContext();
  const isAdminOrOwner = currentUserRole === "owner" || currentUserRole === "admin";
  const listFn = useServerFn(listClients);
  const saveOrderFn = useServerFn(saveSidebarOrder);
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

  const [clientsOpen, setClientsOpen] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("CF_ClientsSectionOpen") !== "false";
    }
    return true;
  });

  useEffect(() => {
    localStorage.setItem("CF_ClientsSectionOpen", String(clientsOpen));
  }, [clientsOpen]);

  const filteredItems = DEFAULT_NAV_ITEMS.filter(
    (item) => isAdminOrOwner || (item.to !== "/finance" && item.to !== "/clients" && item.to !== "/crm"),
  );

  const [orderedItems, setOrderedItems] = useState<NavItem[]>([]);

  useEffect(() => {
    if (sidebarOrder && sidebarOrder.length > 0) {
      const ordered: NavItem[] = [];
      for (const to of sidebarOrder) {
        const item = filteredItems.find((i) => i.to === to);
        if (item) ordered.push(item);
      }
      for (const item of filteredItems) {
        if (!ordered.some((o) => o.to === item.to)) {
          ordered.push(item);
        }
      }
      setOrderedItems(ordered);
    } else {
      setOrderedItems(filteredItems);
    }
  }, [sidebarOrder, currentUserRole]);

  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  function handleDragStart(e: React.DragEvent, index: number) {
    e.dataTransfer.setData("text/plain", String(index));
    e.dataTransfer.effectAllowed = "move";
    setDragFrom(index);
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIdx(index);
  }

  function handleDragLeave() {
    setDragOverIdx(null);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const from = dragFrom;
    const to = dragOverIdx;
    setDragFrom(null);
    setDragOverIdx(null);
    if (from === null || to === null || from === to) return;

    const updated = [...orderedItems];
    const [moved] = updated.splice(from, 1);
    updated.splice(to, 0, moved);
    setOrderedItems(updated);

    const newOrder = updated.map((item) => item.to);
    setSidebarOrder(newOrder);
    saveOrderFn({ data: { order: newOrder } }).catch(() => {});
  }

  function handleDragEnd() {
    setDragFrom(null);
    setDragOverIdx(null);
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
              {orderedItems.map((item, index) => {
                const isOver = dragOverIdx === index;
                const isDragging = dragFrom === index;

                return (
                  <div key={item.to} className="relative">
                    {isOver && (
                      <div className="h-1 rounded-full bg-primary/40 mx-2 my-0.5 transition-all duration-150" />
                    )}
                    <SidebarMenuItem className="group/nav-item">
                      <div
                        draggable
                        onDragStart={(e) => handleDragStart(e, index)}
                        onDragOver={(e) => handleDragOver(e, index)}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onDragEnd={handleDragEnd}
                        className={cn("transition-all duration-150", isDragging && "opacity-40")}
                      >
                        <div className="relative flex items-center">
                          <div
                            className={cn(
                              "absolute left-0 top-1/2 -translate-y-1/2 opacity-0 group-hover/nav-item:opacity-100 transition-opacity cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground p-0.5 rounded",
                              collapsed && "hidden",
                            )}
                          >
                            <GripVertical className="h-3 w-3" />
                          </div>
                          <SidebarMenuButton
                            asChild
                            isActive={isActive(item.to, item.exact)}
                            className={cn(!collapsed && "pl-7")}
                          >
                            <Link
                              to={item.to}
                              className="flex items-center gap-2 select-none"
                              draggable={false}
                              onDragStart={(e) => { e.preventDefault(); }}
                            >
                              <item.icon className="h-4 w-4" />
                              {!collapsed && <span>{item.title}</span>}
                            </Link>
                          </SidebarMenuButton>
                        </div>
                      </div>
                    </SidebarMenuItem>
                  </div>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isAdminOrOwner && (
          <Collapsible open={clientsOpen} onOpenChange={setClientsOpen}>
            <SidebarGroup>
              <CollapsibleTrigger asChild>
                <SidebarGroupLabel className="flex items-center justify-between cursor-pointer select-none hover:bg-zinc-800/40 rounded-md px-2 py-1 transition-colors">
                  <div className="flex items-center gap-1.5">
                    {clientsOpen ? (
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    <span>Clientes</span>
                  </div>
                  {!collapsed && clientsOpen && (
                    <Link
                      to="/clients/new"
                      className="text-muted-foreground hover:text-foreground"
                      aria-label="Novo cliente"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Link>
                  )}
                </SidebarGroupLabel>
              </CollapsibleTrigger>
              <CollapsibleContent>
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
                            <span
                              className="h-1.5 w-1.5 rounded-full shrink-0"
                              style={{ backgroundColor: c.color || "var(--primary)" }}
                            />
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
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        )}
      </SidebarContent>
    </Sidebar>
  );
}
