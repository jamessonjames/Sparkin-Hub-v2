import { useState, type FormEvent } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

export type ClientFormValues = {
  id?: string;
  name: string;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  billing_model: "fixed" | "credits";
  fixed_type?: "monthly" | "one_off" | null;
  monthly_value?: number | null;
  commercial_notes?: string | null;
  internal_notes?: string | null;
  credits_enabled: boolean;
  access_active: boolean;
};

export function ClientForm({
  initial,
  onSubmit,
  submitting,
  submitLabel = "Salvar",
}: {
  initial?: Partial<ClientFormValues>;
  onSubmit: (values: ClientFormValues) => void;
  submitting?: boolean;
  submitLabel?: string;
}) {
  const [v, setV] = useState<ClientFormValues>({
    name: initial?.name ?? "",
    contact_name: initial?.contact_name ?? "",
    email: initial?.email ?? "",
    phone: initial?.phone ?? "",
    billing_model: initial?.billing_model ?? "fixed",
    fixed_type: initial?.fixed_type ?? "monthly",
    monthly_value: initial?.monthly_value ?? null,
    commercial_notes: initial?.commercial_notes ?? "",
    internal_notes: initial?.internal_notes ?? "",
    credits_enabled: initial?.credits_enabled ?? false,
    access_active: initial?.access_active ?? true,
  });

  function handle(e: FormEvent) {
    e.preventDefault();
    onSubmit(v);
  }

  return (
    <form onSubmit={handle} className="space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <Label>Nome *</Label>
          <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} required />
        </div>
        <div>
          <Label>Contato</Label>
          <Input
            value={v.contact_name ?? ""}
            onChange={(e) => setV({ ...v, contact_name: e.target.value })}
          />
        </div>
        <div>
          <Label>E-mail</Label>
          <Input
            type="email"
            value={v.email ?? ""}
            onChange={(e) => setV({ ...v, email: e.target.value })}
          />
        </div>
        <div>
          <Label>Telefone</Label>
          <Input
            value={v.phone ?? ""}
            onChange={(e) => setV({ ...v, phone: e.target.value })}
          />
        </div>
        <div>
          <Label>Modelo de cobrança</Label>
          <Select
            value={v.billing_model}
            onValueChange={(val) => setV({ ...v, billing_model: val as "fixed" | "credits" })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="fixed">Fixo</SelectItem>
              <SelectItem value="credits">Créditos</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {v.billing_model === "fixed" && (
          <div>
            <Label>Tipo</Label>
            <Select
              value={v.fixed_type ?? "monthly"}
              onValueChange={(val) => setV({ ...v, fixed_type: val as "monthly" | "one_off" })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Mensal</SelectItem>
                <SelectItem value="one_off">Pontual</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        <div>
          <Label>Valor mensal (R$)</Label>
          <Input
            type="number"
            step="0.01"
            value={v.monthly_value ?? ""}
            onChange={(e) =>
              setV({ ...v, monthly_value: e.target.value ? Number(e.target.value) : null })
            }
          />
        </div>
      </div>

      <div>
        <Label>Notas comerciais</Label>
        <Textarea
          rows={3}
          value={v.commercial_notes ?? ""}
          onChange={(e) => setV({ ...v, commercial_notes: e.target.value })}
        />
      </div>
      <div>
        <Label>Notas internas</Label>
        <Textarea
          rows={3}
          value={v.internal_notes ?? ""}
          onChange={(e) => setV({ ...v, internal_notes: e.target.value })}
        />
      </div>

      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={v.credits_enabled}
            onCheckedChange={(c) => setV({ ...v, credits_enabled: c })}
          />
          Créditos habilitados
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={v.access_active}
            onCheckedChange={(c) => setV({ ...v, access_active: c })}
          />
          Acesso ativo
        </label>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Salvando..." : submitLabel}
        </Button>
      </div>
    </form>
  );
}