import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DEFAULT_CREDIT_TIERS, calculateTiersPrice } from "./credit-tiers";
import crypto from "crypto";

const entrySchema = z.object({
  id: z.string().uuid().optional(),
  type: z.enum(["revenue", "expense"]),
  title: z.string().min(1, "O título é obrigatório"),
  client_id: z.string().uuid().nullable().optional(),
  due_date: z.string(), // YYYY-MM-DD
  total_value: z.number().nonnegative(),
  paid_value: z.number().nonnegative().default(0),
  status: z.enum(["pending", "paid", "overdue"]).default("pending"),
  category: z.string().nullable().optional(),
  recipient_provider: z.string().nullable().optional(),
});

export type FinancialEntry = z.infer<typeof entrySchema>;

// Helper to format Date objects as YYYY-MM-DD in local time
function getLocalDateString(date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// 1. List financial entries for a specific month and year
export const listFinancialEntries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({
    month: z.number().min(1).max(12),
    year: z.number(),
    type: z.enum(["revenue", "expense"]).optional(),
    client_id: z.string().uuid().optional(),
  }))
  .handler(async ({ data: { month, year, type, client_id }, context }) => {
    try {
      const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${year}-${String(month).padStart(2, "0")}-${lastDay}`;

      let query = context.supabase
        .from("financial_entries")
        .select(`
          *,
          client:clients(id, name)
        `)
        .gte("due_date", startDate)
        .lte("due_date", endDate)
        .order("due_date", { ascending: true });

      if (type) {
        query = query.eq("type", type);
      }
      if (client_id) {
        query = query.eq("client_id", client_id);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Automatically flag overdue items at runtime before returning
      const todayStr = getLocalDateString(new Date());
      const entries = (data || []).map((entry: any) => {
        let status = entry.status;
        if (status === "pending" && entry.due_date < todayStr) {
          status = "overdue";
        }
        return { ...entry, status };
      });

      return entries;
    } catch (e: any) {
      console.error("listFinancialEntries error:", e);
      throw new Error(e.message || "Erro ao buscar transações.");
    }
  });

// 2. Check and generate monthly recurring receivables for active monthly clients
export const checkAndGenerateMonthlyReceivables = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({
    month: z.number().min(1).max(12),
    year: z.number(),
  }))
  .handler(async ({ data: { month, year }, context }) => {
    try {
      // Get all active clients
      const { data: clients, error: clientErr } = await context.supabase
        .from("clients")
        .select("id, name, billing_model, fixed_type, monthly_value")
        .is("deleted_at", null)
        .eq("access_active", true);

      if (clientErr) throw clientErr;

      const monthlyClients = (clients || []).filter(
        (c) =>
          c.billing_model === "credits" ||
          (c.billing_model === "fixed" && c.fixed_type === "monthly")
      );

      const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${year}-${String(month).padStart(2, "0")}-${lastDay}`;
      const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
      const monthStr = monthNames[month - 1];

      for (const client of monthlyClients) {
        // Check if subscription entry exists for this client in this month
        const { data: existing, error: existErr } = await context.supabase
          .from("financial_entries" as any)
          .select("id, total_value, status")
          .eq("type", "revenue")
          .eq("client_id", client.id)
          .is("demand_id", null) // Subscription entries have null demand_id
          .gte("due_date", startDate)
          .lte("due_date", endDate)
          .maybeSingle();

        if (existErr) throw existErr;

        // Calculate credit cost if billing model is credits
        let calculatedPrice = 0;
        if (client.billing_model === "credits") {
          // 1. Fetch completed demands for this month
          const { data: demands, error: demandsErr } = await context.supabase
            .from("demands")
            .select("estimated_credits")
            .eq("client_id", client.id)
            .eq("status", "concluido")
            .gte("due_date", startDate)
            .lte("due_date", endDate);

          if (demandsErr) throw demandsErr;

          const totalCredits = (demands || []).reduce((sum, d) => sum + (d.estimated_credits || 0), 0);

          // 2. Fetch credit tiers for this client
          let creditTiers = DEFAULT_CREDIT_TIERS;
          const { data: noteRows, error: noteErr } = await context.supabase
            .from("notes")
            .select("content")
            .is("deleted_at", null)
            .eq("client_id", client.id)
            .eq("title", "__credit_tiers_config__")
            .limit(1);

          if (!noteErr && noteRows && noteRows.length > 0) {
            try {
              const parsed = JSON.parse(noteRows[0].content ?? "{}");
              if (parsed && Array.isArray(parsed)) {
                creditTiers = parsed;
              } else if (parsed && parsed.tiers && Array.isArray(parsed.tiers)) {
                creditTiers = parsed.tiers;
              }
            } catch (e) {
              console.error("Error parsing credit tiers for client:", client.id, e);
            }
          }

          calculatedPrice = calculateTiersPrice(totalCredits, creditTiers);
        }

        const currentVal = client.billing_model === "credits"
          ? Math.max(calculatedPrice, Number(client.monthly_value || 0))
          : Number(client.monthly_value || 0);

        if (!existing) {
          // Generate a new receivable entry for this month
          const dueDay = 10; // Default due day
          const dueDate = `${year}-${String(month).padStart(2, "0")}-${String(dueDay).padStart(2, "0")}`;

          const { error: insErr } = await context.supabase
            .from("financial_entries")
            .insert({
              type: "revenue",
              title: `Mensalidade — ${client.name} (${monthStr}/${year})`,
              client_id: client.id,
              total_value: currentVal,
              paid_value: 0,
              due_date: dueDate,
              status: "pending",
              category: "Mensalidade",
            });

          if (insErr) throw insErr;
        } else {
          // If it exists, but the total_value doesn't match the client's monthly_value AND status is not paid:
          // Update it to sync with the current client value!
          if ((existing as any).status !== "paid" && Number((existing as any).total_value) !== currentVal) {
            const { error: updErr } = await context.supabase
              .from("financial_entries" as any)
              .update({
                total_value: currentVal,
                title: `Mensalidade — ${client.name} (${monthStr}/${year})`,
                updated_at: new Date().toISOString(),
              })
              .eq("id", (existing as any).id);

            if (updErr) throw updErr;
          }
        }
      }

      return { success: true };
    } catch (e: any) {
      console.error("checkAndGenerateMonthlyReceivables error:", e);
      return { success: false, error: e.message };
    }
  });

// 3. Upsert a financial entry
export const upsertFinancialEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(entrySchema)
  .handler(async ({ data, context }) => {
    try {
      const { error } = await context.supabase
        .from("financial_entries")
        .upsert({
          ...(data as any),
          updated_at: new Date().toISOString(),
        } as any);

      if (error) throw error;
      return { success: true };
    } catch (e: any) {
      console.error("upsertFinancialEntry error:", e);
      return { success: false, error: e.message || "Erro ao salvar transação." };
    }
  });

// 4. Delete a financial entry
export const deleteFinancialEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data: { id }, context }) => {
    try {
      // Fetch the entry first to check if it's a subscription billing
      const { data: entry, error: fetchErr } = await context.supabase
        .from("financial_entries" as any)
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (fetchErr) throw fetchErr;

      // Delete the entry
      const { error } = await context.supabase
        .from("financial_entries" as any)
        .delete()
        .eq("id", id);

      if (error) throw error;

      // If it was a recurring monthly receivable (no demand_id, client_id present, category is Mensalidade)
      // Downgrade client billing model to 'fixed' and fixed_type to 'one_off'
      if (
        entry &&
        entry.type === "revenue" &&
        entry.category === "Mensalidade" &&
        !entry.demand_id &&
        entry.client_id
      ) {
        const { error: clientUpdErr } = await context.supabase
          .from("clients")
          .update({
            billing_model: "fixed",
            fixed_type: "one_off",
            monthly_value: null,
          })
          .eq("id", entry.client_id);

        if (clientUpdErr) throw clientUpdErr;
      }

      return { success: true };
    } catch (e: any) {
      console.error("deleteFinancialEntry error:", e);
      return { success: false, error: e.message || "Erro ao excluir." };
    }
  });

// 5. Register a payment total or partial
export const registerPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({
    id: z.string().uuid(),
    amount: z.number().positive(),
  }))
  .handler(async ({ data: { id, amount }, context }) => {
    try {
      const { data: entry, error: getErr } = await context.supabase
        .from("financial_entries")
        .select("*")
        .eq("id", id)
        .single();

      if (getErr) throw getErr;

      const newPaidValue = Number(entry.paid_value || 0) + amount;
      const finalTotalValue = Math.max(Number(entry.total_value || 0), newPaidValue);
      const status = newPaidValue >= finalTotalValue ? "paid" : "pending";

      const { error: updErr } = await context.supabase
        .from("financial_entries")
        .update({
          paid_value: newPaidValue,
          total_value: finalTotalValue,
          status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (updErr) throw updErr;
      return { success: true };
    } catch (e: any) {
      console.error("registerPayment error:", e);
      return { success: false, error: e.message || "Erro ao registrar pagamento." };
    }
  });

// 6. Get consolidated financial summary (KPIs, overdue list, 6-month historical chart)
export const getFinancialSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({
    month: z.number().min(1).max(12),
    year: z.number(),
    chartMonths: z.number().min(3).max(12).default(6),
  }))
  .handler(async ({ data: { month, year, chartMonths }, context }) => {
    try {
      const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${year}-${String(month).padStart(2, "0")}-${lastDay}`;
      const todayStr = getLocalDateString(new Date());

      // Fetch all entries of the month
      const { data: currentEntries, error } = await context.supabase
        .from("financial_entries")
        .select(`
          *,
          client:clients(id, name)
        `)
        .gte("due_date", startDate)
        .lte("due_date", endDate);

      if (error) throw error;

      // Calculate monthly KPIs
      let revenueTotal = 0;
      let revenuePending = 0;
      let revenueOverdue = 0;
      let revenuePaid = 0;

      let expenseTotal = 0;
      let expensePending = 0;
      let expenseOverdue = 0;
      let expensePaid = 0;

      const overdueReceivables: any[] = [];
      const overduePayables: any[] = [];

      (currentEntries || []).forEach((entry: any) => {
        const total = Number(entry.total_value || 0);
        const paid = Number(entry.paid_value || 0);
        const balance = total - paid;
        const isOverdue = entry.status === "overdue" || (entry.status === "pending" && entry.due_date < todayStr);

        if (entry.type === "revenue") {
          revenueTotal += total;
          revenuePaid += paid;
          if (entry.status === "paid") {
            // Already fully paid
          } else if (isOverdue) {
            revenueOverdue += balance;
            overdueReceivables.push({ ...entry, status: "overdue" });
          } else {
            revenuePending += balance;
          }
        } else {
          expenseTotal += total;
          expensePaid += paid;
          if (entry.status === "paid") {
            // Paid
          } else if (isOverdue) {
            expenseOverdue += balance;
            overduePayables.push({ ...entry, status: "overdue" });
          } else {
            expensePending += balance;
          }
        }
      });

      // Calculate last N months historical data — single batch query
      const chartStart = new Date(year, month - 1 - (chartMonths - 1), 1);
      const chartStartStr = `${chartStart.getFullYear()}-${String(chartStart.getMonth() + 1).padStart(2, "0")}-01`;
      const chartEndStr = endDate;

      const { data: allHist, error: histErr } = await context.supabase
        .from("financial_entries")
        .select("type, total_value, due_date")
        .gte("due_date", chartStartStr)
        .lte("due_date", chartEndStr)
        .order("due_date", { ascending: true });

      if (histErr) throw histErr;

      // Group by month in JS
      const monthNamesShort = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
      const chartData: { month: string; faturamento: number; despesas: number; lucro: number }[] = [];

      for (let i = chartMonths - 1; i >= 0; i--) {
        const d = new Date(year, month - 1 - i, 1);
        const m = d.getMonth() + 1;
        const y = d.getFullYear();

        const mStart = `${y}-${String(m).padStart(2, "0")}-01`;
        const mEnd = `${y}-${String(m).padStart(2, "0")}-${new Date(y, m, 0).getDate()}`;

        let mRevenue = 0;
        let mExpense = 0;

        (allHist || []).forEach((e: any) => {
          if (e.due_date >= mStart && e.due_date <= mEnd) {
            if (e.type === "revenue") mRevenue += Number(e.total_value || 0);
            else mExpense += Number(e.total_value || 0);
          }
        });

        chartData.push({
          month: `${monthNamesShort[m - 1]}/${String(y).slice(2)}`,
          faturamento: mRevenue,
          despesas: mExpense,
          lucro: mRevenue - mExpense,
        });
      }

      return {
        revenue: {
          total: revenueTotal,
          pending: revenuePending,
          overdue: revenueOverdue,
          paid: revenuePaid,
        },
        expense: {
          total: expenseTotal,
          pending: expensePending,
          overdue: expenseOverdue,
          paid: expensePaid,
        },
        overdueReceivables,
        overduePayables,
        chartData,
      };
    } catch (e: any) {
      console.error("getFinancialSummary error:", e);
      throw new Error(e.message || "Erro ao gerar resumo financeiro.");
    }
  });

// Helper to add months to a date string (YYYY-MM-DD) clamping day of month correctly
function addMonths(dateStr: string, months: number): string {
  const parts = dateStr.split("-");
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1; // 0-indexed
  const day = parseInt(parts[2], 10);

  const targetDate = new Date(year, month + months, 1);
  const maxDays = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0).getDate();
  const targetDay = Math.min(day, maxDays);
  targetDate.setDate(targetDay);

  const yyyy = targetDate.getFullYear();
  const mm = String(targetDate.getMonth() + 1).padStart(2, "0");
  const dd = String(targetDate.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

const expenseRecurrenceSchema = z.object({
  title: z.string().min(1, "O título é obrigatório"),
  recipient_provider: z.string().nullable().optional(),
  total_value: z.number().nonnegative(),
  due_date: z.string(), // YYYY-MM-DD
  category: z.string().nullable().optional(),
  recurrence_type: z.enum(["single", "monthly", "parceled"]),
  installments_count: z.number().int().min(1).nullable().optional(),
  monthly_duration_type: z.enum(["indefinite", "until_date"]).nullable().optional(),
  end_date: z.string().nullable().optional(),
});

export const createExpenseWithRecurrence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(expenseRecurrenceSchema)
  .handler(async ({ data, context }) => {
    try {
      const entriesToInsert = [];
      const recurrenceGroupId = data.recurrence_type !== "single" ? crypto.randomUUID() : null;

      if (data.recurrence_type === "single") {
        entriesToInsert.push({
          type: "expense",
          title: data.title,
          recipient_provider: data.recipient_provider || null,
          total_value: data.total_value,
          paid_value: 0,
          due_date: data.due_date,
          status: "pending",
          category: data.category || "Outros",
          recurrence_group_id: null,
        });
      } else if (data.recurrence_type === "parceled") {
        const count = data.installments_count || 1;
        for (let i = 0; i < count; i++) {
          const installmentDueDate = addMonths(data.due_date, i);
          entriesToInsert.push({
            type: "expense",
            title: `${data.title} (${i + 1}/${count})`,
            recipient_provider: data.recipient_provider || null,
            total_value: data.total_value,
            paid_value: 0,
            due_date: installmentDueDate,
            status: "pending",
            category: data.category || "Outros",
            recurrence_group_id: recurrenceGroupId,
          });
        }
      } else if (data.recurrence_type === "monthly") {
        let count = 12; // Default for indefinite
        if (data.monthly_duration_type === "until_date" && data.end_date) {
          // Calculate months between due_date and end_date
          const start = new Date(data.due_date + "T12:00:00");
          const end = new Date(data.end_date + "T12:00:00");
          const yearDiff = end.getFullYear() - start.getFullYear();
          const monthDiff = end.getMonth() - start.getMonth();
          const diff = yearDiff * 12 + monthDiff;
          count = Math.max(1, diff + 1); // At least 1 month, include end month
        }

        for (let i = 0; i < count; i++) {
          const installmentDueDate = addMonths(data.due_date, i);
          // If we have an end_date, make sure we don't go past it
          if (data.monthly_duration_type === "until_date" && data.end_date && installmentDueDate > data.end_date) {
            break;
          }
          entriesToInsert.push({
            type: "expense",
            title: data.title,
            recipient_provider: data.recipient_provider || null,
            total_value: data.total_value,
            paid_value: 0,
            due_date: installmentDueDate,
            status: "pending",
            category: data.category || "Outros",
            recurrence_group_id: recurrenceGroupId,
          });
        }
      }

      const { error } = await context.supabase
        .from("financial_entries")
        .insert(entriesToInsert);

      if (error) throw error;
      return { success: true, count: entriesToInsert.length };
    } catch (e: any) {
      console.error("createExpenseWithRecurrence error:", e);
      return { success: false, error: e.message || "Erro ao registrar despesa(s)." };
    }
  });

export const deleteFinancialEntryWithRecurrence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      id: z.string().uuid(),
      delete_future: z.boolean(),
    })
  )
  .handler(async ({ data: { id, delete_future }, context }) => {
    try {
      // 1. Fetch the entry to check its due date and recurrence group id
      const { data: entry, error: fetchErr } = await context.supabase
        .from("financial_entries")
        .select("*")
        .eq("id", id)
        .single();

      if (fetchErr) throw fetchErr;

      if (delete_future && entry.recurrence_group_id) {
        // Delete all entries with the same group id where due_date >= entry.due_date and status is not paid
        const { error } = await context.supabase
          .from("financial_entries")
          .delete()
          .eq("recurrence_group_id" as any, (entry as any).recurrence_group_id)
          .gte("due_date", entry.due_date)
          .neq("status", "paid");

        if (error) throw error;
      } else {
        // Just delete this single entry
        const { error } = await context.supabase
          .from("financial_entries")
          .delete()
          .eq("id", id);

        if (error) throw error;
      }

      return { success: true };
    } catch (e: any) {
      console.error("deleteFinancialEntryWithRecurrence error:", e);
      return { success: false, error: e.message || "Erro ao excluir lançamento(s)." };
    }
  });

export const updateFinancialEntryWithRecurrence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      id: z.string().uuid(),
      update_future: z.boolean(),
      entry: entrySchema,
    })
  )
  .handler(async ({ data: { id, update_future, entry: updatedData }, context }) => {
    try {
      // 1. Fetch original entry to check details
      const { data: original, error: fetchErr } = await context.supabase
        .from("financial_entries")
        .select("*")
        .eq("id", id)
        .single();

      if (fetchErr) throw fetchErr;

      if (update_future && original.recurrence_group_id) {
        // Update the current entry
        const { error: currentErr } = await context.supabase
          .from("financial_entries")
          .update({
            ...updatedData,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id);

        if (currentErr) throw currentErr;

        // Select and update all future entries of the same group that are not paid
        const { data: futureEntries, error: futErr } = await context.supabase
          .from("financial_entries")
          .select("id, title, due_date")
          .eq("recurrence_group_id", original.recurrence_group_id)
          .gt("due_date", original.due_date)
          .neq("status", "paid");

        if (futErr) throw futErr;

        for (const fut of (futureEntries || [])) {
          let newTitle = updatedData.title;

          // Check if original title had (X/Y) suffix and future title has it too
          const origSuffixMatch = original.title.match(/\s+\((\d+\/\d+)\)$/);
          const futSuffixMatch = fut.title.match(/\s+\((\d+\/\d+)\)$/);

          if (origSuffixMatch && futSuffixMatch) {
            const baseNewTitle = updatedData.title.replace(/\s+\((\d+\/\d+)\)$/, "");
            newTitle = `${baseNewTitle} (${futSuffixMatch[1]})`;
          }

          await context.supabase
            .from("financial_entries")
            .update({
              title: newTitle,
              total_value: updatedData.total_value,
              category: updatedData.category,
              recipient_provider: updatedData.recipient_provider,
              updated_at: new Date().toISOString(),
            })
            .eq("id", fut.id);
        }
      } else {
        // Just update this single entry
        const { error } = await context.supabase
          .from("financial_entries")
          .update({
            ...updatedData,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id);

        if (error) throw error;
      }

      return { success: true };
    } catch (e: any) {
      console.error("updateFinancialEntryWithRecurrence error:", e);
      return { success: false, error: e.message || "Erro ao atualizar lançamento(s)." };
    }
  });
