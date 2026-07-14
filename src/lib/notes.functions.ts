import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const NOTE_TYPES = ["reuniao", "briefing", "ideias", "copy", "planejamento", "observacoes"] as const;

export const listNotes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { client_id: string }) =>
    z.object({ client_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("notes")
      .select("id, title, content, note_type, visibility, client_id, updated_at, created_at")
      .is("deleted_at", null)
      .eq("client_id", data.client_id)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        client_id: z.string().uuid(),
        title: z.string().min(1),
        content: z.string().default(""),
        note_type: z.enum(NOTE_TYPES).default("observacoes"),
        visibility: z.enum(["private", "shared"]).default("private"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (data.id) {
      const { error } = await context.supabase
        .from("notes")
        .update({
          title: data.title,
          content: data.content,
          note_type: data.note_type,
          visibility: data.visibility,
        })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase
      .from("notes")
      .insert({
        client_id: data.client_id,
        title: data.title,
        content: data.content,
        note_type: data.note_type,
        visibility: data.visibility,
        created_by_user_id: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("notes")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });