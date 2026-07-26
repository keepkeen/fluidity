export type SyncDotState = "ok" | "syncing" | "error"

export interface SyncRuntimeStatus {
  state: SyncDotState
  updatedAt: number
  message?: string
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
    return { state: "error", updatedAt: Date.now(), message: "未配置云同步" }
  try {
    return JSON.parse(raw) as SyncRuntimeStatus
  } catch {
    return { state: "error", updatedAt: Date.now(), message: "云同步状态损坏" }
  }
}

export const setSyncRuntimeStatus = (status: SyncRuntimeStatus): void => {
  try {
    localStorage.setItem(RUNTIME_STATUS_KEY, JSON.stringify(status))
    window.dispatchEvent(
      new CustomEvent<SyncRuntimeStatus>(RUNTIME_STATUS_EVENT, {
        detail: status,
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
