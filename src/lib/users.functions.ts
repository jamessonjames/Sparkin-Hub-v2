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

export const createUserWithRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      email: z.string().email(),
      password: z.string().min(6),
      name: z.string().min(1),
      role: z.enum(["owner", "admin", "collaborator"]),
    }).parse(input)
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    
    // Create the user in Auth
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: {
        name: data.name,
      }
    });
    
    if (authError) throw new Error(authError.message);
    if (!authUser.user) throw new Error("Não foi possível criar o usuário.");

    const userId = authUser.user.id;

    // Set role
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, role: data.role });
      
    if (roleError) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw new Error(roleError.message);
    }

    // Upsert profile
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .upsert({ id: userId, name: data.name, email: data.email });
      
    if (profileError) {
      console.warn("Could not upsert profile:", profileError.message);
    }

    return { ok: true, userId };
  });

export const updateUserAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      userId: z.string().uuid(),
      name: z.string().min(1),
      email: z.string().email(),
      password: z.string().min(6).optional().nullable(),
    }).parse(input)
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    
    const updateData: any = {
      email: data.email,
      user_metadata: {
        name: data.name,
      }
    };
    if (data.password) {
      updateData.password = data.password;
    }

    // Update in Auth
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(data.userId, updateData);
    if (authError) throw new Error(authError.message);

    // Update profile
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({ name: data.name, email: data.email })
      .eq("id", data.userId);
      
    if (profileError) throw new Error(profileError.message);

    return { ok: true };
  });

export const deleteUserAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      userId: z.string().uuid(),
    }).parse(input)
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // First delete from Auth
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (authError) throw new Error(authError.message);

    return { ok: true };
  });
