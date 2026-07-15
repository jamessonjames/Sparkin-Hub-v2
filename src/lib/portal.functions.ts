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
      .select("id, title, status, priority, due_date, created_at")
      .eq("client_id", client.id)
      .order("due_date", { ascending: true, nullsFirst: false });
    if (dErr) throw new Error(dErr.message);

    return { client, demands: demands ?? [] };
  });
