import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type Meeting = {
  id: string;
  client_id?: string | null;
  title: string;
  due_date: string; // ISO string: YYYY-MM-DDTHH:mm
  estimated_hours: number;
  notes?: string | null;
  audio_url?: string | null;
  ai_summary?: string | null;
  transcript?: string | null;
  created_at?: string;
  created_by_user_id?: string | null;
  assignee_user_id?: string | null;
  clients?: { id: string; name: string } | null;
};

const meetingSchema = z.object({
  id: z.string().uuid().optional(),
  client_id: z.string().uuid().optional().nullable(),
  title: z.string().min(1, "O título da reunião é obrigatório."),
  due_date: z.string().min(1, "A data e horário são obrigatórios."),
  estimated_hours: z.number().min(0.25).default(1.0),
  notes: z.string().optional().nullable(),
  audio_url: z.string().optional().nullable(),
  ai_summary: z.string().optional().nullable(),
  transcript: z.string().optional().nullable(),
  assignee_user_id: z.string().uuid().optional().nullable(),
});

export const listMeetings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      clientId: z.string().uuid().optional().nullable(),
      search: z.string().optional().nullable(),
      assigneeUserId: z.string().uuid().optional().nullable(),
    }).optional().parse(input ?? {})
  )
  .handler(async ({ data, context }) => {
    function buildQuery(includeDeletedFilter = true) {
      let q = (context.supabase as any)
        .from("meetings")
        .select("id, client_id, title, starts_at, duration_minutes, notes, transcript, audio_url, ai_summary, created_at, created_by_user_id, assignee_user_id, clients(id, name)")
        .order("starts_at", { ascending: false });

      if (data?.clientId) {
        q = q.eq("client_id", data.clientId);
      }
      if (data?.assigneeUserId) q = q.eq("assignee_user_id", data.assigneeUserId);

      if (data?.search && data.search.trim() !== "") {
        q = q.ilike("title", `%${data.search.trim()}%`);
      }

      if (includeDeletedFilter) {
        q = q.is("deleted_at", null);
      }
      return q;
    }

    let rows: any[] | null = null;
    const { data: nonDeletedRows, error } = await buildQuery(true);
    if (error) {
      if (error.message?.includes("deleted_at") || error.code === "42703") {
        const { data: fallbackRows, error: fallbackError } = await buildQuery(false);
        if (fallbackError) {
          console.error("[listMeetings] Error fetching meetings fallback:", fallbackError);
          return [];
        }
        rows = fallbackRows;
      } else {
        console.error("[listMeetings] Error fetching meetings:", error);
        return [];
      }
    } else {
      rows = nonDeletedRows;
    }

    const meetings: Meeting[] = (rows || []).map((row: any) => {
      return {
        id: row.id,
        client_id: row.client_id,
        title: row.title,
        due_date: row.starts_at,
        estimated_hours: Number(row.duration_minutes || 60) / 60,
        notes: row.notes || "",
        transcript: row.transcript || "",
        audio_url: row.audio_url || null,
        ai_summary: row.ai_summary || null,
        created_at: row.created_at,
        created_by_user_id: row.created_by_user_id,
        assignee_user_id: row.assignee_user_id,
        clients: row.clients ? { id: row.clients.id, name: row.clients.name } : null,
      };
    });

    return meetings;
  });

export const upsertMeeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => meetingSchema.parse(data))
  .handler(async ({ data, context }) => {
    const assigneeUserId = data.assignee_user_id || context.userId;
    const startsAt = new Date(data.due_date);
    const endsAt = new Date(startsAt.getTime() + data.estimated_hours * 60 * 60 * 1000);

    const [{ data: otherMeetings }, { data: assignedDemands }] = await Promise.all([
      (context.supabase as any)
        .from("meetings")
        .select("id, title, starts_at, duration_minutes")
        .eq("assignee_user_id", assigneeUserId)
        .neq("id", data.id || "00000000-0000-0000-0000-000000000000"),
      (context.supabase as any)
        .from("demands")
        .select("id, title, due_date, estimated_hours")
        .eq("assignee_user_id", assigneeUserId)
        .is("deleted_at", null)
        .in("status", ["nao_iniciado", "fazendo", "com_ajustes"])
        .not("due_date", "is", null),
    ]);

    const overlaps = (start: Date, end: Date) => startsAt < end && endsAt > start;
    const meetingConflict = (otherMeetings || []).find((item: any) => {
      const start = new Date(item.starts_at);
      return overlaps(start, new Date(start.getTime() + Number(item.duration_minutes || 60) * 60_000));
    });
    const demandConflict = (assignedDemands || []).find((item: any) => {
      const start = new Date(item.due_date);
      return overlaps(start, new Date(start.getTime() + Number(item.estimated_hours || 1) * 3_600_000));
    });
    if (meetingConflict || demandConflict) {
      throw new Error(`Horário ocupado por “${(meetingConflict || demandConflict).title}”. Escolha um intervalo livre.`);
    }

    const rowData: any = {
      title: data.title,
      client_id: data.client_id || null,
      starts_at: startsAt.toISOString(),
      duration_minutes: Math.round(data.estimated_hours * 60),
      created_by_user_id: context.userId,
      assignee_user_id: assigneeUserId,
    };
    if (data.notes !== undefined) rowData.notes = data.notes || "";
    if (data.transcript !== undefined) rowData.transcript = data.transcript || "";
    if (data.audio_url !== undefined) rowData.audio_url = data.audio_url || null;
    if (data.ai_summary !== undefined) rowData.ai_summary = data.ai_summary || "";

    if (data.id) {
      const { data: updated, error } = await (context.supabase as any)
        .from("meetings")
        .update(rowData)
        .eq("id", data.id)
        .select()
        .single();
      if (error) throw new Error(`Erro ao atualizar reunião: ${error.message}`);
      return { success: true, id: updated.id };
    } else {
      const { data: created, error } = await (context.supabase as any)
        .from("meetings")
        .insert([rowData])
        .select()
        .single();
      if (error) throw new Error(`Erro ao criar reunião: ${error.message}`);
      return { success: true, id: created.id };
    }
  });

export const deleteMeeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    // Try soft-deleting first
    const { error: softErr } = await (context.supabase as any)
      .from("meetings")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", data.id);

    if (softErr) {
      if (softErr.message?.includes("deleted_at") || softErr.code === "42703") {
        // Fallback to hard delete if deleted_at column is not yet present in DB
        const { error: hardErr } = await (context.supabase as any)
          .from("meetings")
          .delete()
          .eq("id", data.id);
        if (hardErr) throw new Error(`Erro ao excluir reunião: ${hardErr.message}`);
      } else {
        throw new Error(`Erro ao excluir reunião: ${softErr.message}`);
      }
    }
    return { success: true };
  });
