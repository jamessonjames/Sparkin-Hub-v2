import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { slugify } from "./slug";

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  contact_name: z.string().optional().nullable(),
  email: z.string().email().optional().or(z.literal("")).nullable(),
  phone: z.string().optional().nullable(),
  billing_model: z.enum(["fixed", "credits", "seasonal"]).default("fixed"),
  fixed_type: z.enum(["monthly", "one_off"]).optional().nullable(),
  monthly_value: z.number().optional().nullable(),
  commercial_notes: z.string().optional().nullable(),
  internal_notes: z.string().optional().nullable(),
  credits_enabled: z.boolean().default(false),
  access_active: z.boolean().default(true),
});

export const listClients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roleRow } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .maybeSingle();
      
    const role = roleRow?.role ?? "collaborator";

    if (role === "collaborator") {
      const { data: assignedDemands, error: demandError } = await context.supabase
        .from("demands")
        .select("client_id")
        .eq("assignee_user_id", context.userId)
        .is("deleted_at", null);
        
      if (demandError) throw new Error(demandError.message);
      
      const clientIds = Array.from(new Set((assignedDemands ?? []).map(d => d.client_id)));
      if (clientIds.length === 0) return [];
      
      const { data, error } = await context.supabase
        .from("clients")
        .select("id, name, contact_name, email, phone, billing_model, fixed_type, monthly_value, credits_enabled, access_active, slug, updated_at")
        .in("id", clientIds)
        .is("deleted_at", null)
        .order("name", { ascending: true });
        
      if (error) throw new Error(error.message);
      return data ?? [];
    }

    const { data, error } = await context.supabase
      .from("clients")
      .select("id, name, contact_name, email, phone, billing_model, fixed_type, monthly_value, credits_enabled, access_active, slug, updated_at")
      .is("deleted_at", null)
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getClient = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: roleRow } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .maybeSingle();
      
    const role = roleRow?.role ?? "collaborator";
    
    if (role === "collaborator") {
      const { data: assignedDemands, error: countError } = await context.supabase
        .from("demands")
        .select("id")
        .eq("client_id", data.id)
        .eq("assignee_user_id", context.userId)
        .is("deleted_at", null);
        
      if (countError) throw new Error(countError.message);
      if (!assignedDemands || assignedDemands.length === 0) {
        throw new Error("Você não tem acesso a este cliente.");
      }
    }

    const { data: client, error } = await context.supabase
      .from("clients")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!client) throw new Error("Cliente não encontrado");
    return client;
  });

export const createClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => upsertSchema.parse(input))
  .handler(async ({ data, context }) => {
    const baseSlug = slugify(data.name);
    let slug = baseSlug;
    // ensure uniqueness
    for (let i = 1; i < 20; i++) {
      const { data: exists } = await context.supabase
        .from("clients").select("id").eq("slug", slug).maybeSingle();
      if (!exists) break;
      slug = `${baseSlug}-${i}`;
    }
    const { data: row, error } = await context.supabase
      .from("clients")
      .insert({
        name: data.name,
        contact_name: data.contact_name || null,
        email: data.email || null,
        phone: data.phone || null,
        billing_model: data.billing_model,
        fixed_type: data.fixed_type || null,
        monthly_value: data.monthly_value ?? null,
        commercial_notes: data.commercial_notes || null,
        internal_notes: data.internal_notes || null,
        credits_enabled: data.credits_enabled,
        access_active: data.access_active,
        slug,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => upsertSchema.extend({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    const { error } = await context.supabase
      .from("clients")
      .update({
        name: rest.name,
        contact_name: rest.contact_name || null,
        email: rest.email || null,
        phone: rest.phone || null,
        billing_model: rest.billing_model,
        fixed_type: rest.fixed_type || null,
        monthly_value: rest.monthly_value ?? null,
        commercial_notes: rest.commercial_notes || null,
        internal_notes: rest.internal_notes || null,
        credits_enabled: rest.credits_enabled,
        access_active: rest.access_active,
      })
      .eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("clients")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setClientCreditsEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), credits_enabled: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("clients")
      .update({ credits_enabled: data.credits_enabled })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listClientEditions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { client_id: string }) => z.object({ client_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: editions, error } = await context.supabase
      .from("client_editions")
      .select("*")
      .eq("client_id", data.client_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return editions ?? [];
  });

export const createClientEdition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      client_id: z.string().uuid(),
      name: z.string().min(1),
      is_active: z.boolean().default(false),
      billing_month: z.number().min(1).max(12).optional().nullable(),
      billing_year: z.number().optional().nullable(),
      price: z.number().nonnegative().optional().nullable(),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    if (data.is_active) {
      await context.supabase
        .from("client_editions")
        .update({ is_active: false })
        .eq("client_id", data.client_id);
    }
    const { data: row, error } = await context.supabase
      .from("client_editions")
      .insert({
        client_id: data.client_id,
        name: data.name,
        is_active: data.is_active,
        billing_month: data.billing_month || null,
        billing_year: data.billing_year || null,
        price: data.price || null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateClientEdition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      id: z.string().uuid(),
      client_id: z.string().uuid(),
      name: z.string().min(1),
      is_active: z.boolean(),
      billing_month: z.number().min(1).max(12).optional().nullable(),
      billing_year: z.number().optional().nullable(),
      price: z.number().nonnegative().optional().nullable(),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    if (data.is_active) {
      await context.supabase
        .from("client_editions")
        .update({ is_active: false })
        .eq("client_id", data.client_id);
    }
    const { error } = await context.supabase
      .from("client_editions")
      .update({
        name: data.name,
        is_active: data.is_active,
        billing_month: data.billing_month || null,
        billing_year: data.billing_year || null,
        price: data.price || null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteClientEdition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("client_editions")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });