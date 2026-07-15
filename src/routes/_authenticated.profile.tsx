import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { User, Mail, Lock, Save } from "lucide-react";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "Minha Conta — Creative Flow Hub" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    async function loadUser() {
      setLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setUserId(user.id);
          setEmail(user.email ?? "");
          
          // Load public profile
          const { data: profile } = await supabase
            .from("profiles")
            .select("name")
            .eq("id", user.id)
            .maybeSingle();
            
          if (profile) {
            setName(profile.name ?? "");
          }
        }
      } catch (err) {
        toast.error("Erro ao carregar dados do perfil");
      } finally {
        setLoading(false);
      }
    }
    loadUser();
  }, []);

  async function handleUpdateProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;
    setSavingProfile(true);
    try {
      // 1. Update public.profiles
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ name })
        .eq("id", userId);
      if (profileError) throw profileError;

      // 2. Update auth.user metadata & email
      const { error: authError } = await supabase.auth.updateUser({
        email: email,
        data: { name },
      });
      if (authError) throw authError;

      toast.success("Perfil atualizado com sucesso!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar perfil");
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleUpdatePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!password.trim()) {
      toast.error("Digite a nova senha");
      return;
    }
    if (password.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres");
      return;
    }
    setSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Senha redefinida com sucesso!");
      setPassword("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao redefinir senha");
    } finally {
      setSavingPassword(false);
    }
  }

  if (loading) {
    return <div className="p-10 text-center text-zinc-500">Carregando dados da conta...</div>;
  }

  return (
    <div className="w-full max-w-4xl mx-auto p-4 md:p-6 space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold text-foreground">Minha Conta</h2>
        <p className="text-sm text-muted-foreground">Gerencie suas informações de perfil e segurança.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Profile Card */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              Dados Gerais
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpdateProfile} className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="name" className="text-xs text-zinc-500 font-bold">Nome de exibição</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="bg-zinc-850 border-zinc-700 text-zinc-200"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="email" className="text-xs text-zinc-500 font-bold">E-mail</Label>
                <div className="relative">
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="bg-zinc-850 border-zinc-700 text-zinc-200"
                    required
                  />
                </div>
              </div>

              <Button type="submit" disabled={savingProfile} className="w-full gap-2">
                <Save className="h-4 w-4" />
                {savingProfile ? "Salvando..." : "Salvar Alterações"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Password Card */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
              <Lock className="h-4 w-4 text-primary" />
              Segurança
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpdatePassword} className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="pass" className="text-xs text-zinc-500 font-bold">Nova Senha</Label>
                <Input
                  id="pass"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="bg-zinc-850 border-zinc-700 text-zinc-200"
                />
              </div>

              <Button type="submit" disabled={savingPassword} className="w-full gap-2 variant-outline border-zinc-700 text-zinc-200 hover:bg-zinc-800">
                <Lock className="h-4 w-4" />
                {savingPassword ? "Redefinindo..." : "Redefinir Senha"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
