import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const creditTierSchema = z.object({
  type: z.enum(["up_to", "above"]).default("up_to"),
  hours_limit: z.number().positive(),
  credits_amount: z.number().positive().default(1),
  minutes_per_credit: z.number().positive().default(30),
});

const pricingSchema = z.object({
  base_hourly_rate: z.number().nonnegative().default(80),
  base_credit_minutes: z.number().positive().default(30),
  tiers: z.array(z.object({
    type: z.enum(["up_to", "above"]).default("up_to"),
    hours_limit: z.number().positive(),
    hourly_rate: z.number().nonnegative(),
  })).default([]),
  credit_tiers: z.array(creditTierSchema).optional().default([]),
});

export type PricingSettings = z.infer<typeof pricingSchema>;

export const DEFAULT_CREDIT_HOUR_TIERS = [
  { type: "up_to", hours_limit: 2, credits_amount: 1, minutes_per_credit: 30 },
  { type: "above", hours_limit: 2, credits_amount: 1, minutes_per_credit: 60 },
];

export function calculateCreditsFromPricing(estimatedHours: number, creditTiers?: any[], baseCreditMinutes: number = 30): number {
  if (!estimatedHours || estimatedHours <= 0) return 0;
  
  const totalMinutes = estimatedHours * 60;
  const tiers = (creditTiers && creditTiers.length > 0) ? creditTiers : DEFAULT_CREDIT_HOUR_TIERS;

  const upToTiers = tiers.filter((t: any) => t.type === "up_to" || !t.type)
    .sort((a: any, b: any) => a.hours_limit - b.hours_limit);
    
  const aboveTiers = tiers.filter((t: any) => t.type === "above")
    .sort((a: any, b: any) => b.hours_limit - a.hours_limit);

  let minutesPerCredit = baseCreditMinutes || 30;
  let creditsAmount = 1;

  const matchingUpTo = upToTiers.find((t: any) => estimatedHours <= t.hours_limit);
  if (matchingUpTo) {
    minutesPerCredit = matchingUpTo.minutes_per_credit || (matchingUpTo.credits_rate ? (60 / matchingUpTo.credits_rate) : 30);
    creditsAmount = matchingUpTo.credits_amount || 1;
  } else {
    const matchingAbove = aboveTiers.find((t: any) => estimatedHours > t.hours_limit);
    if (matchingAbove) {
      minutesPerCredit = matchingAbove.minutes_per_credit || (matchingAbove.credits_rate ? (60 / matchingAbove.credits_rate) : 60);
      creditsAmount = matchingAbove.credits_amount || 1;
    }
  }

  const effectiveMinsPerCredit = minutesPerCredit / creditsAmount;
  return Math.max(1, Math.ceil(totalMinutes / effectiveMinsPerCredit));
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
          base_credit_minutes: 30,
          tiers: [
            { type: "up_to", hours_limit: 1, hourly_rate: 80 },
            { type: "up_to", hours_limit: 2, hourly_rate: 60 },
            { type: "up_to", hours_limit: 4, hourly_rate: 40 },
          ],
          credit_tiers: DEFAULT_CREDIT_HOUR_TIERS,
        } as PricingSettings;
      }

      const val = data.value as any;
      if (val.base_credit_minutes === undefined) {
        val.base_credit_minutes = 30;
      }
      if (!val.credit_tiers || val.credit_tiers.length === 0) {
        val.credit_tiers = DEFAULT_CREDIT_HOUR_TIERS;
      }

      return val as PricingSettings;
    } catch (e) {
      console.error("getPricingSettings error:", e);
      return {
        base_hourly_rate: 80,
        base_credit_minutes: 30,
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
  .inputValidator((data: PricingSettings) => pricingSchema.parse(data))
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
