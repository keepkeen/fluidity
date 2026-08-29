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

const IndicatorContainer = styled.div`
  position: fixed;
  top: 20px;
  left: 20px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 20px;
  background: var(--bg-primary);
  border: 1px solid var(--accent);
  box-shadow: var(--shadow-soft);
  border-radius: var(--radius-sm);
  z-index: 50;
  animation: indicator-in 0.3s ease-out both;

  @keyframes indicator-in {
    from {
      opacity: 0;
      transform: translateX(-24px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`

const SpinnerIcon = styled(FontAwesomeIcon)`
  color: var(--accent);
  animation: spin 1s linear infinite;

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`

const LoadingText = styled.span`
  color: var(--text-primary);
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

  if (!isLoading) return null

  return (
    <IndicatorContainer role="status" aria-live="polite">
      <SpinnerIcon icon={faSpinner} />
      <LoadingText>AI 正在整理链接...</LoadingText>
    </IndicatorContainer>
  )
}
