/**
 * 可拖拽链接组件
 * 使用 @dnd-kit/sortable 实现拖拽排序
 */

import React, { memo } from "react"

import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import styled from "@emotion/styled"
import { faGripVertical } from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"

interface SortableLinkProps {
  id: string
  children: React.ReactNode
  disabled?: boolean
}

const DragHandle = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
  cursor: grab;
  color: var(--default-color);
  opacity: 0.3;
  transition: opacity 0.2s;
  touch-action: none;
  user-select: none;

  &:hover {
    opacity: 0.8;
  }

  &:active {
    cursor: grabbing;
    opacity: 1;
  }
`

const SortableWrapper = styled.div<{ isDragging: boolean }>`
  display: flex;
  align-items: center;
  opacity: ${({ isDragging }) => (isDragging ? 0.5 : 1)};
  background: ${({ isDragging }) =>
    isDragging ? "var(--accent-color)" : "transparent"};
  transition: background 0.2s;

  &:hover ${DragHandle} {
    opacity: 0.5;
  }
`

export const SortableLink = memo(
  ({ id, children, disabled = false }: SortableLinkProps) => {
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
      >
        {!disabled && (
          <DragHandle {...listeners}>
            <FontAwesomeIcon icon={faGripVertical} size="sm" />
          </DragHandle>
        )}
        {children}
      </SortableWrapper>
    )
  }
)

SortableLink.displayName = "SortableLink"
