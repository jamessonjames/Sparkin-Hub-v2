import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type LeadStatus = "novo" | "contato" | "proposta" | "ganho" | "perdido";

export type CrmLead = {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  status: LeadStatus;
  estimated_value: number | null;
  billing_model: string | null;
  internal_notes: string | null;
  client_color: string;
  source: string | null;
  created_at: string;
  updated_at: string;
};

const createLeadSchema = z.object({
  name: z.string().min(1),
  contact_name: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  estimated_value: z.number().optional().nullable(),
  billing_model: z.string().optional().nullable(),
  internal_notes: z.string().optional().nullable(),
  client_color: z.string().optional().default("#3b82f6"),
});

export const listLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("crm_leads")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as CrmLead[];
  });

export const createLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createLeadSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("crm_leads")
      .insert({
        name: data.name,
        contact_name: data.contact_name || null,
        email: data.email || null,
        phone: data.phone || null,
        estimated_value: data.estimated_value ?? null,
        billing_model: data.billing_model || "Pagamento Mensal Fixo",
        internal_notes: data.internal_notes || null,
        client_color: data.client_color,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row as CrmLead;
  });

export const updateLeadStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      id: z.string().uuid(),
      status: z.enum(["novo", "contato", "proposta", "ganho", "perdido"]),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("crm_leads")
      .update({ status: data.status })
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row as CrmLead;
  });

export const deleteLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("crm_leads")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const convertSchema = z.object({
  leadId: z.string().uuid(),
  billing_model: z.enum(["fixed", "credits", "seasonal"]),
  fixed_type: z.enum(["monthly", "one_off"]).optional().nullable(),
  monthly_value: z.number().optional().nullable(),
});

export const convertToClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => convertSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: lead, error: leadError } = await context.supabase
      .from("crm_leads")
      .select("*")
      .eq("id", data.leadId)
      .single();
    if (leadError) throw new Error(leadError.message);

    const { slugify } = await import("./slug");
    const baseSlug = slugify(lead.name);
    let slug = baseSlug;
    for (let i = 1; i < 20; i++) {
      const { data: exists } = await context.supabase
        .from("clients").select("id").eq("slug", slug).maybeSingle();
      if (!exists) break;
      slug = `${baseSlug}-${i}`;
    }

    const billingModelMap: Record<string, "fixed" | "credits" | "seasonal"> = {
      fixed: "fixed",
      credits: "credits",
      seasonal: "seasonal",
    };

    const { data: client, error: clientError } = await context.supabase
      .from("clients")
      .insert({
        name: lead.name,
        contact_name: lead.contact_name,
        email: lead.email,
        phone: lead.phone,
        internal_notes: lead.internal_notes,
        color: lead.client_color || "#3b82f6",
        billing_model: billingModelMap[data.billing_model] || "fixed",
        fixed_type: data.fixed_type || (data.billing_model === "fixed" ? "monthly" : null),
        monthly_value: data.monthly_value ?? null,
        slug,
      })
      .select("id")
      .single();
    if (clientError) throw new Error(clientError.message);

    const { error: updateError } = await context.supabase
      .from("crm_leads")
      .update({ status: "ganho" })
      .eq("id", data.leadId);
    if (updateError) throw new Error(updateError.message);

    return { clientId: client.id };
  });

export const updateLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      id: z.string().uuid(),
      name: z.string().min(1),
      contact_name: z.string().optional().nullable(),
      email: z.string().optional().nullable(),
      phone: z.string().optional().nullable(),
      estimated_value: z.number().optional().nullable(),
      billing_model: z.string().optional().nullable(),
      internal_notes: z.string().optional().nullable(),
      client_color: z.string().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    const { data: row, error } = await context.supabase
      .from("crm_leads")
      .update({
        name: rest.name,
        contact_name: rest.contact_name || null,
        email: rest.email || null,
        phone: rest.phone || null,
        estimated_value: rest.estimated_value ?? null,
        billing_model: rest.billing_model || "Pagamento Mensal Fixo",
        internal_notes: rest.internal_notes || null,
        client_color: rest.client_color || "#3b82f6",
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row as CrmLead;
  });
