import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import {
  closestCenter,
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  useSortable,
} from "@dnd-kit/sortable"
import { CSS as DndCSS } from "@dnd-kit/utilities"
import styled from "@emotion/styled"
import { faCheck, faXmark } from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"

import { Favicon } from "../../components/Favicon"
import { Modal } from "../../components/Modal"
import { LinkAnalytics } from "../../services/analytics"
import {
  buildHomeItems,
  HomeItem,
  readHomeLayout,
  saveHomeLayout,
  WIDGET_SCREEN_TIME,
} from "../../services/homeLayout"
import { navigateToLink } from "../../services/linkSearch"
import { CommandPalette } from "../LinkContainer/CommandPalette/CommandPalette"
import { RediscoveryCard } from "../Rediscovery/RediscoveryCard"
import { Links } from "../Settings/settingsHandler"
import { TodayScreenTime } from "../Usage/TodayScreenTime"

/**
 * iOS 风格主屏：小组件与应用图标同网格。
 * 长按进入抖动编辑模式：拖拽排序、✕ 删除；"完成"或 Escape 退出。
 */

const CELL = 96

const GridContainer = styled.div`
  animation: fade-up 0.55s cubic-bezier(0.22, 1, 0.36, 1) both;
  flex: 1;
  min-width: 0;
  max-width: 1040px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(${CELL}px, 1fr));
  grid-auto-rows: ${CELL}px;
  grid-auto-flow: dense;
  gap: 14px;
  align-content: start;
  padding: 8px 0 24px;
`

const cellSpan = (item: HomeItem): { col: number; row: number } =>
  item.kind === "widget" ? { col: 3, row: 3 } : { col: 1, row: 1 }

const ItemShell = styled.div<{
  col: number
  row: number
  jiggling: boolean
  delayIndex: number
}>`
  grid-column: span ${({ col }) => col};
  grid-row: span ${({ row }) => row};
  position: relative;
  min-width: 0;
  min-height: 0;

  animation: ${({ jiggling }) =>
    jiggling ? "jiggle 0.28s ease-in-out infinite" : "none"};
  animation-delay: ${({ delayIndex }) => (delayIndex % 4) * 70}ms;
`

const AppTile = styled.button`
  width: 100%;
  height: 100%;
  border: none;
  background: transparent;
  padding: 6px 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  cursor: pointer;
  min-width: 0;

  :focus-visible {
    outline: none;
  }
`

const AppIconBox = styled.span`
  width: 58px;
  height: 58px;
  border-radius: 15px;
  background: var(--surface-bg);
  backdrop-filter: var(--surface-blur);
  -webkit-backdrop-filter: var(--surface-blur);
  border: 1px solid var(--surface-border);
  box-shadow: var(--shadow-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    transform var(--transition-fast),
    border-color var(--transition-fast);

  ${AppTile}:hover & {
    transform: var(--hover-transform);
    border-color: color-mix(in srgb, var(--accent) 45%, transparent);
  }

  ${AppTile}:active & {
    transform: scale(0.94);
  }

  ${AppTile}:focus-visible & {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
`

const AppLabel = styled.span`
  max-width: 100%;
  font-size: 0.74rem;
  color: var(--text-primary);
  opacity: 0.9;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
`

const WidgetShell = styled.div`
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
`

const RemoveBadge = styled.button`
  position: absolute;
  top: -6px;
  left: -6px;
  z-index: 5;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 1px solid var(--surface-border-strong);
  background: color-mix(in srgb, var(--bg-primary) 92%, transparent);
  color: var(--text-primary);
  font-size: 0.7rem;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: var(--shadow-soft);
  animation: pop-in 0.2s ease both;

  :hover {
    color: var(--accent-hover);
    border-color: var(--accent-hover);
  }
`

const DoneButton = styled.button`
  position: fixed;
  top: 18px;
  right: 72px;
  z-index: 150;
  padding: 8px 20px;
  border: 1px solid color-mix(in srgb, var(--accent) 55%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 20%, transparent);
  backdrop-filter: var(--surface-blur);
  -webkit-backdrop-filter: var(--surface-blur);
  color: var(--accent);
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  animation: pop-in 0.25s cubic-bezier(0.22, 1, 0.36, 1) both;

  :hover {
    background: color-mix(in srgb, var(--accent) 30%, transparent);
  }
`

const ConfirmCard = styled.div`
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 1001;
  width: min(320px, calc(100vw - 48px));
  padding: 22px;
  background: color-mix(in srgb, var(--bg-primary) 90%, transparent);
  backdrop-filter: var(--surface-blur);
  -webkit-backdrop-filter: var(--surface-blur);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-main);
  box-shadow: var(--shadow-pop);
  text-align: center;
  animation: pop-in 0.25s cubic-bezier(0.22, 1, 0.36, 1) both;
`

const ConfirmTitle = styled.h3`
  margin: 0 0 8px;
  font-size: 1rem;
  color: var(--text-primary);
`

const ConfirmText = styled.p`
  margin: 0 0 18px;
  font-size: 0.85rem;
  color: var(--text-secondary);
  line-height: 1.5;
`

const ConfirmButtons = styled.div`
  display: flex;
  gap: 10px;
  justify-content: center;
`

const ConfirmButton = styled.button<{ danger?: boolean }>`
  padding: 8px 22px;
  border-radius: 999px;
  border: 1px solid
    ${({ danger }) =>
      danger ? "var(--accent-hover)" : "var(--surface-border-strong)"};
  background: ${({ danger }) =>
    danger
      ? "color-mix(in srgb, var(--accent-hover) 18%, transparent)"
      : "transparent"};
  color: ${({ danger }) =>
    danger ? "var(--accent-hover)" : "var(--text-primary)"};
  font-size: 0.88rem;
  cursor: pointer;
  transition: background var(--transition-fast);

  :hover {
    background: ${({ danger }) =>
      danger
        ? "color-mix(in srgb, var(--accent-hover) 30%, transparent)"
        : "color-mix(in srgb, var(--text-primary) 8%, transparent)"};
  }
`

interface DeleteTarget {
  url: string
  label: string
}

// ============ 可排序条目 ============

const SortableItem = ({
  item,
  index,
  editMode,
  onOpen,
  onRemove,
}: {
  item: HomeItem
  index: number
  editMode: boolean
  onOpen: (item: Extract<HomeItem, { kind: "app" }>) => void
  onRemove: (item: HomeItem) => void
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id })
  const span = cellSpan(item)

  return (
    <ItemShell
      ref={setNodeRef}
      col={span.col}
      row={span.row}
      jiggling={editMode && !isDragging}
      delayIndex={index}
      style={{
        transform: DndCSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : undefined,
        opacity: isDragging ? 0.85 : 1,
      }}
      {...attributes}
      {...listeners}
      /* 容器不该是 button：内部有真实的交互元素（图标按钮/小组件） */
      role={undefined}
      tabIndex={-1}
    >
      {editMode && (
        <RemoveBadge
          type="button"
          aria-label={
            item.kind === "app" ? `删除 ${item.label}` : "移除小组件"
          }
          onPointerDown={e => e.stopPropagation()}
          onClick={e => {
            e.stopPropagation()
            onRemove(item)
          }}
        >
          <FontAwesomeIcon icon={faXmark} />
        </RemoveBadge>
      )}

      {item.kind === "widget" ? (
        <WidgetShell>
          {item.id === WIDGET_SCREEN_TIME ? (
            <TodayScreenTime />
          ) : (
            <RediscoveryCard />
          )}
        </WidgetShell>
      ) : (
        <AppTile
          type="button"
          title={item.url}
          onClick={() => {
            if (!editMode) onOpen(item)
          }}
        >
          <AppIconBox>
            <Favicon url={item.url} icon={item.icon} size={30} />
          </AppIconBox>
          <AppLabel>{item.label}</AppLabel>
        </AppTile>
      )}
    </ItemShell>
  )
}

// ============ 主组件 ============

export const HomeGrid = () => {
  const [linkGroups, setLinkGroups] = useState(() => Links.getWithFallback())
  const [layout, setLayout] = useState(() => readHomeLayout())
  const [editMode, setEditMode] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const items = useMemo(
    () => buildHomeItems(linkGroups, layout, LinkAnalytics.get(), Date.now()),
    [linkGroups, layout]
  )

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { delay: 220, tolerance: 8 },
    })
  )

  // 长按进入编辑模式（iOS 式）
  const handlePointerDown = useCallback(() => {
    if (longPressRef.current) clearTimeout(longPressRef.current)
    longPressRef.current = setTimeout(() => setEditMode(true), 480)
  }, [])

  const cancelLongPress = useCallback(() => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current)
      longPressRef.current = null
    }
  }, [])

  useEffect(() => cancelLongPress, [cancelLongPress])

  // Escape 退出编辑
  useEffect(() => {
    if (!editMode) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEditMode(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [editMode])

  const persistOrder = useCallback(
    (order: string[]) => {
      const next = { ...layout, order }
      setLayout(next)
      saveHomeLayout(next)
    },
    [layout]
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      setEditMode(true)
      if (!over || active.id === over.id) return
      const ids = items.map(item => item.id)
      const from = ids.indexOf(String(active.id))
      const to = ids.indexOf(String(over.id))
      if (from === -1 || to === -1) return
      persistOrder(arrayMove(ids, from, to))
    },
    [items, persistOrder]
  )

  const handleOpen = useCallback(
    (item: Extract<HomeItem, { kind: "app" }>) => {
      navigateToLink(item.url, item.label, item.groupTitle)
    },
    []
  )

  const handleRemove = useCallback(
    (item: HomeItem) => {
      if (item.kind === "widget") {
        const next = {
          ...layout,
          hiddenWidgets: [...new Set([...layout.hiddenWidgets, item.id])],
        }
        setLayout(next)
        saveHomeLayout(next)
        return
      }
      setDeleteTarget({ url: item.url, label: item.label })
    },
    [layout]
  )

  const confirmDelete = useCallback(() => {
    if (!deleteTarget) return
    const groups = Links.getWithFallback()
      .map(group => ({
        ...group,
        links: group.links.filter(link => link.value !== deleteTarget.url),
      }))
      .filter(group => group.links.length > 0)
    Links.set(groups)
    setLinkGroups(groups)
    setDeleteTarget(null)
  }, [deleteTarget])

  // 命令面板删除入口复用同一确认
  const requestDeleteFromPalette = useCallback(
    (_groupIndex: number, _linkIndex: number, label: string) => {
      const target = linkGroups
        .flatMap(group => group.links)
        .find(link => link.label === label)
      if (target) setDeleteTarget({ url: target.value, label })
    },
    [linkGroups]
  )

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={items.map(item => item.id)}
          strategy={rectSortingStrategy}
        >
          <GridContainer
            onPointerDown={handlePointerDown}
            onPointerUp={cancelLongPress}
            onPointerMove={cancelLongPress}
            onPointerLeave={cancelLongPress}
          >
            {items.map((item, index) => (
              <SortableItem
                key={item.id}
                item={item}
                index={index}
                editMode={editMode}
                onOpen={handleOpen}
                onRemove={handleRemove}
              />
            ))}
          </GridContainer>
        </SortableContext>
      </DndContext>

      {editMode && (
        <DoneButton type="button" onClick={() => setEditMode(false)}>
          <FontAwesomeIcon icon={faCheck} />
          完成
        </DoneButton>
      )}

      <CommandPalette
        linkGroups={linkGroups}
        onDeleteLink={requestDeleteFromPalette}
      />

      {deleteTarget && (
        <Modal
          onClose={() => setDeleteTarget(null)}
          label="确认删除链接"
          overlay="dark"
        >
          <ConfirmCard>
            <ConfirmTitle>移除应用</ConfirmTitle>
            <ConfirmText>
              从收藏中删除&quot;{deleteTarget.label}&quot;？此操作立即生效。
            </ConfirmText>
            <ConfirmButtons>
              <ConfirmButton
                type="button"
                onClick={() => setDeleteTarget(null)}
              >
                取消
              </ConfirmButton>
              <ConfirmButton type="button" danger onClick={confirmDelete}>
                删除
              </ConfirmButton>
            </ConfirmButtons>
          </ConfirmCard>
        </Modal>
      )}
    </>
  )
}
