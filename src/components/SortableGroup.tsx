/**
 * 可拖拽群组组件
 * 使用 @dnd-kit/sortable 实现群组拖拽排序
 */

import React, { memo } from "react"

import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import styled from "@emotion/styled"

interface SortableGroupProps {
  id: string
  children: React.ReactNode
  disabled?: boolean
}

const SortableWrapper = styled.div<{ isDragging: boolean }>`
  opacity: ${({ isDragging }) => (isDragging ? 0.5 : 1)};
  transition: opacity 0.2s;
`

export const SortableGroup = memo(
  ({ id, children, disabled = false }: SortableGroupProps) => {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id, disabled })

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
    }

    return (
      <SortableWrapper
        ref={setNodeRef}
        style={style}
        isDragging={isDragging}
        {...attributes}
        {...listeners}
      >
        {children}
      </SortableWrapper>
    )
  }
)

SortableGroup.displayName = "SortableGroup"
