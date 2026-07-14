import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({ meta: [{ title: "Redefinir senha" }] }),
  component: ResetPassword,
});

function ResetPassword() {
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Link do e-mail traz o token no hash; supabase-js processa automaticamente.
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    if (hash.includes("type=recovery") || hash.includes("access_token")) {
      setReady(true);
    } else {
      // Também aceita sessão já ativa vinda do link
      supabase.auth.getUser().then(({ data }) => {
        if (data.user) setReady(true);
      });
    }
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Senha atualizada!");
      navigate({ to: "/auth" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <div className="w-full max-w-md surface-card p-8">
        <h1 className="font-display text-xl font-bold mb-2">Redefinir senha</h1>
        {!ready ? (
          <p className="text-sm text-muted-foreground">Link inválido ou expirado. Solicite um novo em “Esqueci minha senha”.</p>
        ) : (
          <form onSubmit={submit} className="space-y-3 mt-4">
            <div>
              <label className="text-xs text-muted-foreground">Nova senha</label>
              <input
                type="password"
                className="field-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
              />
            </div>
            <button className="btn-primary w-full" disabled={loading} type="submit">
              {loading ? "Salvando..." : "Atualizar senha"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
