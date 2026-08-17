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
  created_at?: string;
  created_by_user_id?: string | null;
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
});

export const listMeetings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      clientId: z.string().uuid().optional().nullable(),
      search: z.string().optional().nullable(),
    }).optional().parse(input ?? {})
  )
  .handler(async ({ data, context }) => {
    let query = (context.supabase as any)
      .from("demands")
      .select("id, client_id, title, due_date, estimated_hours, internal_notes, created_at, created_by_user_id, clients(id, name)")
      .ilike("internal_notes", "%\"is_meeting\":true%")
      .is("deleted_at", null)
      .order("due_date", { ascending: false });

    if (data?.clientId) {
      query = query.eq("client_id", data.clientId);
    }

    if (data?.search && data.search.trim() !== "") {
      query = query.ilike("title", `%${data.search.trim()}%`);
    }

    const { data: rows, error } = await query;
    if (error) {
      console.error("[listMeetings] Error fetching meetings:", error);
      return [];
    }

    const meetings: Meeting[] = (rows || []).map((row: any) => {
      let parsedPayload: any = {};
      try {
        if (row.internal_notes) {
          parsedPayload = JSON.parse(row.internal_notes);
        }
      } catch {}

      return {
        id: row.id,
        client_id: row.client_id,
        title: row.title,
        due_date: row.due_date,
        estimated_hours: row.estimated_hours ? Number(row.estimated_hours) : 1.0,
        notes: parsedPayload.notes || "",
        audio_url: parsedPayload.audio_url || null,
        ai_summary: parsedPayload.ai_summary || null,
        created_at: row.created_at,
        created_by_user_id: row.created_by_user_id,
        clients: row.clients ? { id: row.clients.id, name: row.clients.name } : null,
      };
    });

    return meetings;
  });

export const upsertMeeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => meetingSchema.parse(data))
  .handler(async ({ data, context }) => {
    // If client_id is missing, fallback to system general client or first available client
    let targetClientId = data.client_id;
    if (!targetClientId) {
      const { data: defaultClient } = await (context.supabase as any)
        .from("clients")
        .select("id")
        .limit(1)
        .maybeSingle();
      targetClientId = defaultClient?.id;
    }

    if (!targetClientId) {
      throw new Error("Nenhum cliente cadastrado no sistema para vincular a reunião.");
    }

    const meetingPayload = {
      is_meeting: true,
      notes: data.notes || "",
      audio_url: data.audio_url || null,
      ai_summary: data.ai_summary || null,
    };

    const rowData: any = {
      title: data.title,
      client_id: targetClientId,
      due_date: data.due_date,
      estimated_hours: data.estimated_hours,
      internal_notes: JSON.stringify(meetingPayload),
      status: "nao_iniciado",
      priority: "medium",
      estimated_credits: 0,
      is_manually_scheduled: true,
      created_by_user_id: context.userId,
    };

    if (data.id) {
      const { data: updated, error } = await (context.supabase as any)
        .from("demands")
        .update(rowData)
        .eq("id", data.id)
        .select()
        .single();
      if (error) throw new Error(`Erro ao atualizar reunião: ${error.message}`);
      return { success: true, id: updated.id };
    } else {
      const { data: created, error } = await (context.supabase as any)
        .from("demands")
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
    const { error } = await (context.supabase as any)
      .from("demands")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(`Erro ao excluir reunião: ${error.message}`);
    return { success: true };
  });
