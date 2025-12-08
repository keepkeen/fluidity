/**
 * AI 加载指示器 - 全局显示 AI 整理进度
 * 只在设置窗口关闭时显示在右上角
 */

import React, { useEffect, useState } from "react"

import styled from "@emotion/styled"
import { faSpinner } from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"

import {
  getOrganizeStatus,
  subscribeOrganizeStatus,
  OrganizeStatus,
} from "../services/linkOrganizer"

// 全局设置窗口状态
let settingsWindowOpen = false
type SettingsListener = (open: boolean) => void
let settingsListeners: SettingsListener[] = []

export const setSettingsWindowOpen = (open: boolean) => {
  settingsWindowOpen = open
  settingsListeners.forEach(listener => listener(open))
}

export const subscribeSettingsWindow = (
  listener: SettingsListener
): (() => void) => {
  settingsListeners.push(listener)
  return () => {
    settingsListeners = settingsListeners.filter(l => l !== listener)
  }
}

const IndicatorContainer = styled.div<{ visible: boolean }>`
  position: fixed;
  top: 20px;
  right: 20px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 20px;
  background: var(--bg-color);
  border: 2px solid var(--accent-color);
  box-shadow: 6px 6px 0px var(--accent-color);
  z-index: 50;
  opacity: ${({ visible }) => (visible ? 1 : 0)};
  transform: ${({ visible }) =>
    visible ? "translateX(0)" : "translateX(100%)"};
  transition: opacity 0.3s, transform 0.3s;
  pointer-events: ${({ visible }) => (visible ? "auto" : "none")};
`

const SpinnerIcon = styled(FontAwesomeIcon)`
  color: var(--accent-color);
  animation: spin 1s linear infinite;

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
`

const LoadingText = styled.span`
  color: var(--default-color);
  font-size: 0.9rem;
`

export const AILoadingIndicator: React.FC = () => {
  const [status, setStatus] = useState<OrganizeStatus>(getOrganizeStatus())
  const [settingsOpen, setSettingsOpen] = useState(settingsWindowOpen)

  useEffect(() => {
    // 订阅整理状态变化
    return subscribeOrganizeStatus(result => {
      setStatus(result.status)
    })
  }, [])

  useEffect(() => {
    // 订阅设置窗口状态变化
    return subscribeSettingsWindow(open => {
      setSettingsOpen(open)
    })
  }, [])

  // 只在设置窗口关闭且正在加载时显示
  const isLoading = status === "loading" && !settingsOpen

  return (
    <IndicatorContainer visible={isLoading}>
      <SpinnerIcon icon={faSpinner} />
      <LoadingText>AI 正在整理链接...</LoadingText>
    </IndicatorContainer>
  )
}
