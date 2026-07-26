/**
 * 设置变更事件
 *
 * 应用/导入设置后，通过该事件让 App 重挂载 Startpage 子树，
 * 各组件在挂载时重新读取 localStorage 即可拿到新值，
 * 代替过去的 window.location.reload()（白屏、重拉壁纸、重跑 AI 请求）。
 */

export const SETTINGS_APPLIED_EVENT = "fluidity:settings-applied"

export const emitSettingsApplied = (): void => {
  window.dispatchEvent(new Event(SETTINGS_APPLIED_EVENT))
}

export const onSettingsApplied = (listener: () => void): (() => void) => {
  window.addEventListener(SETTINGS_APPLIED_EVENT, listener)
  return () => window.removeEventListener(SETTINGS_APPLIED_EVENT, listener)
}
