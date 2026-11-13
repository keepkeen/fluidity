// disabled：云同步未启用/已断开，与真正的同步失败（error）在 UI 上必须可区分
export type SyncDotState = "ok" | "syncing" | "error" | "disabled"

export interface SyncRuntimeStatus {
  state: SyncDotState
  updatedAt: number
  message?: string
  /** 最近一次成功完成拉取、合并或推送的时间。 */
  lastSuccessAt?: number
  /** 本地仍有正在处理或等待推送的改动。 */
  pending?: boolean
}

const RUNTIME_STATUS_KEY = "fluidity-sync.runtimeStatus.v1"
const RUNTIME_STATUS_EVENT = "fluidity-sync.runtimeStatus.changed"

declare global {
  interface WindowEventMap {
    [RUNTIME_STATUS_EVENT]: CustomEvent<SyncRuntimeStatus>
  }
}

export const getSyncRuntimeStatus = (): SyncRuntimeStatus => {
  const raw = localStorage.getItem(RUNTIME_STATUS_KEY)
  if (!raw)
    return { state: "disabled", updatedAt: Date.now(), message: "未配置云同步" }
  try {
    return JSON.parse(raw) as SyncRuntimeStatus
  } catch {
    return { state: "error", updatedAt: Date.now(), message: "云同步状态损坏" }
  }
}

export const setSyncRuntimeStatus = (status: SyncRuntimeStatus): void => {
  try {
    const previous = getSyncRuntimeStatus()
    const next: SyncRuntimeStatus = {
      ...status,
      lastSuccessAt:
        status.state === "ok"
          ? status.updatedAt
          : status.lastSuccessAt ?? previous.lastSuccessAt,
      pending:
        status.pending ??
        (status.state === "syncing" || Boolean(status.message?.includes("正在回推"))),
    }
    localStorage.setItem(RUNTIME_STATUS_KEY, JSON.stringify(next))
    window.dispatchEvent(
      new CustomEvent<SyncRuntimeStatus>(RUNTIME_STATUS_EVENT, {
        detail: next,
      })
    )
  } catch {
    // ignore
  }
}

export const subscribeSyncRuntimeStatus = (
  handler: (status: SyncRuntimeStatus) => void
): (() => void) => {
  const onStorage = (e: StorageEvent) => {
    if (e.key !== RUNTIME_STATUS_KEY) return
    handler(getSyncRuntimeStatus())
  }
  const onLocal = (e: CustomEvent<SyncRuntimeStatus>) => {
    handler(e.detail)
  }
  window.addEventListener("storage", onStorage)
  window.addEventListener(RUNTIME_STATUS_EVENT, onLocal as EventListener)
  return () => {
    window.removeEventListener("storage", onStorage)
    window.removeEventListener(RUNTIME_STATUS_EVENT, onLocal as EventListener)
  }
}
