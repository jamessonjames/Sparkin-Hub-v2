import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { createDemand, updateDemand } from "./demands.functions";

export type DemandSuggestionStatus = "pending" | "approved" | "dismissed";
export type SuggestionSource = "whatsapp" | "meeting" | "email";
export type SuggestedType = "NOVA_DEMANDA" | "AJUSTE_DEMANDA";

export interface DemandSuggestion {
  id: string;
  client_id: string;
  source: SuggestionSource;
  suggested_type: SuggestedType;
  target_demand_id?: string | null;
  suggested_title: string;
  suggested_description?: string | null;
  ai_summary?: string | null;
  raw_content?: string | null;
  audio_url?: string | null;
  estimated_hours?: number | null;
  status: DemandSuggestionStatus;
  created_at: string;
  updated_at: string;
  clients?: {
    id: string;
    name: string;
  } | null;
}

export interface CaptureSettings {
  id?: string;
  key?: string;
  scan_frequency: "manual" | "30m" | "1h" | "3h" | "daily";
  max_messages: number;
  ai_provider: "gemini" | "deepseek" | "ollama";
  api_key?: string | null;
  ollama_url?: string | null;
  enabled_clients: string[];
  last_scan_at?: string | null;
}

export const listSuggestions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        status: z.enum(["pending", "approved", "dismissed"]).optional().default("pending"),
        clientId: z.string().uuid().optional(),
      })
      .optional()
      .parse(input ?? {})
  )
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("demand_suggestions")
      .select("*, clients(id, name)")
      .order("created_at", { ascending: false });

    if (data?.status) {
      query = query.eq("status", data.status);
    }
    if (data?.clientId) {
      query = query.eq("client_id", data.clientId);
    }

    const { data: suggestions, error } = await query;
    if (error) throw new Error(error.message);
    return (suggestions ?? []) as DemandSuggestion[];
  });

export const createSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        client_id: z.string().uuid(),
        source: z.enum(["whatsapp", "meeting", "email"]).default("whatsapp"),
        suggested_type: z.enum(["NOVA_DEMANDA", "AJUSTE_DEMANDA"]).default("NOVA_DEMANDA"),
        target_demand_id: z.string().uuid().optional().nullable(),
        suggested_title: z.string().min(1),
        suggested_description: z.string().optional().nullable(),
        ai_summary: z.string().optional().nullable(),
        raw_content: z.string().optional().nullable(),
        audio_url: z.string().optional().nullable(),
        estimated_hours: z.number().optional().default(1.0),
      })
      .parse(input)
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("demand_suggestions")
      .insert({
        client_id: data.client_id,
        source: data.source,
        suggested_type: data.suggested_type,
        target_demand_id: data.target_demand_id || null,
        suggested_title: data.suggested_title,
        suggested_description: data.suggested_description || null,
        ai_summary: data.ai_summary || null,
        raw_content: data.raw_content || null,
        audio_url: data.audio_url || null,
        estimated_hours: data.estimated_hours ?? 1.0,
        status: "pending",
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return row as DemandSuggestion;
  });

export const approveSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        title: z.string().optional(),
        description: z.string().optional(),
        estimated_hours: z.number().optional(),
        assignee_user_id: z.string().uuid().optional().nullable(),
      })
      .parse(input)
  )
  .handler(async ({ data, context }) => {
    // 1. Fetch suggestion
    const { data: suggestion, error: fetchErr } = await context.supabase
      .from("demand_suggestions")
      .select("*")
      .eq("id", data.id)
      .single();

    if (fetchErr || !suggestion) throw new Error("Sugestão não encontrada");

    const finalTitle = data.title || suggestion.suggested_title;
    const finalDesc = data.description || suggestion.suggested_description || "";
    const finalHours = data.estimated_hours ?? Number(suggestion.estimated_hours || 1.0);

    if (suggestion.suggested_type === "AJUSTE_DEMANDA" && suggestion.target_demand_id) {
      // Move existing target demand to "com_ajustes" and append notes
      const { data: targetDemand } = await context.supabase
        .from("demands")
        .select("id, status, description, internal_notes")
        .eq("id", suggestion.target_demand_id)
        .single();

      if (targetDemand) {
        const updatedNotes = `${targetDemand.internal_notes ? targetDemand.internal_notes + "\n\n" : ""}[Ajuste do WhatsApp/E-mail em ${new Date().toLocaleDateString("pt-BR")}]: ${finalDesc}`;
        
        await context.supabase
          .from("demands")
          .update({
            status: "com_ajustes",
            internal_notes: updatedNotes,
            is_manually_scheduled: false,
          })
          .eq("id", targetDemand.id);
      }
    } else {
      // Create new demand
      await context.supabase.from("demands").insert({
        client_id: suggestion.client_id,
        title: finalTitle,
        description: finalDesc,
        status: "nao_iniciado",
        priority: "medium",
        estimated_hours: finalHours,
        assignee_user_id: data.assignee_user_id || null,
        created_by_user_id: context.userId,
      });
    }

    // Mark suggestion as approved
    const { error: updateErr } = await context.supabase
      .from("demand_suggestions")
      .update({ status: "approved", updated_at: new Date().toISOString() })
      .eq("id", data.id);

    if (updateErr) throw new Error(updateErr.message);
    return { ok: true };
  });

export const dismissSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("demand_suggestions")
      .update({ status: "dismissed", updated_at: new Date().toISOString() })
      .eq("id", data.id);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getCaptureSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: row } = await context.supabase
      .from("capture_settings")
      .select("*")
      .eq("key", "global")
      .maybeSingle();

    if (!row) {
      const defaultSettings: CaptureSettings = {
        scan_frequency: "1h",
        max_messages: 30,
        ai_provider: "gemini",
        enabled_clients: [],
      };
      return defaultSettings;
    }

    return {
      ...row,
      enabled_clients: Array.isArray(row.enabled_clients) ? row.enabled_clients : [],
    } as CaptureSettings;
  });

export const updateCaptureSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        scan_frequency: z.enum(["manual", "30m", "1h", "3h", "daily"]).default("1h"),
        max_messages: z.number().int().min(5).max(100).default(30),
        ai_provider: z.enum(["gemini", "deepseek", "ollama"]).default("gemini"),
        api_key: z.string().optional().nullable(),
        ollama_url: z.string().optional().nullable(),
        enabled_clients: z.array(z.string()).default([]),
      })
      .parse(input)
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("capture_settings").upsert(
      {
        key: "global",
        scan_frequency: data.scan_frequency,
        max_messages: data.max_messages,
        ai_provider: data.ai_provider,
        api_key: data.api_key || null,
        ollama_url: data.ollama_url || null,
        enabled_clients: data.enabled_clients,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );

    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const triggerWhatsAppScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const nowISO = new Date().toISOString();
    await context.supabase.from("capture_settings").upsert(
      {
        key: "global",
        last_scan_at: nowISO,
        updated_at: nowISO,
      },
      { onConflict: "key" }
    );

    return { ok: true, timestamp: nowISO };
  });
