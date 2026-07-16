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
  billing_model: z.enum(["fixed", "credits"]).default("fixed"),
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
    const { data, error } = await context.supabase
      .from("clients")
      .select("id, name, contact_name, email, phone, billing_model, credits_enabled, access_active, slug, updated_at")
      .is("deleted_at", null)
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getClient = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
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