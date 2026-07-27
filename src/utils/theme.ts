export const HIGHLIGHT_COLORS: Record<string, ColorPalette> = {
  roxo: {
    primary: "#9b59b6",
    primaryForeground: "#ffffff",
    accent: "#8e44ad",
    accentForeground: "#ffffff",
    gradient: "linear-gradient(135deg, #9b59b6, #8e44ad)",
  },
  azul: {
    primary: "#3498db",
    primaryForeground: "#ffffff",
    accent: "#2980b9",
    accentForeground: "#ffffff",
    gradient: "linear-gradient(135deg, #3498db, #2980b9)",
  },
  verde: {
    primary: "#2ecc71",
    primaryForeground: "#ffffff",
    accent: "#27ae60",
    accentForeground: "#ffffff",
    gradient: "linear-gradient(135deg, #2ecc71, #27ae60)",
  },
  rosa: {
    primary: "#e91e63",
    primaryForeground: "#ffffff",
    accent: "#c2185b",
    accentForeground: "#ffffff",
    gradient: "linear-gradient(135deg, #e91e63, #c2185b)",
  },
  laranja: {
    primary: "#f39c12",
    primaryForeground: "#ffffff",
    accent: "#e67e22",
    accentForeground: "#ffffff",
    gradient: "linear-gradient(135deg, #f39c12, #e67e22)",
  },
  sunset: {
    primary: "#ff6b35",
    primaryForeground: "#ffffff",
    accent: "#f7c59f",
    accentForeground: "#1a1a2e",
    gradient: "linear-gradient(135deg, #ff6b35, #f7c59f)",
  },
  ocean: {
    primary: "#0077b6",
    primaryForeground: "#ffffff",
    accent: "#00b4d8",
    accentForeground: "#ffffff",
    gradient: "linear-gradient(135deg, #0077b6, #00b4d8)",
  },
  aurora: {
    primary: "#6c5ce7",
    primaryForeground: "#ffffff",
    accent: "#a29bfe",
    accentForeground: "#ffffff",
    gradient: "linear-gradient(135deg, #6c5ce7, #a29bfe)",
  },
  cyberpunk: {
    primary: "#ff00ff",
    primaryForeground: "#000000",
    accent: "#00ffff",
    accentForeground: "#000000",
    gradient: "linear-gradient(135deg, #ff00ff, #00ffff)",
  },
};

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

export type ColorPalette = {
  primary: string;
  primaryForeground: string;
  accent: string;
  accentForeground: string;
  gradient?: string;
};

function hexToRgb(hex: string) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`
    : null;
}

export function getThemeVariables(color: HighlightColor, customColor?: string) {
  const palette = color === "custom" && customColor ? parseCustomColor(customColor) : HIGHLIGHT_COLORS[color] || HIGHLIGHT_COLORS.roxo;
  return {
    "--primary": palette.primary,
    "--primary-foreground": palette.primaryForeground,
    "--primary-rgb": hexToRgb(palette.primary),
    "--accent": palette.accent,
    "--accent-foreground": palette.accentForeground,
    "--accent-rgb": hexToRgb(palette.accent),
    "--primary-gradient": palette.gradient || "",
  };
}

export function applyTheme(color: HighlightColor, customColor?: string) {
  if (typeof document === "undefined") return;
  const palette = color === "custom" && customColor ? parseCustomColor(customColor) : HIGHLIGHT_COLORS[color] || HIGHLIGHT_COLORS.roxo;
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
  const savedName = localStorage.getItem("CF_SystemName") || "Sparkin Hub";
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

export function applyThemeAndHighlight() {
  if (typeof window === "undefined") return;
  const savedName = localStorage.getItem("CF_SystemName");
  if (savedName) {
    document.title = savedName.endsWith(" Hub") ? savedName : `${savedName} Hub`;
  }
  const savedFavicon = localStorage.getItem("CF_Favicon");
  if (savedFavicon) {
    let link = document.querySelector("link[rel='icon']") as HTMLLinkElement;
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = savedFavicon;
  }
  updateDynamicManifest();
}

function parseCustomColor(color: string): ColorPalette {
  return {
    primary: color,
    primaryForeground: "#ffffff",
    accent: color,
    accentForeground: "#ffffff",
    gradient: `linear-gradient(135deg, ${color}, ${color}dd)`,
  };
}
