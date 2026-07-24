import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, Users, ListChecks, Plus, CalendarDays, Settings, DollarSign, TrendingUp, GripVertical, ChevronDown, ChevronRight, FolderKanban, Inbox as InboxIcon } from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
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
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";
import { listClients } from "@/lib/clients.functions";
import { saveSidebarOrder, getSystemBranding } from "@/lib/users.functions";
import { supabase } from "@/integrations/supabase/client";
import { useUserContext } from "@/contexts/user-context";
import { cn } from "@/lib/utils";
import { getClientActivityStatus, getStatusColor } from "@/lib/activity.functions";
import type { ClientActivity } from "@/lib/activity.functions";

type NavItem = { title: string; to: string; icon: typeof LayoutDashboard; exact?: boolean };
const DEFAULT_NAV_ITEMS: NavItem[] = [
  { title: "Dashboard", to: "/", icon: LayoutDashboard, exact: true },
  { title: "Caixa de Entrada", to: "/inbox", icon: InboxIcon },
  { title: "Clientes", to: "/clients", icon: Users },
  { title: "Funil Comercial", to: "/crm", icon: TrendingUp },
  { title: "Financeiro", to: "/finance", icon: DollarSign },
  { title: "Demandas", to: "/demands", icon: ListChecks },
  { title: "Agenda", to: "/agenda", icon: CalendarDays },
];

function applyOrder(order: string[], items: NavItem[]): NavItem[] {
  const ordered: NavItem[] = [];
  for (const to of order) {
    const item = items.find((i) => i.to === to);
    if (item) ordered.push(item);
  }
  for (const item of items) {
    if (!ordered.some((o) => o.to === item.to)) ordered.push(item);
  }
  return ordered;
}

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const { currentUserRole, sidebarOrder, setSidebarOrder } = useUserContext();
  const isAdminOrOwner = currentUserRole === "owner" || currentUserRole === "admin";
  const listFn = useServerFn(listClients);
  const saveOrderFn = useServerFn(saveSidebarOrder);
  const activityFn = useServerFn(getClientActivityStatus);
  const { data: clients } = useQuery({
    queryKey: ["clients"],
    queryFn: () => listFn(),
  });
  const { data: activityMap } = useQuery({
    queryKey: ["clientActivityMap"],
    queryFn: async () => {
      const data: ClientActivity[] = await activityFn();
      const map = new Map<string, ClientActivity>();
      for (const a of data) map.set(a.clientId, a);
      return map;
    },
  });

  const [systemName, setSystemName] = useState("Creative Flow");
  const [faviconUrl, setFaviconUrl] = useState("");
  const getBrandingFn = useServerFn(getSystemBranding);

  useEffect(() => {
    const handleBrandingChange = () => {
      const savedName = localStorage.getItem("CF_SystemName") || "Creative Flow";
      const savedFavicon = localStorage.getItem("CF_Favicon") || "";
      setSystemName(savedName);
      setFaviconUrl(savedFavicon);
    };
    handleBrandingChange();

    getBrandingFn().then((b) => {
      if (b.system_name) {
        setSystemName(b.system_name);
        localStorage.setItem("CF_SystemName", b.system_name);
      }
      if (b.favicon_url) {
        setFaviconUrl(b.favicon_url);
        localStorage.setItem("CF_Favicon", b.favicon_url);
        const faviconLink = document.querySelector<HTMLLinkElement>("link[rel*='icon']");
        if (faviconLink) {
          faviconLink.href = b.favicon_url;
        }
      }
    }).catch(() => {});

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

  const [projectsOpen, setProjectsOpen] = useState<Record<string, boolean>>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("CF_ProjectsOpen");
      if (saved) { try { return JSON.parse(saved); } catch {} }
    }
    return {};
  });

  const toggleProjects = useCallback((clientId: string) => {
    setProjectsOpen((prev) => {
      const next = { ...prev, [clientId]: !(prev[clientId] ?? true) };
      localStorage.setItem("CF_ProjectsOpen", JSON.stringify(next));
      return next;
    });
  }, []);

  useEffect(() => {
    localStorage.setItem("CF_ClientsSectionOpen", String(clientsOpen));
  }, [clientsOpen]);

  const filteredItems = DEFAULT_NAV_ITEMS.filter(
    (item) => isAdminOrOwner || (item.to !== "/finance" && item.to !== "/clients" && item.to !== "/crm"),
  );

  const [orderedItems, setOrderedItems] = useState<NavItem[]>(() => {
    const stored = localStorage.getItem("CF_SidebarOrder");
    if (stored) {
      try {
        const parsed: string[] = JSON.parse(stored);
        if (parsed.length > 0) return applyOrder(parsed, filteredItems);
      } catch {}
    }
    return filteredItems;
  });

  useEffect(() => {
    if (sidebarOrder && sidebarOrder.length > 0) {
      setOrderedItems(applyOrder(sidebarOrder, filteredItems));
      localStorage.setItem("CF_SidebarOrder", JSON.stringify(sidebarOrder));
    } else {
      const stored = localStorage.getItem("CF_SidebarOrder");
      if (stored) {
        try {
          const parsed: string[] = JSON.parse(stored);
          if (parsed.length > 0) setOrderedItems(applyOrder(parsed, filteredItems));
          else setOrderedItems(filteredItems);
        } catch {
          setOrderedItems(filteredItems);
        }
      } else {
        setOrderedItems(filteredItems);
      }
    }
  }, [sidebarOrder, currentUserRole]);

  const itemRefs = useRef<(HTMLLIElement | null)[]>([]);
  const dragState = useRef<{
    from: number;
    startY: number;
    isDragging: boolean;
  } | null>(null);

  const [dropIdx, setDropIdx] = useState<number | null>(null);
  const dropIdxRef = useRef<number | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [floatingPos, setFloatingPos] = useState({ y: 0 });

  const dragOverlayRef = useRef<HTMLDivElement | null>(null);
  const docMoveHandler = useRef<((e: PointerEvent) => void) | null>(null);
  const docUpHandler = useRef<((e: PointerEvent) => void) | null>(null);

  function cleanupDragOverlay() {
    if (dragOverlayRef.current) {
      document.body.removeChild(dragOverlayRef.current);
      dragOverlayRef.current = null;
    }
  }

  function removeDocListeners() {
    if (docMoveHandler.current) {
      document.removeEventListener("pointermove", docMoveHandler.current);
      docMoveHandler.current = null;
    }
    if (docUpHandler.current) {
      document.removeEventListener("pointerup", docUpHandler.current);
      docUpHandler.current = null;
    }
  }

  function setItemRef(index: number, el: HTMLLIElement | null) {
    itemRefs.current[index] = el;
  }

  function handlePointerDown(e: React.PointerEvent, index: number) {
    if (collapsed) return;
    if ((e.target as HTMLElement).closest('[data-sidebar="menu-sub"], .sidebar-action-btn')) return;

    dragState.current = {
      from: index,
      startY: e.clientY,
      isDragging: false,
    };
    setDragIdx(index);
    setIsDragging(false);
    setFloatingPos({ y: e.clientY });
  }

  function handlePointerMove(e: React.PointerEvent) {
    const state = dragState.current;
    if (!state) return;

    const dy = Math.abs(e.clientY - state.startY);
    if (!state.isDragging && dy > 6) {
      state.isDragging = true;
      setIsDragging(true);

      const overlay = document.createElement("div");
      overlay.style.cssText = "position:fixed;inset:0;z-index:99998;pointer-events:auto;";
      document.body.appendChild(overlay);
      dragOverlayRef.current = overlay;

      const moveHandler = (ev: PointerEvent) => {
        ev.preventDefault();
        setFloatingPos({ y: ev.clientY });
        const items = itemRefs.current;
        let found: number | null = null;
        for (let i = 0; i < items.length; i++) {
          const el = items[i];
          if (el) {
            const rect = el.getBoundingClientRect();
            const mid = rect.top + rect.height / 2;
            if (ev.clientY <= mid) {
              found = i;
              break;
            }
          }
        }
        if (found === null && items.length > 0) {
          const last = items[items.length - 1];
          if (last && ev.clientY > last.getBoundingClientRect().bottom) {
            found = items.length;
          }
        }
        setDropIdx(found);
        dropIdxRef.current = found;
      };

      const upHandler = () => {
        removeDocListeners();
        cleanupDragOverlay();
        setIsDragging(false);

        const s = dragState.current;
        dragState.current = null;
        const finalDrop = dropIdxRef.current;

        if (s && s.isDragging && finalDrop !== null && s.from !== finalDrop) {
          const to = finalDrop;
          const updated = [...orderedItems];
          const [moved] = updated.splice(s.from, 1);
          updated.splice(to, 0, moved);
          setOrderedItems(updated);
          const newOrder = updated.map((item) => item.to);
          localStorage.setItem("CF_SidebarOrder", JSON.stringify(newOrder));
          setSidebarOrder(newOrder);
          saveOrderFn({ data: { order: newOrder } }).catch((err) => {
            console.error("Failed to save sidebar order to DB:", err);
          });
        }

        setDragIdx(null);
        setDropIdx(null);
        dropIdxRef.current = null;
      };

      docMoveHandler.current = moveHandler;
      docUpHandler.current = upHandler;
      document.addEventListener("pointermove", moveHandler);
      document.addEventListener("pointerup", upHandler);
      return;
    }
  }

  function handlePointerUp() {
    const state = dragState.current;
    if (!state) return;
    dragState.current = null;
    setIsDragging(false);
    setDragIdx(null);
    setDropIdx(null);
  }

  function handlePointerCancel() {
    removeDocListeners();
    cleanupDragOverlay();
    dragState.current = null;
    setIsDragging(false);
    setDragIdx(null);
    setDropIdx(null);
  }

  const floatingItem = isDragging && dragIdx !== null && orderedItems[dragIdx];

  function renderNavItem(item: NavItem, index: number) {
    if (item.to === "/clients") {
      return renderClientsNavItem(item, index);
    }
    return renderRegularNavItem(item, index);
  }

  function renderRegularNavItem(item: NavItem, index: number) {
    const isDrag = isDragging && dragIdx === index;

    return (
      <SidebarMenuItem
        key={item.to}
        ref={(el) => setItemRef(index, el)}
        onPointerDown={(e) => handlePointerDown(e, index)}
        className={cn(
          "group/nav-item transition-all duration-150 select-none",
          isDrag && "opacity-30",
        )}
        style={{ transform: isDrag ? "scale(0.95)" : "" }}
      >
        {dropIdx === index && (
          <div className="absolute -top-0.5 left-2 right-2 h-0.5 rounded-full bg-primary/50 z-10" />
        )}
        {dropIdx === orderedItems.length && index === orderedItems.length - 1 && (
          <div className="absolute -bottom-0.5 left-2 right-2 h-0.5 rounded-full bg-primary/50 z-10" />
        )}
        <div className="relative flex items-center py-1">
          <div className={cn(
            "absolute left-0 top-1/2 -translate-y-1/2 opacity-0 group-hover/nav-item:opacity-100 transition-opacity cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground p-0.5 rounded",
            collapsed && "hidden",
          )}>
            <GripVertical className="h-3 w-3" />
          </div>
          <SidebarMenuButton
            asChild
            size="sm"
            isActive={isActive(item.to, item.exact)}
            className={cn(!collapsed && "pl-7")}
          >
            <Link to={item.to} className="flex items-center gap-2 select-none">
              <item.icon className="h-4 w-4" />
              {!collapsed && <span>{item.title}</span>}
            </Link>
          </SidebarMenuButton>
        </div>
      </SidebarMenuItem>
    );
  }

  function renderClientsNavItem(item: NavItem, index: number) {
    const isDrag = isDragging && dragIdx === index;

    const masterClients = (clients ?? []).filter((c) => !c.parent_id && !c.is_project);
    const projectsByParent = new Map<string, typeof clients>();
    for (const c of clients ?? []) {
      if (c.parent_id) {
        const arr = projectsByParent.get(c.parent_id) ?? [];
        arr.push(c);
        projectsByParent.set(c.parent_id, arr);
      }
    }

    return (
      <SidebarMenuItem
        key={item.to}
        ref={(el) => setItemRef(index, el)}
        onPointerDown={(e) => handlePointerDown(e, index)}
        className={cn(
          "group/nav-item transition-all duration-150 select-none",
          isDrag && "opacity-30",
        )}
        style={{ transform: isDrag ? "scale(0.95)" : "" }}
      >
        {dropIdx === index && (
          <div className="absolute -top-0.5 left-2 right-2 h-0.5 rounded-full bg-primary/50 z-10" />
        )}
        {dropIdx === orderedItems.length && index === orderedItems.length - 1 && (
          <div className="absolute -bottom-0.5 left-2 right-2 h-0.5 rounded-full bg-primary/50 z-10" />
        )}
        <div>
          <div className="relative flex items-center py-1">
            <div className={cn(
              "absolute left-0 top-1/2 -translate-y-1/2 opacity-0 group-hover/nav-item:opacity-100 transition-opacity cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground p-0.5 rounded",
              collapsed && "hidden",
            )}>
              <GripVertical className="h-3 w-3" />
            </div>
            <SidebarMenuButton
              asChild
              size="sm"
              isActive={isActive("/clients", false)}
              className={cn(!collapsed && "pl-7", "flex-1")}
            >
              <Link to="/clients" className="flex items-center gap-2 select-none">
                <Users className="h-4 w-4" />
                {!collapsed && <span>Clientes</span>}
              </Link>
            </SidebarMenuButton>
            {!collapsed && isAdminOrOwner && (
              <div className="flex items-center gap-0.5 pr-1">
                <button
                  type="button"
                  onClick={() => setClientsOpen(!clientsOpen)}
                  className="sidebar-action-btn p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-zinc-800/60 transition-colors"
                >
                  {clientsOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    window.dispatchEvent(new CustomEvent("open-client-form"));
                  }}
                  className="sidebar-action-btn p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-zinc-800/60 transition-colors cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
          {!collapsed && clientsOpen && isAdminOrOwner && (
            <SidebarMenuSub className="gap-[1px] pl-4">
              {masterClients.slice(0, 20).map((mc) => {
                const projectList = (projectsByParent.get(mc.id) ?? []).slice(0, 10);
                const isProjOpen = projectsOpen[mc.id] ?? true;
                return (
                  <div key={mc.id} className="space-y-[1px]">
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton asChild size="sm" isActive={pathname === `/clients/${mc.id}`}>
                          <Link
                            to="/clients/$id"
                            params={{ id: mc.id }}
                            className="flex items-center gap-2 group/link"
                          >
                            <span
                              className="h-1.5 w-1.5 rounded-full shrink-0"
                              style={{ backgroundColor: getStatusColor(activityMap?.get(mc.id)?.status ?? "atencao") }}
                            />
                            <span className="truncate flex-1">{mc.name}</span>
                            {projectList.length > 0 && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  toggleProjects(mc.id);
                                }}
                                className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-zinc-800/60 transition-colors sidebar-action-btn"
                              >
                                {isProjOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                window.dispatchEvent(new CustomEvent("open-client-form", { detail: { parentId: mc.id, isProject: true } }));
                              }}
                              className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-zinc-800/60 transition-colors sidebar-action-btn opacity-0 group-hover/link:opacity-100"
                              title={`Novo projeto em ${mc.name}`}
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </Link>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                    {isProjOpen && projectList.length > 0 && (
                      <div className="pl-3 space-y-[1px] border-l border-border/40 ml-1.5">
                        {projectList.map((p) => (
                          <SidebarMenuSubItem key={p.id}>
                            <SidebarMenuSubButton asChild size="sm" isActive={pathname === `/clients/${p.id}`}>
                              <Link
                                to="/clients/$id"
                                params={{ id: p.id }}
                                className="flex items-center gap-2"
                              >
                                <FolderKanban className="h-3 w-3 text-muted-foreground/60 shrink-0" />
                                <span
                                  className="h-1.5 w-1.5 rounded-full shrink-0"
                                  style={{ backgroundColor: getStatusColor(activityMap?.get(p.id)?.status ?? "atencao") }}
                                />
                                <span className="truncate">{p.name}</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {(clients?.length ?? 0) === 0 && (
                <div className="px-6 py-1 text-xs text-muted-foreground">
                  Nenhum cliente ainda.
                </div>
              )}
            </SidebarMenuSub>
          )}
        </div>
      </SidebarMenuItem>
    );
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

      {floatingItem && createPortal(
        <div
          className="fixed pointer-events-none z-[99999] flex items-center gap-2 px-3 py-2 rounded-lg bg-card border border-border shadow-2xl text-sm font-semibold text-foreground select-none"
          style={{ left: 80, top: floatingPos.y - 20 }}
        >
          <floatingItem.icon className="h-4 w-4" />
          <span>{floatingItem.title}</span>
        </div>,
        document.body,
      )}

      <SidebarContent
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        <SidebarGroup>
          <SidebarGroupLabel>Navegação</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-2">
              {orderedItems.map((item, index) => renderNavItem(item, index))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
