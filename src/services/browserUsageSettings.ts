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

interface UsageSettingsResponse {
  ok?: boolean
  error?: string
}

const notifyBackground = async (): Promise<void> => {
  if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) return

  await new Promise<void>((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(
        { type: "fluidity:usageSettingsChanged" },
        (response?: UsageSettingsResponse) => {
          const runtimeError = chrome.runtime.lastError
          if (runtimeError) {
            reject(new Error("浏览统计后台未响应，请重新加载扩展后再试"))
            return
          }
          if (response?.ok === false) {
            reject(new Error(response.error || "浏览统计脚本启用失败"))
            return
          }
          resolve()
        }
      )
    } catch {
      reject(new Error("浏览统计后台未响应，请重新加载扩展后再试"))
    }
  })
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
    const previous = await getBrowserUsageSettings()
    await setChromeLocal(BROWSER_USAGE_SETTINGS_KEY, normalized)
    try {
      await notifyBackground()
    } catch (error) {
      await setChromeLocal(BROWSER_USAGE_SETTINGS_KEY, previous)
      throw error
    }
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

export interface NarrowBrowserUsagePermissionsResult {
  hadBroadPermissions: boolean
  serviceOriginsGranted: boolean
}

/**
 * 关闭浏览统计时撤销全站权限，并把仍在使用的网络功能收窄到精确域名。
 *
 * Chrome 在全站授权存在时会把精确域名视作已授权，却不会保证它在
 * 全站授权撤销后仍作为独立授权保留。因此必须先撤销，再在同一次用户
 * 操作中申请精确域名。
 */
export const narrowBrowserUsagePermissions = async (
  requiredServiceOrigins: string[]
): Promise<NarrowBrowserUsagePermissionsResult> => {
  if (typeof chrome === "undefined") {
    return { hadBroadPermissions: false, serviceOriginsGranted: true }
  }

  const permissions = chrome.permissions
  if (!permissions.contains || !permissions.remove) {
    if (chrome.runtime?.id) {
      throw new Error("权限接口不可用，请重新加载扩展后再试")
    }
    return { hadBroadPermissions: false, serviceOriginsGranted: true }
  }

  const grantedBroadOrigins: string[] = []
  for (const origin of BROWSER_USAGE_PERMISSION_ORIGINS) {
    if (await permissions.contains({ origins: [origin] })) {
      grantedBroadOrigins.push(origin)
    }
  }
  const hadBroadPermissions = grantedBroadOrigins.length > 0
  if (!hadBroadPermissions) {
    return { hadBroadPermissions: false, serviceOriginsGranted: true }
  }

  const removed = await permissions.remove({
    origins: grantedBroadOrigins,
  })
  if (!removed) {
    throw new Error("全站访问权限撤销失败，请在扩展详情页中手动检查")
  }

  const origins = Array.from(
    new Set(
      requiredServiceOrigins
        .map(origin => origin.trim())
        .filter(origin => origin && !BROWSER_USAGE_PERMISSION_ORIGINS.includes(origin))
    )
  )
  if (origins.length === 0) {
    return { hadBroadPermissions: true, serviceOriginsGranted: true }
  }

  if (!permissions.request) {
    return { hadBroadPermissions: true, serviceOriginsGranted: false }
  }

  const alreadyGranted = await permissions.contains({ origins })
  const serviceOriginsGranted =
    alreadyGranted || (await permissions.request({ origins }))

  return { hadBroadPermissions: true, serviceOriginsGranted }
}
