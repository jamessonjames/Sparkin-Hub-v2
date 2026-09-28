import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DEFAULT_CONFIG, SchedulingConfig } from "@/utils/scheduler";

import { z } from "zod";

const scheduleConfigSchema = z.object({
  workingDays: z.array(z.number()),
  startHour: z.number().min(0).max(23),
  endHour: z.number().min(1).max(24),
  lunchStart: z.number().min(0).max(23),
  lunchEnd: z.number().min(0).max(24),
  timezone: z.string().default("America/Sao_Paulo"),
});

// Get scheduling config from system_settings
export const getScheduleConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
      const { data, error } = await context.supabase
        .from("system_settings")
        .select("value")
        .eq("key", "schedule_config")
        .maybeSingle();

      if (error) throw error;
      if (!data?.value) {
        return DEFAULT_CONFIG;
      }

      const val = data.value as any;
      return {
        workingDays: Array.isArray(val.workingDays) ? val.workingDays : DEFAULT_CONFIG.workingDays,
        startHour: typeof val.startHour === "number" ? val.startHour : DEFAULT_CONFIG.startHour,
        endHour: typeof val.endHour === "number" ? val.endHour : DEFAULT_CONFIG.endHour,
        lunchStart: typeof val.lunchStart === "number" ? val.lunchStart : DEFAULT_CONFIG.lunchStart,
        lunchEnd: typeof val.lunchEnd === "number" ? val.lunchEnd : DEFAULT_CONFIG.lunchEnd,
        timezone: typeof val.timezone === "string" ? val.timezone : DEFAULT_CONFIG.timezone,
      } as SchedulingConfig;
    } catch (e) {
      console.error("getScheduleConfig error:", e);
      return DEFAULT_CONFIG;
    }
  });

// Save scheduling config to system_settings
export const saveScheduleConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: SchedulingConfig) => scheduleConfigSchema.parse(data))
  .handler(async ({ data, context }) => {
    try {
      const { error } = await context.supabase
        .from("system_settings")
        .upsert({
          key: "schedule_config",
          value: data,
        });

      if (error) throw error;
      return { success: true };
    } catch (e: any) {
      console.error("saveScheduleConfig error:", e);
      return { success: false, error: e.message || "Erro ao salvar expediente." };
    }
  });
