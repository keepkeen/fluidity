import React, {
  MouseEvent,
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
} from "react"

import styled from "@emotion/styled"
import { faTrash } from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"

import { AccordionContainer, AccordionGroup } from "./Accordion/Accordion"
import { CommandPalette } from "./CommandPalette/CommandPalette"
import { HoverCardLinks } from "./HoverCard/HoverCardLinks"
import {
  DragDropProvider,
  SortableContext,
  verticalListSortingStrategy,
  generateLinkId,
} from "../../components/DragDropProvider"
import { Favicon } from "../../components/Favicon"
import { SortableLink } from "../../components/SortableLink"
import { linkGroup } from "../../data/data"
import { AccordionSoundService } from "../../services/accordionSound"
import { LinkAnalytics } from "../../services/analytics"
import { navigateToLink } from "../../services/linkSearch"
import * as Settings from "../Settings/settingsHandler"

// 链接项容器 - 支持删除按钮和拖拽
const LinkItemWrapper = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 100%;
  overflow: hidden;
  flex: 1;
`

const LinkItem = styled.a`
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  position: relative;
  padding: 6px 0 6px 24px;
  font-size: 0.95rem;

  ::before {
    position: absolute;
    left: 0px;
    bottom: 3px;
    z-index: 0;
    content: "";
    height: 4px;
    width: 100%;
    background-color: var(--accent-color);
    transition: 0.5s;
    opacity: 0.7;
  }

  :hover,
  :focus {
    color: var(--accent-color2);
    animation: text-flicker 0.01s ease 0s infinite alternate;
    outline: none;
  }
`

const DeleteButton = styled.button`
  background: transparent;
  border: none;
  color: var(--default-color);
  cursor: pointer;
  padding: 6px 8px;
  opacity: 0;
  transition: 0.2s;
  flex-shrink: 0;

  ${LinkItemWrapper}:hover & {
    opacity: 0.5;
  }

  &:hover {
    opacity: 1 !important;
    color: var(--accent-color2);
  }
`

// 删除确认弹窗
const ConfirmOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
`

const ConfirmDialog = styled.div`
  background: var(--bg-color);
  border: 2px solid var(--default-color);
  padding: 24px;
  max-width: 320px;
  text-align: center;
`

const ConfirmTitle = styled.h3`
  margin: 0 0 12px 0;
  color: var(--accent-color);
  font-size: 1.1rem;
`

const ConfirmText = styled.p`
  margin: 0 0 20px 0;
  color: var(--default-color);
  font-size: 0.9rem;
  opacity: 0.8;
`

const ConfirmButtons = styled.div`
  display: flex;
  gap: 12px;
  justify-content: center;
`

const ConfirmButton = styled.button<{ danger?: boolean }>`
  padding: 8px 20px;
  border: 2px solid
    ${({ danger }) =>
      danger ? "var(--accent-color2)" : "var(--default-color)"};
  background: ${({ danger }) =>
    danger ? "var(--accent-color2)" : "transparent"};
  color: ${({ danger }) =>
    danger ? "var(--bg-color)" : "var(--default-color)"};
  cursor: pointer;
  font-size: 0.9rem;
  transition: 0.2s;

  &:hover {
    opacity: 0.8;
  }
`

// 悬浮卡片模式的容器 - 填充剩余空间
const HoverCardContainer = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
  flex: 1;
  min-width: 300px;
  max-width: 100%;
`

// 命令面板模式的占位容器 - 只显示触发按钮
const CommandPaletteContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  min-height: 300px;
`

const CommandPalettePlaceholder = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 40px;
  border: 2px dashed var(--default-color);
  opacity: 0.5;
  text-align: center;

  &:hover {
    opacity: 0.8;
  }
`

const PlaceholderText = styled.p`
  font-size: 1rem;
  color: var(--default-color);
`

const PlaceholderHint = styled.p`
  font-size: 0.85rem;
  color: var(--accent-color);
`

// 删除确认状态类型
interface DeleteConfirm {
  groupIndex: number
  linkIndex: number
  label: string
}

export const LinkContainer = () => {
  const [active, setActive] = useState<number | null>(0)
  const [linkGroups, setLinkGroups] = useState(Settings.Links.getWithFallback())
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirm | null>(null)
  const [soundEnabled, setSoundEnabled] = useState(false)
  const [linkDisplaySettings, setLinkDisplaySettings] = useState(
    Settings.LinkDisplay.getWithFallback()
  )
  const displayMode = linkDisplaySettings.mode
  const accordionRef = useRef<HTMLDivElement>(null)

  // 自定义高度和宽度状态
  const [customHeight, setCustomHeight] = useState<number | undefined>(
    linkDisplaySettings.accordionHeight
  )
  const [customWidth, setCustomWidth] = useState<number | undefined>(
    linkDisplaySettings.accordionContentWidth
  )

  // 检测是否需要紧凑模式（群组过多时）
  // 每个手风琴宽度约 113px，当超过可用空间时启用紧凑模式
  const isCompact = linkGroups.length > 6

  // 初始化音效状态
  useEffect(() => {
    setSoundEnabled(AccordionSoundService.isEnabled())
  }, [])

  // 点击外部收起手风琴
  useEffect(() => {
    if (displayMode !== "accordion") return

    const handleClickOutside = (e: globalThis.MouseEvent) => {
      // 如果点击的是手风琴区域内部，不处理
      if (accordionRef.current?.contains(e.target as Node)) return
      // 如果点击的是删除确认弹窗，不处理
      if ((e.target as Element).closest("[data-confirm-dialog]")) return
      // 收起所有手风琴
      setActive(null)
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [displayMode])

  // 高度变化处理
  const handleHeightChange = useCallback((height: number) => {
    setCustomHeight(height)
    const newSettings = {
      ...Settings.LinkDisplay.getWithFallback(),
      accordionHeight: height,
    }
    Settings.LinkDisplay.set(newSettings)
    setLinkDisplaySettings(newSettings)
  }, [])

  // 宽度变化处理
  const handleWidthChange = useCallback((width: number) => {
    setCustomWidth(width)
    const newSettings = {
      ...Settings.LinkDisplay.getWithFallback(),
      accordionContentWidth: width,
    }
    Settings.LinkDisplay.set(newSettings)
    setLinkDisplaySettings(newSettings)
  }, [])

  // 切换音效
  const handleToggleSound = useCallback(() => {
    const newState = AccordionSoundService.toggle()
    setSoundEnabled(newState)
  }, [])

  // 拖拽重排序处理
  const handleReorder = useCallback((newGroups: linkGroup[]) => {
    setLinkGroups(newGroups)
    Settings.Links.set(newGroups)
  }, [])

  // 生成当前活动组的链接 ID 列表
  const activeLinkIds = useMemo(() => {
    if (active === null || !linkGroups[active]) return []
    return linkGroups[active].links.map((_, idx) => generateLinkId(active, idx))
  }, [linkGroups, active])

  // 计算最大链接数量（用于手风琴高度计算）
  const maxLinkCount = useMemo(
    () => Math.max(...linkGroups.map(g => g.links.length), 1),
    [linkGroups]
  )

  // 计算每个群组的最大标签长度
  const maxLabelLengths = useMemo(
    () => linkGroups.map(g => Math.max(...g.links.map(l => l.label.length), 5)),
    [linkGroups]
  )

  const middleMouseHandler = useCallback(
    (event: MouseEvent, groupIndex: number) => {
      setActive(groupIndex)
      if (event.button === 1) {
        linkGroups[groupIndex].links.forEach(link => {
          // 追踪中键点击
          LinkAnalytics.trackClick(
            link.value,
            link.label,
            linkGroups[groupIndex].title
          )
          window.open(link.value, "_blank")
        })
      }
    },
    [linkGroups]
  )

  const handleLinkClick = useCallback(
    (e: React.MouseEvent, url: string, label: string, groupTitle: string) => {
      e.preventDefault()
      // 使用统一的链接导航服务
      navigateToLink(url, label, groupTitle, linkDisplaySettings.openInNewTab)
    },
    [linkDisplaySettings.openInNewTab]
  )

  // 删除链接
  const handleDeleteLink = useCallback(
    (groupIndex: number, linkIndex: number) => {
      const newGroups = linkGroups.map((group, gIdx) => {
        if (gIdx === groupIndex) {
          return {
            ...group,
            links: group.links.filter((_, lIdx) => lIdx !== linkIndex),
          }
        }
        return group
      })
      setLinkGroups(newGroups)
      Settings.Links.set(newGroups)
      setDeleteConfirm(null)
    },
    [linkGroups]
  )

  // 请求删除确认
  const requestDelete = (
    groupIndex: number,
    linkIndex: number,
    label: string
  ) => {
    setDeleteConfirm({ groupIndex, linkIndex, label })
  }

  // 删除确认弹窗
  const DeleteConfirmDialog = deleteConfirm && (
    <ConfirmOverlay onClick={() => setDeleteConfirm(null)}>
      <ConfirmDialog onClick={e => e.stopPropagation()}>
        <ConfirmTitle>确认删除</ConfirmTitle>
        <ConfirmText>
          确定要删除链接 &quot;{deleteConfirm.label}&quot; 吗？
        </ConfirmText>
        <ConfirmButtons>
          <ConfirmButton onClick={() => setDeleteConfirm(null)}>
            取消
          </ConfirmButton>
          <ConfirmButton
            danger
            onClick={() =>
              handleDeleteLink(
                deleteConfirm.groupIndex,
                deleteConfirm.linkIndex
              )
            }
          >
            删除
          </ConfirmButton>
        </ConfirmButtons>
      </ConfirmDialog>
    </ConfirmOverlay>
  )

  // 命令面板模式 - 显示占位提示和触发按钮
  if (displayMode === "command-palette") {
    return (
      <>
        <CommandPaletteContainer>
          <CommandPalettePlaceholder>
            <PlaceholderText>按 / 键快速搜索链接</PlaceholderText>
            <PlaceholderHint>或点击右下角按钮</PlaceholderHint>
          </CommandPalettePlaceholder>
        </CommandPaletteContainer>
        <CommandPalette linkGroups={linkGroups} onDeleteLink={requestDelete} />
        {DeleteConfirmDialog}
      </>
    )
  }

  // 悬浮卡片模式 - 也支持 / 键搜索
  if (displayMode === "hover-card") {
    return (
      <>
        <HoverCardContainer>
          <HoverCardLinks
            linkGroups={linkGroups}
            onDeleteLink={requestDelete}
          />
        </HoverCardContainer>
        <CommandPalette linkGroups={linkGroups} onDeleteLink={requestDelete} />
        {DeleteConfirmDialog}
      </>
    )
  }

  // 默认：手风琴模式
  return (
    <DragDropProvider linkGroups={linkGroups} onReorder={handleReorder}>
      <AccordionContainer
        ref={accordionRef}
        soundEnabled={soundEnabled}
        compact={isCompact}
        onToggleSound={handleToggleSound}
      >
        {linkGroups.map((group, groupIndex) => (
          <AccordionGroup
            key={group.title}
            active={active === groupIndex}
            title={group.title}
            linkCount={group.links.length}
            maxLinkCount={maxLinkCount}
            maxLabelLength={maxLabelLengths[groupIndex]}
            soundEnabled={soundEnabled}
            compact={isCompact}
            customHeight={customHeight}
            customWidth={customWidth}
            onClick={() => setActive(groupIndex)}
            onMouseDown={e => middleMouseHandler(e, groupIndex)}
            onWidthChange={handleWidthChange}
            onHeightChange={handleHeightChange}
          >
            <SortableContext
              items={
                active === groupIndex
                  ? activeLinkIds
                  : group.links.map((_, idx) => generateLinkId(groupIndex, idx))
              }
              strategy={verticalListSortingStrategy}
            >
              {group.links.map((link, linkIndex) => (
                <SortableLink
                  key={link.value}
                  id={generateLinkId(groupIndex, linkIndex)}
                  disabled={active !== groupIndex}
                >
                  <LinkItemWrapper>
                    <Favicon url={link.value} icon={link.icon} size={16} />
                    <LinkItem
                      tabIndex={active !== groupIndex ? -1 : undefined}
                      href={link.value}
                      onClick={e =>
                        handleLinkClick(e, link.value, link.label, group.title)
                      }
                      title={link.label}
                    >
                      {link.label}
                    </LinkItem>
                    <DeleteButton
                      onClick={e => {
                        e.preventDefault()
                        e.stopPropagation()
                        requestDelete(groupIndex, linkIndex, link.label)
                      }}
                      title="删除链接"
                    >
                      <FontAwesomeIcon icon={faTrash} size="sm" />
                    </DeleteButton>
                  </LinkItemWrapper>
                </SortableLink>
              ))}
            </SortableContext>
          </AccordionGroup>
        ))}
      </AccordionContainer>
      <CommandPalette linkGroups={linkGroups} onDeleteLink={requestDelete} />
      {DeleteConfirmDialog}
    </DragDropProvider>
  )
}
