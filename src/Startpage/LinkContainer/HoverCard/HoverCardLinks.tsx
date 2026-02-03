import React, { memo, useState, useRef, useCallback } from "react"

import styled from "@emotion/styled"
import { faTrash } from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"

import { Favicon } from "../../../components/Favicon"
import { linkGroup } from "../../../data/data"
import { LinkAnalytics } from "../../../services/analytics"
import { navigateToLink } from "../../../services/linkSearch"
import * as Settings from "../../Settings/settingsHandler"

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 20px;
  max-height: 400px;
  overflow-y: auto;
`

const GroupItem = styled.div`
  position: relative;
`

const GroupTitle = styled.button<{ active: boolean }>`
  width: 100%;
  padding: 12px 16px;
  background: ${({ active }) =>
    active ? "var(--accent-color)" : "rgba(0, 0, 0, 0.3)"};
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  color: ${({ active }) =>
    active ? "var(--bg-color)" : "var(--default-color)"};
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  cursor: pointer;
  font-size: 1rem;
  font-weight: 500;
  text-align: left;
  transition: 0.2s;
  position: relative;

  &:hover {
    background: var(--accent-color);
    color: var(--bg-color);
  }

  &::after {
    content: "→";
    position: absolute;
    right: 16px;
    opacity: ${({ active }) => (active ? 1 : 0.5)};
    transition: 0.2s;
  }

  &:hover::after {
    opacity: 1;
    transform: translateX(4px);
  }
`

// 卡片尺寸常量
const CARD_MIN_WIDTH = 160
const CARD_MAX_WIDTH = 350
const CARD_MIN_HEIGHT = 100
const CARD_MAX_HEIGHT = 400
const CHAR_WIDTH = 9 // 每个字符约 9px
const LINK_HEIGHT = 38 // 每个链接高度
const HEADER_HEIGHT = 40 // 头部高度
const PADDING = 8 // 内边距

const CardPopup = styled.div<{
  visible: boolean
  position: "right" | "left"
  offsetTop: number
  cardWidth: number
  cardHeight: number
}>`
  position: fixed;
  ${({ position }) => (position === "right" ? "left: auto;" : "right: auto;")}
  top: ${({ offsetTop }) => offsetTop}px;
  width: ${({ cardWidth }) => cardWidth}px;
  height: ${({ cardHeight }) => cardHeight}px;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
  opacity: ${({ visible }) => (visible ? 1 : 0)};
  transform: ${({ visible, position }) =>
    visible
      ? "translateX(0) scale(1)"
      : position === "right"
      ? "translateX(-10px) scale(0.95)"
      : "translateX(10px) scale(0.95)"};
  transform-origin: ${({ position }) =>
    position === "right" ? "left center" : "right center"};
  pointer-events: ${({ visible }) => (visible ? "auto" : "none")};
  transition: opacity 0.2s ease-out,
    transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 50;
  display: flex;
  flex-direction: column;
`

const LinkList = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 3px;

    &:hover {
      background: rgba(255, 255, 255, 0.3);
    }
  }
`

const LinkItemWrapper = styled.div`
  display: flex;
  align-items: center;
  transition: 0.15s;

  &:hover {
    background: var(--accent-color);
  }
`

const LinkItem = styled.a`
  flex: 1;
  padding: 10px 16px;
  color: var(--default-color);
  text-decoration: none;
  transition: 0.15s;
  position: relative;
  font-size: 0.95rem;
  display: flex;
  align-items: center;
  gap: 8px;

  &::before {
    content: "";
    position: absolute;
    left: 0;
    bottom: 0;
    width: 3px;
    height: 0;
    background: var(--accent-color);
    transition: 0.2s;
  }

  ${LinkItemWrapper}:hover & {
    color: var(--bg-color);

    &::before {
      height: 100%;
    }
  }
`

const DeleteBtn = styled.button`
  background: transparent;
  border: none;
  color: var(--default-color);
  cursor: pointer;
  padding: 8px 12px;
  opacity: 0;
  transition: 0.2s;

  ${LinkItemWrapper}:hover & {
    opacity: 0.7;
    color: var(--bg-color);
  }

  &:hover {
    opacity: 1 !important;
  }
`

const CardHeader = styled.div`
  padding: 10px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  font-weight: 600;
  font-size: 0.85rem;
  color: var(--accent-color);
`

interface Props {
  linkGroups: linkGroup[]
  onDeleteLink?: (groupIndex: number, linkIndex: number, label: string) => void
}

/**
 * 计算卡片尺寸
 */
const calculateCardSize = (
  links: { label: string; value: string }[]
): { width: number; height: number } => {
  // 计算最长标签长度
  const maxLabelLength = Math.max(...links.map(l => l.label.length), 0)
  // 宽度：基于最长标签 + favicon + padding
  const width = Math.min(
    CARD_MAX_WIDTH,
    Math.max(CARD_MIN_WIDTH, maxLabelLength * CHAR_WIDTH + 60)
  )
  // 高度：基于链接数量
  const contentHeight = links.length * LINK_HEIGHT + HEADER_HEIGHT + PADDING
  const height = Math.min(
    CARD_MAX_HEIGHT,
    Math.max(CARD_MIN_HEIGHT, contentHeight)
  )

  return { width, height }
}

export const HoverCardLinks = memo(({ linkGroups, onDeleteLink }: Props) => {
  const [activeGroup, setActiveGroup] = useState<number | null>(null)
  const [cardPosition, setCardPosition] = useState<"right" | "left">("right")
  const [cardOffset, setCardOffset] = useState({ top: 0, left: 0 })
  const [cardSize, setCardSize] = useState({
    width: CARD_MIN_WIDTH,
    height: CARD_MIN_HEIGHT,
  })
  const containerRef = useRef<HTMLDivElement>(null)
  const groupRefs = useRef<(HTMLDivElement | null)[]>([])
  const leaveTimeoutRef = useRef<number | null>(null)
  const linkDisplaySettings = Settings.LinkDisplay.getWithFallback()

  const handleMouseEnter = useCallback(
    (index: number) => {
      // 清除离开定时器
      if (leaveTimeoutRef.current) {
        clearTimeout(leaveTimeoutRef.current)
        leaveTimeoutRef.current = null
      }
      setActiveGroup(index)

      // 计算卡片尺寸
      const group = linkGroups[index]
      const size = calculateCardSize(group.links)
      setCardSize(size)

      const groupEl = groupRefs.current[index]
      if (groupEl) {
        const rect = groupEl.getBoundingClientRect()
        const windowWidth = window.innerWidth
        const windowHeight = window.innerHeight

        // 判断弹出方向
        const spaceRight = windowWidth - rect.right
        const spaceLeft = rect.left

        if (spaceRight > size.width + 20 || spaceRight >= spaceLeft) {
          setCardPosition("right")
          setCardOffset({
            top: Math.min(rect.top, windowHeight - size.height - 20),
            left: rect.right + 8,
          })
        } else {
          setCardPosition("left")
          setCardOffset({
            top: Math.min(rect.top, windowHeight - size.height - 20),
            left: rect.left - size.width - 8,
          })
        }
      }
    },
    [linkGroups]
  )

  const handleMouseLeave = useCallback(() => {
    // 延迟关闭，给用户时间移动到卡片上
    leaveTimeoutRef.current = window.setTimeout(() => {
      setActiveGroup(null)
    }, 150)
  }, [])

  const handleCardMouseEnter = useCallback(() => {
    // 鼠标进入卡片时，清除离开定时器
    if (leaveTimeoutRef.current) {
      clearTimeout(leaveTimeoutRef.current)
      leaveTimeoutRef.current = null
    }
  }, [])

  const handleCardMouseLeave = useCallback(() => {
    // 鼠标离开卡片时，关闭卡片
    setActiveGroup(null)
  }, [])

  const handleLinkClick = useCallback(
    (e: React.MouseEvent, url: string, label: string, groupTitle: string) => {
      e.preventDefault()
      // 使用统一的链接导航服务
      navigateToLink(url, label, groupTitle, linkDisplaySettings.openInNewTab)
    },
    [linkDisplaySettings.openInNewTab]
  )

  // 中键点击打开所有链接
  const handleMiddleClick = useCallback(
    (e: React.MouseEvent, group: linkGroup) => {
      if (e.button === 1) {
        e.preventDefault()
        group.links.forEach(link => {
          LinkAnalytics.trackClick(link.value, link.label, group.title)
          window.open(link.value, "_blank")
        })
      }
    },
    []
  )

  return (
    <Container ref={containerRef}>
      {linkGroups.map((group, index) => (
        <GroupItem
          key={group.title}
          ref={el => (groupRefs.current[index] = el)}
          onMouseEnter={() => handleMouseEnter(index)}
          onMouseLeave={handleMouseLeave}
        >
          <GroupTitle
            active={activeGroup === index}
            onMouseDown={e => handleMiddleClick(e, group)}
          >
            {group.title}
          </GroupTitle>

          <CardPopup
            visible={activeGroup === index}
            position={cardPosition}
            offsetTop={cardOffset.top}
            cardWidth={cardSize.width}
            cardHeight={cardSize.height}
            style={{
              [cardPosition === "right" ? "left" : "right"]:
                cardPosition === "right"
                  ? `${cardOffset.left}px`
                  : `${window.innerWidth - cardOffset.left}px`,
            }}
            onMouseEnter={handleCardMouseEnter}
            onMouseLeave={handleCardMouseLeave}
          >
            <CardHeader>{group.title}</CardHeader>
            <LinkList>
              {group.links.map((link, linkIndex) => (
                <LinkItemWrapper key={link.value}>
                  <LinkItem
                    href={link.value}
                    onClick={e =>
                      handleLinkClick(e, link.value, link.label, group.title)
                    }
                  >
                    <Favicon url={link.value} icon={link.icon} size={14} />
                    {link.label}
                  </LinkItem>
                  {onDeleteLink && (
                    <DeleteBtn
                      onClick={e => {
                        e.preventDefault()
                        e.stopPropagation()
                        onDeleteLink(index, linkIndex, link.label)
                      }}
                      title="删除链接"
                    >
                      <FontAwesomeIcon icon={faTrash} size="sm" />
                    </DeleteBtn>
                  )}
                </LinkItemWrapper>
              ))}
            </LinkList>
          </CardPopup>
        </GroupItem>
      ))}
    </Container>
  )
})

HoverCardLinks.displayName = "HoverCardLinks"
