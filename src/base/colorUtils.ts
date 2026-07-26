export const COLOR_ALIASES: Record<string, string> = {
  "--bg-primary": "--bg-color",
  "--text-primary": "--default-color",
  "--text-secondary": "--secondary-color",
  "--border-default": "--border-color",
  "--accent": "--accent-color",
  "--accent-hover": "--accent-color2",
}

export const FALLBACK_COLORS: Record<string, string> = {
  "--bg-primary": "#121215",
  "--bg-secondary": "#1a1a20",
  "--bg-hover": "#23232b",
  "--text-primary": "#f3f4f6",
  "--text-secondary": "#cbd5e1",
  "--text-muted": "#8b95a7",
  "--border-default": "rgba(255,255,255,0.10)",
  "--border-active": "#8ab4ff",
  "--accent": "#8ab4ff",
  "--accent-hover": "#a7c4ff",
  "--accent-text": "#121215",
  "--success": "#7dd3a8",
  "--glow": "#8ab4ff",
}

export const DANGER_COLOR = "rgba(255, 100, 100, 0.95)"

export const applyColors = (colors: Record<string, string>): void => {
  const root = document.documentElement
  const resolvedColors = { ...FALLBACK_COLORS, ...colors }

  Object.entries(resolvedColors).forEach(([key, value]) => {
    root.style.setProperty(key, value)

    const alias = COLOR_ALIASES[key]
    if (alias) {
      root.style.setProperty(alias, value)
    }
  })
}
