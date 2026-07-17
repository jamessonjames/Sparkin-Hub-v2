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
  const timeoutRef = useRef<any>(null);
  const runningRef = useRef(false);
  const pendingUpdatesRef = useRef<{ id: string; due_date: string | null }[] | null>(null);

  const { data: demands = [] } = useQuery({
    queryKey: ["demands"],
    queryFn: () => listFn(),
  });

  useEffect(() => {
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

    const active = (demands as any[]).filter((d) => d.status !== "concluido");
    if (active.length === 0) return;

    const items = active.map((d: any) => ({
      id: d.id,
      title: d.title,
      priority: d.priority as "low" | "medium" | "high" | "urgent",
      status: d.status,
      due_date: d.due_date,
      estimated_hours: d.estimated_hours ? Number(d.estimated_hours) : 1.0,
      created_at: d.created_at,
      is_manually_scheduled: !!d.is_manually_scheduled,
    }));

    const scheduled = scheduleByPriority(items as any, config);
    const updates: { id: string; due_date: string | null }[] = [];
    for (const d of active) {
      if (d.is_manually_scheduled && d.due_date) continue;

      const next = scheduled[d.id];
      if (next && next !== d.due_date) {
        updates.push({ id: d.id, due_date: next });
      }
    }

    if (updates.length === 0) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      return;
    }

    // Save the latest calculated updates
    pendingUpdatesRef.current = updates;

    // Clear previous timeout to debounce
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set new timeout to debounce the database save by 1 second
    timeoutRef.current = setTimeout(() => {
      const runSave = async () => {
        if (runningRef.current) {
          // If a save is already in progress, retry shortly
          timeoutRef.current = setTimeout(runSave, 500);
          return;
        }

        const currentUpdates = pendingUpdatesRef.current;
        if (!currentUpdates || currentUpdates.length === 0) return;

        runningRef.current = true;
        try {
          await batchFn({ data: { updates: currentUpdates } });
          
          // Update the local query cache directly to keep UI fast and avoid refetch flicker
          qc.setQueryData<any[]>(["demands"], (prev) => {
            if (!prev) return [];
            const updateMap = new Map(currentUpdates.map((u) => [u.id, u.due_date]));
            return prev.map((d) => {
              if (updateMap.has(d.id)) {
                return { ...d, due_date: updateMap.get(d.id) };
              }
              return d;
            });
          });

          pendingUpdatesRef.current = null;
        } catch (e) {
          console.error("Auto-scheduling error:", e);
        } finally {
          runningRef.current = false;
        }
      };

      runSave();
    }, 1000);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [demands, batchFn, qc]);
}
