const HEARTBEAT_INTERVAL_MS = 5000
const MIN_SEND_GAP_MS = 500

const normalizeUrl = rawUrl => {
  try {
    const u = new URL(rawUrl)
    if (u.protocol !== "http:" && u.protocol !== "https:") return null
    // Drop query/hash to reduce sensitivity + cardinality.
    return `${u.origin}${u.pathname}`
  } catch {
    return null
  }
}

const isIncognito = () => {
  try {
    return Boolean(chrome?.extension?.inIncognitoContext)
  } catch {
    return false
  }
}

const getPageIdentity = () => {
  const url = normalizeUrl(location.href)
  if (!url) return null
  const title =
    typeof document.title === "string" ? document.title.slice(0, 200) : ""
  return { url, title }
}

let lastSendAt = 0
const canSendNow = () => {
  const t = Date.now()
  if (t - lastSendAt < MIN_SEND_GAP_MS) return false
  lastSendAt = t
  return true
}

const sendStop = () => {
  try {
    if (isIncognito()) return
    if (!canSendNow()) return
    const ident = getPageIdentity()
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
    if (isIncognito()) return
    if (document.visibilityState !== "visible") return
    if (typeof document.hasFocus === "function" && !document.hasFocus()) return
    if (!canSendNow()) return

    const ident = getPageIdentity()
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

// Prefer a long-lived Port to keep MV3 service worker responsive even when no
// extension pages (e.g. new-tab) are open.
let usagePort = null
let portRetryTimer = 0
const connectUsagePort = () => {
  try {
    if (usagePort) return usagePort
    usagePort = chrome.runtime.connect({ name: "fluidity:usage" })
    usagePort.onDisconnect.addListener(() => {
      usagePort = null
      if (portRetryTimer) clearTimeout(portRetryTimer)
      portRetryTimer = setTimeout(() => {
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

const sendToBackground = payload => {
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
      // If the service worker is unavailable, this surfaces only via lastError.
      void chrome.runtime.lastError
    })
  } catch {
    // ignore
  }
}

// Send an initial heartbeat quickly, then keep ticking.
sendHeartbeat()
setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS)

// Extra triggers to reduce perceived lag when switching/returning.
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
window.addEventListener("blur", sendStop, { passive: true })
window.addEventListener("pagehide", sendStop, { passive: true })

// SPA navigation support
;(() => {
  try {
    const originalPushState = history.pushState.bind(history)
    const originalReplaceState = history.replaceState.bind(history)

    history.pushState = (...args) => {
      const result = originalPushState(...args)
      sendHeartbeat()
      return result
    }

    history.replaceState = (...args) => {
      const result = originalReplaceState(...args)
      sendHeartbeat()
      return result
    }

    window.addEventListener("popstate", sendHeartbeat, { passive: true })
  } catch {
    // ignore
  }
})()

// ===== Fluidity: In-page Command Palette Overlay (Shadow DOM + iframe) =====
;(() => {
  const OVERLAY_ID = "__fluidity_palette_overlay__"

  const getExtensionOrigin = () => {
    try {
      return new URL(chrome.runtime.getURL("palette.html")).origin
    } catch {
      return null
    }
  }

  const randomNonce = () =>
    `${Date.now().toString(16)}_${Math.random().toString(16).slice(2)}`

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
      `palette.html?openPalette=1&embed=1&nonce=${encodeURIComponent(nonce)}`
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

    const onMessage = e => {
      try {
        if (!extensionOrigin || e.origin !== extensionOrigin) return
        const data = e.data || {}
        if (data.nonce !== nonce) return
        if (data.type === "fluidity:paletteClose") {
          window.removeEventListener("message", onMessage)
          removeOverlay()
          return
        }
        if (data.type === "fluidity:paletteNavigate") {
          const url = typeof data.url === "string" ? data.url : null
          if (!url) return
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

    // Best effort focus (iframe will focus its own input on mount).
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
