import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Users, ListChecks, CalendarDays } from "lucide-react";

const ITEMS = [
  { title: "Início", to: "/", icon: LayoutDashboard, exact: true },
  { title: "Clientes", to: "/clients", icon: Users },
  { title: "Demandas", to: "/demands", icon: ListChecks },
  { title: "Agenda", to: "/agenda", icon: CalendarDays },
] as const;

export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (path: string, exact?: boolean) =>
    exact ? pathname === path : pathname === path || pathname.startsWith(path + "/");

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 h-16 border-t border-border bg-background/95 backdrop-blur"
      aria-label="Navegação principal"
    >
      <ul className="grid grid-cols-4 h-full">
        {ITEMS.map((it) => {
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
