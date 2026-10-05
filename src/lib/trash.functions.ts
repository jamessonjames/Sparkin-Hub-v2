import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type TrashCategory = "demands" | "clients" | "notes" | "meetings";

export interface TrashItem {
  id: string;
  category: TrashCategory;
  title: string;
  subtitle?: string | null;
  deleted_at: string;
  days_remaining: number;
  metadata?: Record<string, any>;
}

export interface TrashSummary {
  items: TrashItem[];
  counts: {
    demands: number;
    clients: number;
    notes: number;
    meetings: number;
    total: number;
  };
}

const RETENTION_DAYS = 30;

function calculateDaysRemaining(deletedAtIso: string): number {
  const deletedAtTime = new Date(deletedAtIso).getTime();
  const nowTime = Date.now();
  const diffDays = Math.floor((nowTime - deletedAtTime) / (1000 * 60 * 60 * 24));
  const remaining = RETENTION_DAYS - diffDays;
  return Math.max(0, remaining);
}

// ── List all items currently in the trash (and automatically purge items > 30 days) ──
export const listTrashItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TrashSummary> => {
    // 1. Role check: only admin and owner can access trash
    const { data: roleRow } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .maybeSingle();

    const role = roleRow?.role ?? "collaborator";
    if (role === "collaborator") {
      throw new Error("Acesso negado. Apenas administradores podem acessar a lixeira.");
    }

    const thirtyDaysAgoIso = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

    // 2. Auto-purge records deleted more than 30 days ago (fire-and-forget or background purge)
    try {
      await Promise.allSettled([
        context.supabase.from("demands").delete().lt("deleted_at", thirtyDaysAgoIso),
        context.supabase.from("notes").delete().lt("deleted_at", thirtyDaysAgoIso),
        context.supabase.from("clients").delete().lt("deleted_at", thirtyDaysAgoIso),
        (context.supabase as any).from("meetings").delete().lt("deleted_at", thirtyDaysAgoIso),
      ]);
    } catch (e) {
      console.warn("[listTrashItems] Error during auto-purge of expired trash items:", e);
    }

    // 3. Query active trash items across categories
    const [demandsRes, clientsRes, notesRes, meetingsRes] = await Promise.all([
      context.supabase
        .from("demands")
        .select("id, title, deleted_at, clients(name)")
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false }),

      context.supabase
        .from("clients")
        .select("id, name, deleted_at, is_project")
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false }),

      context.supabase
        .from("notes")
        .select("id, title, deleted_at, note_type, clients(name)")
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false }),

      (context.supabase as any)
        .from("meetings")
        .select("id, title, starts_at, deleted_at, clients(name)")
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false }),
    ]);

    const items: TrashItem[] = [];

    // Demands
    const demands = demandsRes.data || [];
    for (const d of demands) {
      if (!d.deleted_at) continue;
      items.push({
        id: d.id,
        category: "demands",
        title: d.title,
        subtitle: (d.clients as any)?.name ? `Cliente: ${(d.clients as any).name}` : "Demanda avulsa",
        deleted_at: d.deleted_at,
        days_remaining: calculateDaysRemaining(d.deleted_at),
      });
    }

    // Clients
    const clients = clientsRes.data || [];
    for (const c of clients) {
      if (!c.deleted_at) continue;
      items.push({
        id: c.id,
        category: "clients",
        title: c.name,
        subtitle: c.is_project ? "Projeto" : "Empresa / Cliente",
        deleted_at: c.deleted_at,
        days_remaining: calculateDaysRemaining(c.deleted_at),
      });
    }

    // Notes
    const notes = notesRes.data || [];
    for (const n of notes) {
      if (!n.deleted_at) continue;
      items.push({
        id: n.id,
        category: "notes",
        title: n.title,
        subtitle: (n.clients as any)?.name ? `Cliente: ${(n.clients as any).name}` : `Tipo: ${n.note_type}`,
        deleted_at: n.deleted_at,
        days_remaining: calculateDaysRemaining(n.deleted_at),
      });
    }

    // Meetings (ignoring error if meetings doesn't have deleted_at column yet)
    const meetings = meetingsRes.error ? [] : (meetingsRes.data || []);
    for (const m of meetings) {
      if (!m.deleted_at) continue;
      items.push({
        id: m.id,
        category: "meetings",
        title: m.title,
        subtitle: (m.clients as any)?.name ? `Cliente: ${(m.clients as any).name}` : "Reunião de equipe",
        deleted_at: m.deleted_at,
        days_remaining: calculateDaysRemaining(m.deleted_at),
      });
    }

    // Sort items by deleted_at descending (most recently deleted first)
    items.sort((a, b) => new Date(b.deleted_at).getTime() - new Date(a.deleted_at).getTime());

    const counts = {
      demands: demands.length,
      clients: clients.length,
      notes: notes.length,
      meetings: meetings.length,
      total: items.length,
    };

    return { items, counts };
  });

// ── Restore a single item from trash ──
export const restoreTrashItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      id: z.string().uuid(),
      category: z.enum(["demands", "clients", "notes", "meetings"]),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: roleRow } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .maybeSingle();

    const role = roleRow?.role ?? "collaborator";
    if (role === "collaborator") {
      throw new Error("Acesso negado. Apenas administradores podem restaurar itens da lixeira.");
    }

    const { error } = await (context.supabase as any)
      .from(data.category)
      .update({ deleted_at: null })
      .eq("id", data.id);

    if (error) {
      throw new Error(`Erro ao restaurar ${data.category}: ${error.message}`);
    }

    return { ok: true };
  });

// ── Permanently delete a single item from trash ──
export const permanentlyDeleteTrashItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      id: z.string().uuid(),
      category: z.enum(["demands", "clients", "notes", "meetings"]),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: roleRow } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .maybeSingle();

    const role = roleRow?.role ?? "collaborator";
    if (role === "collaborator") {
      throw new Error("Acesso negado. Apenas administradores podem excluir definitivamente itens.");
    }

    const { error } = await (context.supabase as any)
      .from(data.category)
      .delete()
      .eq("id", data.id);

    if (error) {
      throw new Error(`Erro ao excluir definitivamente: ${error.message}`);
    }

    return { ok: true };
  });

// ── Empty entire trash or a specific category ──
export const emptyTrash = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      category: z.enum(["all", "demands", "clients", "notes", "meetings"]).default("all"),
    }).parse(input ?? { category: "all" }),
  )
  .handler(async ({ data, context }) => {
    const { data: roleRow } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .maybeSingle();

    const role = roleRow?.role ?? "collaborator";
    if (role === "collaborator") {
      throw new Error("Acesso negado. Apenas administradores podem esvaziar a lixeira.");
    }

    const targets: ("demands" | "clients" | "notes" | "meetings")[] =
      data.category === "all"
        ? ["demands", "notes", "clients", "meetings"]
        : [data.category];

    for (const tbl of targets) {
      const { error } = await (context.supabase as any)
        .from(tbl)
        .delete()
        .not("deleted_at", "is", null);

      if (error && !error.message?.includes("deleted_at")) {
        console.error(`[emptyTrash] Erro ao limpar ${tbl}:`, error);
      }
    }

    return { ok: true };
  });
