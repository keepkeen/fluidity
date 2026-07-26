/**
 * 可选主机权限
 *
 * AI 与云同步的 API 域名放在 optional_host_permissions 里，
 * 只在用户启用对应功能时（用户手势中）按需申请，
 * 降低安装时的权限告警面。
 */

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

/**
 * 确保已获得指定域名权限；未授予时发起申请（需在用户手势中调用）。
 * 非扩展环境（web 版）没有 permissions API，请求直接走 CORS，返回 true。
 */
export const ensureOriginPermissions = async (
  origins: string[]
): Promise<boolean> => {
  const permissions = getPermissionsApi()
  if (!permissions?.request || !permissions.contains) return true
  try {
    const granted = await permissions.contains({ origins })
    if (granted) return true
    return await permissions.request({ origins })
  } catch {
    return false
  }
}

export const ensureAIPermissions = (): Promise<boolean> =>
  ensureOriginPermissions(AI_PERMISSION_ORIGINS)

export const ensureSyncPermissions = (): Promise<boolean> =>
  ensureOriginPermissions(SYNC_PERMISSION_ORIGINS)
