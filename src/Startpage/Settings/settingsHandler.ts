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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const isStringRecord = (value: unknown): value is Record<string, string> =>
  isRecord(value) && Object.values(value).every(v => typeof v === "string")

const isTheme = (value: unknown): value is Theme =>
  isRecord(value) &&
  typeof value.name === "string" &&
  isStringRecord(value.colors) &&
  typeof value.image === "string"

const isThemeArray = (value: unknown): value is Theme[] =>
  Array.isArray(value) && value.every(isTheme)

const isLinkGroups = (value: unknown): value is linkGroup[] =>
  Array.isArray(value) &&
  value.every(
    group =>
      isRecord(group) &&
      typeof group.title === "string" &&
      Array.isArray(group.links) &&
      group.links.every(
        link =>
          isRecord(link) &&
          typeof link.label === "string" &&
          typeof link.value === "string"
      )
  )

const isSearchSettings = (value: unknown): value is SearchType =>
  isRecord(value) &&
  typeof value.engine === "string" &&
  isRecord(value.fastForward)

// "hover-card" 是已移除的历史模式，读到时按 accordion 处理（见 getWithFallback）
const isLinkDisplaySettings = (
  value: unknown
): value is LinkDisplaySettings =>
  isRecord(value) &&
  ["accordion", "hover-card", "command-palette"].includes(String(value.mode))

const isWallpaperSettings = (value: unknown): value is WallpaperSettings =>
  isRecord(value)

const isCardAreaSettings = (value: unknown): value is CardAreaSettings =>
  isRecord(value)

const removeCorruptBackups = (key: string) => {
  const prefix = `${key}.corrupt.`
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const existing = localStorage.key(i)
    if (existing?.startsWith(prefix)) localStorage.removeItem(existing)
  }
}

const readLocalJson = <T>(
  key: string,
  validator: (value: unknown) => value is T
): T | undefined => {
  const raw = localStorage.getItem(key)
  if (!raw) return undefined

  try {
    const parsed: unknown = JSON.parse(raw)
    if (validator(parsed)) return parsed
    throw new Error("schema mismatch")
  } catch (error) {
    const corruptKey = `${key}.corrupt.${Date.now()}`
    try {
      // 每个 key 只保留最新一份损坏备份，避免反复加载时备份无限累积占满配额
      removeCorruptBackups(key)
      localStorage.setItem(corruptKey, raw)
      localStorage.removeItem(key)
    } catch {
      // ignore storage recovery errors
    }
    settingsLogger.error(`Stored ${key} is invalid; moved to ${corruptKey}.`, error)
    return undefined
  }
}

const writeLocalJson = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (error) {
    settingsLogger.error(`Failed to persist ${key}`, error)
    window.dispatchEvent(
      new CustomEvent("show-notification", {
        detail: {
          type: "error",
          title: "保存失败",
          message: "本地存储空间不足，设置未能保存。请清理自定义图片后重试。",
        },
      })
    )
    throw error
  }
}

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
    return readLocalJson("search-settings", isSearchSettings)
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
    writeLocalJson("search-settings", searchSettings),

  parse: (searchSettings: string) => JSON.parse(searchSettings) as SearchType,
}

export const Themes = {
  get: () => {
    return readLocalJson("themes", isThemeArray)
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

  set: (themes: Theme[]) => writeLocalJson("themes", themes),

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
    return readLocalJson(linkGroupsKey, isLinkGroups)
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

  set: (themes: linkGroup[]) => writeLocalJson(linkGroupsKey, themes),

  parse: (linkGroups: string) => JSON.parse(linkGroups) as linkGroup[],
}

export const Design = {
  get: () => {
    return readLocalJson("design", isTheme)
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

  set: (design: Theme) => writeLocalJson("design", design),
}

const linkDisplayKey = "link-display-settings"
export const LinkDisplay = {
  get: () => {
    return readLocalJson(linkDisplayKey, isLinkDisplaySettings)
  },
  getWithFallback: () => {
    try {
      const stored = LinkDisplay.get() ?? linkDisplaySettings
      if ((stored.mode as string) === "hover-card") {
        return { ...stored, mode: "accordion" as const }
      }
      return stored
    } catch {
      settingsLogger.error(
        "Your currently applied link display settings appear to be corrupted."
      )
      return linkDisplaySettings
    }
  },

  set: (settings: LinkDisplaySettings) =>
    writeLocalJson(linkDisplayKey, settings),
}

const wallpaperKey = "wallpaper-settings"
export const Wallpaper = {
  get: () => {
    return readLocalJson(wallpaperKey, isWallpaperSettings)
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
    writeLocalJson(wallpaperKey, settings)
  },
}

const cardAreaKey = "card-area-settings"
export const CardArea = {
  get: () => {
    return readLocalJson(cardAreaKey, isCardAreaSettings)
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
    writeLocalJson(cardAreaKey, settings)
  },
}
