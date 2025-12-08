/**
 * 全局通知组件 - 在任何页面显示通知
 */

import React, { useEffect, useState, useCallback } from "react"

import styled from "@emotion/styled"
import {
  faCheckCircle,
  faExclamationCircle,
  faTimes,
} from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"

interface NotificationData {
  type: "success" | "error" | "info"
  title: string
  message: string
}

const getColorByType = (type: string): string => {
  if (type === "success") return "var(--accent-color)"
  if (type === "error") return "var(--accent-color2)"
  return "var(--default-color)"
}

const NotificationContainer = styled.div<{ visible: boolean; type: string }>`
  position: fixed;
  top: 20px;
  right: 20px;
  min-width: 300px;
  max-width: 400px;
  background: var(--bg-color);
  border: 2px solid ${({ type }) => getColorByType(type)};
  box-shadow: 8px 8px 0px ${({ type }) => getColorByType(type)};
  padding: 16px;
  z-index: 10000;
  opacity: ${({ visible }) => (visible ? 1 : 0)};
  transform: ${({ visible }) =>
    visible ? "translateX(0)" : "translateX(100%)"};
  transition: opacity 0.3s, transform 0.3s;
  pointer-events: ${({ visible }) => (visible ? "auto" : "none")};
`

const NotificationHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
`

const NotificationTitle = styled.div<{ type: string }>`
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: ${({ type }) => getColorByType(type)};
`

const CloseButton = styled.button`
  background: transparent;
  border: none;
  color: var(--default-color);
  cursor: pointer;
  padding: 4px;
  opacity: 0.6;
  transition: 0.2s;

  &:hover {
    opacity: 1;
  }
`

const NotificationMessage = styled.p`
  margin: 0;
  color: var(--default-color);
  font-size: 0.9rem;
  opacity: 0.8;
  line-height: 1.4;
`

export const GlobalNotification: React.FC = () => {
  const [notification, setNotification] = useState<NotificationData | null>(
    null
  )
  const [visible, setVisible] = useState(false)

  const hideNotification = useCallback(() => {
    setVisible(false)
    setTimeout(() => setNotification(null), 300)
  }, [])

  useEffect(() => {
    const handleShowNotification = (event: CustomEvent<NotificationData>) => {
      setNotification(event.detail)
      setVisible(true)

      // 5秒后自动隐藏
      setTimeout(() => {
        hideNotification()
      }, 5000)
    }

    window.addEventListener(
      "show-notification",
      handleShowNotification as EventListener
    )

    return () => {
      window.removeEventListener(
        "show-notification",
        handleShowNotification as EventListener
      )
    }
  }, [hideNotification])

  if (!notification) return null

  const icon =
    notification.type === "success" ? faCheckCircle : faExclamationCircle

  return (
    <NotificationContainer visible={visible} type={notification.type}>
      <NotificationHeader>
        <NotificationTitle type={notification.type}>
          <FontAwesomeIcon icon={icon} />
          {notification.title}
        </NotificationTitle>
        <CloseButton onClick={hideNotification}>
          <FontAwesomeIcon icon={faTimes} />
        </CloseButton>
      </NotificationHeader>
      <NotificationMessage>{notification.message}</NotificationMessage>
    </NotificationContainer>
  )
}
