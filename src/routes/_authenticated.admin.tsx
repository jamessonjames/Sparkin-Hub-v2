import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listUsersWithRoles, updateUserRole } from "@/lib/users.functions";
import { applyThemeAndHighlight, HIGHLIGHT_COLORS, type HighlightColor } from "@/utils/theme";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Settings,
  Users,
  Link as LinkIcon,
  Palette,
  Check,
  HelpCircle,
  Calendar,
  MessageSquare,
  Globe,
  Upload,
  User,
  Info,
  Save,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Painel Admin — Creative Flow Hub" }] }),
  component: AdminPage,
});

const ROLE_LABELS: Record<string, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  collaborator: "Colaborador",
};

const ROLE_DESC: Record<string, string> = {
  owner: "Acesso total a todas as áreas, clientes, demandas, faturamentos e configurações do sistema.",
  admin: "Acesso completo de gestão. Pode criar, editar e excluir clientes, demandas e gerenciar usuários.",
  collaborator: "Acesso restrito. Só visualiza e edita demandas atribuídas diretamente ao seu usuário.",
};

function AdminPage() {
  const qc = useQueryClient();
  const listUsersFn = useServerFn(listUsersWithRoles);
  const updateRoleFn = useServerFn(updateUserRole);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users-with-roles"],
    queryFn: () => listUsersFn(),
  });

  // Local storage branding settings
  const [systemName, setSystemName] = useState("Creative Flow");
  const [faviconUrl, setFaviconUrl] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [highlightColor, setHighlightColor] = useState<HighlightColor>("roxo");
  const [customHex, setCustomHex] = useState("#4f46e5");

  // User creation states
  const [openCreate, setOpenCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"owner" | "admin" | "collaborator">("collaborator");
  const [creatingUser, setCreatingUser] = useState(false);

  // Integrations states (persisted in localstorage)
  const [notionEnabled, setNotionEnabled] = useState(false);
  const [notionToken, setNotionToken] = useState("");
  const [trelloEnabled, setTrelloEnabled] = useState(false);
  const [trelloToken, setTrelloToken] = useState("");
  const [googleCalendarEnabled, setGoogleCalendarEnabled] = useState(false);
  const [googleClientId, setGoogleClientId] = useState("");
  const [whatsappEnabled, setWhatsappEnabled] = useState(false);
  const [whatsappPhone, setWhatsappPhone] = useState("");

  // Load configuration from localstorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedName = localStorage.getItem("CF_SystemName") || "Creative Flow";
      const savedTheme = (localStorage.getItem("CF_Theme") as "light" | "dark") || "dark";
      const savedFavicon = localStorage.getItem("CF_Favicon") || "";
      const savedColor = (localStorage.getItem("CF_HighlightColor") || "roxo") as HighlightColor;
      const savedHex = localStorage.getItem("CF_CustomHex") || "#4f46e5";
      setSystemName(savedName);
      setTheme(savedTheme);
      setFaviconUrl(savedFavicon);
      setHighlightColor(savedColor);
      setCustomHex(savedHex);

      setNotionEnabled(localStorage.getItem("CF_Int_NotionEnabled") === "true");
      setNotionToken(localStorage.getItem("CF_Int_NotionToken") || "");
      setTrelloEnabled(localStorage.getItem("CF_Int_TrelloEnabled") === "true");
      setTrelloToken(localStorage.getItem("CF_Int_TrelloToken") || "");
      setGoogleCalendarEnabled(localStorage.getItem("CF_Int_GoogleCalendarEnabled") === "true");
      setGoogleClientId(localStorage.getItem("CF_Int_GoogleClientId") || "");
      setWhatsappEnabled(localStorage.getItem("CF_Int_WhatsappEnabled") === "true");
      setWhatsappPhone(localStorage.getItem("CF_Int_WhatsappPhone") || "");
    }
  }, []);

  const updateThemeInstantly = (newTheme: "light" | "dark") => {
    setTheme(newTheme);
    localStorage.setItem("CF_Theme", newTheme);
    applyThemeAndHighlight();
  };

  const updateColorInstantly = (newColor: HighlightColor) => {
    setHighlightColor(newColor);
    localStorage.setItem("CF_HighlightColor", newColor);
    applyThemeAndHighlight();
  };

  const updateCustomHexInstantly = (newHex: string) => {
    setCustomHex(newHex);
    localStorage.setItem("CF_CustomHex", newHex);
    localStorage.setItem("CF_HighlightColor", "custom");
    setHighlightColor("custom");
    applyThemeAndHighlight();
  };

  async function handleSaveBranding(e: React.FormEvent) {
    e.preventDefault();
    localStorage.setItem("CF_SystemName", systemName);
    localStorage.setItem("CF_Favicon", faviconUrl);
    applyThemeAndHighlight();
    toast.success("Configurações de marca atualizadas!");
  }

  async function handleSaveIntegrations() {
    localStorage.setItem("CF_Int_NotionEnabled", String(notionEnabled));
    localStorage.setItem("CF_Int_NotionToken", notionToken);
    localStorage.setItem("CF_Int_TrelloEnabled", String(trelloEnabled));
    localStorage.setItem("CF_Int_TrelloToken", trelloToken);
    localStorage.setItem("CF_Int_GoogleCalendarEnabled", String(googleCalendarEnabled));
    localStorage.setItem("CF_Int_GoogleClientId", googleClientId);
    localStorage.setItem("CF_Int_WhatsappEnabled", String(whatsappEnabled));
    localStorage.setItem("CF_Int_WhatsappPhone", whatsappPhone);
    toast.success("Integrações salvas!");
  }

  async function handleRoleChange(userId: string, newRole: "owner" | "admin" | "collaborator") {
    try {
      await updateRoleFn({ data: { userId, role: newRole } });
      toast.success("Nível de acesso atualizado!");
      qc.invalidateQueries({ queryKey: ["users-with-roles"] });
    } catch (e) {
      toast.error("Erro ao atualizar nível de acesso");
    }
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || !newEmail.trim() || !newPassword.trim()) {
      toast.error("Preencha todos os campos obrigatórios.");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres.");
      return;
    }

    setCreatingUser(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-users", {
        body: {
          action: "createUser",
          email: newEmail,
          password: newPassword,
          name: newName,
          role: newRole,
        },
      });

      if (error) {
        // If invoking edge function failed (e.g. function not deployed yet)
        throw new Error(error.message || "A função edge 'admin-users' pode não estar implantada.");
      }

      toast.success("Usuário criado com sucesso!");
      setOpenCreate(false);
      setNewName("");
      setNewEmail("");
      setNewPassword("");
      setNewRole("collaborator");
      qc.invalidateQueries({ queryKey: ["users-with-roles"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar usuário");
    } finally {
      setCreatingUser(false);
    }
  }


  return (
    <div className="w-full p-4 md:p-6 space-y-6 pb-24 md:pb-6">
      <div>
        <h2 className="font-display text-2xl font-bold text-foreground">Painel Administrativo</h2>
        <p className="text-sm text-muted-foreground">Configurações globais, controle de acessos e integrações do sistema.</p>
      </div>

      <Tabs defaultValue="branding" className="w-full">
        <TabsList className="bg-surface-2 border border-border">
          <TabsTrigger value="branding" className="text-xs gap-1.5">
            <Palette className="h-3.5 w-3.5" /> Marca & Tema
          </TabsTrigger>
          <TabsTrigger value="access" className="text-xs gap-1.5">
            <Users className="h-3.5 w-3.5" /> Controle de Acesso
          </TabsTrigger>
          <TabsTrigger value="integrations" className="text-xs gap-1.5">
            <LinkIcon className="h-3.5 w-3.5" /> Integrações
          </TabsTrigger>
        </TabsList>

        {/* ── SEÇÃO: MARCA & TEMA ── */}
        <TabsContent value="branding" className="mt-4">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Personalização Visual</CardTitle>
              <CardDescription className="text-xs">Configure o nome da plataforma, ícones e cores.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveBranding} className="space-y-5 max-w-xl">
                <div className="space-y-1">
                  <Label htmlFor="sysname" className="text-xs text-muted-foreground font-semibold">Nome do Sistema</Label>
                  <Input
                    id="sysname"
                    value={systemName}
                    onChange={(e) => setSystemName(e.target.value)}
                    className="bg-surface-2 border-border text-foreground text-sm h-9"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="favicon" className="text-xs text-muted-foreground font-semibold font-sans">URL do Favicon (.ico / .png)</Label>
                  <div className="flex gap-2">
                    <Input
                      id="favicon"
                      placeholder="https://exemplo.com/favicon.png"
                      value={faviconUrl}
                      onChange={(e) => setFaviconUrl(e.target.value)}
                      className="bg-surface-2 border-border text-foreground text-sm h-9 flex-1"
                    />
                    <Button type="button" variant="outline" className="border-border gap-1.5 text-xs text-foreground hover:bg-surface-2 h-9">
                      <Upload className="h-3.5 w-3.5" /> Subir
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground font-semibold">Tema Padrão</Label>
                  <div className="flex gap-4">
                    <label className={cn(
                      "flex items-center gap-2 border border-border bg-surface-2/40 rounded-lg px-4 py-2 cursor-pointer hover:bg-surface-2 transition-all flex-1 text-center justify-center font-semibold text-xs text-muted-foreground",
                      theme === "dark" && "border-[var(--primary)] bg-[var(--primary)]/10 text-foreground"
                    )}>
                      <input type="radio" name="theme" value="dark" checked={theme === "dark"} onChange={() => updateThemeInstantly("dark")} className="hidden" />
                      Tema Escuro (Recomendado)
                    </label>
                    <label className={cn(
                      "flex items-center gap-2 border border-border bg-surface-2/40 rounded-lg px-4 py-2 cursor-pointer hover:bg-surface-2 transition-all flex-1 text-center justify-center font-semibold text-xs text-muted-foreground",
                      theme === "light" && "border-[var(--primary)] bg-[var(--primary)]/10 text-foreground"
                    )}>
                      <input type="radio" name="theme" value="light" checked={theme === "light"} onChange={() => updateThemeInstantly("light")} className="hidden" />
                      Tema Claro
                    </label>
                  </div>
                </div>

                {/* Cores de Destaque */}
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground font-semibold">Cores Sólidas</Label>
                    <div className="flex gap-2.5 flex-wrap">
                      {["roxo", "azul", "verde", "rosa", "laranja"].map((color) => {
                        const details = HIGHLIGHT_COLORS[color];
                        const nameCapitalized = color === "roxo" ? "Roxo (Padrão)" : color.charAt(0).toUpperCase() + color.slice(1);
                        return (
                          <button
                            key={color}
                            type="button"
                            onClick={() => updateColorInstantly(color as any)}
                            className={cn(
                              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer",
                              highlightColor === color
                                ? "border-[var(--primary)] bg-[var(--primary)]/10 text-foreground"
                                : "border-border bg-surface-2/40 text-muted-foreground hover:border-foreground/30"
                            )}
                            style={{
                              "--primary": details.primary,
                            } as React.CSSProperties}
                          >
                            <span
                              className="h-3 w-3 rounded-full shrink-0 border border-black/20"
                              style={{ backgroundColor: details.primary }}
                            />
                            {nameCapitalized}
                            {highlightColor === color && <Check className="h-3.5 w-3.5 ml-1 text-primary shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground font-semibold">Degradês Premium (Efeito Visual)</Label>
                    <div className="flex gap-2.5 flex-wrap">
                      {["sunset", "ocean", "aurora", "cyberpunk"].map((color) => {
                        const details = HIGHLIGHT_COLORS[color];
                        const nameCapitalized = color.charAt(0).toUpperCase() + color.slice(1);
                        return (
                          <button
                            key={color}
                            type="button"
                            onClick={() => updateColorInstantly(color as any)}
                            className={cn(
                              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer",
                              highlightColor === color
                                ? "border-[var(--primary)] bg-[var(--primary)]/10 text-foreground"
                                : "border-border bg-surface-2/40 text-muted-foreground hover:border-foreground/30"
                            )}
                            style={{
                              "--primary": details.primary,
                            } as React.CSSProperties}
                          >
                            <span
                              className="h-3 w-6 rounded-md shrink-0 border border-black/20"
                              style={{ backgroundImage: details.gradient }}
                            />
                            {nameCapitalized}
                            {highlightColor === color && <Check className="h-3.5 w-3.5 ml-1 text-primary shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground font-semibold">Cor Personalizada (Hexadecimal)</Label>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => updateCustomHexInstantly(customHex)}
                        className={cn(
                          "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer h-9 shrink-0",
                          highlightColor === "custom"
                            ? "border-[var(--primary)] bg-[var(--primary)]/10 text-foreground"
                            : "border-border bg-surface-2/40 text-muted-foreground hover:border-foreground/30"
                        )}
                      >
                        <span
                          className="h-3 w-3 rounded-full shrink-0 border border-black/20"
                          style={{ backgroundColor: customHex }}
                        />
                        Personalizar Hex
                        {highlightColor === "custom" && <Check className="h-3.5 w-3.5 ml-1 text-primary shrink-0" />}
                      </button>

                      {highlightColor === "custom" && (
                        <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2 duration-200">
                          <input
                            type="color"
                            value={customHex}
                            onChange={(e) => updateCustomHexInstantly(e.target.value)}
                            className="h-9 w-9 bg-surface-2 border border-border rounded cursor-pointer p-0.5"
                          />
                          <Input
                            type="text"
                            placeholder="#4f46e5"
                            value={customHex}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val.startsWith("#") && (val.length === 4 || val.length === 7)) {
                                updateCustomHexInstantly(val);
                              } else {
                                setCustomHex(val);
                              }
                            }}
                            className="bg-surface-2 border-border text-foreground text-xs h-9 w-28 uppercase font-mono"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-border">
                  <Button type="submit" className="gap-2 px-6 text-xs h-9 btn-primary">
                    <Save className="h-4 w-4" /> Salvar Nome & Favicon
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── SEÇÃO: CONTROLE DE ACESSO ── */}
        <TabsContent value="access" className="mt-4">
          <div className="grid md:grid-cols-3 gap-6">
            
            {/* Users list (Left) */}
            <Card className="bg-card border-border md:col-span-2">
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Usuários Cadastrados</CardTitle>
                  <CardDescription className="text-xs">Defina o nível de acesso para cada membro da equipe.</CardDescription>
                </div>
                <Button onClick={() => setOpenCreate(true)} size="sm" className="gap-1.5 text-xs h-8">
                  <Plus className="h-3.5 w-3.5" /> Novo Usuário
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {isLoading ? (
                  <div className="py-6 text-center text-muted-foreground text-xs">Carregando usuários...</div>
                ) : (
                  users.map((u) => {
                    const role = u.user_roles?.[0]?.role ?? "collaborator";
                    const initials = u.name
                      ? u.name.split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase()
                      : "?";

                    return (
                      <div key={u.id} className="flex items-center justify-between p-3 rounded-lg bg-surface-2/40 border border-border gap-4 flex-wrap">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-primary/10 text-primary border border-primary/20 text-xs font-bold flex items-center justify-center">
                            {initials}
                          </div>
                          <div>
                            <div className="text-xs font-bold text-foreground">{u.name ?? "Sem nome"}</div>
                            <div className="text-[10px] text-muted-foreground">{u.email}</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <select
                            value={role}
                            onChange={(e) => handleRoleChange(u.id, e.target.value as any)}
                            className="bg-surface-2 border border-border rounded-md px-2 py-1 text-xs text-foreground focus:outline-none"
                          >
                            <option value="owner">Proprietário</option>
                            <option value="admin">Administrador</option>
                            <option value="collaborator">Colaborador</option>
                          </select>
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>

            {/* Rules explanation (Right) */}
            <Card className="bg-card border-border h-fit">
              <CardHeader>
                <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Info className="h-4 w-4 text-primary" /> Regras de Permissão
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-xs leading-relaxed text-muted-foreground">
                <div>
                  <h5 className="font-bold text-foreground mb-0.5">👑 Proprietário</h5>
                  <p className="text-[11px] text-muted-foreground">{ROLE_DESC.owner}</p>
                </div>
                <hr className="border-border" />
                <div>
                  <h5 className="font-bold text-foreground mb-0.5">🛠️ Administrador</h5>
                  <p className="text-[11px] text-muted-foreground">{ROLE_DESC.admin}</p>
                </div>
                <hr className="border-border" />
                <div>
                  <h5 className="font-bold text-foreground mb-0.5">🧑‍💻 Colaborador</h5>
                  <p className="text-[11px] text-muted-foreground">{ROLE_DESC.collaborator}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── SEÇÃO: INTEGRAÇÕES ── */}
        <TabsContent value="integrations" className="mt-4">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Hub de Conectividade</CardTitle>
              <CardDescription className="text-xs">Sincronize com ferramentas de produtividade para importar e resumir demandas automaticamente.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              
              {/* Notion Integration Card */}
              <div className="p-4 rounded-xl border border-border bg-surface-2/40 flex flex-col md:flex-row justify-between gap-4 items-start md:items-center">
                <div className="flex gap-3">
                  <div className="h-10 w-10 bg-surface-2 rounded-lg flex items-center justify-center shrink-0 border border-border">
                    <Globe className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      Notion
                      {notionEnabled && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                    </h4>
                    <p className="text-[11px] text-muted-foreground mt-0.5 max-w-lg">
                      Importe projetos de banco de dados do Notion. Mapeie campos como status, prioridade e prazos.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Switch checked={notionEnabled} onCheckedChange={setNotionEnabled} />
                </div>
              </div>

              {/* Trello Integration Card */}
              <div className="p-4 rounded-xl border border-border bg-surface-2/40 flex flex-col md:flex-row justify-between gap-4 items-start md:items-center">
                <div className="flex gap-3">
                  <div className="h-10 w-10 bg-surface-2 rounded-lg flex items-center justify-center shrink-0 border border-border">
                    <LinkIcon className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      Trello
                      {trelloEnabled && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                    </h4>
                    <p className="text-[11px] text-muted-foreground mt-0.5 max-w-lg">
                      Sincronize quadros de tarefas do Trello e traga novas atividades direto para o Kanban.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Switch checked={trelloEnabled} onCheckedChange={setTrelloEnabled} />
                </div>
              </div>

              {/* Google Calendar Integration */}
              <div className="p-4 rounded-xl border border-border bg-surface-2/40 flex flex-col md:flex-row justify-between gap-4 items-start md:items-center">
                <div className="flex gap-3">
                  <div className="h-10 w-10 bg-surface-2 rounded-lg flex items-center justify-center shrink-0 border border-border">
                    <Calendar className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      Google Agenda
                      {googleCalendarEnabled && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                    </h4>
                    <p className="text-[11px] text-muted-foreground mt-0.5 max-w-lg">
                      Sincronização bidirecional. Mova datas de entrega no Creative Flow e veja atualizado no seu calendário.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Switch checked={googleCalendarEnabled} onCheckedChange={setGoogleCalendarEnabled} />
                </div>
              </div>

              {/* Whatsapp Resumo (Placeholder) */}
              <div className="p-4 rounded-xl border border-border bg-surface-2/40 flex flex-col md:flex-row justify-between gap-4 items-start md:items-center">
                <div className="flex gap-3">
                  <div className="h-10 w-10 bg-surface-2 rounded-lg flex items-center justify-center shrink-0 border border-border">
                    <MessageSquare className="h-5 w-5 text-emerald-500" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      WhatsApp Business (Resumo Inteligente)
                      {whatsappEnabled && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                    </h4>
                    <p className="text-[11px] text-muted-foreground mt-0.5 max-w-lg">
                      Uma extensão que monitora e lê as conversas do WhatsApp do cliente, entregando resumos instantâneos das últimas demandas solicitadas por mensagem.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Switch checked={whatsappEnabled} onCheckedChange={setWhatsappEnabled} />
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <Button onClick={handleSaveIntegrations} className="gap-2 px-6 text-xs h-9">
                  <Save className="h-4 w-4" /> Salvar Configuração de Integrações
                </Button>
              </div>

            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={openCreate} onOpenChange={setOpenCreate}>
        <DialogContent className="max-w-md w-full bg-card border border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-foreground">Cadastrar Novo Usuário</DialogTitle>
            <DialogDescription className="text-muted-foreground text-xs">
              Registre um novo membro da equipe. Ele poderá fazer login imediatamente com os dados informados.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateUser} className="space-y-4 pt-2">
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground uppercase font-bold">Nome completo</Label>
              <Input
                placeholder="Ex: Ana Silva"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="bg-surface-2 border-border text-sm h-9 text-foreground"
                required
              />
            </div>

            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground uppercase font-bold">E-mail</Label>
              <Input
                type="email"
                placeholder="Ex: ana@empresa.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="bg-surface-2 border-border text-sm h-9 text-foreground"
                required
              />
            </div>

            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground uppercase font-bold">Senha de Acesso</Label>
              <Input
                type="password"
                placeholder="Mínimo 6 caracteres"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="bg-surface-2 border-border text-sm h-9 text-foreground"
                required
              />
            </div>

            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground uppercase font-bold">Nível de Acesso</Label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as any)}
                className="w-full bg-surface-2 border border-border rounded-md p-2 text-xs text-foreground focus:outline-none h-9"
              >
                <option value="owner">Proprietário</option>
                <option value="admin">Administrador</option>
                <option value="collaborator">Colaborador</option>
              </select>
            </div>

            <div className="flex gap-2 justify-end pt-3">
              <Button type="button" variant="ghost" onClick={() => setOpenCreate(false)} className="h-9 px-4 text-xs">
                Cancelar
              </Button>
              <Button type="submit" disabled={creatingUser} className="h-9 px-6 text-xs font-bold gap-1.5">
                <Check className="h-3.5 w-3.5" />
                {creatingUser ? "Cadastrando..." : "Confirmar Cadastro"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
