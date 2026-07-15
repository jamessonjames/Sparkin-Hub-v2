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
    // Query profiles
    const { data: profiles, error: pe } = await context.supabase
      .from("profiles")
      .select("id, name, email, avatar_url")
      .order("name", { ascending: true });
    if (pe) throw new Error(pe.message);

    // Query user roles separately to avoid Postgrest relationship error
    const { data: roles, error: re } = await context.supabase
      .from("user_roles")
      .select("user_id, role");
    if (re) throw new Error(re.message);

    // Merge locally
    return (profiles ?? []).map((p) => {
      const roleRow = (roles ?? []).find((r) => r.user_id === p.id);
      return {
        ...p,
        user_roles: roleRow ? [{ id: roleRow.user_id, role: roleRow.role }] : [],
      };
    });
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
