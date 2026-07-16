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
  roxo: { primary: "oklch(0.46 0.18 264)", primaryForeground: "oklch(0.98 0 0)", accent: "oklch(0.92 0.21 117)", accentForeground: "oklch(0.18 0 0)" },
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

  const savedTheme = localStorage.getItem("CF_Theme") || "dark";
  const savedColor = (localStorage.getItem("CF_HighlightColor") || "roxo") as HighlightColor;
  const savedName = localStorage.getItem("CF_SystemName") || "Creative Flow";
  const savedFavicon = localStorage.getItem("CF_Favicon") || "";

  // 1. Theme
  if (savedTheme === "light") {
    document.documentElement.classList.add("light");
  } else {
    document.documentElement.classList.remove("light");
  }

  // 2. Custom System Name/Title
  if (savedName) {
    document.title = `${savedName} Hub`;
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
