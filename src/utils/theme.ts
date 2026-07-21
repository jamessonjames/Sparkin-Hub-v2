export type HighlightColor =
  | "roxo"
  | "azul"
  | "verde"
  | "rosa"
  | "laranja"
  | "sunset"
  | "ocean"
  | "aurora"
  | "cyberpunk"
  | "custom";

export const HIGHLIGHT_COLORS: Record<
  string,
  { primary: string; primaryForeground: string; accent: string; accentForeground: string; gradient?: string }
> = {
  roxo: { primary: "oklch(0.46 0.18 264)", primaryForeground: "oklch(0.98 0 0)", accent: "oklch(0.85 0.18 264)", accentForeground: "oklch(0.18 0 0)" },
  azul: { primary: "oklch(0.55 0.18 250)", primaryForeground: "oklch(0.98 0 0)", accent: "oklch(0.85 0.18 250)", accentForeground: "oklch(0.18 0 0)" },
  verde: { primary: "oklch(0.50 0.18 145)", primaryForeground: "oklch(0.98 0 0)", accent: "oklch(0.85 0.18 145)", accentForeground: "oklch(0.18 0 0)" },
  rosa: { primary: "oklch(0.55 0.18 360)", primaryForeground: "oklch(0.98 0 0)", accent: "oklch(0.85 0.18 360)", accentForeground: "oklch(0.18 0 0)" },
  laranja: { primary: "oklch(0.55 0.18 45)", primaryForeground: "oklch(0.98 0 0)", accent: "oklch(0.85 0.18 45)", accentForeground: "oklch(0.18 0 0)" },
  
  // Gradients
  sunset: {
    primary: "#FF512F",
    primaryForeground: "#ffffff",
    accent: "#DD2476",
    accentForeground: "#ffffff",
    gradient: "linear-gradient(135deg, #FF512F 0%, #DD2476 100%)",
  },
  ocean: {
    primary: "#02AAB0",
    primaryForeground: "#ffffff",
    accent: "#00CDAC",
    accentForeground: "#111827",
    gradient: "linear-gradient(135deg, #02AAB0 0%, #00CDAC 100%)",
  },
  aurora: {
    primary: "#0575E6",
    primaryForeground: "#ffffff",
    accent: "#00F260",
    accentForeground: "#111827",
    gradient: "linear-gradient(135deg, #0575E6 0%, #00F260 100%)",
  },
  cyberpunk: {
    primary: "#8A2387",
    primaryForeground: "#ffffff",
    accent: "#E94057",
    accentForeground: "#ffffff",
    gradient: "linear-gradient(135deg, #8A2387 0%, #E94057 50%, #F27121 100%)",
  },
};

export function applyThemeAndHighlight() {
  if (typeof window === "undefined") return;

  document.documentElement.classList.remove("light");

  const savedColor = (localStorage.getItem("CF_HighlightColor") || "roxo") as HighlightColor;
  const savedName = localStorage.getItem("CF_SystemName") || "Creative Flow";
  const savedFavicon = localStorage.getItem("CF_Favicon") || "";

  // 2. Custom System Name/Title
  if (savedName) {
    if (document.title.includes("Creative Flow")) {
      document.title = document.title.replace(/Creative Flow/g, savedName);
    }
    if (document.title.includes("Sparkin Hub") && savedName !== "Sparkin Hub") {
      document.title = document.title.replace(/Sparkin Hub/g, savedName);
    }
    
    const appleTitle = document.querySelector("meta[name='apple-mobile-web-app-title']");
    if (appleTitle) {
      appleTitle.setAttribute("content", savedName);
    }
  }

  // 3. Custom branding favicon
  if (savedFavicon) {
    let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = savedFavicon;
  }

  // 3b. Update PWA manifest with custom icon
  updateDynamicManifest();

  // 4. Highlight colors
  let palette;
  if (savedColor === "custom") {
    const customHex = localStorage.getItem("CF_CustomHex") || "#4f46e5";
    palette = {
      primary: customHex,
      primaryForeground: "#ffffff",
      accent: customHex,
      accentForeground: "#ffffff",
      gradient: undefined as string | undefined,
    };
  } else {
    palette = HIGHLIGHT_COLORS[savedColor] || HIGHLIGHT_COLORS.roxo;
  }

  document.documentElement.style.setProperty("--primary", palette.primary);
  document.documentElement.style.setProperty("--primary-foreground", palette.primaryForeground);
  document.documentElement.style.setProperty("--accent", palette.accent);
  document.documentElement.style.setProperty("--accent-foreground", palette.accentForeground);

  if (palette.gradient) {
    document.documentElement.style.setProperty("--primary-gradient", palette.gradient);
  } else {
    document.documentElement.style.removeProperty("--primary-gradient");
  }
}

function updateDynamicManifest() {
  if (typeof window === "undefined") return;

  const savedName = localStorage.getItem("CF_SystemName") || "Creative Flow";
  const savedFavicon = localStorage.getItem("CF_Favicon") || "";

  const iconSrc = savedFavicon || "/icon-512.png";

  const manifest = {
    name: savedName.endsWith(" Hub") ? savedName : `${savedName} Hub`,
    short_name: savedName,
    description: "Portal para organização de demandas, clientes e financeiro.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0f1117",
    theme_color: "#0f1117",
    lang: "pt-BR",
    icons: [
      { src: iconSrc, sizes: "512x512", type: "image/png", purpose: "any maskable" },
      { src: iconSrc, sizes: "192x192", type: "image/png", purpose: "any" },
    ],
  };

  // Remove old dynamic manifest link
  const oldLink = document.querySelector("link[rel='manifest']") as HTMLLinkElement;
  if (oldLink) {
    const oldUrl = oldLink.getAttribute("href") || "";
    if (oldUrl.startsWith("blob:")) URL.revokeObjectURL(oldUrl);
    oldLink.remove();
  }

  const blob = new Blob([JSON.stringify(manifest)], { type: "application/manifest+json" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("link");
  link.rel = "manifest";
  link.href = url;
  document.head.appendChild(link);
}
