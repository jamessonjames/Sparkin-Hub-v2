import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Users, CalendarDays } from "lucide-react";
import { useUserContext } from "@/contexts/user-context";

type Item = { title: string; to: string; icon: typeof LayoutDashboard; exact?: boolean };
const ALL_ITEMS: Item[] = [
  { title: "Início", to: "/", icon: LayoutDashboard, exact: true },
  { title: "Clientes", to: "/clients", icon: Users },
  { title: "Agenda", to: "/agenda", icon: CalendarDays },
];

export function BottomNav() {
  const { isAdminOrOwner } = useUserContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (path: string, exact?: boolean) =>
    exact ? pathname === path : pathname === path || pathname.startsWith(path + "/");

  const items = isAdminOrOwner
    ? ALL_ITEMS
    : ALL_ITEMS.filter((it) => it.to === "/" || it.to === "/agenda");

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 h-16 border-t border-border bg-background/95 backdrop-blur"
      aria-label="Navegação principal"
    >
      <ul
        className="grid h-full"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {items.map((it) => {
          const active = isActive(it.to, it.exact);
          return (
            <li key={it.to}>
              <Link
                to={it.to}
                className={`h-full flex flex-col items-center justify-center gap-1 text-[11px] transition-colors ${
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <it.icon className="h-5 w-5" />
                <span>{it.title}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
