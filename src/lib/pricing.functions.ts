import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const creditTierSchema = z.object({
  type: z.enum(["up_to", "above"]).default("up_to"),
  hours_limit: z.number().positive(),
  credits_rate: z.number().nonnegative(),
});

const pricingSchema = z.object({
  base_hourly_rate: z.number().nonnegative().default(80),
  tiers: z.array(z.object({
    type: z.enum(["up_to", "above"]).default("up_to"),
    hours_limit: z.number().positive(),
    hourly_rate: z.number().nonnegative(),
  })).default([]),
  credit_tiers: z.array(creditTierSchema).optional().default([]),
});

export type PricingSettings = z.infer<typeof pricingSchema>;

export const DEFAULT_CREDIT_HOUR_TIERS = [
  { type: "up_to", hours_limit: 1, credits_rate: 2 },
  { type: "up_to", hours_limit: 2, credits_rate: 1.5 },
  { type: "above", hours_limit: 3, credits_rate: 1 },
];

export function calculateCreditsFromPricing(estimatedHours: number, creditTiers?: any[]): number {
  if (!estimatedHours || estimatedHours <= 0) return 0;
  
  const tiers = (creditTiers && creditTiers.length > 0) ? creditTiers : DEFAULT_CREDIT_HOUR_TIERS;

  const upToTiers = tiers.filter((t: any) => t.type === "up_to" || !t.type)
    .sort((a: any, b: any) => a.hours_limit - b.hours_limit);
    
  const aboveTiers = tiers.filter((t: any) => t.type === "above")
    .sort((a: any, b: any) => b.hours_limit - a.hours_limit);

  let rate = 2;

  const matchingUpTo = upToTiers.find((t: any) => estimatedHours <= t.hours_limit);
  if (matchingUpTo) {
    rate = matchingUpTo.credits_rate;
  } else {
    const matchingAbove = aboveTiers.find((t: any) => estimatedHours > t.hours_limit);
    if (matchingAbove) {
      rate = matchingAbove.credits_rate;
    }
  }

  return Math.max(1, Math.ceil(estimatedHours * rate));
}

// Get pricing settings from system_settings
export const getPricingSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
      const { data, error } = await context.supabase
        .from("system_settings")
        .select("value")
        .eq("key", "pricing_settings")
        .maybeSingle();

      if (error) throw error;
      if (!data?.value) {
        return {
          base_hourly_rate: 80,
          tiers: [
            { type: "up_to", hours_limit: 1, hourly_rate: 80 },
            { type: "up_to", hours_limit: 2, hourly_rate: 60 },
            { type: "up_to", hours_limit: 4, hourly_rate: 40 },
          ],
          credit_tiers: DEFAULT_CREDIT_HOUR_TIERS,
        } as PricingSettings;
      }

      const val = data.value as any;
      if (!val.credit_tiers || val.credit_tiers.length === 0) {
        val.credit_tiers = DEFAULT_CREDIT_HOUR_TIERS;
      }

      return val as PricingSettings;
    } catch (e) {
      console.error("getPricingSettings error:", e);
      return {
        base_hourly_rate: 80,
        tiers: [
          { type: "up_to", hours_limit: 1, hourly_rate: 80 },
          { type: "up_to", hours_limit: 2, hourly_rate: 60 },
          { type: "up_to", hours_limit: 4, hourly_rate: 40 },
        ],
        credit_tiers: DEFAULT_CREDIT_HOUR_TIERS,
      } as PricingSettings;
    }
  });

// Save pricing settings to system_settings
export const savePricingSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(pricingSchema)
  .handler(async ({ data, context }) => {
    try {
      const { error } = await context.supabase
        .from("system_settings")
        .upsert({
          key: "pricing_settings",
          value: data,
        });

      if (error) throw error;
      return { success: true };
    } catch (e: any) {
      console.error("savePricingSettings error:", e);
      return { success: false, error: e.message || "Erro ao salvar precificação." };
    }
  });
