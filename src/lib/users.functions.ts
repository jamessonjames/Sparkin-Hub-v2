import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listProfiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("id, name, email, avatar_url")
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listUsersWithRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select(`
        id,
        name,
        email,
        avatar_url,
        user_roles (
          id,
          role
        )
      `)
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const updateUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      userId: z.string().uuid(),
      role: z.enum(["owner", "admin", "collaborator"]),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    // 1. Check if role entry exists
    const { data: existing } = await context.supabase
      .from("user_roles")
      .select("id")
      .eq("user_id", data.userId)
      .maybeSingle();

    if (existing) {
      const { error } = await context.supabase
        .from("user_roles")
        .update({ role: data.role })
        .eq("user_id", data.userId);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase
        .from("user_roles")
        .insert({ user_id: data.userId, role: data.role });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
