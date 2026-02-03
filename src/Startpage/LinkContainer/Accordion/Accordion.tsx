import React, {
  forwardRef,
  memo,
  MouseEvent,
  PropsWithChildren,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react"

import styled from "@emotion/styled"
import { faVolumeUp, faVolumeMute } from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"

import { NoteAnimation } from "../../../components/NoteAnimation"
import { AccordionSoundService } from "../../../services/accordionSound"

const StyledAccordionContainer = styled.div<{ compact?: boolean }>`
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  position: relative;
  width: 100%;
  justify-content: ${({ compact }) => (compact ? "center" : "flex-start")};
  align-items: flex-start;
  padding-top: ${({ compact }) => (compact ? "50px" : "0")};
`

// 高度调整手柄（用于每个手风琴组的上下边缘）
const HeightResizeHandle = styled.div<{ position: "top" | "bottom" }>`
  position: absolute;
  ${({ position }) => (position === "top" ? "top: -6px;" : "bottom: -6px;")}
  left: 0;
  right: 0;
  height: 12px;
  cursor: ns-resize;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s;
  z-index: 20;

  &:hover,
  &.dragging {
    opacity: 1;
  }

  &::before {
    content: "";
    width: 40px;
    height: 3px;
    background: var(--accent-color);
    border-radius: 2px;
    transition: width 0.2s;
  }

  &:hover::before {
    width: 60px;
  }
`

// 宽度调整手柄
const WidthResizeHandle = styled.div`
  position: absolute;
  right: -6px;
  top: 0;
  bottom: 0;
  width: 12px;
  cursor: ew-resize;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s;
  z-index: 10;

  &:hover,
  &.dragging {
    opacity: 1;
  }

  &::before {
    content: "";
    width: 4px;
    height: 40px;
    background: var(--accent-color);
    border-radius: 2px;
  }
`

const SoundToggleButton = styled.button<{ enabled: boolean }>`
  position: absolute;
  top: -40px;
  right: 0;
  background: transparent;
  border: 2px solid var(--default-color);
  color: ${({ enabled }) =>
    enabled ? "var(--accent-color)" : "var(--default-color)"};
  width: 32px;
  height: 32px;
  cursor: pointer;
  opacity: 0.6;
  transition: 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    opacity: 1;
    border-color: var(--accent-color);
  }
`

interface AccordionContainerProps extends PropsWithChildren {
  soundEnabled: boolean
  compact?: boolean
  customHeight?: number
  onToggleSound: () => void
  onHeightChange?: (height: number) => void
}

export const AccordionContainer = forwardRef<
  HTMLDivElement,
  Omit<AccordionContainerProps, "customHeight" | "onHeightChange">
>(({ children, soundEnabled, compact, onToggleSound }, ref) => {
  return (
    <StyledAccordionContainer ref={ref} compact={compact}>
      <SoundToggleButton
        enabled={soundEnabled}
        onClick={onToggleSound}
        title={soundEnabled ? "关闭音效" : "开启音效"}
        style={compact ? { top: "10px", right: "10px" } : undefined}
      >
        <FontAwesomeIcon icon={soundEnabled ? faVolumeUp : faVolumeMute} />
      </SoundToggleButton>
      {children}
    </StyledAccordionContainer>
  )
})

AccordionContainer.displayName = "AccordionContainer"

// 高度计算常量
const LINK_HEIGHT = 32 // 每个链接的高度（px）
const MIN_HEIGHT = 160 // 最小高度
const MAX_HEIGHT = 500 // 最大高度
const PADDING = 20 // 上下 padding

/**
 * 根据最大链接数计算手风琴高度
 */
const calculateAccordionHeight = (
  maxLinkCount: number,
  compact?: boolean
): number => {
  if (compact) {
    // 紧凑模式：高度范围更小
    const compactMin = 140
    const compactMax = 280
    const height = maxLinkCount * LINK_HEIGHT + PADDING
    return Math.min(compactMax, Math.max(compactMin, height))
  }
  // 正常模式
  const height = maxLinkCount * LINK_HEIGHT + PADDING
  return Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, height))
}

const StyledAccordionGroup = styled.div<{
  compact?: boolean
  dynamicHeight: number
}>`
  height: ${({ dynamicHeight }) => `${dynamicHeight}px`};
  display: flex;
  padding: 0 10px;
  flex-direction: row;
  border: 3px solid var(--default-color);
  border-right: none;
  border-left: none;
  position: relative;

  &:first-of-type {
    border-left: 3px solid var(--default-color);
  }

  &:last-of-type {
    border-right: 3px solid var(--default-color);
  }

  @media screen and (max-height: 700px) {
    height: ${({ dynamicHeight, compact }) =>
      `${Math.round(dynamicHeight * (compact ? 0.8 : 0.7))}px`};
  }

  @media screen and (max-width: 800px) {
    height: ${({ dynamicHeight }) =>
      `${Math.min(200, Math.round(dynamicHeight * 0.6))}px`};
  }

  @media screen and (max-width: 600px) {
    height: ${({ dynamicHeight }) =>
      `${Math.min(160, Math.round(dynamicHeight * 0.5))}px`};
  }
`

const AccordionContent = styled.div<{ width: number }>`
  height: 100%;
  width: ${({ width }) => `${width}px`};
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  overflow-x: hidden;
  overflow-y: auto;
  /* 优化的展开收起动画 - 使用 cubic-bezier 实现更自然的缓动 */
  transition: width 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s ease-out;
  opacity: ${({ width }) => (width > 0 ? 1 : 0)};
  padding: 6px 0;
  box-sizing: border-box;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);

  &::-webkit-scrollbar {
    width: 4px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: var(--default-color);
    opacity: 0.3;
  }
`

const AccordionTitleWrapper = styled.button<{
  active: boolean
  fillPercent: number
}>`
  padding: 0;
  background-color: var(--bg-color);
  border: 4px solid var(--accent-color);
  height: 100%;
  width: 90px;
  cursor: ${({ active }) => (active ? "default" : "pointer")};
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.8;
  position: relative;
  overflow: hidden;

  ::before {
    content: "";
    position: absolute;
    bottom: 0px;
    width: 100%;
    height: ${({ active, fillPercent }) =>
      active ? "92%" : `${fillPercent}%`};
    background-color: var(--accent-color);
    /* 优化的填充动画 - 展开时更快，收起时更慢 */
    transition: height ${({ active }) => (active ? "0.6s" : "0.4s")}
      cubic-bezier(0.4, 0, 0.2, 1);
  }

  :hover,
  :focus {
    outline: none;
    ${({ active }) =>
      !active &&
      `
            ::before {
                height: 50%;
            }
            > .wave {
                bottom: calc(50% - 25px);
                ::before{
                    animation: wave 12s infinite cubic-bezier(0.71, 0.33, 0.33, 0.68);
                    top: -25%;
                    left: 50%;
                }
            }
        `}
  }

  > .wave {
    /* Waves Source: https://codepen.io/mburakerman/pen/eRZZEv */
    width: 82px;
    height: 50px;
    position: absolute;
    bottom: ${({ active, fillPercent }) =>
      active ? "calc(92% - 25px)" : `calc(${fillPercent}% - 25px)`};
    top: auto;
    overflow: hidden;
    transition: ${({ active }) => (active ? "1s" : ".5s")};

    ::before {
      content: "";
      width: 180px;
      height: 185px;
      position: absolute;
      top: -25%;
      left: 50%;
      margin-left: -90px;
      margin-top: -140px;
      border-radius: 37%;
      background-color: var(--bg-color);
      animation: wave 12s infinite cubic-bezier(0.71, 0.33, 0.33, 0.68);
    }

    @keyframes wave {
      from {
        transform: rotate(0deg);
      }
      from {
        transform: rotate(360deg);
      }
    }
  }
`

const AccordionTitle = styled.h1<{ title: string; active: boolean }>`
  writing-mode: vertical-rl;
  text-orientation: mixed;
  color: ${({ active }) =>
    active ? "var(--text-on-accent)" : "var(--default-color)"};
  text-shadow: ${({ active }) =>
    active
      ? "0 1px 2px rgba(0, 0, 0, 0.3)"
      : "0 0 8px var(--bg-color), 0 0 16px var(--bg-color)"};
  transition: 0.5s;
  letter-spacing: 3px;
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0;
  padding: 10px 0;
  z-index: 1;
`

type groupProps = PropsWithChildren<{
  active: boolean
  title: string
  linkCount: number
  maxLinkCount: number
  maxLabelLength: number
  soundEnabled: boolean
  compact?: boolean
  customHeight?: number
  customWidth?: number
  onClick: () => void
  onMouseDown: (e: MouseEvent) => void
  onWidthChange?: (width: number) => void
  onHeightChange?: (height: number) => void
}>

/* eslint-disable sonarjs/cognitive-complexity */
export const AccordionGroup = memo(
  ({
    active,
    title,
    linkCount,
    maxLinkCount,
    maxLabelLength,
    soundEnabled,
    compact,
    customHeight,
    customWidth,
    children,
    onClick,
    onMouseDown,
    onWidthChange,
    onHeightChange,
  }: groupProps) => {
    const ref = useRef<HTMLDivElement>(null)
    // 基于最大标签长度计算宽度：每个字符约 10px，加上 padding 和图标
    const baseWidth =
      customWidth ?? Math.max(150, Math.min(400, maxLabelLength * 10 + 80))
    const [contentWidth, setContentWidth] = useState(active ? baseWidth : 0)
    const [showNote, setShowNote] = useState(false)
    const prevActiveRef = useRef(active)
    const [isDraggingWidth, setIsDraggingWidth] = useState(false)
    const [isDraggingHeight, setIsDraggingHeight] = useState(false)
    const startXRef = useRef(0)
    const startWidthRef = useRef(0)
    const startYRef = useRef(0)
    const startHeightRef = useRef(0)

    // 计算填充高度百分比（基于链接数量的相对排序）
    const fillPercent =
      maxLinkCount > 0 ? Math.round((linkCount / maxLinkCount) * 100) : 0

    // 获取音符名称
    const noteName = AccordionSoundService.getNoteForPercent(fillPercent)

    useEffect(() => {
      if (active) {
        setContentWidth(baseWidth)
      } else {
        setContentWidth(0)
      }
    }, [active, baseWidth])

    // 当激活状态变化时播放音效和显示动画
    useEffect(() => {
      if (active && !prevActiveRef.current && soundEnabled) {
        // 从非激活变为激活时播放音效
        AccordionSoundService.playForPercent(fillPercent)
        setShowNote(true)
      }
      prevActiveRef.current = active
    }, [active, fillPercent, soundEnabled])

    const handleNoteComplete = useCallback(() => {
      setShowNote(false)
    }, [])

    // 宽度拖拽处理
    const handleWidthDragStart = useCallback(
      (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDraggingWidth(true)
        startXRef.current = e.clientX
        startWidthRef.current = contentWidth
      },
      [contentWidth]
    )

    useEffect(() => {
      if (!isDraggingWidth) return

      const handleMouseMove = (e: globalThis.MouseEvent) => {
        const deltaX = e.clientX - startXRef.current
        const newWidth = Math.max(
          100,
          Math.min(500, startWidthRef.current + deltaX)
        )
        setContentWidth(newWidth)
        onWidthChange?.(newWidth)
      }

      const handleMouseUp = () => {
        setIsDraggingWidth(false)
      }

      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("mouseup", handleMouseUp)

      return () => {
        document.removeEventListener("mousemove", handleMouseMove)
        document.removeEventListener("mouseup", handleMouseUp)
      }
    }, [isDraggingWidth, onWidthChange])

    // 高度拖拽处理
    const handleHeightDragStart = useCallback(
      (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDraggingHeight(true)
        startYRef.current = e.clientY
        startHeightRef.current =
          ref.current?.offsetHeight ?? customHeight ?? 200
      },
      [customHeight]
    )

    useEffect(() => {
      if (!isDraggingHeight) return

      const handleMouseMove = (e: globalThis.MouseEvent) => {
        const deltaY = e.clientY - startYRef.current
        const newHeight = Math.max(
          120,
          Math.min(600, startHeightRef.current + deltaY)
        )
        onHeightChange?.(newHeight)
      }

      const handleMouseUp = () => {
        setIsDraggingHeight(false)
      }

      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("mouseup", handleMouseUp)

      return () => {
        document.removeEventListener("mousemove", handleMouseMove)
        document.removeEventListener("mouseup", handleMouseUp)
      }
    }, [isDraggingHeight, onHeightChange])

    // 计算动态高度（优先使用自定义高度）
    const dynamicHeight =
      customHeight ?? calculateAccordionHeight(maxLinkCount, compact)

    return (
      <StyledAccordionGroup
        ref={ref}
        compact={compact}
        dynamicHeight={dynamicHeight}
        data-accordion-group
      >
        {/* 顶部高度调整手柄 */}
        {onHeightChange && (
          <HeightResizeHandle
            position="top"
            className={isDraggingHeight ? "dragging" : ""}
            onMouseDown={handleHeightDragStart}
            title="拖拽调整高度"
          />
        )}
        <AccordionTitleWrapper
          active={active}
          fillPercent={fillPercent}
          onMouseDown={onMouseDown}
          onClick={onClick}
          tabIndex={active ? -1 : undefined}
        >
          <div className={"wave"} />
          <AccordionTitle active={active} title={title}>
            {title}
          </AccordionTitle>
          {soundEnabled && (
            <NoteAnimation
              show={showNote}
              note={noteName}
              onComplete={handleNoteComplete}
            />
          )}
        </AccordionTitleWrapper>
        <AccordionContent
          width={contentWidth}
          aria-hidden={!active || undefined}
          style={{ position: "relative" }}
        >
          {children}
          {active && onWidthChange && (
            <WidthResizeHandle
              className={isDraggingWidth ? "dragging" : ""}
              onMouseDown={handleWidthDragStart}
              title="拖拽调整宽度"
            />
          )}
        </AccordionContent>
        {/* 底部高度调整手柄 */}
        {onHeightChange && (
          <HeightResizeHandle
            position="bottom"
            className={isDraggingHeight ? "dragging" : ""}
            onMouseDown={handleHeightDragStart}
            title="拖拽调整高度"
          />
        )}
      </StyledAccordionGroup>
    )
  }
)

AccordionGroup.displayName = "AccordionGroup"
