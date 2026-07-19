import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  DollarSign,
  TrendingUp,
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  Trash2,
  CalendarDays,
  AlertCircle,
  CheckCircle,
  Clock,
  Edit,
  ArrowUpRight,
  ArrowDownRight,
  User,
  Tags,
  Briefcase,
  HelpCircle,
} from "lucide-react";

import {
  listFinancialEntries,
  checkAndGenerateMonthlyReceivables,
  upsertFinancialEntry,
  deleteFinancialEntry,
  registerPayment,
  getFinancialSummary,
  createExpenseWithRecurrence,
  FinancialEntry,
  deleteFinancialEntryWithRecurrence,
  updateFinancialEntryWithRecurrence,
} from "@/lib/finance.functions";
import { listClients } from "@/lib/clients.functions";

export function getRecurrenceLabel(entry: { title: string; recurrence_group_id?: string | null }) {
  const match = (entry.title || "").match(/\s+\((\d+)\/(\d+)\)$/);
  if (match) {
    return {
      type: "parceled",
      label: "Parcela",
      current: parseInt(match[1]),
      total: parseInt(match[2]),
      badgeText: `Parcela ${match[1]}/${match[2]}`,
    };
  }
  if (entry.recurrence_group_id) {
    return {
      type: "monthly",
      label: "Recorrente Fixa",
      badgeText: "Recorrente",
    };
  }
  return {
    type: "single",
    label: "Único",
    badgeText: "Único",
  };
}

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/finance")({
  component: FinancePage,
  head: () => ({ meta: [{ title: "Financeiro — Sparkin Hub" }] }),
});

const MONTHS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const CATEGORIES_REVENUE = ["Mensalidade", "Projeto Avulso", "Consultoria", "Outros"];
const CATEGORIES_EXPENSE = [
  "Assinatura / SaaS",
  "Fiscal / Impostos",
  "Colaborador / Folha",
  "Mentoria / Treinamento",
  "Marketing / Tráfego",
  "Servidores / Infra",
  "Outros"
];

function FinancePage() {
  const queryClient = useQueryClient();
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [loadingRole, setLoadingRole] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", data.user.id)
          .maybeSingle()
          .then(({ data: roleData }) => {
            if (roleData) {
              setCurrentUserRole(roleData.role);
            }
            setLoadingRole(false);
          });
      } else {
        setLoadingRole(false);
      }
    });
  }, []);

  // Period State (Current month and year)
  const [currentMonth, setCurrentMonth] = useState(() => new Date().getMonth() + 1);
  const [currentYear, setCurrentYear] = useState(() => new Date().getFullYear());

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "paid" | "overdue">("all");

  // DRE Deductions State (simulates tax deductions)
  const [taxesEnabled, setTaxesEnabled] = useState(true);
  const taxRate = 0.06; // 6% default tax rate

  // Modal States
  const [isEntryModalOpen, setIsEntryModalOpen] = useState(false);
  const [entryModalType, setEntryModalType] = useState<"revenue" | "expense">("revenue");
  const [editingEntry, setEditingEntry] = useState<FinancialEntry | null>(null);

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentEntry, setPaymentEntry] = useState<FinancialEntry | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");

  // Recurrence Dialog States
  const [deleteRecurrenceOpen, setDeleteRecurrenceOpen] = useState(false);
  const [targetDeleteEntry, setTargetDeleteEntry] = useState<any>(null);
  const [editRecurrenceOpen, setEditRecurrenceOpen] = useState(false);
  const [targetEditData, setTargetEditData] = useState<{ id: string; entry: FinancialEntry } | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formClientId, setFormClientId] = useState<string>("none");
  const [formTotalValue, setFormTotalValue] = useState("");
  const [formDueDate, setFormDueDate] = useState("");
  const [formCategory, setFormCategory] = useState("Outros");
  const [formRecipient, setFormRecipient] = useState("");
  
  // Recurrence states for new expenses
  const [recurrenceType, setRecurrenceType] = useState<"single" | "monthly" | "parceled">("single");
  const [installmentsCount, setInstallmentsCount] = useState("2");
  const [monthlyDurationType, setMonthlyDurationType] = useState<"indefinite" | "until_date">("indefinite");
  const [endDate, setEndDate] = useState("");

  // TanStack Start Server Functions
  const listEntriesFn = useServerFn(listFinancialEntries);
  const checkGenFn = useServerFn(checkAndGenerateMonthlyReceivables);
  const summaryFn = useServerFn(getFinancialSummary);
  const upsertFn = useServerFn(upsertFinancialEntry);
  const deleteFn = useServerFn(deleteFinancialEntry);
  const registerPayFn = useServerFn(registerPayment);
  const listClientsFn = useServerFn(listClients);
  const createExpenseWithRecurrenceFn = useServerFn(createExpenseWithRecurrence);
  const deleteWithRecurrenceFn = useServerFn(deleteFinancialEntryWithRecurrence);
  const updateWithRecurrenceFn = useServerFn(updateFinancialEntryWithRecurrence);

  // Queries
  const { data: clients } = useQuery({
    queryKey: ["clients"],
    queryFn: () => listClientsFn(),
  });

  const { data: summary, isLoading: isLoadingSummary } = useQuery({
    queryKey: ["financialSummary", currentMonth, currentYear],
    queryFn: async () => {
      // First, trigger automatic recurring generation to ensure data is updated
      await checkGenFn({ data: { month: currentMonth, year: currentYear } });
      return summaryFn({ data: { month: currentMonth, year: currentYear } });
    },
  });

  const { data: entries, isLoading: isLoadingEntries } = useQuery({
    queryKey: ["financialEntries", currentMonth, currentYear],
    queryFn: () => listEntriesFn({ data: { month: currentMonth, year: currentYear } }),
  });

  // Mutations
  const upsertMutation = useMutation({
    mutationFn: (data: FinancialEntry) => upsertFn({ data }),
    onSuccess: (res) => {
      if (res.success) {
        toast.success("Lançamento salvo com sucesso!");
        queryClient.invalidateQueries({ queryKey: ["financialSummary"] });
        queryClient.invalidateQueries({ queryKey: ["financialEntries"] });
        setIsEntryModalOpen(false);
      } else {
        toast.error(res.error || "Erro ao salvar lançamento.");
      }
    },
  });

  const createRecurringExpenseMutation = useMutation({
    mutationFn: (data: Parameters<typeof createExpenseWithRecurrenceFn>[0]["data"]) => 
      createExpenseWithRecurrenceFn({ data }),
    onSuccess: (res) => {
      if (res.success) {
        toast.success("Despesa(s) registrada(s) com sucesso!");
        queryClient.invalidateQueries({ queryKey: ["financialSummary"] });
        queryClient.invalidateQueries({ queryKey: ["financialEntries"] });
        setIsEntryModalOpen(false);
      } else {
        toast.error(res.error || "Erro ao registrar despesas.");
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: (res) => {
      if (res.success) {
        toast.success("Lançamento excluído!");
        queryClient.invalidateQueries({ queryKey: ["financialSummary"] });
        queryClient.invalidateQueries({ queryKey: ["financialEntries"] });
      } else {
        toast.error(res.error || "Erro ao excluir.");
      }
    },
  });

  const deleteWithRecurrenceMutation = useMutation({
    mutationFn: (data: { id: string; delete_future: boolean }) => deleteWithRecurrenceFn({ data }),
    onSuccess: (res) => {
      if (res.success) {
        toast.success("Lançamento(s) excluído(s)!");
        queryClient.invalidateQueries({ queryKey: ["financialSummary"] });
        queryClient.invalidateQueries({ queryKey: ["financialEntries"] });
        setDeleteRecurrenceOpen(false);
        setTargetDeleteEntry(null);
      } else {
        toast.error(res.error || "Erro ao excluir.");
      }
    },
  });

  const updateWithRecurrenceMutation = useMutation({
    mutationFn: (data: { id: string; update_future: boolean; entry: FinancialEntry }) => updateWithRecurrenceFn({ data }),
    onSuccess: (res) => {
      if (res.success) {
        toast.success("Lançamento(s) salvo(s)!");
        queryClient.invalidateQueries({ queryKey: ["financialSummary"] });
        queryClient.invalidateQueries({ queryKey: ["financialEntries"] });
        setEditRecurrenceOpen(false);
        setTargetEditData(null);
        setIsEntryModalOpen(false);
      } else {
        toast.error(res.error || "Erro ao salvar.");
      }
    },
  });

  const payMutation = useMutation({
    mutationFn: (data: { id: string; amount: number }) => registerPayFn({ data }),
    onSuccess: (res) => {
      if (res.success) {
        toast.success("Pagamento registrado com sucesso!");
        queryClient.invalidateQueries({ queryKey: ["financialSummary"] });
        queryClient.invalidateQueries({ queryKey: ["financialEntries"] });
        setIsPaymentModalOpen(false);
      } else {
        toast.error(res.error || "Erro ao registrar pagamento.");
      }
    },
  });

  // Filtered lists (must be before early returns to keep hooks consistent)
  const filteredRevenues = useMemo(() => {
    if (!entries) return [];
    return entries.filter((e) => {
      if (e.type !== "revenue") return false;
      const matchesSearch = e.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
        (e.client?.name && e.client.name.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesStatus = statusFilter === "all" || e.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [entries, searchQuery, statusFilter]);

  const filteredExpenses = useMemo(() => {
    if (!entries) return [];
    return entries.filter((e) => {
      if (e.type !== "expense") return false;
      const matchesSearch = e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (e.recipient_provider && e.recipient_provider.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesStatus = statusFilter === "all" || e.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [entries, searchQuery, statusFilter]);

  const allTransactions = useMemo(() => {
    if (!entries) return [];
    return [...entries].sort((a, b) => b.due_date.localeCompare(a.due_date));
  }, [entries]);

  // Format helpers
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);
  };

  const formatDate = (dateStr: string) => {
    const [year, month, day] = dateStr.split("-");
    return `${day}/${month}/${year}`;
  };

  if (loadingRole) {
    return <div className="p-12 text-center text-muted-foreground text-sm font-sans animate-pulse">Carregando permissões...</div>;
  }

  if (currentUserRole === "collaborator") {
    return (
      <div className="p-12 text-center space-y-4 max-w-xl mx-auto mt-12 bg-card border border-border rounded-xl">
        <h2 className="text-xl font-bold text-foreground font-display">Acesso Restrito</h2>
        <p className="text-sm text-muted-foreground">
          Colaboradores não têm acesso às informações e lançamentos do painel financeiro do sistema.
        </p>
      </div>
    );
  }

  // Navigation handlers
  const handlePrevMonth = () => {
    if (currentMonth === 1) {
      setCurrentMonth(12);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 12) {
      setCurrentMonth(1);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  // Open modals
  const openNewEntryModal = (type: "revenue" | "expense") => {
    setEntryModalType(type);
    setEditingEntry(null);
    setFormTitle("");
    setFormClientId("none");
    setFormTotalValue("");
    setFormDueDate(new Date().toISOString().split("T")[0]);
    setFormCategory(type === "revenue" ? "Projeto Avulso" : "Outros");
    setFormRecipient("");
    setRecurrenceType("single");
    setInstallmentsCount("2");
    setMonthlyDurationType("indefinite");
    setEndDate("");
    setIsEntryModalOpen(true);
  };

  const openEditEntryModal = (entry: any) => {
    setEntryModalType(entry.type);
    setEditingEntry(entry);
    setFormTitle(entry.title);
    setFormClientId(entry.client_id || "none");
    setFormTotalValue(String(entry.total_value));
    setFormDueDate(entry.due_date);
    setFormCategory(entry.category || "Outros");
    setFormRecipient(entry.recipient_provider || "");
    setRecurrenceType("single");
    setInstallmentsCount("2");
    setMonthlyDurationType("indefinite");
    setEndDate("");
    setIsEntryModalOpen(true);
  };

  const openPaymentModal = (entry: any) => {
    setPaymentEntry(entry);
    setPaymentAmount(String(Number(entry.total_value) - Number(entry.paid_value)));
    setIsPaymentModalOpen(true);
  };

  // Submit handlers
  const handleEntrySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle || !formTotalValue || !formDueDate) {
      toast.error("Preencha todos os campos obrigatórios.");
      return;
    }

    if (!editingEntry && entryModalType === "expense" && recurrenceType !== "single") {
      // Validate recurrence fields
      if (recurrenceType === "parceled") {
        const count = Number(installmentsCount);
        if (isNaN(count) || count < 1) {
          toast.error("A quantidade de parcelas deve ser pelo menos 1.");
          return;
        }
      } else if (recurrenceType === "monthly" && monthlyDurationType === "until_date") {
        if (!endDate) {
          toast.error("Preencha a data limite para a recorrência.");
          return;
        }
        if (endDate < formDueDate) {
          toast.error("A data limite não pode ser anterior ao vencimento da primeira parcela.");
          return;
        }
      }

      createRecurringExpenseMutation.mutate({
        title: formTitle,
        recipient_provider: formRecipient || null,
        total_value: Number(formTotalValue),
        due_date: formDueDate,
        category: formCategory,
        recurrence_type: recurrenceType,
        installments_count: recurrenceType === "parceled" ? Number(installmentsCount) : null,
        monthly_duration_type: recurrenceType === "monthly" ? monthlyDurationType : null,
        end_date: recurrenceType === "monthly" && monthlyDurationType === "until_date" ? endDate : null,
      });
      return;
    }

    const payload: FinancialEntry = {
      id: editingEntry?.id,
      type: entryModalType,
      title: formTitle,
      client_id: formClientId === "none" ? null : formClientId,
      due_date: formDueDate,
      total_value: Number(formTotalValue),
      paid_value: editingEntry ? editingEntry.paid_value : 0,
      status: editingEntry ? editingEntry.status : "pending",
      category: formCategory,
      recipient_provider: entryModalType === "expense" ? formRecipient : null,
    };

    if (editingEntry?.recurrence_group_id) {
      const hasChanged =
        editingEntry.title !== formTitle ||
        editingEntry.total_value !== Number(formTotalValue) ||
        editingEntry.category !== formCategory ||
        (entryModalType === "expense" && editingEntry.recipient_provider !== (formRecipient || null));

      if (hasChanged) {
        setTargetEditData({ id: editingEntry.id!, entry: payload });
        setEditRecurrenceOpen(true);
        return;
      }
    }

    upsertMutation.mutate(payload);
  };

  const handlePaymentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentEntry || !paymentAmount) return;

    const amount = Number(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Informe um valor válido.");
      return;
    }

    payMutation.mutate({ id: paymentEntry.id!, amount });
  };

  const handleDeleteEntry = (id: string) => {
    const entry = entries?.find((e) => e.id === id);
    if (entry?.recurrence_group_id) {
      setTargetDeleteEntry(entry);
      setDeleteRecurrenceOpen(true);
    } else {
      if (confirm("Tem certeza que deseja excluir esta transação?")) {
        deleteMutation.mutate(id);
      }
    }
  };

  // Custom premium SVG line/bar chart builder
  const renderChart = () => {
    if (!summary || !summary.chartData || summary.chartData.length === 0) {
      return (
        <div className="h-64 flex items-center justify-center text-muted-foreground bg-zinc-900/20 rounded-lg border border-zinc-800">
          Carregando dados do gráfico...
        </div>
      );
    }

    const chartData = summary.chartData;
    const maxVal = Math.max(...chartData.map((d) => Math.max(d.faturamento, d.despesas, 1000)));
    const graphHeight = 160;
    const graphWidth = 500;
    const paddingLeft = 50;
    const paddingRight = 20;
    const paddingTop = 20;
    const paddingBottom = 30;

    const totalWidth = graphWidth + paddingLeft + paddingRight;
    const totalHeight = graphHeight + paddingTop + paddingBottom;

    const points = chartData.map((d, index) => {
      const x = paddingLeft + (index / (chartData.length - 1)) * graphWidth;
      const yRevenue = paddingTop + graphHeight - (d.faturamento / maxVal) * graphHeight;
      const yExpense = paddingTop + graphHeight - (d.despesas / maxVal) * graphHeight;
      return { x, yRevenue, yExpense, label: d.month, raw: d };
    });

    const revenueLinePath = points.map((p) => `${p.x},${p.yRevenue}`).join(" L ");
    const expenseLinePath = points.map((p) => `${p.x},${p.yExpense}`).join(" L ");

    return (
      <div className="bg-zinc-900/40 p-6 rounded-xl border border-zinc-800/80">
        <h3 className="text-sm font-semibold text-zinc-300 mb-6 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          Análise Financeira Consolidada (Últimos 6 meses)
        </h3>

        <div className="w-full overflow-x-auto">
          <svg viewBox={`0 0 ${totalWidth} ${totalHeight}`} className="w-full min-w-[600px] h-64 font-sans text-[10px] fill-zinc-500">
            {/* Grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
              const y = paddingTop + graphHeight * ratio;
              const val = maxVal * (1 - ratio);
              return (
                <g key={i}>
                  <line x1={paddingLeft} y1={y} x2={paddingLeft + graphWidth} y2={y} stroke="rgba(255,255,255,0.05)" strokeDasharray="3,3" />
                  <text x={paddingLeft - 8} y={y + 3} textAnchor="end">{formatCurrency(val).split(",")[0]}</text>
                </g>
              );
            })}

            {/* X axis labels */}
            {points.map((p, i) => (
              <text key={i} x={p.x} y={paddingTop + graphHeight + 18} textAnchor="middle">{p.label}</text>
            ))}

            {/* Revenue Line */}
            <path
              d={`M ${revenueLinePath}`}
              fill="none"
              stroke="var(--primary)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Expense Line */}
            <path
              d={`M ${expenseLinePath}`}
              fill="none"
              stroke="#ef4444"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Points */}
            {points.map((p, i) => (
              <g key={i}>
                <circle cx={p.x} cy={p.yRevenue} r="4" fill="var(--primary)" className="transition-all hover:r-6 cursor-pointer" />
                <circle cx={p.x} cy={p.yExpense} r="4" fill="#ef4444" className="transition-all hover:r-6 cursor-pointer" />
              </g>
            ))}
          </svg>
        </div>

        <div className="flex gap-6 justify-center mt-4 text-xs font-medium">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-primary" />
            <span className="text-zinc-400">Faturamento Total (Receitas)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-red-500" />
            <span className="text-zinc-400">Despesas / Custos</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 space-y-6 w-full">
      {/* Top Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2 font-display">
          <DollarSign className="h-6 w-6 text-primary" />
          Financeiro & Fluxo de Caixa
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gerencie receitas automáticas de demandas, contratos recorrentes, despesas e relatórios de DRE.
        </p>
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <TabsList className="bg-zinc-900/60 border border-zinc-800 p-1">
            <TabsTrigger value="overview">Visão Geral</TabsTrigger>
            <TabsTrigger value="receivables">Contas a Receber</TabsTrigger>
            <TabsTrigger value="payables">Contas a Pagar</TabsTrigger>
            <TabsTrigger value="reports">Relatórios & DRE</TabsTrigger>
          </TabsList>

          {/* Date Filter Bar */}
          <div className="flex items-center gap-2 bg-zinc-900/60 p-1.5 rounded-lg border border-zinc-800 self-start sm:self-auto">
            <Button variant="ghost" size="icon" onClick={handlePrevMonth} className="h-8 w-8 hover:bg-zinc-800">
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <div className="flex items-center gap-2 px-2">
              <Select value={String(currentMonth)} onValueChange={(val) => setCurrentMonth(Number(val))}>
                <SelectTrigger className="h-8 border-none bg-transparent hover:bg-zinc-800 text-sm font-semibold font-sans w-28">
                  <SelectValue placeholder="Mês" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-950 border-zinc-800">
                  {MONTHS.map((m, idx) => (
                    <SelectItem key={idx} value={String(idx + 1)}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={String(currentYear)} onValueChange={(val) => setCurrentYear(Number(val))}>
                <SelectTrigger className="h-8 border-none bg-transparent hover:bg-zinc-800 text-sm font-semibold font-sans w-20">
                  <SelectValue placeholder="Ano" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-950 border-zinc-800">
                  {[2024, 2025, 2026, 2027, 2028].map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button variant="ghost" size="icon" onClick={handleNextMonth} className="h-8 w-8 hover:bg-zinc-800">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* 1. VISÃO GERAL TAB */}
        <TabsContent value="overview" className="space-y-6">
          {isLoadingSummary ? (
            <div className="py-20 text-center text-muted-foreground flex flex-col items-center gap-2">
              <Clock className="animate-spin h-6 w-6 text-primary" />
              Carregando dados financeiros do período...
            </div>
          ) : (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Receivables Card */}
                <div className="surface-card p-6 border border-zinc-800/80 hover:border-zinc-700/80 transition-all rounded-xl relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-3 text-emerald-500/10 group-hover:scale-110 transition-transform">
                    <ArrowUpRight className="h-16 w-16" />
                  </div>
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    Contas a Receber
                  </div>
                  <div className="text-3xl font-extrabold tracking-tight mt-3 font-display">
                    {formatCurrency(summary?.revenue.total || 0)}
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-6 pt-4 border-t border-zinc-800 text-[11px] font-sans">
                    <div>
                      <div className="text-zinc-500 font-medium">Pendente</div>
                      <div className="text-zinc-300 font-semibold mt-0.5">
                        {formatCurrency(summary?.revenue.pending || 0)}
                      </div>
                    </div>
                    <div>
                      <div className="text-red-500 font-medium">Vencido</div>
                      <div className="text-red-400 font-semibold mt-0.5">
                        {formatCurrency(summary?.revenue.overdue || 0)}
                      </div>
                    </div>
                    <div>
                      <div className="text-emerald-500 font-medium font-semibold">Recebido</div>
                      <div className="text-emerald-400 font-semibold mt-0.5">
                        {formatCurrency(summary?.revenue.paid || 0)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Payables Card */}
                <div className="surface-card p-6 border border-zinc-800/80 hover:border-zinc-700/80 transition-all rounded-xl relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-3 text-red-500/10 group-hover:scale-110 transition-transform">
                    <ArrowDownRight className="h-16 w-16" />
                  </div>
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <span className="h-2 w-2 rounded-full bg-red-500" />
                    Contas a Pagar
                  </div>
                  <div className="text-3xl font-extrabold tracking-tight mt-3 font-display text-zinc-100">
                    {formatCurrency(summary?.expense.total || 0)}
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-6 pt-4 border-t border-zinc-800 text-[11px] font-sans">
                    <div>
                      <div className="text-zinc-500 font-medium">Pendente</div>
                      <div className="text-zinc-300 font-semibold mt-0.5">
                        {formatCurrency(summary?.expense.pending || 0)}
                      </div>
                    </div>
                    <div>
                      <div className="text-red-500 font-medium">Vencido</div>
                      <div className="text-red-400 font-semibold mt-0.5">
                        {formatCurrency(summary?.expense.overdue || 0)}
                      </div>
                    </div>
                    <div>
                      <div className="text-emerald-500 font-medium">Pago</div>
                      <div className="text-emerald-400 font-semibold mt-0.5">
                        {formatCurrency(summary?.expense.paid || 0)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Net Income Card */}
                <div className="surface-card p-6 border border-zinc-800/80 hover:border-zinc-700/80 transition-all rounded-xl relative overflow-hidden group">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <span className="h-2 w-2 rounded-full bg-primary" />
                    Lucro Líquido do Período
                  </div>
                  <div className="text-3xl font-extrabold tracking-tight mt-3 font-display">
                    {formatCurrency((summary?.revenue.total || 0) - (summary?.expense.total || 0))}
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-6 pt-4 border-t border-zinc-800 text-[11px] font-sans">
                    <div>
                      <div className="text-zinc-500 font-medium">Receitas</div>
                      <div className="text-emerald-400 font-semibold mt-0.5">
                        {formatCurrency(summary?.revenue.total || 0)}
                      </div>
                    </div>
                    <div>
                      <div className="text-zinc-500 font-medium">Despesas</div>
                      <div className="text-red-400 font-semibold mt-0.5">
                        {formatCurrency(summary?.expense.total || 0)}
                      </div>
                    </div>
                    <div>
                      <div className="text-zinc-500 font-medium">Saldo Líquido</div>
                      <div className="text-primary font-bold mt-0.5">
                        {formatCurrency((summary?.revenue.paid || 0) - (summary?.expense.paid || 0))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Overdue/Pending Columns */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Overdue Receivables Column */}
                <div className="surface-card p-6 border border-zinc-800/80 rounded-xl space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
                    <h3 className="text-sm font-bold text-amber-500 flex items-center gap-2 font-display">
                      <AlertCircle className="h-4 w-4" />
                      Recebimentos Vencidos ({summary?.overdueReceivables.length || 0})
                    </h3>
                    {summary?.overdueReceivables.length > 0 && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 font-sans border border-red-500/20">
                        Ação Necessária
                      </span>
                    )}
                  </div>

                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {summary?.overdueReceivables.length === 0 ? (
                      <div className="py-12 text-center text-xs text-muted-foreground flex flex-col items-center gap-1.5">
                        <CheckCircle className="h-8 w-8 text-emerald-500/40" />
                        Nenhum recebimento vencido no mês!
                      </div>
                    ) : (
                      summary?.overdueReceivables.map((entry: any) => (
                        <div key={entry.id} className="flex items-center justify-between p-3 bg-zinc-950/40 border border-zinc-800/50 rounded-lg hover:bg-zinc-900/30 transition-colors">
                          <div className="min-w-0 flex-1 pr-3">
                            <div className="text-xs font-semibold text-zinc-100 truncate">{entry.title}</div>
                            <div className="text-[10px] text-zinc-500 mt-1 flex items-center gap-2 truncate">
                              <span className="text-zinc-400 font-medium truncate">{entry.client?.name}</span>
                              <span>•</span>
                              <span>Venceu em {formatDate(entry.due_date)}</span>
                            </div>
                          </div>
                          <div className="text-right flex items-center gap-3 shrink-0">
                            <div>
                              <div className="text-xs font-bold text-red-400">
                                {formatCurrency(Number(entry.total_value) - Number(entry.paid_value))}
                              </div>
                              <div className="text-[9px] text-zinc-500 mt-0.5">Saldo pendente</div>
                            </div>
                            <Button size="sm" variant="ghost" onClick={() => openPaymentModal(entry)} className="h-7 px-2.5 hover:bg-emerald-500/10 hover:text-emerald-400 border border-zinc-800 text-[10px] font-bold">
                              Liquidar
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Overdue Payables Column */}
                <div className="surface-card p-6 border border-zinc-800/80 rounded-xl space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
                    <h3 className="text-sm font-bold text-red-500 flex items-center gap-2 font-display">
                      <AlertCircle className="h-4 w-4" />
                      Pagamentos Vencidos ({summary?.overduePayables.length || 0})
                    </h3>
                  </div>

                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {summary?.overduePayables.length === 0 ? (
                      <div className="py-12 text-center text-xs text-muted-foreground flex flex-col items-center gap-1.5">
                        <CheckCircle className="h-8 w-8 text-emerald-500/40" />
                        Nenhum pagamento vencido no mês!
                      </div>
                    ) : (
                      summary?.overduePayables.map((entry: any) => (
                        <div key={entry.id} className="flex items-center justify-between p-3 bg-zinc-950/40 border border-zinc-800/50 rounded-lg hover:bg-zinc-900/30 transition-colors">
                          <div className="min-w-0 flex-1 pr-3">
                            <div className="text-xs font-semibold text-zinc-100 truncate">{entry.title}</div>
                            <div className="text-[10px] text-zinc-500 mt-1 flex items-center gap-2 truncate">
                              <span className="text-zinc-400 font-medium truncate">{entry.recipient_provider || "Fornecedor"}</span>
                              <span>•</span>
                              <span>Venceu em {formatDate(entry.due_date)}</span>
                            </div>
                          </div>
                          <div className="text-right flex items-center gap-3 shrink-0">
                            <div>
                              <div className="text-xs font-bold text-red-400">
                                {formatCurrency(Number(entry.total_value) - Number(entry.paid_value))}
                              </div>
                              <div className="text-[9px] text-zinc-500 mt-0.5">A pagar</div>
                            </div>
                            <Button size="sm" variant="ghost" onClick={() => openPaymentModal(entry)} className="h-7 px-2.5 hover:bg-red-500/10 hover:text-red-400 border border-zinc-800 text-[10px] font-bold">
                              Liquidar
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Transactions List */}
              <div className="surface-card p-6 border border-zinc-800/80 rounded-xl space-y-4">
                <h3 className="text-sm font-bold text-zinc-300 font-display">Histórico de Transações Recentes</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-zinc-800 text-zinc-500 font-medium pb-2">
                        <th className="pb-3 font-semibold">Vencimento</th>
                        <th className="pb-3 font-semibold">Tipo</th>
                        <th className="pb-3 font-semibold">Descrição / Título</th>
                        <th className="pb-3 font-semibold">Payer / Beneficiário</th>
                        <th className="pb-3 font-semibold">Categoria</th>
                        <th className="pb-3 font-semibold text-right">Valor Total</th>
                        <th className="pb-3 font-semibold text-right">Valor Pago</th>
                        <th className="pb-3 font-semibold text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/40 text-zinc-300 font-sans">
                      {allTransactions.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-8 text-center text-zinc-500">
                            Nenhuma movimentação registrada para este mês.
                          </td>
                        </tr>
                      ) : (
                        allTransactions.slice(0, 10).map((t) => (
                          <tr key={t.id} className="hover:bg-zinc-900/10 transition-colors">
                            <td className="py-3.5 font-medium">{formatDate(t.due_date)}</td>
                            <td className="py-3.5">
                              {t.type === "revenue" ? (
                                <span className="flex items-center gap-1 text-emerald-400 font-semibold text-[10px] uppercase">
                                  <ArrowUpRight className="h-3.5 w-3.5" /> Recebível
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 text-red-400 font-semibold text-[10px] uppercase">
                                  <ArrowDownRight className="h-3.5 w-3.5" /> Despesa
                                </span>
                              )}
                            </td>
                            <td className="py-3.5 font-semibold text-zinc-100">{t.title}</td>
                            <td className="py-3.5">
                              {t.type === "revenue" ? t.client?.name || "Cliente Avulso" : t.recipient_provider || "—"}
                            </td>
                            <td className="py-3.5">
                              <span className="px-2 py-0.5 rounded-full bg-zinc-800/80 text-zinc-400 text-[10px] font-semibold border border-zinc-700/20">
                                {t.category || "Outros"}
                              </span>
                            </td>
                            <td className="py-3.5 text-right font-bold">{formatCurrency(t.total_value)}</td>
                            <td className="py-3.5 text-right font-medium text-emerald-400">{formatCurrency(t.paid_value)}</td>
                            <td className="py-3.5 text-right">
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                                t.status === "paid"
                                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                  : t.status === "overdue"
                                  ? "bg-red-500/10 text-red-400 border border-red-500/20"
                                  : "bg-zinc-800 text-zinc-400 border border-zinc-700/50"
                              }`}>
                                {t.status === "paid" ? "Pago" : t.status === "overdue" ? "Atrasado" : "Pendente"}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </TabsContent>

        {/* 2. CONTAS A RECEBER TAB */}
        <TabsContent value="receivables" className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-900/30 p-4 rounded-xl border border-zinc-800/80">
            {/* Search & Filter inputs */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar cliente, título..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9 w-64 bg-zinc-950/80 border-zinc-800"
                />
              </div>

              <Select value={statusFilter} onValueChange={(val: any) => setStatusFilter(val)}>
                <SelectTrigger className="h-9 border-zinc-800 bg-zinc-950/80 text-xs w-36 font-sans">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Status</SelectItem>
                  <SelectItem value="pending">Pendentes</SelectItem>
                  <SelectItem value="paid">Pagos</SelectItem>
                  <SelectItem value="overdue">Vencidos</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button onClick={() => openNewEntryModal("revenue")} className="h-9 font-semibold text-xs gap-1.5 font-sans">
              <Plus className="h-4 w-4" /> Nova Conta a Receber
            </Button>
          </div>

          {/* Receivables List Cards */}
          {isLoadingEntries ? (
            <div className="py-20 text-center text-muted-foreground flex flex-col items-center gap-2">
              <Clock className="animate-spin h-6 w-6 text-primary" /> Carregando contas a receber...
            </div>
          ) : (
            <div className="space-y-3">
              {filteredRevenues.length === 0 ? (
                <div className="surface-card p-12 text-center text-muted-foreground border border-dashed border-zinc-800">
                  Nenhum recebível encontrado para os filtros selecionados.
                </div>
              ) : (
                filteredRevenues.map((entry) => {
                  const balance = Number(entry.total_value) - Number(entry.paid_value);
                  return (
                    <div key={entry.id} className="surface-card p-5 border border-zinc-800/80 rounded-xl hover:border-zinc-700/80 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="space-y-2 flex-1 min-w-0 pr-4">
                        <div className="flex items-center gap-2.5">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                            entry.status === "paid"
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : entry.status === "overdue"
                              ? "bg-red-500/10 text-red-400 border border-red-500/20"
                              : "bg-zinc-800 text-zinc-400 border border-zinc-700/50"
                          }`}>
                            {entry.status === "paid" ? "Pago" : entry.status === "overdue" ? "Pendente Atrasado" : "Pendente"}
                          </span>
                          {(() => {
                            const rec = getRecurrenceLabel(entry);
                            return (
                              <span className={cn(
                                "px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider",
                                rec.type === "parceled" && "bg-amber-500/10 text-amber-400 border border-amber-500/20",
                                rec.type === "monthly" && "bg-purple-500/10 text-purple-400 border border-purple-500/20",
                                rec.type === "single" && "bg-zinc-800/85 text-zinc-400 border border-zinc-700/50"
                              )}>
                                {rec.badgeText}
                              </span>
                            );
                          })()}
                          <span className="text-[10px] text-zinc-500 font-semibold font-sans uppercase flex items-center gap-1">
                            <Tags className="h-3 w-3" /> {entry.category || "Sem categoria"}
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-zinc-100 truncate">{entry.title}</h4>
                        <div className="text-[11px] text-zinc-400 font-sans flex flex-wrap items-center gap-4">
                          <span className="flex items-center gap-1 text-zinc-300 font-medium">
                            <User className="h-3.5 w-3.5 text-zinc-500" /> {entry.client?.name || "Cliente Avulso"}
                          </span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <CalendarDays className="h-3.5 w-3.5 text-zinc-500" /> Vence em {formatDate(entry.due_date)}
                          </span>
                        </div>
                      </div>

                      {/* Values & Actions */}
                      <div className="flex items-center gap-6 shrink-0 justify-between md:justify-end">
                        <div className="grid grid-cols-3 gap-6 text-right">
                          <div>
                            <div className="text-[10px] text-zinc-500 font-semibold font-sans uppercase">Valor Total</div>
                            <div className="text-xs font-bold text-zinc-300 mt-1">{formatCurrency(entry.total_value)}</div>
                          </div>
                          <div>
                            <div className="text-[10px] text-emerald-500 font-semibold font-sans uppercase">Valor Pago</div>
                            <div className="text-xs font-bold text-emerald-400 mt-1">{formatCurrency(entry.paid_value)}</div>
                          </div>
                          <div>
                            <div className="text-[10px] text-amber-500 font-semibold font-sans uppercase">Saldo Restante</div>
                            <div className="text-xs font-bold text-amber-400 mt-1">{formatCurrency(balance)}</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {entry.status !== "paid" && (
                            <Button size="sm" onClick={() => openPaymentModal(entry)} className="h-8 text-xs font-bold font-sans hover:scale-105 transition-transform">
                              Receber
                            </Button>
                          )}
                          <Button size="icon" variant="ghost" onClick={() => openEditEntryModal(entry)} className="h-8 w-8 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100">
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => handleDeleteEntry(entry.id)} className="h-8 w-8 hover:bg-red-500/10 text-zinc-400 hover:text-red-400">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </TabsContent>

        {/* 3. CONTAS A PAGAR TAB */}
        <TabsContent value="payables" className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-900/30 p-4 rounded-xl border border-zinc-800/80">
            {/* Search & Filter inputs */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar fornecedor, despesa..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9 w-64 bg-zinc-950/80 border-zinc-800"
                />
              </div>

              <Select value={statusFilter} onValueChange={(val: any) => setStatusFilter(val)}>
                <SelectTrigger className="h-9 border-zinc-800 bg-zinc-950/80 text-xs w-36 font-sans">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Status</SelectItem>
                  <SelectItem value="pending">Pendentes</SelectItem>
                  <SelectItem value="paid">Pagos</SelectItem>
                  <SelectItem value="overdue">Vencidos</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button onClick={() => openNewEntryModal("expense")} className="h-9 font-semibold text-xs gap-1.5 font-sans bg-red-600 hover:bg-red-500">
              <Plus className="h-4 w-4" /> Lançar Despesa
            </Button>
          </div>

          {/* Payables List Cards */}
          {isLoadingEntries ? (
            <div className="py-20 text-center text-muted-foreground flex flex-col items-center gap-2">
              <Clock className="animate-spin h-6 w-6 text-primary" /> Carregando despesas...
            </div>
          ) : (
            <div className="space-y-3">
              {filteredExpenses.length === 0 ? (
                <div className="surface-card p-12 text-center text-muted-foreground border border-dashed border-zinc-800">
                  Nenhuma despesa encontrada para os filtros selecionados.
                </div>
              ) : (
                filteredExpenses.map((entry) => {
                  const balance = Number(entry.total_value) - Number(entry.paid_value);
                  return (
                    <div key={entry.id} className="surface-card p-5 border border-zinc-800/80 rounded-xl hover:border-zinc-700/80 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="space-y-2 flex-1 min-w-0 pr-4">
                        <div className="flex items-center gap-2.5">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                            entry.status === "paid"
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : entry.status === "overdue"
                              ? "bg-red-500/10 text-red-400 border border-red-500/20"
                              : "bg-zinc-800 text-zinc-400 border border-zinc-700/50"
                          }`}>
                            {entry.status === "paid" ? "Pago" : entry.status === "overdue" ? "Pendente Atrasado" : "Pendente"}
                          </span>
                          {(() => {
                            const rec = getRecurrenceLabel(entry);
                            return (
                              <span className={cn(
                                "px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider",
                                rec.type === "parceled" && "bg-amber-500/10 text-amber-400 border border-amber-500/20",
                                rec.type === "monthly" && "bg-purple-500/10 text-purple-400 border border-purple-500/20",
                                rec.type === "single" && "bg-zinc-800/85 text-zinc-400 border border-zinc-700/50"
                              )}>
                                {rec.badgeText}
                              </span>
                            );
                          })()}
                          <span className="text-[10px] text-zinc-500 font-semibold font-sans uppercase flex items-center gap-1">
                            <Tags className="h-3 w-3" /> {entry.category || "Sem categoria"}
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-zinc-100 truncate">{entry.title}</h4>
                        <div className="text-[11px] text-zinc-400 font-sans flex flex-wrap items-center gap-4">
                          <span className="flex items-center gap-1 text-zinc-300 font-medium">
                            <Briefcase className="h-3.5 w-3.5 text-zinc-500" /> {entry.recipient_provider || "Sem destinatário"}
                          </span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <CalendarDays className="h-3.5 w-3.5 text-zinc-500" /> Vence em {formatDate(entry.due_date)}
                          </span>
                        </div>
                      </div>

                      {/* Values & Actions */}
                      <div className="flex items-center gap-6 shrink-0 justify-between md:justify-end">
                        <div className="grid grid-cols-3 gap-6 text-right">
                          <div>
                            <div className="text-[10px] text-zinc-500 font-semibold font-sans uppercase">Valor Total</div>
                            <div className="text-xs font-bold text-zinc-300 mt-1">{formatCurrency(entry.total_value)}</div>
                          </div>
                          <div>
                            <div className="text-[10px] text-emerald-500 font-semibold font-sans uppercase">Valor Pago</div>
                            <div className="text-xs font-bold text-emerald-400 mt-1">{formatCurrency(entry.paid_value)}</div>
                          </div>
                          <div>
                            <div className="text-[10px] text-amber-500 font-semibold font-sans uppercase">Saldo Restante</div>
                            <div className="text-xs font-bold text-amber-400 mt-1">{formatCurrency(balance)}</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {entry.status !== "paid" && (
                            <Button size="sm" onClick={() => openPaymentModal(entry)} className="h-8 text-xs font-bold font-sans bg-zinc-800 text-zinc-200 hover:bg-zinc-700">
                              Pagar
                            </Button>
                          )}
                          <Button size="icon" variant="ghost" onClick={() => openEditEntryModal(entry)} className="h-8 w-8 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100">
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => handleDeleteEntry(entry.id)} className="h-8 w-8 hover:bg-red-500/10 text-zinc-400 hover:text-red-400">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </TabsContent>

        {/* 4. DRE & RELATÓRIOS TAB */}
        <TabsContent value="reports" className="space-y-6">
          {/* Charts area */}
          {renderChart()}

          {/* DRE Structure */}
          <div className="surface-card p-6 border border-zinc-800/80 rounded-xl space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800/80">
              <div>
                <h3 className="text-sm font-bold text-zinc-200 font-display">DRE — Demonstração do Resultado</h3>
                <p className="text-[11px] text-zinc-500 mt-0.5 font-sans">
                  Regime de Competência simplificado para o período selecionado.
                </p>
              </div>

              {/* Tax config switch */}
              <div className="flex items-center gap-3">
                <Label htmlFor="taxes" className="text-xs text-zinc-400 font-medium font-sans">
                  Deduzir Impostos s/ Vendas est. (6%)
                </Label>
                <Switch id="taxes" checked={taxesEnabled} onCheckedChange={setTaxesEnabled} />
              </div>
            </div>

            {/* DRE Table Rows */}
            <div className="space-y-3 font-sans text-xs">
              <div className="flex justify-between items-center py-2 text-zinc-300 font-semibold border-b border-zinc-800/40">
                <span>(+) RECEITA BRUTA (Faturamento do Mês)</span>
                <span className="font-bold text-emerald-400">{formatCurrency(summary?.revenue.total || 0)}</span>
              </div>

              {taxesEnabled && (
                <div className="flex justify-between items-center py-2 text-zinc-500">
                  <span>(-) Deduções (Impostos s/ Vendas est.)</span>
                  <span className="text-red-400">({formatCurrency((summary?.revenue.total || 0) * taxRate)})</span>
                </div>
              )}

              <div className="flex justify-between items-center py-2.5 text-zinc-200 font-bold border-b border-zinc-800/80">
                <span>(=) RECEITA LÍQUIDA</span>
                <span>
                  {formatCurrency(
                    (summary?.revenue.total || 0) - (taxesEnabled ? (summary?.revenue.total || 0) * taxRate : 0)
                  )}
                </span>
              </div>

              <div className="flex justify-between items-center py-2.5 text-zinc-200 font-bold border-b border-zinc-800/80">
                <span>(=) LUCRO BRUTO</span>
                <span>
                  {formatCurrency(
                    (summary?.revenue.total || 0) - (taxesEnabled ? (summary?.revenue.total || 0) * taxRate : 0)
                  )}
                </span>
              </div>

              <div className="flex justify-between items-center py-2 text-zinc-500">
                <span>(-) Outras Despesas Operacionais / Custos</span>
                <span className="text-red-400">({formatCurrency(summary?.expense.total || 0)})</span>
              </div>

              <div className="flex justify-between items-center py-3 text-zinc-100 font-extrabold border-t border-b border-zinc-800 mt-4 text-sm bg-zinc-900/10 px-3 rounded-lg">
                <span>(=) LUCRO LÍQUIDO DO PERÍODO</span>
                <span className={((summary?.revenue.total || 0) - (taxesEnabled ? (summary?.revenue.total || 0) * taxRate : 0) - (summary?.expense.total || 0)) >= 0 ? "text-emerald-400" : "text-red-400"}>
                  {formatCurrency(
                    (summary?.revenue.total || 0) -
                      (taxesEnabled ? (summary?.revenue.total || 0) * taxRate : 0) -
                      (summary?.expense.total || 0)
                  )}
                </span>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* A. NEW/EDIT TRANSACTION DIALOG */}
      <Dialog open={isEntryModalOpen} onOpenChange={setIsEntryModalOpen}>
        <DialogContent className="max-w-md bg-zinc-950 border border-zinc-800 rounded-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold text-zinc-100 font-display">
              {editingEntry ? "Editar Lançamento" : entryModalType === "revenue" ? "Novo Recebível" : "Nova Despesa"}
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500 font-sans">
              Preencha as informações do lançamento financeiro abaixo.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleEntrySubmit} className="space-y-4 text-xs font-sans mt-2">
            {editingEntry && (
              <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-lg p-3 flex items-center justify-between text-xs mb-1">
                <span className="text-zinc-500 font-semibold font-sans">Tipo de Lançamento</span>
                {(() => {
                  const rec = getRecurrenceLabel(editingEntry);
                  return (
                    <span className={cn(
                      "font-bold px-2 py-0.5 rounded-full uppercase tracking-wider text-[9px] border",
                      rec.type === "parceled" && "bg-amber-500/10 text-amber-400 border-amber-500/20",
                      rec.type === "monthly" && "bg-purple-500/10 text-purple-400 border-purple-500/20",
                      rec.type === "single" && "bg-zinc-850 text-zinc-400 border-zinc-700/50"
                    )}>
                      {rec.badgeText}
                    </span>
                  );
                })()}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="title" className="text-[11px] text-zinc-400 font-semibold font-sans">Título / Descrição *</Label>
              <Input
                id="title"
                required
                placeholder={entryModalType === "revenue" ? "Ex: Projeto Logo Design" : "Ex: Assinatura Adobe CC"}
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                className="bg-zinc-900/60 border-zinc-800 text-xs"
              />
            </div>

            {entryModalType === "revenue" ? (
              <div className="space-y-1.5">
                <Label htmlFor="client" className="text-[11px] text-zinc-400 font-semibold font-sans">Cliente Associado (Opcional)</Label>
                <Select value={formClientId} onValueChange={setFormClientId}>
                  <SelectTrigger id="client" className="bg-zinc-900/60 border-zinc-800 text-xs">
                    <SelectValue placeholder="Selecione um cliente" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-950 border-zinc-800">
                    <SelectItem value="none">Nenhum cliente (Avulso)</SelectItem>
                    {clients?.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="recipient" className="text-[11px] text-zinc-400 font-semibold font-sans">Destinatário / Fornecedor</Label>
                <Input
                  id="recipient"
                  placeholder="Ex: AWS, Salário James"
                  value={formRecipient}
                  onChange={(e) => setFormRecipient(e.target.value)}
                  className="bg-zinc-900/60 border-zinc-800 text-xs"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="total" className="text-[11px] text-zinc-400 font-semibold font-sans">Valor R$ *</Label>
                <Input
                  id="total"
                  required
                  type="number"
                  step="0.01"
                  placeholder="0,00"
                  value={formTotalValue}
                  onChange={(e) => setFormTotalValue(e.target.value)}
                  className="bg-zinc-900/60 border-zinc-800 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="due" className="text-[11px] text-zinc-400 font-semibold font-sans">Vencimento *</Label>
                <Input
                  id="due"
                  required
                  type="date"
                  value={formDueDate}
                  onChange={(e) => setFormDueDate(e.target.value)}
                  className="bg-zinc-900/60 border-zinc-800 text-xs"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="category" className="text-[11px] text-zinc-400 font-semibold font-sans">Categoria</Label>
              <Select value={formCategory} onValueChange={setFormCategory}>
                <SelectTrigger id="category" className="bg-zinc-900/60 border-zinc-800 text-xs">
                  <SelectValue placeholder="Selecione uma categoria" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-950 border-zinc-800">
                  {(entryModalType === "revenue" ? CATEGORIES_REVENUE : CATEGORIES_EXPENSE).map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {!editingEntry && entryModalType === "expense" && (
              <div className="border border-zinc-800/80 bg-zinc-900/10 p-3 rounded-lg space-y-3 mt-1 font-sans">
                <div className="space-y-1.5">
                  <Label htmlFor="recurrence" className="text-[10px] text-zinc-400 font-semibold">
                    Repetição / Recorrência
                  </Label>
                  <Select
                    value={recurrenceType}
                    onValueChange={(val: any) => setRecurrenceType(val)}
                  >
                    <SelectTrigger id="recurrence" className="bg-zinc-900/60 border-zinc-800 text-xs h-8">
                      <SelectValue placeholder="Selecione o tipo de repetição" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-950 border-zinc-800">
                      <SelectItem value="single">Única / Sem repetição</SelectItem>
                      <SelectItem value="monthly">Mensal Fixa (Recorrente)</SelectItem>
                      <SelectItem value="parceled">Parcelada (Instalações)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {recurrenceType === "parceled" && (
                  <div className="space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
                    <Label htmlFor="installments" className="text-[10px] text-zinc-400 font-semibold">
                      Quantidade de Parcelas *
                    </Label>
                    <Input
                      id="installments"
                      type="number"
                      min="1"
                      max="120"
                      value={installmentsCount}
                      onChange={(e) => setInstallmentsCount(e.target.value)}
                      className="bg-zinc-900/60 border-zinc-800 text-xs h-8"
                    />
                    <span className="text-[9px] text-zinc-500 italic block mt-0.5">
                      Gera {installmentsCount || 0} lançamentos mensais de R$ {Number(formTotalValue || 0).toFixed(2)} cada.
                    </span>
                  </div>
                )}

                {recurrenceType === "monthly" && (
                  <div className="space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] text-zinc-400 font-semibold">
                        Duração da Recorrência
                      </Label>
                      <Select
                        value={monthlyDurationType}
                        onValueChange={(val: any) => setMonthlyDurationType(val)}
                      >
                        <SelectTrigger className="bg-zinc-900/60 border-zinc-800 text-xs h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-950 border-zinc-800">
                          <SelectItem value="indefinite">Tempo indeterminado (Lançar 12 meses)</SelectItem>
                          <SelectItem value="until_date">Até data limite (Prazo final)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {monthlyDurationType === "until_date" && (
                      <div className="space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
                        <Label htmlFor="endDate" className="text-[10px] text-zinc-400 font-semibold">
                          Data Limite / Vencimento Final *
                        </Label>
                        <Input
                          id="endDate"
                          type="date"
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                          className="bg-zinc-900/60 border-zinc-800 text-xs h-8"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <DialogFooter className="pt-4 border-t border-zinc-800/80 gap-2">
              <Button type="button" variant="ghost" onClick={() => setIsEntryModalOpen(false)} className="text-xs h-9">
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={upsertMutation.isPending || createRecurringExpenseMutation.isPending}
                className="text-xs h-9 font-semibold"
              >
                {upsertMutation.isPending || createRecurringExpenseMutation.isPending ? "Salvando..." : "Salvar Lançamento"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* B. REGISTER PAYMENT DIALOG */}
      <Dialog open={isPaymentModalOpen} onOpenChange={setIsPaymentModalOpen}>
        <DialogContent className="max-w-md bg-zinc-950 border border-zinc-800 rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold text-zinc-100 font-display">
              Registrar Pagamento / Liquidação
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500 font-sans">
              Informe o valor pago para atualizar a transação: **{paymentEntry?.title}**.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handlePaymentSubmit} className="space-y-4 text-xs font-sans mt-2">
            <div className="bg-zinc-900/40 p-4 rounded-lg border border-zinc-800/80 space-y-1">
              <div className="flex justify-between">
                <span className="text-zinc-500">Valor Lançado:</span>
                <span className="font-semibold text-zinc-200">{formatCurrency(paymentEntry?.total_value || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Valor Já Pago:</span>
                <span className="font-semibold text-emerald-400">{formatCurrency(paymentEntry?.paid_value || 0)}</span>
              </div>
              <div className="flex justify-between border-t border-zinc-800 pt-1.5 mt-1.5 text-zinc-100 font-bold">
                <span>Saldo Restante:</span>
                <span className="text-amber-400">
                  {formatCurrency((paymentEntry?.total_value || 0) - (paymentEntry?.paid_value || 0))}
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="payAmount" className="text-[11px] text-zinc-400 font-semibold font-sans">Valor Pago R$ *</Label>
              <Input
                id="payAmount"
                required
                type="number"
                step="0.01"
                placeholder="0,00"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                className="bg-zinc-900/60 border-zinc-800 text-xs font-bold"
              />
              <span className="text-[10px] text-muted-foreground font-sans">
                Você pode registrar pagamentos parciais. Ao atingir o valor total, o status mudará para Pago automaticamente.
              </span>
            </div>

            <DialogFooter className="pt-4 border-t border-zinc-800/80 gap-2">
              <Button type="button" variant="ghost" onClick={() => setIsPaymentModalOpen(false)} className="text-xs h-9">
                Cancelar
              </Button>
              <Button type="submit" disabled={payMutation.isPending} className="text-xs h-9 font-semibold bg-emerald-600 hover:bg-emerald-500">
                {payMutation.isPending ? "Registrando..." : "Registrar Liquidação"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* C. DELETE RECURRENCE CONFIRMATION DIALOG */}
      <Dialog open={deleteRecurrenceOpen} onOpenChange={setDeleteRecurrenceOpen}>
        <DialogContent className="max-w-md bg-zinc-950 border border-zinc-800 rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold text-zinc-100 font-display">
              Excluir Lançamento Recorrente
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500 font-sans">
              Este lançamento faz parte de um pagamento recorrente/parcelado. Como deseja prosseguir com a exclusão?
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 pt-2">
            <Button
              type="button"
              variant="outline"
              className="w-full text-xs justify-start py-2.5 h-auto border-zinc-800 hover:bg-zinc-900 text-zinc-300"
              onClick={() => {
                if (targetDeleteEntry) {
                  deleteWithRecurrenceMutation.mutate({ id: targetDeleteEntry.id!, delete_future: false });
                }
              }}
              disabled={deleteWithRecurrenceMutation.isPending}
            >
              <div className="text-left">
                <p className="font-bold text-zinc-200">Excluir apenas este lançamento</p>
                <p className="text-[10px] text-zinc-500 font-normal">Remove apenas a fatura do mês selecionado.</p>
              </div>
            </Button>

            <Button
              type="button"
              variant="destructive"
              className="w-full text-xs justify-start py-2.5 h-auto text-white"
              onClick={() => {
                if (targetDeleteEntry) {
                  deleteWithRecurrenceMutation.mutate({ id: targetDeleteEntry.id!, delete_future: true });
                }
              }}
              disabled={deleteWithRecurrenceMutation.isPending}
            >
              <div className="text-left">
                <p className="font-bold text-red-100">Excluir este e todos os futuros</p>
                <p className="text-[10px] text-red-300/70 font-normal">Remove este lançamento e todos os próximos pendentes deste grupo.</p>
              </div>
            </Button>
          </div>

          <DialogFooter className="pt-4 border-t border-zinc-800/80 mt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setDeleteRecurrenceOpen(false);
                setTargetDeleteEntry(null);
              }}
              className="text-xs h-9"
              disabled={deleteWithRecurrenceMutation.isPending}
            >
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* D. EDIT RECURRENCE CONFIRMATION DIALOG */}
      <Dialog open={editRecurrenceOpen} onOpenChange={setEditRecurrenceOpen}>
        <DialogContent className="max-w-md bg-zinc-950 border border-zinc-800 rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold text-zinc-100 font-display">
              Editar Lançamento Recorrente
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500 font-sans">
              Você alterou campos contratuais de uma despesa recorrente. Deseja aplicar as alterações a:
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 pt-2">
            <Button
              type="button"
              variant="outline"
              className="w-full text-xs justify-start py-2.5 h-auto border-zinc-800 hover:bg-zinc-900 text-zinc-300"
              onClick={() => {
                if (targetEditData) {
                  updateWithRecurrenceMutation.mutate({
                    id: targetEditData.id,
                    update_future: false,
                    entry: targetEditData.entry,
                  });
                }
              }}
              disabled={updateWithRecurrenceMutation.isPending}
            >
              <div className="text-left">
                <p className="font-bold text-zinc-200">Apenas este lançamento</p>
                <p className="text-[10px] text-zinc-500 font-normal">Altera o título, valor ou fornecedor somente deste mês.</p>
              </div>
            </Button>

            <Button
              type="button"
              className="w-full text-xs justify-start py-2.5 h-auto bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700/50"
              onClick={() => {
                if (targetEditData) {
                  updateWithRecurrenceMutation.mutate({
                    id: targetEditData.id,
                    update_future: true,
                    entry: targetEditData.entry,
                  });
                }
              }}
              disabled={updateWithRecurrenceMutation.isPending}
            >
              <div className="text-left">
                <p className="font-bold text-zinc-200">Este e todos os futuros</p>
                <p className="text-[10px] text-zinc-400 font-normal">Replica as edições deste mês para todas as faturas futuras pendentes.</p>
              </div>
            </Button>
          </div>

          <DialogFooter className="pt-4 border-t border-zinc-800/80 mt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setEditRecurrenceOpen(false);
                setTargetEditData(null);
              }}
              className="text-xs h-9"
              disabled={updateWithRecurrenceMutation.isPending}
            >
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
