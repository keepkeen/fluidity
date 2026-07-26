import {
  getChromeLocal,
  hasChromeStorage,
  setChromeLocal,
} from "./extensionStore"

export const BROWSER_USAGE_SETTINGS_KEY = "fluidity.browserUsage.settings.v1"

export interface BrowserUsageSettings {
  enabled: boolean
  includePagePath: boolean
  includePageTitle: boolean
}

export const DEFAULT_BROWSER_USAGE_SETTINGS: BrowserUsageSettings = {
  enabled: false,
  includePagePath: false,
  includePageTitle: false,
}

export const BROWSER_USAGE_PERMISSION_ORIGINS = [
  "http://*/*",
  "https://*/*",
]

const normalizeBrowserUsageSettings = (
  raw: Partial<BrowserUsageSettings> | undefined
): BrowserUsageSettings => ({
  ...DEFAULT_BROWSER_USAGE_SETTINGS,
  ...raw,
  enabled: Boolean(raw?.enabled),
  includePagePath: Boolean(raw?.includePagePath),
  includePageTitle: Boolean(raw?.includePageTitle),
})

const notifyBackground = (): void => {
  try {
    if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) return
    chrome.runtime.sendMessage(
      { type: "fluidity:usageSettingsChanged" },
      () => {
        void chrome.runtime.lastError
      }
    )
  } catch {
    // ignore
  }
}

export const getBrowserUsageSettings =
  async (): Promise<BrowserUsageSettings> => {
    if (hasChromeStorage()) {
      const raw = await getChromeLocal<Partial<BrowserUsageSettings>>(
        BROWSER_USAGE_SETTINGS_KEY
      )
      return normalizeBrowserUsageSettings(raw)
    }

    try {
      const raw = localStorage.getItem(BROWSER_USAGE_SETTINGS_KEY)
      return normalizeBrowserUsageSettings(
        raw ? (JSON.parse(raw) as Partial<BrowserUsageSettings>) : undefined
      )
    } catch {
      return DEFAULT_BROWSER_USAGE_SETTINGS
    }
  }

export const setBrowserUsageSettings = async (
  settings: BrowserUsageSettings
): Promise<void> => {
  const normalized = normalizeBrowserUsageSettings(settings)
  if (hasChromeStorage()) {
    await setChromeLocal(BROWSER_USAGE_SETTINGS_KEY, normalized)
    notifyBackground()
    return
  }

  localStorage.setItem(BROWSER_USAGE_SETTINGS_KEY, JSON.stringify(normalized))
}

export const hasBrowserUsagePermissions = async (): Promise<boolean> => {
  try {
    if (typeof chrome === "undefined" || !chrome.permissions?.contains) {
      return false
    }

    return await chrome.permissions.contains({
      origins: BROWSER_USAGE_PERMISSION_ORIGINS,
    })
  } catch {
    return false
  }
}

export const requestBrowserUsagePermissions = async (): Promise<boolean> => {
  try {
    if (typeof chrome === "undefined" || !chrome.permissions?.request) {
      return false
    }

    return await chrome.permissions.request({
      origins: BROWSER_USAGE_PERMISSION_ORIGINS,
    })
  } catch {
    return false
  }
}

export const removeBrowserUsagePermissions = async (): Promise<boolean> => {
  try {
    if (typeof chrome === "undefined" || !chrome.permissions?.remove) {
      return false
    }

    return await chrome.permissions.remove({
      origins: BROWSER_USAGE_PERMISSION_ORIGINS,
    })
  } catch {
    return false
  }
}
