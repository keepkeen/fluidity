import {
  DEFAULT_BROWSER_USAGE_SETTINGS,
  setBrowserUsageSettings,
} from "./browserUsageSettings"
import {
  clearSyncPasswordForSession,
  prepareGistSyncForApplicationReset,
} from "./gistSync"

type ClearableStorageArea = {
  clear(callback: () => void): void
}

interface UsageResetResponse {
  ok?: boolean
  error?: string
}

const hasExtensionRuntime = (): boolean => {
  try {
    return typeof chrome !== "undefined" && Boolean(chrome.runtime?.id)
  } catch {
    return false
  }
}

const assertResetExtensionApis = (): boolean => {
  if (!hasExtensionRuntime()) return false

  try {
    if (
      !chrome.runtime.sendMessage ||
      !chrome.runtime.getManifest ||
      !chrome.permissions?.getAll ||
      !chrome.permissions.remove ||
      !chrome.storage?.local?.get ||
      !chrome.storage.local.set ||
      !chrome.storage?.local?.clear
    ) {
      throw new Error()
    }
  } catch {
    throw new Error(
      "数据尚未清除：扩展关键接口不可用，请重新加载扩展后重试"
    )
  }

  return true
}

const resetBrowserUsageRuntime = async (
  extensionRuntime: boolean
): Promise<void> => {
  if (!extensionRuntime) return

  await new Promise<void>((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: "fluidity:usageReset" },
      (response?: UsageResetResponse) => {
        const runtimeError = chrome.runtime.lastError
        if (runtimeError?.message) {
          reject(new Error("数据尚未清除：浏览统计后台未响应，请重新加载扩展后重试"))
          return
        }
        if (response?.ok !== true) {
          reject(
            new Error(
              response?.error ||
                "数据尚未清除：浏览统计后台重置失败，请重新加载扩展后重试"
            )
          )
          return
        }
        resolve()
      }
    )
  })
}

const revokeOptionalPermissions = async (
  extensionRuntime: boolean
): Promise<void> => {
  if (!extensionRuntime) return

  const granted = await chrome.permissions.getAll()
  const manifest = chrome.runtime.getManifest()
  const requiredPermissions = new Set(manifest.permissions ?? [])
  const requiredOrigins = new Set(manifest.host_permissions ?? [])
  const permissions = (granted.permissions ?? []).filter(
    permission => !requiredPermissions.has(permission)
  )
  const origins = (granted.origins ?? []).filter(
    origin => !requiredOrigins.has(origin)
  )
  if (permissions.length === 0 && origins.length === 0) return

  const removed = await chrome.permissions.remove({ permissions, origins })
  if (!removed) {
    throw new Error(
      "数据尚未清除：无法撤销扩展可选权限，请在扩展详情页检查权限后重试"
    )
  }
}

const clearChromeArea = async (
  area: ClearableStorageArea | undefined
): Promise<void> => {
  if (!area) return
  await new Promise<void>((resolve, reject) => {
    area.clear(() => {
      const error = chrome.runtime?.lastError
      if (error?.message) {
        reject(new Error(error.message))
        return
      }
      resolve()
    })
  })
}

/**
 * Clears every Fluidity-owned store after first stopping background services.
 * chrome.storage is extension-scoped, so clearing the areas cannot touch data
 * owned by another extension or website.
 */
export const resetApplicationData = async (): Promise<void> => {
  const extensionRuntime = assertResetExtensionApis()

  // 权限撤销可能被浏览器拒绝，必须在任何配置或统计数据删除前完成，
  // 否则用户既失去凭据/统计，又无法重新执行撤权。
  await revokeOptionalPermissions(extensionRuntime)

  // Stop writers first. Disabling sync tells already-mounted auto-sync
  // runtimes to release their leader lease without deleting credentials yet.
  try {
    await setBrowserUsageSettings({
      ...DEFAULT_BROWSER_USAGE_SETTINGS,
      enabled: false,
    })
    await prepareGistSyncForApplicationReset()
  } catch {
    throw new Error(
      "数据尚未清除：无法安全停止后台服务，请重新加载扩展后重试"
    )
  }
  // The service worker keeps an in-memory copy of usage data. Reset it through
  // the same event queue before clearing storage, otherwise a later idle event
  // can write the stale snapshot back after this function returns.
  await resetBrowserUsageRuntime(extensionRuntime)
  clearSyncPasswordForSession()

  const storage = extensionRuntime ? chrome.storage : undefined
  await clearChromeArea(storage?.session as ClearableStorageArea | undefined)
  await clearChromeArea(storage?.local as ClearableStorageArea | undefined)

  localStorage.clear()
  sessionStorage.clear()
}
