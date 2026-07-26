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
        portRetryTimer = window.setTimeout(() => {
          portRetryTimer = 0
          connectUsagePort()
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

  ;(() => {
    const OVERLAY_ID = "__fluidity_palette_overlay__"

    const getExtensionOrigin = () => {
      try {
        return new URL(chrome.runtime.getURL("palette.html")).origin
      } catch {
        return null
      }
    }

    const randomNonce = () => {
      const bytes = new Uint8Array(16)
      crypto.getRandomValues(bytes)
      return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("")
    }

    // 此文件必须自包含（MV3 content script 不能有共享 chunk），
    // 故不 import utils/urlSafety，就地校验导航目标 scheme。
    const isSafeNavigationUrl = (url: string) => {
      try {
        return ["http:", "https:"].includes(new URL(url).protocol)
      } catch {
        return false
      }
    }

    const removeOverlay = () => {
      const existing = document.getElementById(OVERLAY_ID)
      if (existing) existing.remove()
    }

    const createOverlay = () => {
      if (document.getElementById(OVERLAY_ID)) {
        removeOverlay()
        return
      }

      const host = document.createElement("div")
      host.id = OVERLAY_ID
      host.style.position = "fixed"
      host.style.top = "0"
      host.style.left = "0"
      host.style.right = "0"
      host.style.bottom = "0"
      host.style.zIndex = "2147483647"
      host.style.pointerEvents = "auto"

      const shadow = host.attachShadow({ mode: "open" })
      const nonce = randomNonce()
      const src = chrome.runtime.getURL(
        `palette.html?openPalette=1&embed=1&nonce=${encodeURIComponent(
          nonce
        )}&parentOrigin=${encodeURIComponent(window.location.origin)}`
      )

      const style = document.createElement("style")
      style.textContent = `
        :host { all: initial; }
        .wrap { position: fixed; inset: 0; width: 100vw; height: 100vh; }
        iframe { width: 100%; height: 100%; border: 0; display: block; background: transparent; }
      `

      const wrap = document.createElement("div")
      wrap.className = "wrap"

      const iframe = document.createElement("iframe")
      iframe.src = src
      iframe.setAttribute("title", "Fluidity Command Palette")
      iframe.setAttribute("tabindex", "-1")
      wrap.appendChild(iframe)

      shadow.appendChild(style)
      shadow.appendChild(wrap)

      const extensionOrigin = getExtensionOrigin()

      const onMessage = (e: MessageEvent) => {
        try {
          if (!extensionOrigin || e.origin !== extensionOrigin) return
          if (e.source !== iframe.contentWindow) return
          const data = e.data as {
            nonce?: unknown
            type?: unknown
            url?: unknown
            openInNewTab?: unknown
          }
          if (data.nonce !== nonce) return
          if (data.type === "fluidity:paletteClose") {
            window.removeEventListener("message", onMessage)
            removeOverlay()
            return
          }
          if (data.type === "fluidity:paletteNavigate") {
            const url = typeof data.url === "string" ? data.url : null
            if (!url || !isSafeNavigationUrl(url)) return
            const openInNewTab = Boolean(data.openInNewTab)
            window.removeEventListener("message", onMessage)
            removeOverlay()
            if (openInNewTab) {
              window.open(url, "_blank", "noopener,noreferrer")
            } else {
              window.location.assign(url)
            }
          }
        } catch {
          // ignore
        }
      }

      window.addEventListener("message", onMessage)
      document.documentElement.appendChild(host)

      try {
        iframe.focus()
      } catch {
        // ignore
      }
    }

    try {
      chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
        if (msg?.type !== "fluidity:togglePaletteOverlay") return
        createOverlay()
        sendResponse({ ok: true })
      })
    } catch {
      // ignore
    }
  })()
})()

export {}
