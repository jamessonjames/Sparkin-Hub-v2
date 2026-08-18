import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listDemands, batchUpdateDueDates } from "@/lib/demands.functions";
import { listMeetings } from "@/lib/meetings.functions";
import { useUserContext } from "@/contexts/user-context";
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
function isSameDate(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (a === b) return true;
  const timeA = new Date(a).getTime();
  const timeB = new Date(b).getTime();
  if (isNaN(timeA) || isNaN(timeB)) return a === b;
  return timeA === timeB;
}

export function useAutoScheduler() {
  const listFn = useServerFn(listDemands);
  const batchFn = useServerFn(batchUpdateDueDates);
  const listMeetingsFn = useServerFn(listMeetings);
  const qc = useQueryClient();
  const timeoutRef = useRef<any>(null);
  const runningRef = useRef(false);
  const pendingUpdatesRef = useRef<{ id: string; due_date: string | null }[] | null>(null);
  const { currentUser } = useUserContext();

  const { data: demands = [] } = useQuery({
    queryKey: ["demands"],
    queryFn: () => listFn(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: meetings = [] } = useQuery({
    queryKey: ["meetings", currentUser?.id],
    queryFn: () => listMeetingsFn({ data: currentUser?.id ? { assigneeUserId: currentUser.id } : {} }),
    enabled: !!currentUser?.id,
    staleTime: 60 * 1000,
  });

  useEffect(() => {
    if (!demands || demands.length === 0) return;

    // Only schedule demands assigned to the authenticated user.
    const myDemands = (demands as any[]).filter(
      (d) => !d.assignee_user_id || d.assignee_user_id === currentUser?.id
    );
    if (myDemands.length === 0) return;

    let config: SchedulingConfig = DEFAULT_CONFIG;
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("CreativeFlow_ScheduleConfig");
      if (saved) {
        try {
          config = JSON.parse(saved);
        } catch {}
      }
    }

    const active = myDemands.filter((d) => d.status === "nao_iniciado" || d.status === "fazendo" || d.status === "com_ajustes");
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

    const meetingBlocks = meetings.map((meeting) => ({
      id: `meeting-block:${meeting.id}`,
      title: meeting.title,
      priority: "urgent" as const,
      status: "nao_iniciado",
      due_date: meeting.due_date,
      estimated_hours: meeting.estimated_hours,
      created_at: meeting.created_at || meeting.due_date,
      is_manually_scheduled: true,
    }));
    const scheduled = scheduleByPriority(items as any, config, meetingBlocks);
    const updates: { id: string; due_date: string | null }[] = [];
    for (const d of active) {
      if (d.is_manually_scheduled && d.due_date) continue;
      if (d.status === "com_ajustes") continue; // Unpinned adjustments stay in day header pill

      const next = scheduled[d.id];
      if (next && !isSameDate(next, d.due_date)) {
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

    // Set new timeout to debounce the database save by 5 seconds
    timeoutRef.current = setTimeout(() => {
      const runSave = async () => {
        if (runningRef.current) {
          timeoutRef.current = setTimeout(runSave, 1000);
          return;
        }

        const currentUpdates = pendingUpdatesRef.current;
        if (!currentUpdates || currentUpdates.length === 0) return;

        runningRef.current = true;
        try {
          await batchFn({ data: { updates: currentUpdates } });
          
          // Update in-memory query cache to avoid triggering a full network refetch loop
          qc.setQueriesData({ queryKey: ["demands"] }, (oldData: any) => {
            if (!Array.isArray(oldData)) return oldData;
            const updateMap = new Map(currentUpdates.map((u) => [u.id, u.due_date]));
            return oldData.map((item) =>
              updateMap.has(item.id) ? { ...item, due_date: updateMap.get(item.id) } : item
            );
          });

          pendingUpdatesRef.current = null;
        } catch (e) {
          console.error("Auto-scheduling error:", e);
        } finally {
          runningRef.current = false;
        }
      };

      runSave();
    }, 5000);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [demands, meetings, batchFn, qc, currentUser?.id]);
}
