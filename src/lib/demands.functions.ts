import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const DEMAND_STATUSES = [
  "rascunho",
  "nao_iniciado",
  "fazendo",
  "para_analise",
  "com_ajustes",
  "concluido",
] as const;
export type DemandStatus = (typeof DEMAND_STATUSES)[number];

export const KANBAN_STATUSES: DemandStatus[] = [
  "nao_iniciado",
  "fazendo",
  "para_analise",
  "com_ajustes",
  "concluido",
];

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  client_id: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  demand_type_id: z.string().uuid().optional().nullable(),
  status: z.enum(DEMAND_STATUSES).default("nao_iniciado"),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  due_date: z.string().optional().nullable(),
  estimated_credits: z.number().int().optional().nullable(),
  estimated_hours: z.number().optional().nullable(),
  internal_notes: z.string().optional().nullable(),
  assignee_user_id: z.string().uuid().optional().nullable(),
});

export const listDemands = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Select '*' to dynamically ignore columns that do not exist yet (like estimated_hours)
    const { data, error } = await context.supabase
      .from("demands")
      .select("*, clients(id, name)")
      .is("deleted_at", null)
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getDemand = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: d, error } = await context.supabase
      .from("demands")
      .select("*, clients(id, name)")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!d) throw new Error("Demanda não encontrada");
    return d;
  });

export const createDemand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => upsertSchema.parse(input))
  .handler(async ({ data, context }) => {
    const payload: any = {
      client_id: data.client_id,
      title: data.title,
      description: data.description || null,
      demand_type_id: data.demand_type_id || null,
      status: data.status,
      priority: data.priority,
      due_date: data.due_date || null,
      estimated_credits: data.estimated_credits ?? undefined,
      internal_notes: data.internal_notes || null,
      assignee_user_id: data.assignee_user_id || null,
      created_by_user_id: context.userId,
    };

    // Gracefully handle database schema transition where estimated_hours might not exist yet
    try {
      const { data: row, error } = await context.supabase
        .from("demands")
        .insert({ ...payload, estimated_hours: data.estimated_hours ?? 1.0 })
        .select("id")
        .single();
      
      if (error) {
        // If error mentions estimated_hours column, retry without it
        if (error.message.includes("estimated_hours") || error.code === "P0002" || error.message.includes("column")) {
          const { data: retryRow, error: retryError } = await context.supabase
            .from("demands")
            .insert(payload)
            .select("id")
            .single();
          if (retryError) throw new Error(retryError.message);
          return retryRow;
        }
        throw new Error(error.message);
      }
      return row;
    } catch (e) {
      const { data: retryRow, error: retryError } = await context.supabase
        .from("demands")
        .insert(payload)
        .select("id")
        .single();
      if (retryError) throw new Error(retryError.message);
      return retryRow;
    }
  });

export const updateDemand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => upsertSchema.extend({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    const payload: any = {
      client_id: rest.client_id,
      title: rest.title,
      description: rest.description || null,
      demand_type_id: rest.demand_type_id || null,
      status: rest.status,
      priority: rest.priority,
      due_date: rest.due_date || null,
      estimated_credits: rest.estimated_credits ?? undefined,
      internal_notes: rest.internal_notes || null,
      assignee_user_id: rest.assignee_user_id || null,
    };

    // Gracefully handle database schema transition where estimated_hours might not exist yet
    try {
      const { error } = await context.supabase
        .from("demands")
        .update({ ...payload, estimated_hours: rest.estimated_hours ?? 1.0 })
        .eq("id", id);
      
      if (error) {
        if (error.message.includes("estimated_hours") || error.code === "P0002" || error.message.includes("column")) {
          const { error: retryError } = await context.supabase
            .from("demands")
            .update(payload)
            .eq("id", id);
          if (retryError) throw new Error(retryError.message);
          return { ok: true };
        }
        throw new Error(error.message);
      }
      return { ok: true };
    } catch (e) {
      const { error: retryError } = await context.supabase
        .from("demands")
        .update(payload)
        .eq("id", id);
      if (retryError) throw new Error(retryError.message);
      return { ok: true };
    }
  });

export const moveDemandStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), status: z.enum(DEMAND_STATUSES) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("demands")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteDemand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("demands")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const batchUpdateDueDates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      updates: z.array(z.object({ id: z.string().uuid(), due_date: z.string().nullable() }))
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const promises = data.updates.map(async (u) => {
      const { error } = await context.supabase
        .from("demands")
        .update({ due_date: u.due_date })
        .eq("id", u.id);
      if (error) throw new Error(`Erro ao atualizar demanda ${u.id}: ${error.message}`);
    });
    await Promise.all(promises);
    return { ok: true };
  });