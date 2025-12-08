import React, { useCallback, useEffect, useState } from "react"

import { css, keyframes } from "@emotion/react"
import styled from "@emotion/styled"
import { faTimes } from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"

import { Ribbon } from "./components/Ribbon"
import { MonthlyReport } from "./MonthlyReport"
import { WeeklyReport } from "./WeeklyReport"
import { ReportState } from "../../services/reportState"

const fadeIn = keyframes`
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
`

const fadeOut = keyframes`
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
`

const scaleIn = keyframes`
  from {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.9);
  }
  to {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
`

const scaleOut = keyframes`
  from {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
  to {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.9);
  }
`

// 遮罩层
const Overlay = styled.div<{ closing: boolean }>`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 100;
  animation: ${({ closing }) =>
    closing
      ? css`
          ${fadeOut} 0.3s ease-out forwards
        `
      : css`
          ${fadeIn} 0.3s ease-out
        `};
`

// 弹窗容器
const ModalContainer = styled.div<{ closing: boolean }>`
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: calc(100% - 60px);
  max-width: 900px;
  max-height: calc(100vh - 60px);
  z-index: 101;
  animation: ${({ closing }) =>
    closing
      ? css`
          ${scaleOut} 0.3s ease-out forwards
        `
      : css`
          ${scaleIn} 0.3s ease-out
        `};

  @media screen and (max-width: 600px) {
    width: calc(100% - 20px);
    max-height: calc(100vh - 20px);
  }
`

const ModalContent = styled.div`
  position: relative;
  padding: 20px;
  border: 2px solid var(--default-color);
  background: var(--bg-color);
  color: var(--default-color);
  box-shadow: 10px 10px 0px var(--accent-color);
  max-height: calc(100vh - 60px);
  display: flex;
  flex-direction: column;

  @media screen and (max-width: 600px) {
    padding: 12px;
    max-height: calc(100vh - 20px);
    box-shadow: 5px 5px 0px var(--accent-color);
  }
`

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 2px solid var(--default-color);
  flex-shrink: 0;
`

const Title = styled.h2`
  margin: 0;
  font-size: 1.3rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;

  @media screen and (max-width: 600px) {
    font-size: 1.1rem;
  }
`

const TitleIcon = styled.span`
  font-size: 1.5rem;
`

const TitleText = styled.span`
  background: linear-gradient(90deg, var(--accent-color), var(--accent-color2));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
`

const CloseButton = styled.button`
  background: transparent;
  border: 2px solid var(--default-color);
  color: var(--default-color);
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: 0.2s;

  &:hover {
    background: var(--accent-color2);
    color: var(--bg-color);
    border-color: var(--accent-color2);
  }
`

const Content = styled.div`
  flex: 1;
  overflow-y: auto;
  padding-right: 8px;

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.1);
  }

  &::-webkit-scrollbar-thumb {
    background: var(--default-color);
    border-radius: 3px;
  }
`

export const ReportBanner: React.FC = () => {
  const [reportType, setReportType] = useState<"weekly" | "monthly" | null>(
    null
  )
  const [closing, setClosing] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const type = ReportState.shouldShowReport()
    if (type) {
      setReportType(type)
      setVisible(true)
    }
  }, [])

  const handleClose = useCallback(() => {
    setClosing(true)

    // 记录关闭状态
    if (reportType === "weekly") {
      ReportState.dismissWeekly()
    } else if (reportType === "monthly") {
      ReportState.dismissMonthly()
    }

    // 动画结束后隐藏
    setTimeout(() => {
      setVisible(false)
    }, 300)
  }, [reportType])

  // 点击遮罩层关闭
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        handleClose()
      }
    },
    [handleClose]
  )

  // ESC 键关闭
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && visible) {
        handleClose()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [visible, handleClose])

  if (!visible || !reportType) {
    return null
  }

  const isWeekly = reportType === "weekly"
  const title = isWeekly ? "上周回顾" : "上月总结"
  const icon = isWeekly ? "🎊" : "🎉"

  return (
    <>
      <Overlay closing={closing} onClick={handleOverlayClick} />
      <ModalContainer closing={closing}>
        <Ribbon position="left" />
        <Ribbon position="right" />

        <ModalContent>
          <Header>
            <Title>
              <TitleIcon>{icon}</TitleIcon>
              <TitleText>{title}</TitleText>
              <TitleIcon>{icon}</TitleIcon>
            </Title>
            <CloseButton onClick={handleClose} aria-label="关闭">
              <FontAwesomeIcon icon={faTimes} />
            </CloseButton>
          </Header>

          <Content>{isWeekly ? <WeeklyReport /> : <MonthlyReport />}</Content>
        </ModalContent>
      </ModalContainer>
    </>
  )
}
