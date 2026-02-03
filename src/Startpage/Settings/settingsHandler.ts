import {
  linkGroup,
  Theme,
  Search as SearchType,
  LinkDisplaySettings,
  WallpaperSettings,
  CardAreaSettings,
  links,
  searchSettings,
  linkDisplaySettings,
  defaultWallpaperSettings,
  defaultCardAreaSettings,
  themes,
  colorsType,
} from "../../data/data"
import { normalizeToHex, hexToHsl, hslToHex } from "../../utils/colorUtils"
import { settingsLogger } from "../../utils/logger"

// 新版 CSS 变量名常量（13 色系统）
const CSS_BG_PRIMARY = "--bg-primary"
const CSS_BG_SECONDARY = "--bg-secondary"
const CSS_BG_HOVER = "--bg-hover"
const CSS_TEXT_PRIMARY = "--text-primary"
const CSS_TEXT_SECONDARY = "--text-secondary"
const CSS_TEXT_MUTED = "--text-muted"
const CSS_BORDER_DEFAULT = "--border-default"
const CSS_BORDER_ACTIVE = "--border-active"
const CSS_ACCENT = "--accent"
const CSS_ACCENT_HOVER = "--accent-hover"
const CSS_ACCENT_TEXT = "--accent-text"
const CSS_SUCCESS = "--success"
const CSS_GLOW = "--glow"

// 旧版 CSS 变量名（用于迁移）
const OLD_BG_COLOR = "--bg-color"
const OLD_DEFAULT_COLOR = "--default-color"
const OLD_SECONDARY_COLOR = "--secondary-color"
const OLD_ACCENT_COLOR = "--accent-color"
const OLD_ACCENT_COLOR2 = "--accent-color2"
const OLD_BORDER_COLOR = "--border-color"
const OLD_BORDER_FOCUS = "--border-focus"
const OLD_ACCENT_PRIMARY = "--accent-primary"
const OLD_ACCENT_SECONDARY = "--accent-secondary"
const OLD_HOVER_BG = "--hover-bg"
const OLD_TEXT_ON_ACCENT = "--text-on-accent"
const OLD_SUCCESS_COLOR = "--success-color"
const OLD_SHADOW_COLOR = "--shadow-color"

/**
 * 计算悬停背景色
 */
const calcBgHover = (bgPrimary: string): string => {
  const hsl = hexToHsl(bgPrimary)
  const newL = Math.min(hsl.l + 8, 100)
  return hslToHex(hsl.h, hsl.s, newL)
}

/**
 * 计算弱化文字色
 */
const calcTextMuted = (textPrimary: string, bgPrimary: string): string => {
  const textHsl = hexToHsl(textPrimary)
  const bgHsl = hexToHsl(bgPrimary)
  // 向背景色方向偏移 50%
  const newL = textHsl.l + (bgHsl.l - textHsl.l) * 0.5
  return hslToHex(textHsl.h, textHsl.s * 0.5, newL)
}

/**
 * 计算强调色悬停状态
 */
const calcAccentHover = (accent: string): string => {
  const hsl = hexToHsl(accent)
  const newL = Math.max(hsl.l - 8, 0)
  return hslToHex(hsl.h, hsl.s, newL)
}

/**
 * 计算强调色上的文字颜色
 */
const calcAccentText = (
  accent: string,
  bgPrimary: string,
  textPrimary: string
): string => {
  const accentHsl = hexToHsl(accent)
  return accentHsl.l > 50 ? bgPrimary : textPrimary
}

/**
 * 从旧版主题迁移到新版 13 色系统
 */
const migrateFromOldTheme = (
  oldColors: Record<string, string>
): Partial<colorsType> => {
  // 获取旧版颜色
  const bgPrimary = normalizeToHex(oldColors[OLD_BG_COLOR] || "#2E2E2E")
  const textPrimary = normalizeToHex(
    oldColors[OLD_DEFAULT_COLOR] || oldColors[CSS_TEXT_PRIMARY] || "#E6E6E6"
  )
  const textSecondary = normalizeToHex(
    oldColors[OLD_SECONDARY_COLOR] || oldColors[CSS_TEXT_SECONDARY] || "#A8A8A8"
  )
  const accent = normalizeToHex(
    oldColors[OLD_ACCENT_COLOR] || oldColors[OLD_ACCENT_PRIMARY] || "#FFB4E6"
  )

  return {
    [CSS_BG_PRIMARY]: bgPrimary,
    [CSS_BG_SECONDARY]:
      oldColors[CSS_BG_SECONDARY] || oldColors[OLD_BG_COLOR]
        ? calcBgHover(bgPrimary)
        : "#252525",
    [CSS_BG_HOVER]: oldColors[OLD_HOVER_BG] || calcBgHover(bgPrimary),
    [CSS_TEXT_PRIMARY]: textPrimary,
    [CSS_TEXT_SECONDARY]: textSecondary,
    [CSS_TEXT_MUTED]: calcTextMuted(textPrimary, bgPrimary),
    [CSS_BORDER_DEFAULT]: oldColors[OLD_BORDER_COLOR] || "#4A4A4A",
    [CSS_BORDER_ACTIVE]: oldColors[OLD_BORDER_FOCUS] || accent,
    [CSS_ACCENT]: accent,
    [CSS_ACCENT_HOVER]:
      oldColors[OLD_ACCENT_COLOR2] ||
      oldColors[OLD_ACCENT_SECONDARY] ||
      calcAccentHover(accent),
    [CSS_ACCENT_TEXT]:
      oldColors[OLD_TEXT_ON_ACCENT] ||
      calcAccentText(accent, bgPrimary, textPrimary),
    [CSS_SUCCESS]: oldColors[OLD_SUCCESS_COLOR] || "#B4FFE6",
    [CSS_GLOW]: oldColors[OLD_SHADOW_COLOR] || accent,
  }
}

/**
 * 补全新版主题中缺失的颜色
 */
const fillMissingColors = (
  colors: Record<string, string>
): Partial<colorsType> => {
  const defaults = themes[0].colors
  const bgPrimary = normalizeToHex(
    colors[CSS_BG_PRIMARY] || defaults[CSS_BG_PRIMARY]
  )
  const textPrimary = normalizeToHex(
    colors[CSS_TEXT_PRIMARY] || defaults[CSS_TEXT_PRIMARY]
  )
  const accent = normalizeToHex(colors[CSS_ACCENT] || defaults[CSS_ACCENT])

  return {
    [CSS_BG_PRIMARY]: bgPrimary,
    [CSS_BG_SECONDARY]: colors[CSS_BG_SECONDARY] || defaults[CSS_BG_SECONDARY],
    [CSS_BG_HOVER]: colors[CSS_BG_HOVER] || calcBgHover(bgPrimary),
    [CSS_TEXT_PRIMARY]: textPrimary,
    [CSS_TEXT_SECONDARY]:
      colors[CSS_TEXT_SECONDARY] || defaults[CSS_TEXT_SECONDARY],
    [CSS_TEXT_MUTED]:
      colors[CSS_TEXT_MUTED] || calcTextMuted(textPrimary, bgPrimary),
    [CSS_BORDER_DEFAULT]:
      colors[CSS_BORDER_DEFAULT] || defaults[CSS_BORDER_DEFAULT],
    [CSS_BORDER_ACTIVE]: colors[CSS_BORDER_ACTIVE] || accent,
    [CSS_ACCENT]: accent,
    [CSS_ACCENT_HOVER]: colors[CSS_ACCENT_HOVER] || calcAccentHover(accent),
    [CSS_ACCENT_TEXT]:
      colors[CSS_ACCENT_TEXT] || calcAccentText(accent, bgPrimary, textPrimary),
    [CSS_SUCCESS]: colors[CSS_SUCCESS] || defaults[CSS_SUCCESS],
    [CSS_GLOW]: colors[CSS_GLOW] || accent,
  }
}

/**
 * 检测是否是旧版主题
 */
const isOldThemeFormat = (colors: Record<string, string>): boolean => {
  // 旧版主题有 --bg-color 或 --default-color 或 --accent-color
  // 新版主题有 --bg-primary 和 --accent
  const hasOldKeys = Boolean(
    colors[OLD_BG_COLOR] ||
      colors[OLD_DEFAULT_COLOR] ||
      colors[OLD_ACCENT_COLOR]
  )
  const hasNewKeys = Boolean(colors[CSS_BG_PRIMARY])
  return hasOldKeys && !hasNewKeys
}

/**
 * 迁移主题数据到新版 13 色系统
 */
export const migrateThemeColors = (theme: Theme): Theme => {
  const oldColors = theme.colors as Record<string, string>

  const colors = isOldThemeFormat(oldColors)
    ? migrateFromOldTheme(oldColors)
    : fillMissingColors(oldColors)

  return { ...theme, colors: colors as colorsType }
}

export const Search = {
  get: () => {
    const lsSearch = localStorage.getItem("search-settings")
    if (lsSearch) return Search.parse(lsSearch)
    return undefined
  },
  getWithFallback: () => {
    try {
      return Search.get() ?? searchSettings
    } catch {
      settingsLogger.error(
        "Your currently applied search settings appear to be corrupted."
      )
      return searchSettings
    }
  },

  set: (searchSettings: SearchType) =>
    localStorage.setItem("search-settings", JSON.stringify(searchSettings)),

  parse: (searchSettings: string) => JSON.parse(searchSettings) as SearchType,
}

export const Themes = {
  get: () => {
    const lsThemes = localStorage.getItem("themes")
    if (lsThemes) return JSON.parse(lsThemes) as Theme[]
    return undefined
  },
  getWithFallback: () => {
    try {
      const userThemes = Themes.get()
      if (userThemes) {
        // 迁移旧版主题数据
        return userThemes.map(migrateThemeColors)
      }
      return themes
    } catch {
      settingsLogger.error(
        "Your currently applied themes appear to be corrupted."
      )
      return themes
    }
  },

  set: (themes: Theme[]) =>
    localStorage.setItem("themes", JSON.stringify(themes)),

  add: (theme: Theme) => {
    const lsThemes = Themes.get()
    if (lsThemes) Themes.set([...lsThemes, theme])
    else Themes.set([theme])
  },

  remove: (name: string) => {
    const lsThemes = Themes.get()
    if (lsThemes) Themes.set(lsThemes.filter(theme => theme.name !== name))
  },

  parse: (theme: string) => JSON.parse(theme) as Theme,
}

const linkGroupsKey = "link-groups"
export const Links = {
  getRaw: () => localStorage.getItem(linkGroupsKey),
  get: () => {
    const lsLinks = localStorage.getItem(linkGroupsKey)
    if (lsLinks) return Links.parse(lsLinks)
    return undefined
  },
  getWithFallback: () => {
    try {
      return Links.get() ?? links
    } catch {
      settingsLogger.error(
        "Your currently applied links appear to be corrupted."
      )
      return links
    }
  },

  set: (themes: linkGroup[]) =>
    localStorage.setItem(linkGroupsKey, JSON.stringify(themes)),

  parse: (linkGroups: string) => JSON.parse(linkGroups) as linkGroup[],
}

export const Design = {
  get: () => {
    const lsDesign = localStorage.getItem("design")
    if (lsDesign) return Themes.parse(lsDesign)
    return undefined
  },
  getWithFallback: () => {
    try {
      const userDesign = Design.get()
      if (userDesign) {
        // 迁移旧版主题数据
        return migrateThemeColors(userDesign)
      }
      return themes[0]
    } catch {
      settingsLogger.error(
        "Your currently applied design appears to be corrupted."
      )
      return themes[0]
    }
  },

  set: (design: Theme) =>
    localStorage.setItem("design", JSON.stringify(design)),
}

const linkDisplayKey = "link-display-settings"
export const LinkDisplay = {
  get: () => {
    const lsLinkDisplay = localStorage.getItem(linkDisplayKey)
    if (lsLinkDisplay) return JSON.parse(lsLinkDisplay) as LinkDisplaySettings
    return undefined
  },
  getWithFallback: () => {
    try {
      return LinkDisplay.get() ?? linkDisplaySettings
    } catch {
      settingsLogger.error(
        "Your currently applied link display settings appear to be corrupted."
      )
      return linkDisplaySettings
    }
  },

  set: (settings: LinkDisplaySettings) =>
    localStorage.setItem(linkDisplayKey, JSON.stringify(settings)),
}

const wallpaperKey = "wallpaper-settings"
export const Wallpaper = {
  get: () => {
    const data = localStorage.getItem(wallpaperKey)
    if (data) return JSON.parse(data) as WallpaperSettings
    return undefined
  },
  getWithFallback: () => {
    try {
      const settings = Wallpaper.get()
      if (settings) return { ...defaultWallpaperSettings, ...settings }
      return defaultWallpaperSettings
    } catch {
      settingsLogger.error("Wallpaper settings appear to be corrupted.")
      return defaultWallpaperSettings
    }
  },
  set: (settings: WallpaperSettings) => {
    localStorage.setItem(wallpaperKey, JSON.stringify(settings))
  },
}

const cardAreaKey = "card-area-settings"
export const CardArea = {
  get: () => {
    const data = localStorage.getItem(cardAreaKey)
    if (data) return JSON.parse(data) as CardAreaSettings
    return undefined
  },
  getWithFallback: () => {
    try {
      const settings = CardArea.get()
      if (settings) return { ...defaultCardAreaSettings, ...settings }
      return defaultCardAreaSettings
    } catch {
      settingsLogger.error("Card area settings appear to be corrupted.")
      return defaultCardAreaSettings
    }
  },
  set: (settings: CardAreaSettings) => {
    localStorage.setItem(cardAreaKey, JSON.stringify(settings))
  },
}
