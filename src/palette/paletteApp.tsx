import "../base/variables.css"

import { useCallback, useMemo } from "react"

import { ErrorBoundary } from "../components/ErrorBoundary"
import { CommandPalette } from "../Startpage/LinkContainer/CommandPalette/CommandPalette"
import * as Settings from "../Startpage/Settings/settingsHandler"

const COLOR_ALIASES: Record<string, string> = {
  "--bg-primary": "--bg-color",
  "--text-primary": "--default-color",
  "--text-secondary": "--secondary-color",
  "--border-default": "--border-color",
  "--accent": "--accent-color",
  "--accent-hover": "--accent-color2",
}

const applyColors = (colors: Record<string, string>): void => {
  const root = document.documentElement
  Object.entries(colors).forEach(([key, value]) => {
    root.style.setProperty(key, value)
    const alias = COLOR_ALIASES[key]
    if (alias) root.style.setProperty(alias, value)
  })
}

const getNonce = (): string => {
  try {
    const params = new URLSearchParams(window.location.search)
    return params.get("nonce") ?? ""
  } catch {
    return ""
  }
}

const postToParent = (payload: unknown): void => {
  try {
    window.parent.postMessage(payload, "*")
  } catch {
    // ignore
  }
}

export const PaletteApp = () => {
  const colors = Settings.Design.getWithFallback().colors
  applyColors(colors)

  const nonce = useMemo(() => getNonce(), [])

  const handleClose = useCallback(() => {
    postToParent({ type: "fluidity:paletteClose", nonce })
  }, [nonce])

  const handleNavigate = useCallback(
    (p: { url: string; openInNewTab: boolean }) => {
      postToParent({
        type: "fluidity:paletteNavigate",
        nonce,
        url: p.url,
        openInNewTab: p.openInNewTab,
      })
      postToParent({ type: "fluidity:paletteClose", nonce })
    },
    [nonce]
  )

  const linkGroups = Settings.Links.getWithFallback()

  return (
    <ErrorBoundary>
      <CommandPalette
        linkGroups={linkGroups}
        defaultOpen
        hideTrigger
        onNavigate={handleNavigate}
        onClose={handleClose}
      />
    </ErrorBoundary>
  )
}
