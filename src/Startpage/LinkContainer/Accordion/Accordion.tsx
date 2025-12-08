import React, {
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
  onToggleSound: () => void
}

export const AccordionContainer = ({
  children,
  soundEnabled,
  compact,
  onToggleSound,
}: AccordionContainerProps) => (
  <StyledAccordionContainer compact={compact}>
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

const StyledAccordionGroup = styled.div<{ compact?: boolean }>`
  height: ${({ compact }) => (compact ? "200px" : "400px")};
  display: flex;
  padding: 0 10px;
  flex-direction: row;
  border: 3px solid var(--default-color);
  border-right: none;
  border-left: none;

  &:first-of-type {
    border-left: 3px solid var(--default-color);
  }

  &:last-of-type {
    border-right: 3px solid var(--default-color);
  }

  @media screen and (max-height: 700px) {
    height: ${({ compact }) => (compact ? "160px" : "280px")};
  }

  @media screen and (max-width: 800px) {
    height: 200px;
  }

  @media screen and (max-width: 600px) {
    height: 160px;
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
  transition: 0.3s;
  padding: 10px 0;

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
  ::before {
    content: "";
    position: absolute;
    bottom: 0px;
    width: 100%;
    height: ${({ active, fillPercent }) =>
      active ? "97.5%" : `${fillPercent}%`};
    background-color: var(--accent-color);
    transition: ${({ active }) => (active ? "1s" : ".5s")};
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
      active ? "calc(97.5% - 25px)" : `calc(${fillPercent}% - 25px)`};
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

  ${({ active }) =>
    !active &&
    `
        :hover{
            > * {
                color: var(--bg-color);
                text-shadow:
                    5px 0px 0 var(--accent-color),
                    4px 0px 0 var(--accent-color),
                    3px 0px 0 var(--accent-color),
                    2px 0px 0 var(--accent-color),
                    1px 0px 0 var(--accent-color),
                    -1px 0px 0 var(--accent-color),
                    0px 1px 0 var(--accent-color),
                    0px -1px 0 var(--accent-color);
            }
        }
    `};
`

const AccordionTitle = styled.h1<{ title: string; active: boolean }>`
  writing-mode: vertical-rl;
  text-orientation: mixed;
  color: ${({ active }) =>
    active ? "var(--bg-color)" : "var(--default-color)"};
  transition: 0.5s;
  letter-spacing: 3px;
  font-size: 1.1rem;
  margin: 0;
  padding: 10px 0;
`

type groupProps = PropsWithChildren<{
  active: boolean
  title: string
  linkCount: number
  maxLinkCount: number
  maxLabelLength: number
  soundEnabled: boolean
  compact?: boolean
  onClick: () => void
  onMouseDown: (e: MouseEvent) => void
}>

export const AccordionGroup = memo(
  ({
    active,
    title,
    linkCount,
    maxLinkCount,
    maxLabelLength,
    soundEnabled,
    compact,
    children,
    onClick,
    onMouseDown,
  }: groupProps) => {
    const ref = useRef<HTMLDivElement>(null)
    // 基于最大标签长度计算宽度：每个字符约 10px，加上 padding 和图标
    const baseWidth = Math.max(150, Math.min(400, maxLabelLength * 10 + 80))
    const [contentWidth, setContentWidth] = useState(active ? baseWidth : 0)
    const [showNote, setShowNote] = useState(false)
    const prevActiveRef = useRef(active)

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

    return (
      <StyledAccordionGroup ref={ref} compact={compact}>
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
        >
          {children}
        </AccordionContent>
      </StyledAccordionGroup>
    )
  }
)

AccordionGroup.displayName = "AccordionGroup"
