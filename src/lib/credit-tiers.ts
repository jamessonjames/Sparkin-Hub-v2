import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export interface CreditTier {
  min_credits: number;
  max_credits: number | null;
  price: number;
  extra_per_credit?: number | null;
}

export const DEFAULT_CREDIT_TIERS: CreditTier[] = [
  { min_credits: 0, max_credits: 16, price: 1000, extra_per_credit: null },
  { min_credits: 17, max_credits: 24, price: 1400, extra_per_credit: null },
  { min_credits: 25, max_credits: 32, price: 1800, extra_per_credit: null },
  { min_credits: 33, max_credits: 40, price: 2200, extra_per_credit: null },
  { min_credits: 41, max_credits: 48, price: 2400, extra_per_credit: null },
  { min_credits: 49, max_credits: null, price: 2400, extra_per_credit: 70 },
];

export interface CreditConfig {
  show_progress_bar: boolean;
  tiers: CreditTier[];
}

export const getClientCreditTiers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { client_id: string }) =>
    z.object({ client_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("notes")
      .select("id, content")
      .is("deleted_at", null)
      .eq("client_id", data.client_id)
      .eq("title", "__credit_tiers_config__")
      .limit(1);

    if (error) throw new Error(error.message);
    const defaultConfig: CreditConfig = { show_progress_bar: true, tiers: DEFAULT_CREDIT_TIERS };

    if (!rows || rows.length === 0) {
      return defaultConfig;
    }

    try {
      const parsed = JSON.parse(rows[0].content ?? "{}");
      if (parsed && Array.isArray(parsed)) {
        return { show_progress_bar: true, tiers: parsed } as CreditConfig;
      }
      return {
        show_progress_bar: parsed.show_progress_bar ?? true,
        tiers: parsed.tiers && Array.isArray(parsed.tiers) ? parsed.tiers : DEFAULT_CREDIT_TIERS
      } as CreditConfig;
    } catch {
      return defaultConfig;
    }
  });

export const saveClientCreditTiers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { client_id: string; tiers: CreditTier[]; show_progress_bar: boolean }) =>
    z
      .object({
        client_id: z.string().uuid(),
        show_progress_bar: z.boolean(),
        tiers: z.array(
          z.object({
            min_credits: z.number().int().nonnegative(),
            max_credits: z.number().int().nonnegative().nullable(),
            price: z.number().positive(),
            extra_per_credit: z.number().positive().nullable().optional(),
          })
        ),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // Check if the note already exists
    const { data: rows, error: selectError } = await context.supabase
      .from("notes")
      .select("id")
      .is("deleted_at", null)
      .eq("client_id", data.client_id)
      .eq("title", "__credit_tiers_config__")
      .limit(1);

    if (selectError) throw new Error(selectError.message);

    const serializedContent = JSON.stringify({
      show_progress_bar: data.show_progress_bar,
      tiers: data.tiers
    });

    if (rows && rows.length > 0) {
      // Update existing note
      const { error: updateError } = await context.supabase
        .from("notes")
        .update({ content: serializedContent })
        .eq("id", rows[0].id);

      if (updateError) throw new Error(updateError.message);
      return { id: rows[0].id };
    } else {
      // Insert new special note
      const { data: newRow, error: insertError } = await context.supabase
        .from("notes")
        .insert({
          client_id: data.client_id,
          title: "__credit_tiers_config__",
          content: serializedContent,
          note_type: "observacoes",
          visibility: "private",
          created_by_user_id: context.userId,
        })
        .select("id")
        .single();

      if (insertError) throw new Error(insertError.message);
      return newRow;
    }
  });

// Financial helper function
export function calculateTiersPrice(totalCredits: number, tiers: CreditTier[]): number {
  if (totalCredits <= 0) return 0;
  
  // Sort tiers by min_credits ascending
  const sorted = [...tiers].sort((a, b) => a.min_credits - b.min_credits);
  
  // Find if there's a tier where totalCredits falls within min and max
  for (const tier of sorted) {
    if (totalCredits >= tier.min_credits && (tier.max_credits === null || totalCredits <= tier.max_credits)) {
      if (tier.max_credits === null && tier.extra_per_credit) {
        // e.g. min_credits = 49, max_credits = null, price = 2400, extra = 70.
        // baseCredits to subtract is (min_credits - 1) = 48
        const baseCredits = tier.min_credits - 1;
        const extraCredits = Math.max(0, totalCredits - baseCredits);
        return Number(tier.price) + extraCredits * Number(tier.extra_per_credit);
      }
      return Number(tier.price);
    }
  }

  // Fallback to highest tier if it exceeds
  if (sorted.length > 0) {
    const highest = sorted[sorted.length - 1];
    if (highest.extra_per_credit) {
      const baseCredits = highest.min_credits - 1;
      const extraCredits = Math.max(0, totalCredits - baseCredits);
      return Number(highest.price) + extraCredits * Number(highest.extra_per_credit);
    }
    return Number(highest.price);
  }
  
  return 0;
}
