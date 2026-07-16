import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listDemands, batchUpdateDueDates } from "@/lib/demands.functions";
import {
  scheduleByPriority,
  DEFAULT_CONFIG,
  type SchedulingConfig,
} from "@/utils/scheduler";

/**
 * Global auto-scheduler. Whenever the demands list changes, re-computes slot
 * assignments by priority (urgent > high > medium > low, tie-break by created_at)
 * and persists any diffs to the backend.
 */
export function useAutoScheduler() {
  const listFn = useServerFn(listDemands);
  const batchFn = useServerFn(batchUpdateDueDates);
  const qc = useQueryClient();
  const running = useRef(false);

  const { data: demands = [] } = useQuery({
    queryKey: ["demands"],
    queryFn: () => listFn(),
  });

  useEffect(() => {
    if (running.current) return;
    if (!demands || demands.length === 0) return;

    let config: SchedulingConfig = DEFAULT_CONFIG;
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("CreativeFlow_ScheduleConfig");
      if (saved) {
        try {
          config = JSON.parse(saved);
        } catch {}
      }
    }

    const forScheduler = demands.map((d: any) => ({
      id: d.id,
      title: d.title,
      priority: d.priority as "low" | "medium" | "high" | "urgent",
      status: d.status,
      due_date: d.due_date,
      estimated_hours: d.estimated_hours ? Number(d.estimated_hours) : 1.0,
      created_at: d.created_at,
    }));

    const scheduled = scheduleByPriority(forScheduler, config);
    const updates: { id: string; due_date: string | null }[] = [];
    for (const d of demands as any[]) {
      if (d.status === "concluido") continue;
      const next = scheduled[d.id];
      if (next && next !== d.due_date) {
        updates.push({ id: d.id, due_date: next });
      }
    }

    if (updates.length === 0) return;

    running.current = true;
    batchFn({ data: { updates } })
      .then(() => qc.invalidateQueries({ queryKey: ["demands"] }))
      .catch((e) => console.error("Auto-scheduling error:", e))
      .finally(() => {
        running.current = false;
      });
  }, [demands, batchFn, qc]);
}
