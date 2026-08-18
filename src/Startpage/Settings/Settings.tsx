import React, { Suspense, useState, useEffect, useRef } from "react"

import styled from "@emotion/styled"
import { faSlidersH } from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"

import { setSettingsWindowOpen } from "../../components/AILoadingIndicator"
import { Modal } from "../../components/Modal"
import { SyncStatusDot } from "../../components/SyncStatusDot"

const SettingsWindow = React.lazy(() =>
  import("./SettingsWindow").then(module => ({
    default: module.SettingsWindow,
  }))
)

const TopRightControls = styled.div`
  position: fixed;
  top: 20px;
  right: 20px;
  display: flex;
  align-items: center;
  gap: 10px;
  z-index: 102;
`

const SettingsPopupToggle = styled.button`
  font-size: 20px;

  color: var(--text-primary);
  background-color: transparent;
  border: none;
  opacity: 0.3;

  cursor: pointer;
  transition: 0.3s;

  :hover {
    opacity: 0.5;
    color: var(--accent-hover);
  }
  :focus {
    outline: none;
  }
  :focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
    opacity: 0.8;
  }
`

export const Settings = () => {
  const [showSettings, setShowSettings] = useState(false)
  const [initialTab, setInitialTab] = useState<string | undefined>(undefined)
  // SettingsWindow 注册的关闭守卫（未应用更改时弹确认）
  const closeGuardRef = useRef<() => boolean>(() => true)

  // 通知全局设置窗口状态变化
  useEffect(() => {
    setSettingsWindowOpen(showSettings)
  }, [showSettings])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const requestedTab = params.get("settings")
    if (requestedTab === "data") {
      setInitialTab("data")
      setShowSettings(true)
    }
  }, [])

  useEffect(() => {
    const openSettings = (event: Event) => {
      const detail = (event as CustomEvent<{ tab?: string }>).detail
      setInitialTab(detail?.tab === "data" ? "data" : undefined)
      setShowSettings(true)
    }
    window.addEventListener("fluidity:open-settings", openSettings)
    return () =>
      window.removeEventListener("fluidity:open-settings", openSettings)
  }, [])

  const hidePopup = () => {
    if (!closeGuardRef.current()) return
    closeGuardRef.current = () => true
    setShowSettings(false)
  }
  const showDefaultSettings = () => {
    setInitialTab(undefined)
    setShowSettings(true)
  }
  const showDataSettings = () => {
    setInitialTab("data")
    setShowSettings(true)
  }

  return (
    <>
      <TopRightControls>
        <SyncStatusDot
          onClick={showDataSettings}
          label="打开云同步设置"
        />
        <SettingsPopupToggle
          type="button"
          aria-label="打开设置"
          title="打开设置"
          onClick={showDefaultSettings}
        >
          <FontAwesomeIcon icon={faSlidersH} />
        </SettingsPopupToggle>
      </TopRightControls>
      {showSettings && (
        <Modal onClose={hidePopup} label="设置">
          <Suspense fallback={null}>
            <SettingsWindow
              hidePopup={hidePopup}
              initialTab={initialTab}
              registerCloseGuard={guard => {
                closeGuardRef.current = guard
              }}
            />
          </Suspense>
        </Modal>
      )}
    </>
  )
}
