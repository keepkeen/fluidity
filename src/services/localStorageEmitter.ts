const EVENT_NAME = "fluidity:localStorageChanged"

export interface LocalStorageChange {
  op: "set" | "remove" | "clear"
  key?: string
}

declare global {
  interface WindowEventMap {
    [EVENT_NAME]: CustomEvent<LocalStorageChange>
  }
}

export const installLocalStorageEmitter = (): void => {
  const w = window as unknown as {
    __fluidityLocalStorageEmitterInstalled?: boolean
  }
  if (w.__fluidityLocalStorageEmitterInstalled) return
  w.__fluidityLocalStorageEmitterInstalled = true

  const originalSetItem = localStorage.setItem.bind(localStorage)
  const originalRemoveItem = localStorage.removeItem.bind(localStorage)
  const originalClear = localStorage.clear.bind(localStorage)

  localStorage.setItem = (key: string, value: string) => {
    originalSetItem(key, value)
    window.dispatchEvent(
      new CustomEvent<LocalStorageChange>(EVENT_NAME, {
        detail: { op: "set", key },
      })
    )
  }

  localStorage.removeItem = (key: string) => {
    originalRemoveItem(key)
    window.dispatchEvent(
      new CustomEvent<LocalStorageChange>(EVENT_NAME, {
        detail: { op: "remove", key },
      })
    )
  }

  localStorage.clear = () => {
    originalClear()
    window.dispatchEvent(
      new CustomEvent<LocalStorageChange>(EVENT_NAME, {
        detail: { op: "clear" },
      })
    )
  }
}

export const onLocalStorageChange = (
  handler: (change: LocalStorageChange) => void
): (() => void) => {
  const listener = (event: CustomEvent<LocalStorageChange>) => {
    handler(event.detail)
  }
  window.addEventListener(EVENT_NAME, listener as EventListener)
  return () => window.removeEventListener(EVENT_NAME, listener as EventListener)
}
