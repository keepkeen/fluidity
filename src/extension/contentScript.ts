(() => {
  const w = window as Window & { __fluidityContentScriptLoaded?: boolean }
  if (w.__fluidityContentScriptLoaded) return
  w.__fluidityContentScriptLoaded = true

  const HEARTBEAT_INTERVAL_MS = 5000
  const MIN_SEND_GAP_MS = 500
  const USAGE_SETTINGS_KEY = "fluidity.browserUsage.settings.v1"

  interface UsageSettings {
    enabled: boolean
    includePagePath: boolean
    includePageTitle: boolean
  }

  const DEFAULT_USAGE_SETTINGS: UsageSettings = {
    enabled: false,
    includePagePath: false,
    includePageTitle: false,
  }

  let usageSettings = DEFAULT_USAGE_SETTINGS
  let usageTimer = 0

  const normalizeUsageSettings = (raw: unknown): UsageSettings => {
    const settings =
      raw && typeof raw === "object" ? (raw as Partial<UsageSettings>) : {}
    return {
      ...DEFAULT_USAGE_SETTINGS,
      enabled: Boolean(settings.enabled),
      includePagePath: Boolean(settings.includePagePath),
      includePageTitle: Boolean(settings.includePageTitle),
    }
  }

  const storageGet = (keys: string[]) =>
    new Promise<Record<string, unknown>>(resolve => {
      chrome.storage.local.get(keys, result =>
        resolve(result as Record<string, unknown>)
      )
    })

  const normalizeUrl = (rawUrl: string, settings: UsageSettings) => {
    try {
      const u = new URL(rawUrl)
      if (u.protocol !== "http:" && u.protocol !== "https:") return null
      return settings.includePagePath ? `${u.origin}${u.pathname}` : u.origin
    } catch {
      return null
    }
  }

  const isIncognito = () => {
    try {
      const extensionContext = (
        chrome as unknown as { extension?: { inIncognitoContext?: boolean } }
      ).extension
      return Boolean(extensionContext?.inIncognitoContext)
    } catch {
      return false
    }
  }

  const getPageIdentity = (settings: UsageSettings) => {
    const url = normalizeUrl(location.href, settings)
    if (!url) return null
    const title =
      settings.includePageTitle && typeof document.title === "string"
        ? document.title.slice(0, 200)
        : ""
    return { url, title }
  }

  let lastSendAt = 0
  const canSendNow = () => {
    const t = Date.now()
    if (t - lastSendAt < MIN_SEND_GAP_MS) return false
    lastSendAt = t
    return true
  }

  const sendToBackground = (payload: unknown) => {
    try {
      const port = connectUsagePort()
      if (port) {
        port.postMessage(payload)
        return
      }
    } catch {
      // fall back
    }

    try {
      chrome.runtime.sendMessage(payload, () => {
        void chrome.runtime.lastError
      })
    } catch {
      // ignore
    }
  }

  const sendStop = (
    settings: UsageSettings = usageSettings,
    options: { force?: boolean } = {}
  ) => {
    try {
      if (isIncognito()) return
      if (!options.force && !settings.enabled) return
      if (!canSendNow()) return
      const ident = getPageIdentity(settings)
      if (!ident) return
      sendToBackground({
        type: "fluidity:usageStop",
        ts: Date.now(),
        url: ident.url,
      })
    } catch {
      // ignore
    }
  }

  const sendHeartbeat = () => {
    try {
      if (!usageSettings.enabled) return
      if (isIncognito()) return
      if (document.visibilityState !== "visible") return
      if (typeof document.hasFocus === "function" && !document.hasFocus()) return
      if (!canSendNow()) return

      const ident = getPageIdentity(usageSettings)
      if (!ident) return

      sendToBackground({
        type: "fluidity:usageHeartbeat",
        ts: Date.now(),
        url: ident.url,
        title: ident.title,
      })
    } catch {
      // ignore
    }
  }

  let usagePort: chrome.runtime.Port | null = null
  let portRetryTimer = 0
  const connectUsagePort = () => {
    try {
      if (usagePort) return usagePort
      usagePort = chrome.runtime.connect({ name: "fluidity:usage" })
      usagePort.onDisconnect.addListener(() => {
        usagePort = null
        if (portRetryTimer) clearTimeout(portRetryTimer)
        if (!usageSettings.enabled) {
          portRetryTimer = 0
          return
        }
        portRetryTimer = window.setTimeout(() => {
          portRetryTimer = 0
          if (usageSettings.enabled) connectUsagePort()
        }, 1500)
      })
      return usagePort
    } catch {
      usagePort = null
      return null
    }
  }

  const syncUsageTimer = () => {
    if (usageSettings.enabled && !usageTimer) {
      sendHeartbeat()
      usageTimer = window.setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS)
      return
    }

    if (!usageSettings.enabled && usageTimer) {
      clearInterval(usageTimer)
      usageTimer = 0
    }
    if (!usageSettings.enabled) {
      if (portRetryTimer) clearTimeout(portRetryTimer)
      portRetryTimer = 0
      if (usagePort) {
        const port = usagePort
        usagePort = null
        try {
          port.disconnect()
        } catch {
          // The extension context may already be gone.
        }
      }
    }
  }

  const loadUsageSettings = async () => {
    try {
      const result = await storageGet([USAGE_SETTINGS_KEY])
      usageSettings = normalizeUsageSettings(result[USAGE_SETTINGS_KEY])
      syncUsageTimer()
    } catch {
      usageSettings = DEFAULT_USAGE_SETTINGS
      syncUsageTimer()
    }
  }

  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.visibilityState === "hidden") {
        sendStop()
        return
      }
      sendHeartbeat()
    },
    { passive: true }
  )
  window.addEventListener("focus", sendHeartbeat, { passive: true })
  window.addEventListener("blur", () => sendStop(), { passive: true })
  window.addEventListener("pagehide", () => sendStop(), { passive: true })

  ;(() => {
    try {
      const originalPushState = history.pushState
      const originalReplaceState = history.replaceState

      history.pushState = function pushState(
        ...args: Parameters<History["pushState"]>
      ) {
        const result = originalPushState.apply(this, args)
        sendHeartbeat()
        return result
      }

      history.replaceState = function replaceState(
        ...args: Parameters<History["replaceState"]>
      ) {
        const result = originalReplaceState.apply(this, args)
        sendHeartbeat()
        return result
      }

      window.addEventListener("popstate", sendHeartbeat, { passive: true })
    } catch {
      // ignore
    }
  })()

  try {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") return
      const change = changes[USAGE_SETTINGS_KEY]
      if (!change) return
      const previousSettings = usageSettings
      usageSettings = normalizeUsageSettings(change.newValue)
      if (previousSettings.enabled && !usageSettings.enabled) {
        sendStop(previousSettings, { force: true })
      }
      syncUsageTimer()
    })
  } catch {
    // ignore
  }

  void loadUsageSettings()
})()

export {}
