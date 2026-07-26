import "../base/variables.css"

import { useCallback, useMemo } from "react"

import { applyColors } from "../base/colorUtils"
import { ErrorBoundary } from "../components/ErrorBoundary"
import { CommandPalette } from "../Startpage/LinkContainer/CommandPalette/CommandPalette"
import * as Settings from "../Startpage/Settings/settingsHandler"

const getSearchParam = (name: string): string => {
  try {
    const params = new URLSearchParams(window.location.search)
    return params.get(name) ?? ""
  } catch {
    return ""
  }
}

const getNonce = (): string => getSearchParam("nonce")

// 目标 origin 由 contentScript 注入时传入；palette.html 是 web_accessible
// 资源，任何网站都能嵌入它，绝不能用 "*" 广播 nonce 和导航数据。
const parentOrigin = getSearchParam("parentOrigin") || window.location.origin

const postToParent = (payload: unknown): void => {
  try {
    window.parent.postMessage(payload, parentOrigin)
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
