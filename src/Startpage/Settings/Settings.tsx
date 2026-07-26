import React, { Suspense, useState, useEffect } from "react"

import styled from "@emotion/styled"
import { faSlidersH } from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"

import { setSettingsWindowOpen } from "../../components/AILoadingIndicator"
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

  color: var(--default-color);
  background-color: transparent;
  border: none;
  opacity: 0.3;

  cursor: pointer;
  transition: 0.3s;

  :hover {
    opacity: 0.5;
    color: var(--accent-color2);
    animation: box-flicker 0.01s ease 0s infinite alternate;
  }
  :focus {
    outline: none;
  }
`

const PopupCover = styled.div`
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  background-color: var(--bg-color);
  opacity: 0.7;
  z-index: 100;
`

export const Settings = () => {
  const [showSettings, setShowSettings] = useState(false)
  const [initialTab, setInitialTab] = useState<string | undefined>(undefined)

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

  const hidePopup = () => setShowSettings(false)
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
        <>
          <PopupCover />
          <Suspense fallback={null}>
            <SettingsWindow hidePopup={hidePopup} initialTab={initialTab} />
          </Suspense>
        </>
      )}
    </>
  )
}
