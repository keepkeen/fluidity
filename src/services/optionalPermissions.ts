/**
 * 可选主机权限
 *
 * AI 与云同步的 API 域名放在 optional_host_permissions 里，
 * 只在用户启用对应功能时（用户手势中）按需申请，
 * 降低安装时的权限告警面。
 */

import { resolveAIServicePermissionOrigin } from "./aiEndpoint"

export const AI_PERMISSION_ORIGINS = ["https://api.deepseek.com/*"]

export const SYNC_PERMISSION_ORIGINS = [
  "https://api.github.com/*",
  "https://gist.githubusercontent.com/*",
]

const getPermissionsApi = (): typeof chrome.permissions | null => {
  try {
    if (typeof chrome === "undefined") return null
    return chrome.permissions ?? null
  } catch {
    return null
  }
}

const hasExtensionRuntime = (): boolean => {
  try {
    return typeof chrome !== "undefined" && Boolean(chrome.runtime?.id)
  } catch {
    return false
  }
}

export interface OriginPermissionGrant {
  granted: boolean
  newlyGranted: boolean
}

/**
 * 确保已获得指定域名权限；未授予时发起申请（需在用户手势中调用）。
 * 非扩展环境（web 版）没有 permissions API，请求直接走 CORS，返回 true。
 */
export const ensureOriginPermissionsWithStatus = async (
  origins: string[]
): Promise<OriginPermissionGrant> => {
  const permissions = getPermissionsApi()
  if (!permissions?.request || !permissions.contains) {
    return { granted: !hasExtensionRuntime(), newlyGranted: false }
  }
  try {
    // Begin request synchronously in the click handler. Awaiting `contains`
    // first can consume Chrome's transient user activation before the prompt.
    const existingPermissionCheck = permissions.contains({ origins })
    const permissionRequest = permissions.request({ origins })
    const [alreadyGranted, granted] = await Promise.all([
      existingPermissionCheck,
      permissionRequest,
    ])
    return { granted, newlyGranted: granted && !alreadyGranted }
  } catch {
    return { granted: false, newlyGranted: false }
  }
}

export const ensureOriginPermissions = async (
  origins: string[]
): Promise<boolean> => {
  const permissions = getPermissionsApi()
  if (!permissions?.request || !permissions.contains) {
    return !hasExtensionRuntime()
  }
  try {
    const granted = await permissions.contains({ origins })
    if (granted) return true
    return await permissions.request({ origins })
  } catch {
    return false
  }
}

/** 撤回指定可选域名权限。非扩展环境没有需要撤回的权限。 */
export const removeOriginPermissions = async (
  origins: string[]
): Promise<boolean> => {
  const permissions = getPermissionsApi()
  if (!permissions?.remove) return false
  try {
    return await permissions.remove({ origins })
  } catch {
    return false
  }
}

export const ensureAIPermissions = (): Promise<boolean> =>
  ensureOriginPermissions(AI_PERMISSION_ORIGINS)

/** 按用户配置的 AI 接口地址申请对应域名权限 */
export const ensureAIPermissionsFor = (baseUrl: string): Promise<boolean> => {
  try {
    return ensureOriginPermissions([resolveAIServicePermissionOrigin(baseUrl)])
  } catch {
    return Promise.resolve(false)
  }
}

export const ensureSyncPermissions = (): Promise<boolean> =>
  ensureOriginPermissions(SYNC_PERMISSION_ORIGINS)

export const resolveRssPermissionOrigin = (feedUrl: string): string => {
  const url = new URL(feedUrl)
  const isLocal = ["localhost", "127.0.0.1"].includes(url.hostname)
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLocal)) {
    throw new Error("RSS subscriptions require HTTPS")
  }
  if (url.username || url.password) throw new Error("RSS URL contains credentials")
  return `${url.protocol}//${url.host}/*`
}

export const resolveRssPermissionOrigins = (feedUrls: string[]): string[] =>
  Array.from(new Set(feedUrls.map(resolveRssPermissionOrigin)))

export const ensureRssPermissionFor = (feedUrl: string): Promise<boolean> => {
  try {
    return ensureOriginPermissionsWithStatus(
      resolveRssPermissionOrigins([feedUrl])
    ).then(result => result.granted)
  } catch {
    return Promise.resolve(false)
  }
}

export const ensureRssPermissionForWithStatus = (
  feedUrl: string
): Promise<OriginPermissionGrant> => {
  try {
    return ensureOriginPermissionsWithStatus(
      resolveRssPermissionOrigins([feedUrl])
    )
  } catch {
    return Promise.resolve({ granted: false, newlyGranted: false })
  }
}

export const removeRssPermissionFor = (feedUrl: string): Promise<boolean> => {
  try {
    return removeOriginPermissions(resolveRssPermissionOrigins([feedUrl]))
  } catch {
    return Promise.resolve(false)
  }
}
