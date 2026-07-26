export interface ThemeMode {
  id: "modern" | "retro"
  name: string
}

export interface DesignTokens {
  radius: {
    none: string
    sm: string
    md: string
    lg: string
    full: string
  }
  shadow: {
    none: string
    sm: string
    md: string
    lg: string
    retro: string // The classic hard offset shadow
  }
  font: {
    ui: string
    mono: string
  }
  border: {
    width: {
      thin: string
      thick: string
    }
    style: string
  }
}

export const TOKENS: DesignTokens = {
  radius: {
    none: "0px",
    sm: "4px",
    md: "8px",
    lg: "16px",
    full: "9999px",
  },
  shadow: {
    none: "none",
    sm: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
    md: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
    lg: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
    retro: "4px 4px 0px var(--accent)", // Dynamic color
  },
  font: {
    ui: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol"',
    mono: '"Fira Code", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  },
  border: {
    width: {
      thin: "1px",
      thick: "2px", // In retro mode this might be 3px
    },
    style: "solid",
  },
}

export const applyThemeMode = (mode: ThemeMode["id"]) => {
  const root = document.documentElement

  if (mode === "modern") {
    root.style.setProperty("--radius-main", TOKENS.radius.lg)
    root.style.setProperty("--radius-sm", TOKENS.radius.sm)
    root.style.setProperty("--font-main", TOKENS.font.ui)
    root.style.setProperty("--shadow-card", TOKENS.shadow.lg)
    root.style.setProperty("--border-width", TOKENS.border.width.thin)
    root.style.setProperty("--glass-opacity", "0.7")
    root.style.setProperty("--hover-transform", "translateY(-2px)")
    root.classList.add("theme-modern")
    root.classList.remove("theme-retro")
  } else {
    // Retro (Classic)
    root.style.setProperty("--radius-main", TOKENS.radius.none)
    root.style.setProperty("--radius-sm", TOKENS.radius.none)
    root.style.setProperty("--font-main", TOKENS.font.mono)
    root.style.setProperty("--shadow-card", TOKENS.shadow.retro)
    root.style.setProperty("--border-width", "3px")
    root.style.setProperty("--glass-opacity", "0.9") // Less transparent
    root.style.setProperty("--hover-transform", "translate(2px, 2px)") // Press effect
    root.classList.add("theme-retro")
    root.classList.remove("theme-modern")
  }
}
