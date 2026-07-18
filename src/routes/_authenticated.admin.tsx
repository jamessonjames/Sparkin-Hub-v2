import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listUsersWithRoles, updateUserRole, createUserWithRole, updateUserAdmin, deleteUserAdmin } from "@/lib/users.functions";
import { uploadToGDrive, getGoogleDriveStatus, disconnectGoogleDrive, exchangeGoogleCode } from "@/lib/gdrive.functions";
import { getPricingSettings, savePricingSettings } from "@/lib/pricing.functions";
import { applyThemeAndHighlight, HIGHLIGHT_COLORS, type HighlightColor } from "@/utils/theme";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
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
  Pencil,
  Trash2,
  DollarSign,
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
  const createUserFn = useServerFn(createUserWithRole);
  const updateUserFn = useServerFn(updateUserAdmin);
  const deleteUserFn = useServerFn(deleteUserAdmin);

  // Logged-in user state
  const [currentUser, setCurrentUser] = useState<any>(null);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users-with-roles"],
    queryFn: () => listUsersFn(),
  });

  const currentUserRole = users.find((u: any) => u.id === currentUser?.id)?.user_roles?.[0]?.role ?? null;

  // Local storage branding settings
  const [systemName, setSystemName] = useState("Creative Flow");
  const [faviconUrl, setFaviconUrl] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [highlightColor, setHighlightColor] = useState<HighlightColor>("roxo");
  const [customHex, setCustomHex] = useState("#4f46e5");

  const faviconInputRef = useRef<HTMLInputElement>(null);
  const [uploadingFavicon, setUploadingFavicon] = useState(false);
  const uploadFn = useServerFn(uploadToGDrive);

  const handleFaviconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingFavicon(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = (event.target?.result as string).split(",")[1];
      try {
        const response = await uploadFn({
          data: {
            fileBase64: base64,
            fileName: file.name,
            mimeType: file.type,
            pathParts: ["Branding"],
          },
        });

        if (response.success && response.url) {
          setFaviconUrl(response.url);
          toast.success("Favicon carregado e hospedado no Google Drive!");
        } else {
          // Fallback if not configured
          const fallbackUrl = event.target?.result as string; // use base64 direct URL
          setFaviconUrl(fallbackUrl);
          toast.warning("Hospedagem Google Drive indisponível. Favicon salvo localmente em base64.");
        }
      } catch (error: any) {
        console.error("Favicon upload failed, using fallback:", error);
        const fallbackUrl = event.target?.result as string;
        setFaviconUrl(fallbackUrl);
        toast.warning("Hospedagem falhou. Usando fallback local.");
      } finally {
        setUploadingFavicon(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // User creation states
  const [openCreate, setOpenCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"owner" | "admin" | "collaborator">("collaborator");
  const [creatingUser, setCreatingUser] = useState(false);

  // User edit states
  const [openEdit, setOpenEdit] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [updatingUser, setUpdatingUser] = useState(false);

  // Integrations states (persisted in localstorage)
  const [notionEnabled, setNotionEnabled] = useState(false);
  const [notionToken, setNotionToken] = useState("");
  const [trelloEnabled, setTrelloEnabled] = useState(false);
  const [trelloToken, setTrelloToken] = useState("");
  const [googleCalendarEnabled, setGoogleCalendarEnabled] = useState(false);
  const [googleClientId, setGoogleClientId] = useState("");
  const [whatsappEnabled, setWhatsappEnabled] = useState(false);
  const [whatsappPhone, setWhatsappPhone] = useState("");

  // Google Drive integration state
  const [gDriveConnected, setGDriveConnected] = useState(false);
  const [gDriveEmail, setGDriveEmail] = useState("");
  const [loadingGDriveStatus, setLoadingGDriveStatus] = useState(true);

  const getStatusFn = useServerFn(getGoogleDriveStatus);
  const disconnectFn = useServerFn(disconnectGoogleDrive);
  const exchangeCodeFn = useServerFn(exchangeGoogleCode);

  // Pricing settings state
  const [baseHourlyRate, setBaseHourlyRate] = useState<number>(80);
  const [pricingTiers, setPricingTiers] = useState<{ type: "up_to" | "above"; hours_limit: number; hourly_rate: number }[]>([]);
  const [savingPricing, setSavingPricing] = useState(false);

  const getPricingFn = useServerFn(getPricingSettings);
  const savePricingFn = useServerFn(savePricingSettings);

  const handleAddTier = () => {
    setPricingTiers([...pricingTiers, { type: "up_to", hours_limit: 1, hourly_rate: 80 }]);
  };

  const handleRemoveTier = (index: number) => {
    setPricingTiers(pricingTiers.filter((_, i) => i !== index));
  };

  const handleUpdateTier = (index: number, key: 'type' | 'hours_limit' | 'hourly_rate', val: any) => {
    const updated = [...pricingTiers];
    updated[index] = { ...updated[index], [key]: val } as any;
    setPricingTiers(updated);
  };

  const handleSavePricing = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPricing(true);
    try {
      // Sort tiers by hours_limit before saving
      const sortedTiers = [...pricingTiers]
        .filter(t => t.hours_limit > 0 && t.hourly_rate >= 0)
        .sort((a, b) => a.hours_limit - b.hours_limit);

      const res = await savePricingFn({
        data: {
          base_hourly_rate: baseHourlyRate,
          tiers: sortedTiers.map(t => ({
            type: t.type || "up_to",
            hours_limit: t.hours_limit,
            hourly_rate: t.hourly_rate
          }))
        }
      });
      if (res.success) {
        toast.success("Configurações de precificação salvas com sucesso!");
        setPricingTiers(sortedTiers);
      } else {
        toast.error(res.error || "Erro ao salvar.");
      }
    } catch (error: any) {
      toast.error(`Erro: ${error.message}`);
    } finally {
      setSavingPricing(false);
    }
  };

  const handleConnectGDrive = () => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) {
      toast.error("VITE_GOOGLE_CLIENT_ID não configurado no arquivo .env");
      return;
    }
    const redirectUri = window.location.origin + window.location.pathname;
    const scope = "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive";
    const responseType = "code";
    const accessType = "offline";
    const prompt = "consent";

    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&response_type=${responseType}&scope=${encodeURIComponent(
      scope
    )}&access_type=${accessType}&prompt=${prompt}`;

    window.location.href = url;
  };

  const handleDisconnectGDrive = async () => {
    if (!confirm("Tem certeza que deseja desconectar o Google Drive? Os novos uploads voltarão a ser salvos em base64 localmente.")) return;
    try {
      const res = await disconnectFn();
      if (res.success) {
        setGDriveConnected(false);
        setGDriveEmail("");
        toast.success("Google Drive desconectado.");
      } else {
        toast.error(`Falha ao desconectar: ${res.error}`);
      }
    } catch (e: any) {
      toast.error(`Erro: ${e.message}`);
    }
  };

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

      // Check Google Drive OAuth callback code in URL
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get("code");
      if (code) {
        // Clear code parameter from URL to keep it clean
        window.history.replaceState({}, document.title, window.location.pathname);
        toast.loading("Conectando sua conta do Google Drive...");
        exchangeCodeFn({ data: { code, redirectUri: window.location.origin + window.location.pathname } })
          .then((res) => {
            toast.dismiss();
            if (res.success) {
              setGDriveConnected(true);
              setGDriveEmail(res.email);
              toast.success(`Google Drive conectado com sucesso: ${res.email}`);
            } else {
              toast.error(`Falha ao conectar Google Drive: ${res.error}`);
            }
          })
          .catch((err) => {
            toast.dismiss();
            toast.error(`Erro: ${err.message}`);
          });
      } else {
        // Load connection status
        getStatusFn()
          .then((res) => {
            setGDriveConnected(res.connected);
            setGDriveEmail(res.email || "");
            setLoadingGDriveStatus(false);
          })
          .catch(() => setLoadingGDriveStatus(false));
      }

      // Load pricing settings
      getPricingFn().then((res) => {
        setBaseHourlyRate(res.base_hourly_rate);
        setPricingTiers(res.tiers || []);
      });

      // Get logged-in user
      supabase.auth.getUser().then(({ data }) => {
        if (data?.user) {
          setCurrentUser(data.user);
        }
      });
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
    window.dispatchEvent(new Event("systemBrandingChanged"));
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
      toast.success("Nível de acesso atualizado com sucesso!");
      qc.invalidateQueries({ queryKey: ["users-with-roles"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao atualizar nível de acesso");
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
      await createUserFn({
        data: {
          email: newEmail,
          password: newPassword,
          name: newName,
          role: newRole,
        },
      });

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

  async function handleUpdateUser(e: React.FormEvent) {
    e.preventDefault();
    if (!editingUser) return;
    if (!editName.trim() || !editEmail.trim()) {
      toast.error("Nome e E-mail são obrigatórios.");
      return;
    }

    setUpdatingUser(true);
    try {
      await updateUserFn({
        data: {
          userId: editingUser.id,
          name: editName,
          email: editEmail,
          password: editPassword ? editPassword : undefined,
        },
      });

      toast.success("Informações do usuário atualizadas com sucesso!");
      setOpenEdit(false);
      setEditingUser(null);
      setEditName("");
      setEditEmail("");
      setEditPassword("");
      qc.invalidateQueries({ queryKey: ["users-with-roles"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao atualizar usuário");
    } finally {
      setUpdatingUser(false);
    }
  }

  async function handleDeleteUser(userId: string) {
    if (!confirm("Tem certeza que deseja excluir permanentemente este usuário? Esta ação não pode ser desfeita.")) {
      return;
    }

    try {
      await deleteUserFn({
        data: {
          userId,
        },
      });

      toast.success("Usuário excluído com sucesso!");
      qc.invalidateQueries({ queryKey: ["users-with-roles"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao excluir usuário");
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
          {currentUserRole !== "collaborator" && (
            <>
              <TabsTrigger value="access" className="text-xs gap-1.5">
                <Users className="h-3.5 w-3.5" /> Controle de Acesso
              </TabsTrigger>
              <TabsTrigger value="integrations" className="text-xs gap-1.5">
                <LinkIcon className="h-3.5 w-3.5" /> Integrações
              </TabsTrigger>
              <TabsTrigger value="pricing" className="text-xs gap-1.5">
                <DollarSign className="h-3.5 w-3.5" /> Precificação & Tarifas
              </TabsTrigger>
            </>
          )}
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
                {currentUserRole !== "collaborator" && (
                  <>
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
                        <input
                          type="file"
                          ref={faviconInputRef}
                          accept="image/*"
                          className="hidden"
                          onChange={handleFaviconUpload}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          disabled={uploadingFavicon}
                          onClick={() => faviconInputRef.current?.click()}
                          className="border-border gap-1.5 text-xs text-foreground hover:bg-surface-2 h-9 cursor-pointer"
                        >
                          <Upload className="h-3.5 w-3.5" />
                          {uploadingFavicon ? "Subindo..." : "Subir"}
                        </Button>
                      </div>
                    </div>
                  </>
                )}

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

                {currentUserRole !== "collaborator" && (
                  <div className="pt-2 border-t border-border">
                    <Button type="submit" className="gap-2 px-6 text-xs h-9 btn-primary">
                      <Save className="h-4 w-4" /> Salvar Nome & Favicon
                    </Button>
                  </div>
                )}
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
                            disabled={u.id === currentUser?.id || (currentUserRole === "admin" && role === "owner")}
                            className="bg-surface-2 border border-border rounded-md px-2 py-1 text-xs text-foreground focus:outline-none"
                          >
                            <option value="owner">Proprietário</option>
                            <option value="admin">Administrador</option>
                            <option value="collaborator">Colaborador</option>
                          </select>

                          <Button
                            variant="ghost"
                            size="icon"
                            type="button"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-surface-2"
                            onClick={() => {
                              setEditingUser(u);
                              setEditName(u.name ?? "");
                              setEditEmail(u.email ?? "");
                              setEditPassword("");
                              setOpenEdit(true);
                            }}
                            disabled={u.id === currentUser?.id || (currentUserRole === "admin" && role === "owner")}
                            title="Editar informações do usuário"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>

                          <Button
                            variant="ghost"
                            size="icon"
                            type="button"
                            className="h-8 w-8 text-destructive/70 hover:text-destructive hover:bg-destructive/10"
                            onClick={() => handleDeleteUser(u.id)}
                            disabled={u.id === currentUser?.id || (currentUserRole === "admin" && role === "owner")}
                            title="Excluir usuário permanentemente"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
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

              {/* Google Drive Integration */}
              <div className="p-4 rounded-xl border border-border bg-surface-2/40 flex flex-col md:flex-row justify-between gap-4 items-start md:items-center">
                <div className="flex gap-3">
                  <div className="h-10 w-10 bg-surface-2 rounded-lg flex items-center justify-center shrink-0 border border-border">
                    <Upload className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      Google Drive
                      {gDriveConnected && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                    </h4>
                    <p className="text-[11px] text-muted-foreground mt-0.5 max-w-lg">
                      {gDriveConnected 
                        ? `Conectado à conta: ${gDriveEmail}. Todos os uploads serão organizados em pastas no seu Drive.`
                        : "Hospede e organize todos os uploads do editor rico e favicons na sua própria conta do Google Drive automaticamente."}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {gDriveConnected ? (
                    <Button 
                      type="button" 
                      variant="destructive" 
                      onClick={handleDisconnectGDrive}
                      className="text-xs h-8 px-3 rounded-lg cursor-pointer"
                    >
                      Desconectar
                    </Button>
                  ) : (
                    <Button 
                      type="button" 
                      onClick={handleConnectGDrive}
                      className="text-xs h-8 px-4 bg-primary text-primary-foreground hover:bg-primary/95 rounded-lg cursor-pointer"
                    >
                      Conectar
                    </Button>
                  )}
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

        {/* ── SEÇÃO: PRECIFICAÇÃO & TARIFAS ── */}
        <TabsContent value="pricing" className="mt-4">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Precificação & Tarifas</CardTitle>
              <CardDescription className="text-xs">Configure o valor da hora base e faixas de desconto progressivas para cálculo automático de projetos pontuais/temporadas.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSavePricing} className="space-y-6 max-w-xl">
                <div className="space-y-1">
                  <Label htmlFor="base-rate" className="text-xs text-muted-foreground font-semibold">Valor da Hora Base (R$)</Label>
                  <Input
                    id="base-rate"
                    type="number"
                    min="0"
                    value={baseHourlyRate}
                    onChange={(e) => setBaseHourlyRate(parseFloat(e.target.value) || 0)}
                    className="bg-surface-2 border-border text-foreground text-sm h-9 w-40"
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground font-semibold">Faixas de Desconto Progressivas</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAddTier}
                      className="h-8 border-border text-xs gap-1.5 cursor-pointer text-foreground hover:bg-surface-2"
                    >
                      <Plus className="h-3.5 w-3.5" /> Adicionar Faixa
                    </Button>
                  </div>

                  {pricingTiers.length === 0 ? (
                    <div className="text-center py-6 border border-dashed border-border rounded-xl text-xs text-muted-foreground">
                      Nenhuma faixa cadastrada. O valor padrão por hora sempre será o valor base.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {pricingTiers.map((tier, idx) => (
                        <div key={idx} className="flex flex-col sm:flex-row sm:items-center gap-3 bg-surface-2/20 border border-border p-3 rounded-xl">
                          <div className="flex-1 flex items-center gap-2">
                            <Select 
                              value={tier.type || "up_to"} 
                              onValueChange={(val) => handleUpdateTier(idx, 'type', val as any)}
                            >
                              <SelectTrigger className="h-8 text-xs bg-background border-input text-foreground w-28 shrink-0">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="up_to" className="text-xs">Até</SelectItem>
                                <SelectItem value="above" className="text-xs">Acima de</SelectItem>
                              </SelectContent>
                            </Select>

                            <Input
                              type="number"
                              step="0.5"
                              min="0.5"
                              value={tier.hours_limit}
                              onChange={(e) => handleUpdateTier(idx, 'hours_limit', parseFloat(e.target.value) || 0)}
                              className="bg-surface-2 border-border text-foreground text-xs h-8 w-20 text-center"
                            />
                            <span className="text-xs text-muted-foreground shrink-0 font-medium">horas</span>
                          </div>
                          
                          <div className="flex-1 flex items-center gap-2 sm:justify-end">
                            <span className="text-xs text-muted-foreground shrink-0">custa</span>
                            <Input
                              type="number"
                              min="0"
                              value={tier.hourly_rate}
                              onChange={(e) => handleUpdateTier(idx, 'hourly_rate', parseFloat(e.target.value) || 0)}
                              className="bg-surface-2 border-border text-foreground text-xs h-8 w-24 text-center font-semibold"
                            />
                            <span className="text-xs text-muted-foreground shrink-0">/ hora</span>
                          </div>

                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveTier(idx)}
                            className="h-8 w-8 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 cursor-pointer shrink-0 sm:ml-2"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground italic leading-relaxed">
                    Nota: Ao preencher o tempo estimado de demandas avulsas ou por temporada, o sistema usará a faixa correspondente para calcular o valor sugerido de forma automática.
                  </p>
                </div>

                <div className="pt-2 flex justify-end">
                  <Button type="submit" disabled={savingPricing} className="gap-2 px-6 text-xs h-9 cursor-pointer">
                    <Save className="h-4 w-4" /> {savingPricing ? "Salvando..." : "Salvar Configuração de Precificação"}
                  </Button>
                </div>
              </form>
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

      <Dialog open={openEdit} onOpenChange={setOpenEdit}>
        <DialogContent className="max-w-md w-full bg-card border border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-foreground">Editar Usuário</DialogTitle>
            <DialogDescription className="text-muted-foreground text-xs">
              Altere os dados cadastrais do membro da equipe. O e-mail e nome serão atualizados imediatamente.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleUpdateUser} className="space-y-4 pt-2">
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground uppercase font-bold">Nome completo</Label>
              <Input
                placeholder="Ex: Ana Silva"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="bg-surface-2 border-border text-sm h-9 text-foreground"
                required
              />
            </div>

            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground uppercase font-bold">E-mail</Label>
              <Input
                type="email"
                placeholder="Ex: ana@empresa.com"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                className="bg-surface-2 border-border text-sm h-9 text-foreground"
                required
              />
            </div>

            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground uppercase font-bold">Nova Senha (deixe em branco para manter)</Label>
              <Input
                type="password"
                placeholder="Mínimo 6 caracteres"
                value={editPassword}
                onChange={(e) => setEditPassword(e.target.value)}
                className="bg-surface-2 border-border text-sm h-9 text-foreground"
              />
            </div>

            <div className="flex gap-2 justify-end pt-3">
              <Button type="button" variant="ghost" onClick={() => setOpenEdit(false)} className="h-9 px-4 text-xs">
                Cancelar
              </Button>
              <Button type="submit" disabled={updatingUser} className="h-9 px-6 text-xs font-bold gap-1.5 btn-primary">
                <Check className="h-3.5 w-3.5" />
                {updatingUser ? "Salvando..." : "Salvar Alterações"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
