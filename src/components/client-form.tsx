import { useState, type FormEvent } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ClientColorPicker } from "@/components/client-color-picker";

export type ClientFormValues = {
  id?: string;
  name: string;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  billing_model: "fixed" | "credits" | "seasonal";
  fixed_type?: "monthly" | "one_off" | null;
  monthly_value?: number | null;
  commercial_notes?: string | null;
  internal_notes?: string | null;
  access_active: boolean;
  color?: string | null;
  parent_id?: string | null;
  is_project?: boolean;
};

export function ClientForm({
  initial,
  onSubmit,
  submitting,
  submitLabel = "Salvar",
  hideBilling = false,
}: {
  initial?: Partial<ClientFormValues>;
  onSubmit: (values: ClientFormValues) => void;
  submitting?: boolean;
  submitLabel?: string;
  hideBilling?: boolean;
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
    access_active: initial?.access_active ?? true,
    color: initial?.color ?? null,
    parent_id: initial?.parent_id ?? null,
    is_project: initial?.is_project ?? false,
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
        {!hideBilling && (
          <div>
            <Label>Modelo de cobrança</Label>
            <Select
              value={
                v.billing_model === "credits"
                  ? "credits"
                  : v.billing_model === "seasonal"
                    ? "seasonal"
                    : v.fixed_type === "one_off"
                      ? "one_off"
                      : "fixed_monthly"
              }
              onValueChange={(val) => {
                if (val === "credits") {
                  setV({ ...v, billing_model: "credits", fixed_type: null });
                } else if (val === "seasonal") {
                  setV({ ...v, billing_model: "seasonal", fixed_type: null, monthly_value: null });
                } else if (val === "one_off") {
                  setV({ ...v, billing_model: "fixed", fixed_type: "one_off" });
                } else {
                  setV({ ...v, billing_model: "fixed", fixed_type: "monthly" });
                }
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="fixed_monthly">Pagamento Mensal Fixo</SelectItem>
                <SelectItem value="credits">Mensal com Créditos</SelectItem>
                <SelectItem value="one_off">Pagamento por Projeto</SelectItem>
                <SelectItem value="seasonal">Por Temporada (Eventos)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        {!hideBilling && (v.billing_model === "fixed" || v.billing_model === "credits") && (
          <div>
            <Label>
              {v.billing_model === "credits"
                ? "Valor Mínimo / Retentor Mensal (R$)"
                : v.fixed_type === "one_off"
                  ? "Valor por Projeto (R$)"
                  : "Valor mensal (R$)"}
            </Label>
            <Input
              type="number"
              step="0.01"
              value={v.monthly_value ?? ""}
              onChange={(e) =>
                setV({ ...v, monthly_value: e.target.value ? Number(e.target.value) : null })
              }
              placeholder={v.billing_model === "credits" ? "Opcional (ex: 1200)" : ""}
            />
          </div>
        )}
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
        <ClientColorPicker
          value={v.color ?? ""}
          onChange={(color) => setV({ ...v, color })}
        />
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