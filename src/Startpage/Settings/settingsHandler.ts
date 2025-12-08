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
} from "../../data/data"
import {
  calculateSecondaryColor,
  calculateBorderColor,
} from "../../utils/colorUtils"

/**
 * 迁移旧版主题数据到新版
 * 为缺少 --secondary-color 和 --border-color 的主题自动计算默认值
 */
export const migrateThemeColors = (theme: Theme): Theme => {
  const colors = { ...theme.colors }

  // 检查是否需要迁移
  if (!colors["--secondary-color"]) {
    colors["--secondary-color"] = calculateSecondaryColor(
      colors["--default-color"],
      colors["--bg-color"]
    )
  }

  if (!colors["--border-color"]) {
    colors["--border-color"] = calculateBorderColor(
      colors["--default-color"],
      colors["--bg-color"]
    )
  }

  return { ...theme, colors }
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
      console.error(
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
      console.error("Your currently applied themes appear to be corrupted.")
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
      console.error("Your currently applied links appear to be corrupted.")
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
      console.error("Your currently applied design appears to be corrupted.")
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
      console.error(
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
      console.error("Wallpaper settings appear to be corrupted.")
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
      console.error("Card area settings appear to be corrupted.")
      return defaultCardAreaSettings
    }
  },
  set: (settings: CardAreaSettings) => {
    localStorage.setItem(cardAreaKey, JSON.stringify(settings))
  },
}
