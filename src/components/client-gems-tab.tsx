import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  listClientGems,
  createClientGem,
  updateClientGem,
  deleteClientGem,
  type ClientGem,
} from "@/lib/client-gems.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sparkles, Plus, Pencil, Trash2, ExternalLink, Bot } from "lucide-react";

export function ClientGemsTab({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const listGemsFn = useServerFn(listClientGems);
  const createGemFn = useServerFn(createClientGem);
  const updateGemFn = useServerFn(updateClientGem);
  const deleteGemFn = useServerFn(deleteClientGem);

  const { data: gems = [], isLoading } = useQuery({
    queryKey: ["client-gems", clientId],
    queryFn: () => listGemsFn({ data: { client_id: clientId } }),
  });

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingGem, setEditingGem] = useState<ClientGem | null>(null);
  const [name, setName] = useState("");
  const [gemUrl, setGemUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const handleOpenAdd = () => {
    setEditingGem(null);
    setName("");
    setGemUrl("");
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (gem: ClientGem) => {
    setEditingGem(gem);
    setName(gem.name);
    setGemUrl(gem.gem_url);
    setIsDialogOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Informe o nome da marca/especialista.");
      return;
    }
    if (!gemUrl.trim()) {
      toast.error("Informe a URL do Gem.");
      return;
    }

    setSaving(true);
    try {
      if (editingGem) {
        await updateGemFn({
          data: {
            id: editingGem.id,
            name,
            gem_url: gemUrl,
          },
        });
        toast.success("Gem atualizado com sucesso!");
      } else {
        await createGemFn({
          data: {
            client_id: clientId,
            name,
            gem_url: gemUrl,
          },
        });
        toast.success("Gem cadastrado com sucesso!");
      }

      qc.invalidateQueries({ queryKey: ["client-gems", clientId] });
      setIsDialogOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar Gem.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (gemId: string) => {
    if (!confirm("Tem certeza que deseja excluir este Gem/Agente?")) return;

    try {
      await deleteGemFn({ data: { id: gemId } });
      toast.success("Gem removido com sucesso.");
      qc.invalidateQueries({ queryKey: ["client-gems", clientId] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao remover Gem.");
    }
  };

  return (
    <div className="space-y-6 py-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-400" />
            IA / Agentes do Cliente
          </h3>
          <p className="text-xs text-muted-foreground">
            Cadastre os Gems e especialistas de IA para esta marca. Eles estarão disponíveis para criação de layouts no modal de demanda.
          </p>
        </div>
        <Button onClick={handleOpenAdd} size="sm" className="gap-1.5 cursor-pointer">
          <Plus className="h-4 w-4" />
          Adicionar Gem / Agente
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-xs text-muted-foreground">Carregando Agentes...</div>
      ) : gems.length === 0 ? (
        <Card className="border-dashed py-10 text-center">
          <CardContent className="flex flex-col items-center justify-center gap-3">
            <Bot className="h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm font-medium text-muted-foreground">Nenhum Gem cadastrado para este cliente.</p>
            <p className="text-xs text-muted-foreground/75 max-w-sm">
              Adicione os URLs dos Gems do Google Gemini especificando o nome da marca ou especialista (ex: Profitin, Dinâmica, Nathália).
            </p>
            <Button onClick={handleOpenAdd} variant="outline" size="sm" className="mt-2 gap-1.5 cursor-pointer">
              <Plus className="h-4 w-4" /> Cadastrar Primeiro Gem
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {gems.map((gem) => (
            <Card key={gem.id} className="relative group hover:border-amber-500/50 transition-colors">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center font-bold text-xs shrink-0">
                      <Sparkles className="h-4 w-4" />
                    </div>
                    <div>
                      <CardTitle className="text-sm font-semibold">{gem.name}</CardTitle>
                      <CardDescription className="text-[11px] truncate max-w-[200px]" title={gem.gem_url}>
                        {gem.gem_url}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                      onClick={() => handleOpenEdit(gem)}
                      title="Editar"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400"
                      onClick={() => handleDelete(gem.id)}
                      title="Excluir"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs gap-1.5 cursor-pointer hover:bg-muted"
                  onClick={() => window.open(gem.gem_url, "_blank")}
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Abrir no Gemini
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog to Add/Edit Gem */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <Sparkles className="h-4 w-4 text-amber-400" />
              {editingGem ? "Editar Gem / Agente" : "Novo Gem / Agente"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Nome da Marca / Especialista</Label>
              <Input
                placeholder="Ex: Profitin, Dinâmica, Nathália..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="text-xs"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">URL do Gem (Gemini)</Label>
              <Input
                placeholder="https://gemini.google.com/gems/..."
                value={gemUrl}
                onChange={(e) => setGemUrl(e.target.value)}
                className="text-xs"
                type="url"
                required
              />
            </div>
            <DialogFooter className="pt-3">
              <Button type="button" variant="outline" size="sm" onClick={() => setIsDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={saving}>
                {saving ? "Salvando..." : editingGem ? "Salvar Alterações" : "Cadastrar Gem"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
