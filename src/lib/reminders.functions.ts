import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const RECURRENCE_TYPES = ["none", "daily", "weekly", "monthly", "yearly"] as const;
export const REMINDER_COLORS = ["yellow", "blue", "green", "purple", "gray"] as const;

export const listReminders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { assigneeUserId?: string }) =>
    z.object({ assigneeUserId: z.string().uuid().optional() }).optional().parse(input),
  )
  .handler(async ({ data, context }) => {
    const targetUser = data?.assigneeUserId || context.userId;
    const { data: rows, error } = await context.supabase
      .from("agenda_reminders" as any)
      .select("*")
      .eq("user_id", targetUser)
      .order("date_time", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertReminder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        title: z.string().min(1),
        content: z.string().default(""),
        color: z.enum(REMINDER_COLORS).default("yellow"),
        date_time: z.string(),
        recurrence_type: z.enum(RECURRENCE_TYPES).default("none"),
        recurrence_interval: z.number().default(1),
        recurrence_end_date: z.string().nullable().optional(),
        is_completed: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (data.id) {
      const { error } = await context.supabase
        .from("agenda_reminders" as any)
        .update({
          title: data.title,
          content: data.content,
          color: data.color,
          date_time: data.date_time,
          recurrence_type: data.recurrence_type,
          recurrence_interval: data.recurrence_interval,
          recurrence_end_date: data.recurrence_end_date,
          is_completed: data.is_completed,
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", data.id)
        .eq("user_id", context.userId);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }

    const { data: row, error } = await context.supabase
      .from("agenda_reminders" as any)
      .insert({
        user_id: context.userId,
        title: data.title,
        content: data.content,
        color: data.color,
        date_time: data.date_time,
        recurrence_type: data.recurrence_type,
        recurrence_interval: data.recurrence_interval,
        recurrence_end_date: data.recurrence_end_date,
        is_completed: data.is_completed,
      } as any)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const completeReminder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: reminder, error: fetchErr } = await context.supabase
      .from("agenda_reminders" as any)
      .select("*")
      .eq("id", data.id)
      .single();
    if (fetchErr || !reminder) throw new Error("Reminder not found");

    if ((reminder as any).recurrence_type && (reminder as any).recurrence_type !== "none") {
      const dt = new Date((reminder as any).date_time);
      const interval = (reminder as any).recurrence_interval || 1;

      if ((reminder as any).recurrence_type === "daily") {
        dt.setDate(dt.getDate() + interval);
      } else if ((reminder as any).recurrence_type === "weekly") {
        dt.setDate(dt.getDate() + 7 * interval);
      } else if ((reminder as any).recurrence_type === "monthly") {
        dt.setMonth(dt.getMonth() + interval);
      } else if ((reminder as any).recurrence_type === "yearly") {
        dt.setFullYear(dt.getFullYear() + interval);
      }

      const endDt = (reminder as any).recurrence_end_date ? new Date((reminder as any).recurrence_end_date) : null;
      if (!endDt || dt <= endDt) {
        await context.supabase.from("agenda_reminders" as any).insert({
          user_id: (reminder as any).user_id,
          title: (reminder as any).title,
          content: (reminder as any).content,
          color: (reminder as any).color,
          date_time: dt.toISOString(),
          recurrence_type: (reminder as any).recurrence_type,
          recurrence_interval: (reminder as any).recurrence_interval,
          recurrence_end_date: (reminder as any).recurrence_end_date,
          is_completed: false,
        } as any);
      }
    }

    const { error } = await context.supabase
      .from("agenda_reminders" as any)
      .update({ is_completed: true, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteReminder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("agenda_reminders" as any)
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
