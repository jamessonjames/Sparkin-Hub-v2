import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { listDemands } from "@/lib/demands.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { STATUS_LABELS } from "@/lib/demand-labels";

export const Route = createFileRoute("/_authenticated/agenda")({
  head: () => ({ meta: [{ title: "Agenda — Creative Flow Hub" }] }),
  component: AgendaPage,
});

const WEEK = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function AgendaPage() {
  const listFn = useServerFn(listDemands);
  const { data: demands = [] } = useQuery({
    queryKey: ["demands"],
    queryFn: () => listFn(),
  });

  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const byDate = useMemo(() => {
    const map = new Map<string, typeof demands>();
    for (const d of demands) {
      if (!d.due_date) continue;
      const key = d.due_date;
      const arr = map.get(key) ?? [];
      arr.push(d);
      map.set(key, arr);
    }
    return map;
  }, [demands]);

  const days = useMemo(() => {
    const first = new Date(cursor);
    const startDow = first.getDay();
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const cells: Array<{ date: Date | null; key: string }> = [];
    for (let i = 0; i < startDow; i++) cells.push({ date: null, key: `pad-${i}` });
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(cursor.getFullYear(), cursor.getMonth(), d);
      cells.push({ date, key: date.toISOString() });
    }
    while (cells.length % 7 !== 0) cells.push({ date: null, key: `tail-${cells.length}` });
    return cells;
  }, [cursor]);

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const monthLabel = cursor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  const upcoming = useMemo(() => {
    return demands
      .filter((d) => d.due_date && d.due_date >= todayKey)
      .sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1))
      .slice(0, 8);
  }, [demands, todayKey]);

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-4 pb-24 md:pb-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" /> Agenda
          </h2>
          <p className="text-sm text-muted-foreground capitalize">{monthLabel}</p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
            aria-label="Mês anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const d = new Date();
              setCursor(new Date(d.getFullYear(), d.getMonth(), 1));
            }}
          >
            Hoje
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
            aria-label="Próximo mês"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Card className="p-2 md:p-4 overflow-hidden">
        <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground mb-1">
          {WEEK.map((w) => (
            <div key={w} className="py-1 font-medium">{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map(({ date, key }) => {
            if (!date) return <div key={key} className="min-h-[70px] md:min-h-[100px]" />;
            const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
            const items = byDate.get(iso) ?? [];
            const isToday = iso === todayKey;
            return (
              <div
                key={key}
                className={`min-h-[70px] md:min-h-[100px] rounded-md border p-1 md:p-2 text-left transition-colors ${
                  isToday
                    ? "border-primary/60 bg-primary/5"
                    : "border-border bg-card/40 hover:bg-card"
                }`}
              >
                <div className={`text-xs font-medium ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                  {date.getDate()}
                </div>
                <div className="mt-1 space-y-1">
                  {items.slice(0, 3).map((d) => (
                    <div
                      key={d.id}
                      className="truncate text-[10px] md:text-xs px-1.5 py-0.5 rounded bg-primary/15 text-primary"
                      title={d.title}
                    >
                      {d.title}
                    </div>
                  ))}
                  {items.length > 3 && (
                    <div className="text-[10px] text-muted-foreground">+{items.length - 3}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <div>
        <h3 className="font-display font-semibold text-foreground mb-2">Próximas entregas</h3>
        <div className="grid md:grid-cols-2 gap-2">
          {upcoming.map((d) => (
            <Link key={d.id} to="/demands">
              <Card className="p-3 hover:border-primary/50 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-foreground truncate">{d.title}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {(d.clients as { name?: string } | null)?.name ?? "—"}
                    </div>
                  </div>
                  <Badge variant="secondary" className="shrink-0">
                    {STATUS_LABELS[d.status] ?? d.status}
                  </Badge>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {new Date(d.due_date + "T00:00:00").toLocaleDateString("pt-BR", {
                    day: "2-digit",
                    month: "short",
                  })}
                </div>
              </Card>
            </Link>
          ))}
          {upcoming.length === 0 && (
            <Card className="p-6 text-center col-span-full">
              <p className="text-sm text-muted-foreground">Sem entregas futuras.</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
