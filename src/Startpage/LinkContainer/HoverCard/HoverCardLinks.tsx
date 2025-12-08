import React, { memo, useState, useRef, useCallback } from "react"

import styled from "@emotion/styled"
import { faTrash } from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"

import { Favicon } from "../../../components/Favicon"
import { linkGroup } from "../../../data/data"
import { LinkAnalytics } from "../../../services/analytics"

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
    active ? "var(--accent-color)" : "transparent"};
  color: ${({ active }) =>
    active ? "var(--bg-color)" : "var(--default-color)"};
  border: 2px solid var(--default-color);
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

const CardPopup = styled.div<{
  visible: boolean
  position: "right" | "left"
  offsetTop: number
}>`
  position: fixed;
  ${({ position }) => (position === "right" ? "left: auto;" : "right: auto;")}
  top: ${({ offsetTop }) => offsetTop}px;
  min-width: 200px;
  max-width: 300px;
  background: var(--bg-color);
  border: 2px solid var(--default-color);
  box-shadow: 8px 8px 0px var(--accent-color);
  opacity: ${({ visible }) => (visible ? 1 : 0)};
  transform: ${({ visible, position }) =>
    visible
      ? "translateX(0)"
      : position === "right"
      ? "translateX(-10px)"
      : "translateX(10px)"};
  pointer-events: ${({ visible }) => (visible ? "auto" : "none")};
  transition: opacity 0.2s, transform 0.2s;
  z-index: 50;
  max-height: 300px;
  overflow-y: auto;
`

const LinkList = styled.div`
  display: flex;
  flex-direction: column;
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
  border-bottom: 2px solid var(--default-color);
  font-weight: 600;
  font-size: 0.85rem;
  color: var(--accent-color);
`

interface Props {
  linkGroups: linkGroup[]
  onDeleteLink?: (groupIndex: number, linkIndex: number, label: string) => void
}

export const HoverCardLinks = memo(({ linkGroups, onDeleteLink }: Props) => {
  const [activeGroup, setActiveGroup] = useState<number | null>(null)
  const [cardPosition, setCardPosition] = useState<"right" | "left">("right")
  const [cardOffset, setCardOffset] = useState({ top: 0, left: 0 })
  const containerRef = useRef<HTMLDivElement>(null)
  const groupRefs = useRef<(HTMLDivElement | null)[]>([])
  const leaveTimeoutRef = useRef<number | null>(null)

  const handleMouseEnter = useCallback((index: number) => {
    // 清除离开定时器
    if (leaveTimeoutRef.current) {
      clearTimeout(leaveTimeoutRef.current)
      leaveTimeoutRef.current = null
    }
    setActiveGroup(index)

    const groupEl = groupRefs.current[index]
    if (groupEl) {
      const rect = groupEl.getBoundingClientRect()
      const windowWidth = window.innerWidth
      const windowHeight = window.innerHeight

      // 判断弹出方向
      const spaceRight = windowWidth - rect.right
      const spaceLeft = rect.left

      if (spaceRight > 320 || spaceRight >= spaceLeft) {
        setCardPosition("right")
        setCardOffset({
          top: Math.min(rect.top, windowHeight - 320),
          left: rect.right + 8,
        })
      } else {
        setCardPosition("left")
        setCardOffset({
          top: Math.min(rect.top, windowHeight - 320),
          left: rect.left - 320 - 8,
        })
      }
    }
  }, [])

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
    (url: string, label: string, groupTitle: string) => {
      // 追踪链接点击
      LinkAnalytics.trackClick(url, label, groupTitle)
    },
    []
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
                    onClick={() =>
                      handleLinkClick(link.value, link.label, group.title)
                    }
                  >
                    <Favicon url={link.value} size={14} />
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
