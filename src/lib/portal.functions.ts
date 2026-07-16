import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

function publicClient() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
          h.delete("Authorization");
        }
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

export const getPublicPortal = createServerFn({ method: "GET" })
  .inputValidator((input: { slug: string }) =>
    z.object({ slug: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data }) => {
    const sb = publicClient();
    const { data: client, error } = await sb
      .from("clients")
      .select("id, name, slug, contact_name, billing_model, credits_enabled")
      .eq("slug", data.slug)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!client) return null;

    const { data: demands, error: dErr } = await sb
      .from("demands")
      .select("id, title, status, priority, due_date, created_at, description, sort_order, estimated_credits")
      .eq("client_id", client.id)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (dErr) throw new Error(dErr.message);

    let creditConfig = null;
    if (client.billing_model === "credits") {
      // Load tiers from the config note (if exists)
      let tiers: any[] = [];
      const { data: noteRows } = await sb
        .from("notes")
        .select("content")
        .eq("client_id", client.id)
        .eq("title", "__credit_tiers_config__")
        .is("deleted_at", null)
        .limit(1);

      if (noteRows && noteRows.length > 0) {
        try {
          const parsed = JSON.parse(noteRows[0].content ?? "{}");
          if (parsed && Array.isArray(parsed)) {
            tiers = parsed;
          } else if (parsed?.tiers) {
            tiers = parsed.tiers;
          }
        } catch {}
      }

      // show_progress_bar is controlled by client.credits_enabled field
      creditConfig = {
        show_progress_bar: client.credits_enabled === true,
        tiers,
      };
    }

    return { client, demands: demands ?? [], creditConfig };
  });

export const getPortalDemandComments = createServerFn({ method: "GET" })
  .inputValidator((input: { slug: string; demand_id: string }) =>
    z.object({ slug: z.string().min(1), demand_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const sb = publicClient();
    // Verify demand belongs to this client slug
    const { data: demand } = await sb
      .from("demands")
      .select("id, clients!inner(slug)")
      .eq("id", data.demand_id)
      .maybeSingle();
    if (!demand) throw new Error("Demanda não encontrada");

    const { data: comments, error } = await sb
      .from("demand_comments")
      .select("id, body, author_type, author_label, created_at")
      .eq("demand_id", data.demand_id)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return comments ?? [];
  });

export const addPortalComment = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({
      slug: z.string().min(1),
      demand_id: z.string().uuid(),
      body: z.string().min(1),
      author_label: z.string().optional(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const sb = publicClient();
    const { error } = await sb.from("demand_comments").insert({
      demand_id: data.demand_id,
      body: data.body,
      author_type: "client",
      author_label: data.author_label ?? "Cliente",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const createPortalDemand = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({
      slug: z.string().min(1),
      title: z.string().min(1),
      description: z.string().optional().nullable(),
      priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const sb = publicClient();
    // Resolve client by slug
    const { data: client, error: cErr } = await sb
      .from("clients")
      .select("id")
      .eq("slug", data.slug)
      .maybeSingle();
    if (cErr || !client) throw new Error("Cliente não encontrado");

    const { data: row, error } = await sb
      .from("demands")
      .insert({
        client_id: client.id,
        title: data.title,
        description: data.description ?? null,
        status: "nao_iniciado",
        priority: data.priority,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updatePortalDemandsOrder = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({
      slug: z.string().min(1),
      updates: z.array(
        z.object({
          id: z.string().uuid(),
          status: z.string(),
          sort_order: z.number().int(),
        }),
      ),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const sb = publicClient();
    // Verify client slug
    const { data: client } = await sb
      .from("clients")
      .select("id")
      .eq("slug", data.slug)
      .maybeSingle();
    if (!client) throw new Error("Cliente não encontrado");

    // Block any move to "fazendo" or "para_analise"
    for (const u of data.updates) {
      if (u.status === "fazendo") throw new Error("O cliente não pode mover demandas para 'Fazendo'");
      if (u.status === "para_analise") throw new Error("O cliente não pode mover demandas para 'Para análise'");
    }

    const promises = data.updates.map(async (u) => {
      const { error } = await sb
        .from("demands")
        .update({ sort_order: u.sort_order, status: u.status as "com_ajustes" | "concluido" | "fazendo" | "nao_iniciado" | "para_analise" | "rascunho" })
        .eq("id", u.id)
        .eq("client_id", client.id);
      if (error) throw new Error(error.message);
    });
    await Promise.all(promises);
    return { ok: true };
  });

export const updatePortalDemand = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({
      slug: z.string().min(1),
      id: z.string().uuid(),
      title: z.string().min(1),
      description: z.string().optional().nullable(),
      status: z.string(),
      priority: z.enum(["low", "medium", "high", "urgent"]),
      due_date: z.string().optional().nullable(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const sb = publicClient();

    // Resolve client by slug and verify demand ownership
    const { data: client } = await sb
      .from("clients")
      .select("id")
      .eq("slug", data.slug)
      .maybeSingle();
    if (!client) throw new Error("Cliente não encontrado");

    // Block "fazendo" and "para_analise" statuses
    if (data.status === "fazendo") throw new Error("O cliente não pode definir o status como 'Fazendo'");
    if (data.status === "para_analise") throw new Error("O cliente não pode definir o status como 'Para análise'");

    const { error } = await sb
      .from("demands")
      .update({
        title: data.title,
        description: data.description ?? null,
        status: data.status as any,
        priority: data.priority,
        due_date: data.due_date ?? null,
      })
      .eq("id", data.id)
      .eq("client_id", client.id);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

