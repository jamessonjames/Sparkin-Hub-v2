import type { DemandStatus } from "./demands.functions";

export const STATUS_LABELS: Record<DemandStatus, string> = {
  rascunho: "Rascunho",
  nao_iniciado: "Não iniciado",
  fazendo: "Fazendo",
  para_analise: "Para análise",
  com_ajustes: "Com ajustes",
  concluido: "Concluído",
};

export const PRIORITY_LABELS: Record<string, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  urgent: "Urgente",
};

export const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-primary/20 text-primary",
  high: "bg-amber-500/20 text-amber-500",
  urgent: "bg-destructive/20 text-destructive",
};