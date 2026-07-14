import { useState, type FormEvent } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { DEMAND_STATUSES, type DemandStatus } from "@/lib/demands.functions";
import { STATUS_LABELS, PRIORITY_LABELS } from "@/lib/demand-labels";

export type DemandFormValues = {
  id?: string;
  client_id: string;
  title: string;
  description?: string | null;
  status: DemandStatus;
  priority: "low" | "medium" | "high" | "urgent";
  due_date?: string | null;
  estimated_credits?: number | null;
  internal_notes?: string | null;
};

export function DemandForm({
  initial,
  clients,
  onSubmit,
  submitting,
  submitLabel = "Salvar",
  lockedClient,
}: {
  initial?: Partial<DemandFormValues>;
  clients: { id: string; name: string }[];
  onSubmit: (values: DemandFormValues) => void;
  submitting?: boolean;
  submitLabel?: string;
  lockedClient?: boolean;
}) {
  const [v, setV] = useState<DemandFormValues>({
    client_id: initial?.client_id ?? clients[0]?.id ?? "",
    title: initial?.title ?? "",
    description: initial?.description ?? "",
    status: initial?.status ?? "nao_iniciado",
    priority: initial?.priority ?? "medium",
    due_date: initial?.due_date ?? "",
    estimated_credits: initial?.estimated_credits ?? null,
    internal_notes: initial?.internal_notes ?? "",
  });

  function handle(e: FormEvent) {
    e.preventDefault();
    if (!v.client_id) return;
    onSubmit(v);
  }

  return (
    <form onSubmit={handle} className="space-y-4">
      <div>
        <Label>Título *</Label>
        <Input
          value={v.title}
          onChange={(e) => setV({ ...v, title: e.target.value })}
          required
        />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {!lockedClient && (
          <div>
            <Label>Cliente *</Label>
            <Select value={v.client_id} onValueChange={(val) => setV({ ...v, client_id: val })}>
              <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div>
          <Label>Status</Label>
          <Select
            value={v.status}
            onValueChange={(val) => setV({ ...v, status: val as DemandStatus })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {DEMAND_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Prioridade</Label>
          <Select
            value={v.priority}
            onValueChange={(val) => setV({ ...v, priority: val as DemandFormValues["priority"] })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(["low", "medium", "high", "urgent"] as const).map((p) => (
                <SelectItem key={p} value={p}>{PRIORITY_LABELS[p]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Prazo</Label>
          <Input
            type="date"
            value={v.due_date ?? ""}
            onChange={(e) => setV({ ...v, due_date: e.target.value })}
          />
        </div>
        <div>
          <Label>Créditos estimados</Label>
          <Input
            type="number"
            min={0}
            value={v.estimated_credits ?? ""}
            onChange={(e) =>
              setV({ ...v, estimated_credits: e.target.value ? Number(e.target.value) : null })
            }
          />
        </div>
      </div>

      <div>
        <Label>Descrição</Label>
        <Textarea
          rows={4}
          value={v.description ?? ""}
          onChange={(e) => setV({ ...v, description: e.target.value })}
        />
      </div>
      <div>
        <Label>Notas internas</Label>
        <Textarea
          rows={2}
          value={v.internal_notes ?? ""}
          onChange={(e) => setV({ ...v, internal_notes: e.target.value })}
        />
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={submitting || !v.client_id}>
          {submitting ? "Salvando..." : submitLabel}
        </Button>
      </div>
    </form>
  );
}