import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) throw redirect({ to: "/" });
  },
  head: () => ({ meta: [] }),
  component: AuthPage,
});

type Mode = "signin" | "signup" | "forgot";

function AuthPage() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const [systemName, setSystemName] = useState("Creative Flow");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedName = localStorage.getItem("CF_SystemName") || "Creative Flow";
      setSystemName(savedName);
      document.title = `Entrar — ${savedName} Hub`;
    }
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { name }, emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast.success("Conta criada! Você já pode entrar.");
        setMode("signin");
      } else if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast.success("Enviamos um link para o seu e-mail.");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/" });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro inesperado";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <div className="w-full max-w-md surface-card p-8">
        <div className="mb-6 text-center">
          <div className="font-display text-2xl font-bold text-foreground">{systemName} Hub</div>
          <p className="text-sm text-muted-foreground mt-2">
            {mode === "signin" && "Entre com sua conta"}
            {mode === "signup" && "Criar conta do proprietário (1º acesso)"}
            {mode === "forgot" && "Enviar link para redefinir senha"}
          </p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          {mode === "signup" && (
            <div>
              <label className="text-xs text-muted-foreground">Nome</label>
              <input
                className="field-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
          )}
          <div>
            <label className="text-xs text-muted-foreground">E-mail</label>
            <input
              type="email"
              autoComplete="email"
              className="field-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          {mode !== "forgot" && (
            <div>
              <label className="text-xs text-muted-foreground">Senha</label>
              <input
                type="password"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                className="field-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
          )}
          <button className="btn-primary w-full mt-2" disabled={loading} type="submit">
            {loading
              ? "Aguarde..."
              : mode === "signin"
              ? "Entrar"
              : mode === "signup"
              ? "Criar conta"
              : "Enviar link"}
          </button>
        </form>

        <div className="mt-4 flex flex-col items-center gap-2 text-xs">
          {mode === "signin" && (
            <>
              <button
                onClick={() => setMode("forgot")}
                className="text-muted-foreground hover:text-foreground underline"
              >
                Esqueci minha senha
              </button>
              <button
                onClick={() => setMode("signup")}
                className="text-muted-foreground hover:text-foreground underline"
              >
                1º acesso? Criar conta do proprietário
              </button>
            </>
          )}
          {mode !== "signin" && (
            <button
              onClick={() => setMode("signin")}
              className="text-muted-foreground hover:text-foreground underline"
            >
              ← Voltar
            </button>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Novos colaboradores são criados pelo proprietário em Configurações → Equipe.
        </p>
      </div>
    </div>
  );
}
