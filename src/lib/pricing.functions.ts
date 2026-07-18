import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const pricingSchema = z.object({
  base_hourly_rate: z.number().nonnegative().default(80),
  tiers: z.array(z.object({
    type: z.enum(["up_to", "above"]).default("up_to"),
    hours_limit: z.number().positive(),
    hourly_rate: z.number().nonnegative(),
  })).default([]),
});

export type PricingSettings = z.infer<typeof pricingSchema>;

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
        // Return default values
        return {
          base_hourly_rate: 80,
          tiers: [
            { type: "up_to", hours_limit: 1, hourly_rate: 80 },
            { type: "up_to", hours_limit: 2, hourly_rate: 60 },
            { type: "up_to", hours_limit: 4, hourly_rate: 40 },
          ],
        } as PricingSettings;
      }

      return data.value as PricingSettings;
    } catch (e) {
      console.error("getPricingSettings error:", e);
      return {
        base_hourly_rate: 80,
        tiers: [
          { type: "up_to", hours_limit: 1, hourly_rate: 80 },
          { type: "up_to", hours_limit: 2, hourly_rate: 60 },
          { type: "up_to", hours_limit: 4, hourly_rate: 40 },
        ],
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
