import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  getClient,
  updateClient,
  deleteClient,
} from "@/lib/clients.functions";
import {
  listDemands,
  moveDemandStatus,
  createDemand,
  type DemandStatus,
} from "@/lib/demands.functions";
import { KanbanBoard } from "@/components/kanban-board";
import { DemandForm, type DemandFormValues } from "@/components/demand-form";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useDemandOverlay } from "@/contexts/demand-overlay";
import { listNotes, upsertNote, deleteNote, NOTE_TYPES } from "@/lib/notes.functions";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ClientForm, type ClientFormValues } from "@/components/client-form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ArrowLeft, Trash2, Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/clients/$id")({
  head: () => ({ meta: [{ title: "Cliente" }] }),
  component: ClientPage,
});

function ClientPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const getFn = useServerFn(getClient);
  const updateFn = useServerFn(updateClient);
  const deleteFn = useServerFn(deleteClient);
  const demandsFn = useServerFn(listDemands);
  const moveFn = useServerFn(moveDemandStatus);
  const createFn = useServerFn(createDemand);

  const { data: client } = useQuery({
    queryKey: ["client", id],
    queryFn: () => getFn({ data: { id } }),
  });
  const { data: allDemands = [] } = useQuery({
    queryKey: ["demands"],
    queryFn: () => demandsFn(),
  });
  const clientDemands = allDemands.filter((d) => d.client_id === id);

  const [saving, setSaving] = useState(false);
  const overlay = useDemandOverlay();

  async function handleMove(demandId: string, status: DemandStatus) {
    qc.setQueryData<typeof allDemands>(["demands"], (prev) =>
      (prev ?? []).map((d) => (d.id === demandId ? { ...d, status } : d)),
    );
    try {
      await moveFn({ data: { id: demandId, status } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao mover");
      qc.invalidateQueries({ queryKey: ["demands"] });
    }
  }

  async function handleSave(values: ClientFormValues) {
    setSaving(true);
    try {
      await updateFn({ data: { ...values, id } });
      toast.success("Salvo!");
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["client", id] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Excluir este cliente?")) return;
    try {
      await deleteFn({ data: { id } });
      toast.success("Excluído.");
      qc.invalidateQueries({ queryKey: ["clients"] });
      navigate({ to: "/clients" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  if (!client) return <div className="p-6 text-muted-foreground">Carregando...</div>;

  return (
    <div className="w-full p-4 md:p-6 space-y-4">
      <button
        onClick={() => navigate({ to: "/clients" })}
        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
      >
        <ArrowLeft className="h-3 w-3" /> Voltar
      </button>

      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold text-foreground">{client.name}</h2>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant={client.access_active ? "default" : "secondary"}>
              {client.access_active ? "Ativo" : "Inativo"}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {client.billing_model === "credits" ? "Créditos" : "Fixo"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {client.slug && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const url = `${window.location.origin}/portal/${client.slug}`;
                navigator.clipboard.writeText(url);
                toast.success("Link do portal copiado!");
              }}
            >
              Copiar link do portal
            </Button>
          )}
          <Button variant="destructive" size="sm" onClick={handleDelete}>
            <Trash2 className="h-4 w-4 mr-1" /> Excluir
          </Button>
        </div>
      </div>

      <Tabs defaultValue="demands">
        <TabsList>
          <TabsTrigger value="demands">
            Demandas ({clientDemands.length})
          </TabsTrigger>
          <TabsTrigger value="overview">Visão geral</TabsTrigger>
          <TabsTrigger value="notes">Notas</TabsTrigger>
        </TabsList>

        <TabsContent value="demands" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setOpenNew(true)} size="sm">
              <Plus className="h-4 w-4 mr-1" /> Nova demanda
            </Button>
          </div>

          <KanbanBoard
            demands={clientDemands.map((d) => ({
              id: d.id,
              title: d.title,
              status: d.status,
              priority: d.priority,
              due_date: d.due_date,
              clients: d.clients ?? null,
            }))}
            onMove={handleMove}
            onOpen={(demandId) => overlay.open(demandId, [{ id: client.id, name: client.name }])}
            onAdd={(status) => overlay.openNew([{ id: client.id, name: client.name }], client.id, status)}
          />
        </TabsContent>

        <TabsContent value="overview" className="mt-4">
          <Card className="p-6">
            <ClientForm
              initial={{
                name: client.name,
                contact_name: client.contact_name,
                email: client.email,
                phone: client.phone,
                billing_model: client.billing_model,
                fixed_type: client.fixed_type,
                monthly_value: client.monthly_value,
                commercial_notes: client.commercial_notes,
                internal_notes: client.internal_notes,
                credits_enabled: client.credits_enabled,
                access_active: client.access_active,
              }}
              onSubmit={handleSave}
              submitting={saving}
            />
          </Card>
        </TabsContent>

        <TabsContent value="notes" className="mt-4">
          <ClientNotesPanel clientId={id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ClientNotesPanel({ clientId }: { clientId: string }) {
  const listFn = useServerFn(listNotes);
  const upsertFn = useServerFn(upsertNote);
  const delFn = useServerFn(deleteNote);
  const qc = useQueryClient();
  const { data: notes = [] } = useQuery({
    queryKey: ["notes", clientId],
    queryFn: () => listFn({ data: { client_id: clientId } }),
  });

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [noteType, setNoteType] =
    useState<(typeof NOTE_TYPES)[number]>("observacoes");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await upsertFn({
        data: {
          client_id: clientId,
          title,
          content,
          note_type: noteType,
          visibility: "private",
        },
      });
      setTitle("");
      setContent("");
      qc.invalidateQueries({ queryKey: ["notes", clientId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Excluir nota?")) return;
    await delFn({ data: { id } });
    qc.invalidateQueries({ queryKey: ["notes", clientId] });
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <Label>Título</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <Label>Tipo</Label>
            <Select value={noteType} onValueChange={(v) => setNoteType(v as typeof noteType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {NOTE_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label>Conteúdo</Label>
          <Textarea rows={3} value={content} onChange={(e) => setContent(e.target.value)} />
        </div>
        <div className="flex justify-end">
          <Button onClick={save} disabled={saving || !title.trim()} size="sm">
            <Plus className="h-4 w-4 mr-1" /> Adicionar nota
          </Button>
        </div>
      </Card>

      <div className="space-y-2">
        {notes.map((n) => (
          <Card key={n.id} className="p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <div className="font-medium text-sm text-foreground">{n.title}</div>
                  <Badge variant="secondary" className="text-[10px]">{n.note_type}</Badge>
                </div>
                {n.content && (
                  <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{n.content}</p>
                )}
                <div className="text-xs text-muted-foreground mt-2">
                  {new Date(n.updated_at).toLocaleString("pt-BR")}
                </div>
              </div>
              <button
                onClick={() => remove(n.id)}
                className="text-muted-foreground hover:text-destructive"
                aria-label="Excluir"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </Card>
        ))}
        {notes.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">Nenhuma nota ainda.</p>
        )}
      </div>
    </div>
  );
}