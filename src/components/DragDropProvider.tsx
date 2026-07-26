/**
 * DragDrop 上下文提供者
 * 封装 @dnd-kit 的 DndContext 和相关配置
 */

import React, { memo, useCallback, useState } from "react"

import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import styled from "@emotion/styled"

import { linkGroup } from "../data/data"

// 拖拽数据类型
export interface DragData {
  type: "link" | "group"
  groupIndex: number
  linkIndex?: number
}

interface DragDropProviderProps {
  children: React.ReactNode
  linkGroups: linkGroup[]
  onReorder: (newGroups: linkGroup[]) => void
}

// 拖拽覆盖层样式
const DragOverlayContent = styled.div`
  padding: 8px 16px;
  background: var(--accent-color);
  color: var(--bg-color);
  border: 2px solid var(--default-color);
  font-size: 0.9rem;
  opacity: 0.9;
  box-shadow: 4px 4px 0 var(--default-color);
`

/**
 * 生成唯一 ID
 */
export const generateLinkId = (groupIndex: number, linkIndex: number): string =>
  `link-${groupIndex}-${linkIndex}`

export const generateGroupId = (groupIndex: number): string =>
  `group-${groupIndex}`

/**
 * 解析 ID 获取索引
 */
export const parseLinkId = (
  id: string
): { groupIndex: number; linkIndex: number } | null => {
  const match = id.match(/^link-(\d+)-(\d+)$/)
  if (match) {
    return {
      groupIndex: parseInt(match[1], 10),
      linkIndex: parseInt(match[2], 10),
    }
  }
  return null
}

export const parseGroupId = (id: string): number | null => {
  const match = id.match(/^group-(\d+)$/)
  if (match) {
    return parseInt(match[1], 10)
  }
  return null
}

/**
 * DragDrop 提供者组件
 */
export const DragDropProvider = memo(
  ({ children, linkGroups, onReorder }: DragDropProviderProps) => {
    const [activeId, setActiveId] = useState<string | null>(null)
    const [activeLabel, setActiveLabel] = useState<string>("")

    // 配置传感器
    const sensors = useSensors(
      useSensor(PointerSensor, {
        activationConstraint: {
          distance: 8, // 需要拖动 8px 才激活，避免误触
        },
      }),
      useSensor(KeyboardSensor, {
        coordinateGetter: sortableKeyboardCoordinates,
      })
    )

    // 拖拽开始
    const handleDragStart = useCallback(
      (event: DragStartEvent) => {
        const { active } = event
        setActiveId(active.id as string)

        // 获取拖拽项的标签
        const linkInfo = parseLinkId(active.id as string)
        if (linkInfo) {
          const { groupIndex, linkIndex } = linkInfo
          setActiveLabel(linkGroups[groupIndex]?.links[linkIndex]?.label || "")
        } else {
          const groupIndex = parseGroupId(active.id as string)
          if (groupIndex !== null) {
            setActiveLabel(linkGroups[groupIndex]?.title || "")
          }
        }
      },
      [linkGroups]
    )

    // 拖拽结束
    const handleDragEnd = useCallback(
      (event: DragEndEvent) => {
        const { active, over } = event
        setActiveId(null)
        setActiveLabel("")

        if (!over || active.id === over.id) return

        const activeIdStr = active.id as string
        const overIdStr = over.id as string

        // 解析 ID
        const activeLinkInfo = parseLinkId(activeIdStr)
        const overLinkInfo = parseLinkId(overIdStr)
        const activeGroupIndex = parseGroupId(activeIdStr)
        const overGroupIndex = parseGroupId(overIdStr)

        // 链接排序（同组内）
        if (activeLinkInfo && overLinkInfo) {
          if (activeLinkInfo.groupIndex === overLinkInfo.groupIndex) {
            // 同组内排序
            const groupIndex = activeLinkInfo.groupIndex
            const newGroups = [...linkGroups]
            newGroups[groupIndex] = {
              ...newGroups[groupIndex],
              links: arrayMove(
                newGroups[groupIndex].links,
                activeLinkInfo.linkIndex,
                overLinkInfo.linkIndex
              ),
            }
            onReorder(newGroups)
          } else {
            // 跨组移动
            const newGroups = [...linkGroups]
            const [movedLink] = newGroups[
              activeLinkInfo.groupIndex
            ].links.splice(activeLinkInfo.linkIndex, 1)
            newGroups[overLinkInfo.groupIndex].links.splice(
              overLinkInfo.linkIndex,
              0,
              movedLink
            )
            onReorder(newGroups)
          }
        }

        // 群组排序
        if (activeGroupIndex !== null && overGroupIndex !== null) {
          const newGroups = arrayMove(
            linkGroups,
            activeGroupIndex,
            overGroupIndex
          )
          onReorder(newGroups)
        }
      },
      [linkGroups, onReorder]
    )

    return (
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        {children}
        <DragOverlay>
          {activeId && activeLabel && (
            <DragOverlayContent>{activeLabel}</DragOverlayContent>
          )}
        </DragOverlay>
      </DndContext>
    )
  }
)

DragDropProvider.displayName = "DragDropProvider"

// 导出 SortableContext 供子组件使用
export { SortableContext, verticalListSortingStrategy }
