export type HighlightColor = "roxo" | "azul" | "verde" | "rosa" | "laranja";

export const HIGHLIGHT_COLORS: Record<HighlightColor, { primary: string; primaryForeground: string; accent: string; accentForeground: string }> = {
  roxo: { primary: "oklch(0.46 0.18 264)", primaryForeground: "oklch(0.98 0 0)", accent: "oklch(0.92 0.21 117)", accentForeground: "oklch(0.18 0 0)" },
  azul: { primary: "oklch(0.55 0.18 250)", primaryForeground: "oklch(0.98 0 0)", accent: "oklch(0.85 0.18 250)", accentForeground: "oklch(0.18 0 0)" },
  verde: { primary: "oklch(0.50 0.18 145)", primaryForeground: "oklch(0.98 0 0)", accent: "oklch(0.85 0.18 145)", accentForeground: "oklch(0.18 0 0)" },
  rosa: { primary: "oklch(0.55 0.18 360)", primaryForeground: "oklch(0.98 0 0)", accent: "oklch(0.85 0.18 360)", accentForeground: "oklch(0.18 0 0)" },
  laranja: { primary: "oklch(0.55 0.18 45)", primaryForeground: "oklch(0.98 0 0)", accent: "oklch(0.85 0.18 45)", accentForeground: "oklch(0.18 0 0)" }
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
  const palette = HIGHLIGHT_COLORS[savedColor] || HIGHLIGHT_COLORS.roxo;
  document.documentElement.style.setProperty("--primary", palette.primary);
  document.documentElement.style.setProperty("--primary-foreground", palette.primaryForeground);
  document.documentElement.style.setProperty("--accent", palette.accent);
  document.documentElement.style.setProperty("--accent-foreground", palette.accentForeground);
}
