import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Toaster } from "sonner";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { getUserPreferences } from "@/lib/users.functions";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          A página que você procura não existe ou foi movida.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="btn-primary"
          >
            Voltar ao início
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);

  const isChunkError = Boolean(
    error?.message &&
      /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk|Cannot read properties of undefined/i.test(error.message)
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center w-full">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {isChunkError ? "Nova versão disponível" : "Algo deu errado"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {isChunkError
            ? "O sistema foi atualizado no servidor. Clique no botão abaixo para carregar a versão mais recente."
            : "Ocorreu um erro inesperado nesta página."}
        </p>
        {!isChunkError && error?.message && (
          <div className="mt-3 p-3 bg-muted/40 rounded text-left text-xs font-mono text-muted-foreground max-h-36 overflow-auto border border-border/50 break-all">
            {error.message}
          </div>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              if (typeof window !== "undefined") {
                window.location.href = window.location.origin + window.location.pathname + "?_r=" + Date.now();
              }
            }}
            className="btn-primary"
          >
            {isChunkError ? "Carregar versão mais recente" : "Tentar novamente"}
          </button>
          <Link to="/" className="btn-ghost">Início</Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: "#0f1117" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Creative Flow" },
      { name: "mobile-web-app-capable", content: "yes" },
      { title: "Sparkin Hub" },
      { name: "description", content: "Portal leve para organização de demandas de clientes, anotações e controle comercial." },
      { property: "og:title", content: "Sparkin Hub" },
      { property: "og:description", content: "Portal leve para organização de demandas de clientes, anotações e controle comercial." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Sparkin Hub" },
      { name: "twitter:description", content: "Portal leve para organização de demandas de clientes, anotações e controle comercial." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/6c6357b6-0584-467d-b4a6-cbc1c16ec51b/id-preview-ac360c0e--5f85f758-ee3c-4876-8654-ef27f55b6cc0.lovable.app-1784065185350.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/6c6357b6-0584-467d-b4a6-cbc1c16ec51b/id-preview-ac360c0e--5f85f758-ee3c-4876-8654-ef27f55b6cc0.lovable.app-1784065185350.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", type: "image/x-icon", href: "/favicon.ico" },
      { rel: "apple-touch-icon", href: "/icon-512.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

import { applyThemeAndHighlight, HIGHLIGHT_COLORS } from "@/utils/theme";

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  const getPrefsFn = useServerFn(getUserPreferences);

  useEffect(() => {
    // Apply global branding from localStorage (system name, favicon)
    applyThemeAndHighlight();

    // Load per-user highlight color preferences from DB
    supabase.auth.getUser().then(({ data }) => {
      if (!data?.user) return;
      getPrefsFn().then((prefs) => {
        const color = prefs.highlight_color ?? "roxo";
        const hex = prefs.custom_hex ?? "#4f46e5";
        let primary, primaryFg, accent, accentFg, gradient;
        if (color === "custom") {
          primary = hex; primaryFg = "#ffffff"; accent = hex; accentFg = "#ffffff";
        } else {
          const p = HIGHLIGHT_COLORS[color];
          if (p) { primary = p.primary; primaryFg = p.primaryForeground; accent = p.accent; accentFg = p.accentForeground; gradient = p.gradient; }
        }
        if (primary) document.documentElement.style.setProperty("--primary", primary);
        if (primaryFg) document.documentElement.style.setProperty("--primary-foreground", primaryFg);
        if (accent) document.documentElement.style.setProperty("--accent", accent);
        if (accentFg) document.documentElement.style.setProperty("--accent-foreground", accentFg);
        if (gradient) document.documentElement.style.setProperty("--primary-gradient", gradient);
        else document.documentElement.style.removeProperty("--primary-gradient");
      }).catch(() => {});
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => {
      sub.subscription.unsubscribe();
    };
  }, [router, queryClient, getPrefsFn]);

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      <Toaster theme="system" position="top-right" richColors />
    </QueryClientProvider>
  );
}
