// Shipped skins: the default "Dead Terminal" look plus ten VS Code-popular palettes.
// A theme is a set of CSS-variable overrides applied to :root at runtime, plus an
// app background. The default theme has no overrides (reverts to theme.css).

export interface Theme {
  id: string;
  name: string;
  swatch: string; // representative accent for the picker
  vars?: Record<string, string>;
  appBg?: string;
}

interface Palette {
  bg: string;
  panel: string;
  panel2: string;
  hover: string;
  border: string;
  text: string;
  dim: string;
  mute: string;
  accent: string;
  ink: string;
  danger?: string;
  fav?: string;
  like?: string;
}

function vars(p: Palette): Record<string, string> {
  const danger = p.danger ?? "#e05252";
  return {
    "--bg-base": p.bg,
    "--bg-elev": p.panel,
    "--bg-elev-2": p.panel2,
    "--bg-hover": p.hover,
    "--screen": p.panel2,
    "--border": p.border,
    "--border-solid": p.border,
    "--text": p.text,
    "--text-dim": p.dim,
    "--text-mute": p.mute,
    "--accent": p.accent,
    "--accent-ink": p.ink,
    "--accent-2": p.accent,
    "--like": p.like ?? "#e2557a",
    "--fav": p.fav ?? "#d7a12b",
    "--danger": danger,
    "--danger-bg": `${danger}22`,
    "--glow-accent": "none",
    "--glow-text": "none",
    "--card-bg": p.panel,
  };
}

export const THEMES: Theme[] = [
  { id: "dead-terminal", name: "Dead Terminal", swatch: "#57d98a" },
  { id: "dark-plus", name: "Dark+", swatch: "#4ea0e0", appBg: "#1e1e1e",
    vars: vars({ bg: "#1e1e1e", panel: "#252526", panel2: "#2d2d30", hover: "#37373d", border: "#3c3c3c", text: "#d4d4d4", dim: "#a0a0a0", mute: "#6a6a6a", accent: "#4ea0e0", ink: "#04121d" }) },
  { id: "light-plus", name: "Light+", swatch: "#0a66c2", appBg: "#ffffff",
    vars: vars({ bg: "#ffffff", panel: "#f3f3f3", panel2: "#ececec", hover: "#e2e2e2", border: "#d0d0d0", text: "#1e1e1e", dim: "#616161", mute: "#9a9a9a", accent: "#0a66c2", ink: "#ffffff", fav: "#b8860b" }) },
  { id: "monokai", name: "Monokai", swatch: "#a6e22e", appBg: "#272822",
    vars: vars({ bg: "#272822", panel: "#2e2f28", panel2: "#34352d", hover: "#3e3f34", border: "#414339", text: "#f8f8f2", dim: "#b0b1a6", mute: "#75715e", accent: "#a6e22e", ink: "#14160c", fav: "#e6db74", like: "#f92672" }) },
  { id: "dracula", name: "Dracula", swatch: "#bd93f9", appBg: "#282a36",
    vars: vars({ bg: "#282a36", panel: "#2f3140", panel2: "#343746", hover: "#44475a", border: "#44475a", text: "#f8f8f2", dim: "#b3b8d0", mute: "#6272a4", accent: "#bd93f9", ink: "#1a1024", fav: "#f1fa8c", like: "#ff79c6" }) },
  { id: "solarized-dark", name: "Solarized Dark", swatch: "#268bd2", appBg: "#002b36",
    vars: vars({ bg: "#002b36", panel: "#073642", panel2: "#083f4d", hover: "#0a4b5a", border: "#0f4b58", text: "#93a1a1", dim: "#839496", mute: "#586e75", accent: "#268bd2", ink: "#001b22", fav: "#b58900", like: "#dc322f" }) },
  { id: "solarized-light", name: "Solarized Light", swatch: "#268bd2", appBg: "#fdf6e3",
    vars: vars({ bg: "#fdf6e3", panel: "#eee8d5", panel2: "#e4ddc8", hover: "#d9d2be", border: "#cfc8b0", text: "#586e75", dim: "#657b83", mute: "#93a1a1", accent: "#268bd2", ink: "#ffffff", fav: "#b58900", like: "#dc322f" }) },
  { id: "one-dark", name: "One Dark Pro", swatch: "#61afef", appBg: "#282c34",
    vars: vars({ bg: "#282c34", panel: "#2f333d", panel2: "#353b45", hover: "#3e4451", border: "#3e4451", text: "#abb2bf", dim: "#8b93a1", mute: "#5c6370", accent: "#61afef", ink: "#0b1420", fav: "#e5c07b", like: "#e06c75" }) },
  { id: "nord", name: "Nord", swatch: "#88c0d0", appBg: "#2e3440",
    vars: vars({ bg: "#2e3440", panel: "#333a47", panel2: "#3b4252", hover: "#434c5e", border: "#434c5e", text: "#d8dee9", dim: "#aeb6c4", mute: "#7b8698", accent: "#88c0d0", ink: "#10171f", fav: "#ebcb8b", like: "#bf616a" }) },
  { id: "gruvbox", name: "Gruvbox Dark", swatch: "#fabd2f", appBg: "#282828",
    vars: vars({ bg: "#282828", panel: "#32302f", panel2: "#3c3836", hover: "#504945", border: "#504945", text: "#ebdbb2", dim: "#bdae93", mute: "#928374", accent: "#fabd2f", ink: "#1d2021", fav: "#b8bb26", like: "#fb4934" }) },
  { id: "night-owl", name: "Night Owl", swatch: "#82aaff", appBg: "#011627",
    vars: vars({ bg: "#011627", panel: "#0b2231", panel2: "#102a3b", hover: "#1d3b4d", border: "#1d3b4d", text: "#d6deeb", dim: "#a7b6c9", mute: "#5f7e97", accent: "#82aaff", ink: "#020f18", fav: "#ecc48d", like: "#ef5350" }) },
];

const ALL_KEYS = new Set<string>();
THEMES.forEach((t) => t.vars && Object.keys(t.vars).forEach((k) => ALL_KEYS.add(k)));

export const DEFAULT_THEME_ID = THEMES[0].id;

/** Apply a theme by id (clears any prior overrides first). */
export function applyTheme(id: string): void {
  const theme = THEMES.find((t) => t.id === id) ?? THEMES[0];
  const root = document.documentElement;
  ALL_KEYS.forEach((k) => root.style.removeProperty(k));
  if (theme.vars) {
    for (const [k, v] of Object.entries(theme.vars)) root.style.setProperty(k, v);
  }
  const rootEl = document.getElementById("root");
  if (rootEl) rootEl.style.background = theme.appBg ?? "";
}
