import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type ClientGem = {
  id: string;
  client_id: string;
  name: string;
  gem_url: string;
  created_at: string;
};

export const listClientGems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { client_id: string }) =>
    z.object({ client_id: z.string().uuid() }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { data: gems, error } = await context.supabase
      .from("client_gems")
      .select("*")
      .eq("client_id", data.client_id)
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message);
    return (gems as ClientGem[]) ?? [];
  });

export const createClientGem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { client_id: string; name: string; gem_url: string }) =>
    z
      .object({
        client_id: z.string().uuid(),
        name: z.string().min(1, "Nome é obrigatório"),
        gem_url: z.string().url("URL do Gem inválida"),
      })
      .parse(input)
  )
  .handler(async ({ data, context }) => {
    const { data: created, error } = await context.supabase
      .from("client_gems")
      .insert({
        client_id: data.client_id,
        name: data.name.trim(),
        gem_url: data.gem_url.trim(),
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return created as ClientGem;
  });

export const updateClientGem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; name: string; gem_url: string }) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().min(1, "Nome é obrigatório"),
        gem_url: z.string().url("URL do Gem inválida"),
      })
      .parse(input)
  )
  .handler(async ({ data, context }) => {
    const { data: updated, error } = await context.supabase
      .from("client_gems")
      .update({
        name: data.name.trim(),
        gem_url: data.gem_url.trim(),
      })
      .eq("id", data.id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return updated as ClientGem;
  });

export const deleteClientGem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) =>
    z.object({ id: z.string().uuid() }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("client_gems")
      .delete()
      .eq("id", data.id);

    if (error) throw new Error(error.message);
    return { success: true };
  });
