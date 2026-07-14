import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listComments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { demand_id: string }) =>
    z.object({ demand_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("demand_comments")
      .select("id, body, author_type, author_user_id, author_label, created_at")
      .eq("demand_id", data.demand_id)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const addComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ demand_id: z.string().uuid(), body: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("demand_comments").insert({
      demand_id: data.demand_id,
      body: data.body,
      author_type: "team",
      author_user_id: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("demand_comments").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });