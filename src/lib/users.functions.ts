import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listProfiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id, name, email, avatar_url, highlight_color, custom_hex, sidebar_order")
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listUsersWithRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Query profiles using admin client to bypass RLS
    const { data: profiles, error: pe } = await supabaseAdmin
      .from("profiles")
      .select("id, name, email, avatar_url")
      .order("name", { ascending: true });
    if (pe) throw new Error(pe.message);

    // Query user roles using admin client to bypass RLS
    const { data: roles, error: re } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role");
    if (re) throw new Error(re.message);

    // Merge locally
    return (profiles ?? []).map((p: any) => {
      const roleRow = (roles ?? []).find((r: any) => r.user_id === p.id);
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
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Delete any existing role for this user, then insert the new one.
    // This avoids conflicts with the UNIQUE(user_id, role) constraint.
    const { error: delError } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.userId);
    if (delError) throw new Error(delError.message);

    const { error: insError } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.userId, role: data.role });
    if (insError) throw new Error(insError.message);

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
    
    // Create the user in Auth — the DB trigger handle_new_user will automatically
    // insert the profile and user_roles row, using the role from user_metadata.
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: {
        name: data.name,
        role: data.role,
      }
    });
    
    if (authError) throw new Error(authError.message);
    if (!authUser.user) throw new Error("Não foi possível criar o usuário.");

    return { ok: true, userId: authUser.user.id };
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

export const saveUserPreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      highlight_color: z.string().optional(),
      custom_hex: z.string().optional(),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const updates: any = {};
    if (data.highlight_color) updates.highlight_color = data.highlight_color;
    if (data.custom_hex) updates.custom_hex = data.custom_hex;

    const { error } = await context.supabase
      .from("profiles")
      .update(updates)
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getUserPreferences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("highlight_color, custom_hex, sidebar_order")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return {
      highlight_color: data?.highlight_color ?? "roxo",
      custom_hex: data?.custom_hex ?? "#4f46e5",
      sidebar_order: (data?.sidebar_order as string[] | null) ?? null,
    };
  });

export const saveSidebarOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      order: z.array(z.string()),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({ sidebar_order: data.order })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
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

// Server functions to get and save global system branding (system name & favicon) across devices
export const getSystemBranding = createServerFn({ method: "GET" })
  .handler(async ({ context }) => {
    try {
      const { data } = await (context.supabase as any)
        .from("system_settings")
        .select("value")
        .eq("key", "system_branding")
        .maybeSingle();

      const val = data?.value as any;
      return {
        system_name: val?.system_name || "Sparkin Hub",
        favicon_url: val?.favicon_url || "",
      };
    } catch (e) {
      return { system_name: "Sparkin Hub", favicon_url: "" };
    }
  });

export const saveSystemBranding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({
    system_name: z.string().min(1),
    favicon_url: z.string().optional().nullable(),
  }))
  .handler(async ({ data: { system_name, favicon_url }, context }) => {
    try {
      const { error } = await context.supabase
        .from("system_settings")
        .upsert(
          {
            key: "system_branding",
            value: {
              system_name,
              favicon_url: favicon_url || "",
            },
          },
          { onConflict: "key" }
        );

      if (error) throw error;
      return { success: true };
    } catch (e: any) {
      console.error("saveSystemBranding error:", e);
      return { success: false, error: e.message || "Erro ao salvar no banco de dados." };
    }
  });
