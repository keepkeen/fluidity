import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"

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
import {
  faCheck,
  faChevronLeft,
  faChevronRight,
  faXmark,
} from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"

import { Favicon } from "../../components/Favicon"
import { Modal } from "../../components/Modal"
import { linkGroup } from "../../data/data"
import { LinkAnalytics } from "../../services/analytics"
import {
  buildHomeItems,
  HomeItem,
  readHomeLayout,
  saveHomeLayout,
  WIDGET_SCREEN_TIME,
} from "../../services/homeLayout"
import {
  getHomeGridMetrics,
  getOrderForItemOnPage,
  getVisiblePageIndices,
  HomeGridMetrics,
  paginateHomeItems,
} from "../../services/homePagination"
import { navigateToLink } from "../../services/linkSearch"
import { CommandPalette } from "../LinkContainer/CommandPalette/CommandPalette"
import { RediscoveryCard } from "../Rediscovery/RediscoveryCard"
import { Links } from "../Settings/settingsHandler"
import { TodayScreenTime } from "../Usage/TodayScreenTime"

/**
 * iOS 风格主屏：小组件与应用图标同网格。
 * 长按进入抖动编辑模式：拖拽排序、✕ 删除；"完成"或 Escape 退出。
 */

const HomePager = styled.div`
  flex: 1;
  min-width: 0;
  width: min(1040px, 100%);
  max-width: 1040px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`

const PageViewport = styled.div`
  width: 100%;
  height: clamp(390px, calc(100vh - 270px), 650px);
  min-height: 0;
  overflow: hidden;
  border-radius: 26px;
  touch-action: pan-y;
  cursor: grab;
  user-select: none;

  &[data-page-dragging="true"] {
    cursor: grabbing;
  }

  @media screen and (max-width: 600px) {
    height: clamp(360px, calc(100vh - 250px), 540px);
    border-radius: 20px;
  }
`

const PageTrack = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  transform: translate3d(
    calc(
      var(--home-page-offset, 0%) +
        var(--home-page-drag-offset, 0px)
    ),
    0,
    0
  );
  transition: var(--home-page-transition, none);
  will-change: transform;

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`

const PageGrid = styled.div<{ columns: number; rows: number }>`
  flex: 0 0 100%;
  width: 100%;
  height: 100%;
  display: grid;
  grid-template-columns: repeat(${({ columns }) => columns}, minmax(0, 1fr));
  grid-template-rows: repeat(${({ rows }) => rows}, minmax(0, 1fr));
  grid-auto-flow: dense;
  gap: 14px;
  align-content: start;
  padding: 8px;
  box-sizing: border-box;
`

const PageDots = styled.div`
  position: relative;
  min-height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0;
`

const MovePageNotice = styled.div`
  position: absolute;
  left: 50%;
  bottom: calc(100% + 4px);
  transform: translateX(-50%);
  width: max-content;
  max-width: min(360px, 90vw);
  padding: 6px 10px;
  border: 1px solid var(--home-stroke);
  border-radius: 999px;
  background: var(--home-surface-strong);
  box-shadow: var(--home-shadow);
  color: var(--text-secondary);
  font-size: 0.72rem;
  text-align: center;
  pointer-events: none;
`

const PageDot = styled.button<{ active: boolean }>`
  width: ${({ active }) => (active ? 32 : 24)}px;
  height: 24px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  display: grid;
  place-items: center;

  ::before {
    content: "";
    width: ${({ active }) => (active ? 20 : 6)}px;
    height: 6px;
    border-radius: 999px;
    background: ${({ active }) =>
      active
        ? "var(--accent)"
        : "color-mix(in srgb, var(--text-primary) 30%, transparent)"};
    box-shadow: ${({ active }) =>
      active
        ? "0 0 14px color-mix(in srgb, var(--accent) 45%, transparent)"
        : "none"};
    transition:
      width var(--transition-fast),
      background var(--transition-fast);
  }

  :focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 3px;
  }
`

const PagePosition = styled.span`
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
`

const PageGap = styled.span`
  width: 8px;
  color: var(--text-muted);
  font-size: 0.72rem;
  line-height: 1;
  text-align: center;
`

const cellSpan = (
  item: HomeItem,
  widgetSpan: number
): { col: number; row: number } =>
  item.kind === "widget"
    ? { col: widgetSpan, row: widgetSpan }
    : { col: 1, row: 1 }

/**
 * 外层承载 dnd-kit 的行内 transform 与交错入场动画；
 * 抖动动画放内层，避免 CSS animation 覆盖行内 transform。
 *
 * settled 后必须移除入场动画：重排会让 React 移动 DOM 节点，
 * 被移动节点的 CSS 动画会整体重启（掉落后全场闪一遍淡入）。
 */
const ItemShell = styled.div<{
  col: number
  row: number
  delayIndex: number
  settled: boolean
}>`
  grid-column: span ${({ col }) => col};
  grid-row: span ${({ row }) => row};
  position: relative;
  min-width: 0;
  min-height: 0;

  animation: ${({ settled }) =>
    settled ? "none" : "fade-up 0.5s cubic-bezier(0.22, 1, 0.36, 1) backwards"};
  animation-delay: ${({ delayIndex }) => Math.min(delayIndex, 14) * 28}ms;
`

const JiggleBox = styled.div<{ jiggling: boolean; delayIndex: number }>`
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  position: relative;
  transform-origin: 50% 50%;

  animation: ${({ jiggling }) =>
    jiggling ? "jiggle 0.28s ease-in-out infinite" : "none"};
  /* 负延迟：各条目从周期中段开始，立即错相 */
  animation-delay: ${({ delayIndex }) => -(delayIndex % 5) * 57}ms;
`

const AppEntry = styled.div`
  width: 100%;
  height: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: 7px;
`

const AppTile = styled.button`
  width: fit-content;
  height: auto;
  border: none;
  background: transparent;
  padding: 0;
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;

  :focus-visible {
    outline: none;
  }
`

const AppIconBox = styled.span`
  width: clamp(58px, 5vw, 66px);
  height: clamp(58px, 5vw, 66px);
  border-radius: 17px;
  /* 图标使用高分辨率源；底板只做静态主题混色，避免逐帧磨砂造成卡顿。 */
  background:
    linear-gradient(
      145deg,
      color-mix(
        in srgb,
        hsl(var(--tile-hue) 50% 58%) 15%,
        var(--home-surface-strong)
      ),
      var(--home-surface-strong)
    );
  border: 1px solid var(--home-stroke);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, white 16%, transparent),
    var(--home-shadow);
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
  width: 72px;
  max-width: 100%;
  font-size: 0.74rem;
  color: var(--text-primary);
  opacity: 0.9;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-shadow: 0 1px 4px
    color-mix(in srgb, var(--bg-primary) 72%, transparent);
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

const MovePageControls = styled.div`
  position: absolute;
  top: -6px;
  right: -6px;
  z-index: 5;
  display: flex;
  overflow: hidden;
  border: 1px solid var(--surface-border-strong);
  border-radius: 999px;
  background: color-mix(in srgb, var(--bg-primary) 92%, transparent);
  box-shadow: var(--shadow-soft);
  animation: pop-in 0.2s ease both;
`

const MovePageButton = styled.button`
  width: 24px;
  height: 22px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
  font-size: 0.65rem;

  :hover,
  :focus-visible {
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 16%, transparent);
  }

  & + & {
    border-left: 1px solid var(--surface-border);
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

interface PageDragState {
  pointerId: number
  startX: number
  startY: number
  startedAt: number
  axis: "pending" | "horizontal" | "vertical"
}

const PAGE_SNAP_TRANSITION =
  "transform 240ms cubic-bezier(0.22, 1, 0.36, 1)"

const positionPageTrack = (
  track: HTMLDivElement | null,
  page: number,
  dragOffset: number,
  animate: boolean
): void => {
  if (!track) return
  track.style.setProperty("--home-page-offset", `${-page * 100}%`)
  track.style.setProperty("--home-page-drag-offset", `${dragOffset}px`)
  track.style.setProperty(
    "--home-page-transition",
    animate ? PAGE_SNAP_TRANSITION : "none"
  )
}

// ============ 可排序条目 ============

const SortableItem = ({
  item,
  index,
  editMode,
  settled,
  widgetSpan,
  onOpen,
  onRemove,
  linkGroups,
  onRequestLinkRemoval,
  pageIndex,
  totalPages,
  onMovePage,
}: {
  item: HomeItem
  index: number
  editMode: boolean
  settled: boolean
  widgetSpan: number
  onOpen: (item: Extract<HomeItem, { kind: "app" }>) => void
  onRemove: (item: HomeItem) => void
  linkGroups: linkGroup[]
  onRequestLinkRemoval: (url: string, label: string) => void
  pageIndex: number
  totalPages: number
  onMovePage: (item: HomeItem, direction: -1 | 1) => void
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id })
  const span = cellSpan(item, widgetSpan)
  /* 固定挂载时的序号：animation-delay 若随重排变化会导致动画重启（闪烁） */
  const [entranceIndex] = useState(index)

  return (
    <ItemShell
      ref={setNodeRef}
      col={span.col}
      row={span.row}
      delayIndex={entranceIndex}
      settled={settled}
      style={{
        /* 去掉 scale：跨尺寸槽位（图标↔小组件）拖动时不做压缩预览，iOS 手感 */
        transform: DndCSS.Transform.toString(
          transform ? { ...transform, scaleX: 1, scaleY: 1 } : null
        ),
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
      <JiggleBox jiggling={editMode && !isDragging} delayIndex={entranceIndex}>
        {editMode && (
          <>
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
            {totalPages > 1 && (
              <MovePageControls role="group" aria-label="移动到其他页面">
                {pageIndex > 0 && (
                  <MovePageButton
                    type="button"
                    aria-label="移至上一页"
                    title="移至上一页"
                    onPointerDown={e => e.stopPropagation()}
                    onClick={e => {
                      e.stopPropagation()
                      onMovePage(item, -1)
                    }}
                  >
                    <FontAwesomeIcon icon={faChevronLeft} />
                  </MovePageButton>
                )}
                {pageIndex < totalPages - 1 && (
                  <MovePageButton
                    type="button"
                    aria-label="移至下一页"
                    title="移至下一页"
                    onPointerDown={e => e.stopPropagation()}
                    onClick={e => {
                      e.stopPropagation()
                      onMovePage(item, 1)
                    }}
                  >
                    <FontAwesomeIcon icon={faChevronRight} />
                  </MovePageButton>
                )}
              </MovePageControls>
            )}
          </>
        )}

        {item.kind === "widget" ? (
          <WidgetShell>
            {item.id === WIDGET_SCREEN_TIME ? (
              <TodayScreenTime />
            ) : (
              <RediscoveryCard
                linkGroups={linkGroups}
                onRequestRemove={onRequestLinkRemoval}
              />
            )}
          </WidgetShell>
        ) : (
          <AppEntry>
            <AppTile
              type="button"
              data-home-app-tile="true"
              aria-label={item.label}
              title={item.url}
              onClick={() => {
                if (!editMode) onOpen(item)
              }}
            >
              <AppIconBox
                style={
                  {
                    "--tile-hue": String(
                      [...item.url].reduce(
                        (hash, char) => (hash * 31 + char.charCodeAt(0)) % 360,
                        0
                      )
                    ),
                  } as React.CSSProperties
                }
              >
                <Favicon
                  url={item.url}
                  icon={item.icon}
                  size={40}
                  sourceSize={128}
                  fallbackLabel={item.label}
                  eager
                />
              </AppIconBox>
            </AppTile>
            <AppLabel>{item.label}</AppLabel>
          </AppEntry>
        )}
      </JiggleBox>
    </ItemShell>
  )
}

// ============ 主组件 ============

export const HomeGrid = () => {
  const [linkGroups, setLinkGroups] = useState(() => Links.getWithFallback())
  const [layout, setLayout] = useState(() => readHomeLayout())
  const [editMode, setEditMode] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const [settled, setSettled] = useState(false)
  const [currentPage, setCurrentPage] = useState(0)
  const [animatePage, setAnimatePage] = useState(true)
  const [isPageDragging, setIsPageDragging] = useState(false)
  const [movePageNotice, setMovePageNotice] = useState<string | null>(null)
  const [gridMetrics, setGridMetrics] = useState<HomeGridMetrics>({
    columns: 9,
    rows: 5,
    widgetSpan: 3,
  })
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pressOriginRef = useRef<{ x: number; y: number } | null>(null)
  const gridRef = useRef<HTMLDivElement | null>(null)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const pageTrackRef = useRef<HTMLDivElement | null>(null)
  const pageDragRef = useRef<PageDragState | null>(null)
  const suppressNextPageClickRef = useRef(false)
  const lastWheelAtRef = useRef(0)

  // 入场动画结束后移除 animation，避免重排移动 DOM 时动画重启闪烁
  useEffect(() => {
    const timer = setTimeout(() => setSettled(true), 1100)
    return () => clearTimeout(timer)
  }, [])

  const items = useMemo(
    () => buildHomeItems(linkGroups, layout, LinkAnalytics.get(), Date.now()),
    [linkGroups, layout]
  )
  const pages = useMemo(
    () => paginateHomeItems(items, gridMetrics),
    [items, gridMetrics]
  )
  const [mountedPageIndices, setMountedPageIndices] = useState<Set<number>>(
    () => new Set([0, 1])
  )
  const visiblePageIndices = useMemo(
    () => getVisiblePageIndices(pages.length, currentPage),
    [currentPage, pages.length]
  )

  useEffect(() => {
    if (!movePageNotice) return
    const timer = setTimeout(() => setMovePageNotice(null), 2200)
    return () => clearTimeout(timer)
  }, [movePageNotice])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const measure = () => {
      const rect = viewport.getBoundingClientRect()
      setGridMetrics(getHomeGridMetrics(rect.width, rect.height))
    }
    measure()

    const observer = new ResizeObserver(measure)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    setCurrentPage(page => Math.min(page, Math.max(0, pages.length - 1)))
  }, [pages.length])

  useEffect(() => {
    setMountedPageIndices(previous => {
      const next = new Set(
        [...previous].filter(pageIndex => pageIndex < pages.length)
      )
      for (
        let pageIndex = Math.max(0, currentPage - 1);
        pageIndex <= Math.min(pages.length - 1, currentPage + 1);
        pageIndex += 1
      ) {
        next.add(pageIndex)
      }
      const unchanged =
        next.size === previous.size &&
        [...next].every(pageIndex => previous.has(pageIndex))
      return unchanged ? previous : next
    })
  }, [currentPage, pages.length])

  useLayoutEffect(() => {
    positionPageTrack(pageTrackRef.current, currentPage, 0, animatePage)
  }, [animatePage, currentPage])

  /* 编辑模式内即拖即走（iOS 手感）；平时按住 220ms 才触发，避免误拖 */
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: editMode
        ? { distance: 4 }
        : { delay: 220, tolerance: 8 },
    })
  )

  // 长按进入编辑模式（iOS 式）；允许 10px 以内的指针抖动
  const cancelLongPress = useCallback(() => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current)
      longPressRef.current = null
    }
    pressOriginRef.current = null
  }, [])

  const changePage = useCallback(
    (direction: -1 | 1) => {
      setAnimatePage(true)
      setCurrentPage(page =>
        Math.min(pages.length - 1, Math.max(0, page + direction))
      )
    },
    [pages.length]
  )

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!e.isPrimary || e.button !== 0) return
      cancelLongPress()
      pressOriginRef.current = { x: e.clientX, y: e.clientY }
      pageDragRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startedAt: performance.now(),
        axis: "pending",
      }
      if (!editMode) {
        longPressRef.current = setTimeout(() => setEditMode(true), 480)
      }
    },
    [cancelLongPress, editMode]
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const origin = pressOriginRef.current
      if (
        origin &&
        Math.hypot(e.clientX - origin.x, e.clientY - origin.y) > 10
      ) {
        cancelLongPress()
      }

      const drag = pageDragRef.current
      if (!drag || drag.pointerId !== e.pointerId || editMode) return
      const dx = e.clientX - drag.startX
      const dy = e.clientY - drag.startY

      if (drag.axis === "pending") {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 5) return
        if (Math.abs(dy) > Math.abs(dx) * 1.15) {
          drag.axis = "vertical"
          return
        }
        drag.axis = "horizontal"
        cancelLongPress()
        suppressNextPageClickRef.current = true
        setIsPageDragging(true)
        try {
          e.currentTarget.setPointerCapture(e.pointerId)
        } catch {
          // Pointer capture is optional; document-level pointer events still work.
        }
      }

      if (drag.axis !== "horizontal") return
      e.preventDefault()
      const atLeadingEdge = currentPage === 0 && dx > 0
      const atTrailingEdge = currentPage === pages.length - 1 && dx < 0
      positionPageTrack(
        pageTrackRef.current,
        currentPage,
        atLeadingEdge || atTrailingEdge ? Math.round(dx * 0.24) : dx,
        false
      )
    },
    [cancelLongPress, currentPage, editMode, pages.length]
  )

  const finishPageDrag = useCallback(
    (e: React.PointerEvent, cancelled = false) => {
      cancelLongPress()
      const drag = pageDragRef.current
      pageDragRef.current = null
      if (!drag || drag.pointerId !== e.pointerId) return

      if (drag.axis === "horizontal") {
        const dx = e.clientX - drag.startX
        const elapsed = Math.max(1, performance.now() - drag.startedAt)
        const velocity = dx / elapsed
        const viewportWidth = viewportRef.current?.clientWidth ?? 0
        const passedDistance =
          Math.abs(dx) >= Math.max(48, viewportWidth * 0.13)
        const passedFlick = Math.abs(dx) >= 20 && Math.abs(velocity) >= 0.45
        const canChange =
          dx < 0 ? currentPage < pages.length - 1 : currentPage > 0

        const targetPage =
          !cancelled && canChange && (passedDistance || passedFlick)
            ? currentPage + (dx < 0 ? 1 : -1)
            : currentPage
        positionPageTrack(pageTrackRef.current, targetPage, 0, true)
        setAnimatePage(true)
        setIsPageDragging(false)
        setCurrentPage(targetPage)
        setTimeout(() => {
          suppressNextPageClickRef.current = false
        }, 0)
      } else {
        setIsPageDragging(false)
        positionPageTrack(pageTrackRef.current, currentPage, 0, true)
      }

      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId)
        }
      } catch {
        // ignore
      }
    },
    [cancelLongPress, currentPage, pages.length]
  )

  const handlePageClickCapture = useCallback(
    (event: React.MouseEvent) => {
      if (!suppressNextPageClickRef.current) return
      suppressNextPageClickRef.current = false
      event.preventDefault()
      event.stopPropagation()
    },
    []
  )

  useEffect(() => cancelLongPress, [cancelLongPress])

  // 设置里"重置主屏布局"等外部改动 → 即时刷新
  useEffect(() => {
    const refresh = () => {
      setLayout(readHomeLayout())
      setLinkGroups(Links.getWithFallback())
    }
    window.addEventListener("fluidity-home-layout-changed", refresh)
    return () =>
      window.removeEventListener("fluidity-home-layout-changed", refresh)
  }, [])

  // iOS 式：点击网格空隙或网格外的壁纸区域退出编辑
  useEffect(() => {
    if (!editMode || deleteTarget) return
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node
      const grid = gridRef.current
      if (!grid) return
      const clickedPageGap =
        target instanceof HTMLElement &&
        target.dataset.homePageGrid === "true"
      if (target === grid || clickedPageGap || !grid.contains(target)) {
        setEditMode(false)
      }
    }
    window.addEventListener("pointerdown", onPointerDown)
    return () => window.removeEventListener("pointerdown", onPointerDown)
  }, [editMode, deleteTarget])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target
      const isEditable =
        target instanceof HTMLElement &&
        (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
          target.isContentEditable)
      if (isEditable || editMode || deleteTarget || event.isComposing) return

      if (event.key === "ArrowLeft" && currentPage > 0) {
        event.preventDefault()
        setAnimatePage(true)
        setCurrentPage(page => page - 1)
        return
      }
      if (event.key === "ArrowRight" && currentPage < pages.length - 1) {
        event.preventDefault()
        setAnimatePage(true)
        setCurrentPage(page => page + 1)
        return
      }

      const match = event.code.match(/^Digit([1-9])$/)
      if (!match || layout.pageShortcutModifier === "disabled") return
      const modifierPressed =
        layout.pageShortcutModifier === "alt"
          ? event.altKey && !event.ctrlKey && !event.metaKey
          : layout.pageShortcutModifier === "control"
            ? event.ctrlKey && !event.altKey && !event.metaKey
            : event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey
      if (!modifierPressed) return

      const page = Number(match[1]) - 1
      if (page < 0 || page >= pages.length) return
      event.preventDefault()
      setAnimatePage(Math.abs(page - currentPage) === 1)
      setCurrentPage(page)
    }

    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [currentPage, deleteTarget, editMode, layout.pageShortcutModifier, pages.length])

  const handleWheel = useCallback(
    (event: React.WheelEvent) => {
      if (editMode || Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return
      if (Math.abs(event.deltaX) < 24) return
      const now = Date.now()
      if (now - lastWheelAtRef.current < 320) return
      lastWheelAtRef.current = now
      event.preventDefault()
      changePage(event.deltaX > 0 ? 1 : -1)
    },
    [changePage, editMode]
  )

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

  const handleMovePage = useCallback(
    (item: HomeItem, direction: -1 | 1) => {
      const sourcePage = pages.findIndex(pageItems =>
        pageItems.some(candidate => candidate.id === item.id)
      )
      const targetPage = sourcePage + direction
      if (sourcePage < 0 || targetPage < 0 || targetPage >= pages.length) return

      const nextOrder = getOrderForItemOnPage(
        items,
        gridMetrics,
        item.id,
        targetPage
      )
      if (!nextOrder) {
        setMovePageNotice("当前自动布局没有可用位置，条目保持在本页")
        return
      }
      setMovePageNotice(null)
      persistOrder(nextOrder)
      setAnimatePage(true)
      setCurrentPage(targetPage)
    },
    [gridMetrics, items, pages, persistOrder]
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

  const requestLinkRemoval = useCallback((url: string, label: string) => {
    setDeleteTarget({ url, label })
  }, [])

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
          <HomePager
            ref={gridRef}
            data-home-editing={editMode ? "true" : "false"}
          >
            <PageViewport
              ref={viewportRef}
              role="region"
              aria-label="主页分页区域"
              data-page-dragging={isPageDragging ? "true" : "false"}
              onPointerDown={handlePointerDown}
              onPointerUp={event => finishPageDrag(event)}
              onPointerCancel={event => finishPageDrag(event, true)}
              onPointerMove={handlePointerMove}
              onPointerLeave={cancelLongPress}
              onClickCapture={handlePageClickCapture}
              onDragStart={event => event.preventDefault()}
              onWheel={handleWheel}
            >
              <PageTrack ref={pageTrackRef} data-home-page-track="true">
                {pages.map((pageItems, pageIndex) => (
                  <PageGrid
                    key={`page-${pageIndex}`}
                    columns={gridMetrics.columns}
                    rows={gridMetrics.rows}
                    data-home-page-grid="true"
                    aria-hidden={pageIndex !== currentPage}
                    {...(pageIndex !== currentPage ? { inert: "" } : {})}
                  >
                    {(mountedPageIndices.has(pageIndex) ||
                      Math.abs(pageIndex - currentPage) <= 1) &&
                      pageItems.map(item => {
                        const index = items.findIndex(
                          candidate => candidate.id === item.id
                        )
                        return (
                          <SortableItem
                            key={item.id}
                            item={item}
                            index={index}
                            editMode={editMode}
                            settled={settled}
                            widgetSpan={gridMetrics.widgetSpan}
                            onOpen={handleOpen}
                            onRemove={handleRemove}
                            linkGroups={linkGroups}
                            onRequestLinkRemoval={requestLinkRemoval}
                            pageIndex={pageIndex}
                            totalPages={pages.length}
                            onMovePage={handleMovePage}
                          />
                        )
                      })}
                  </PageGrid>
                ))}
              </PageTrack>
            </PageViewport>

            <PageDots aria-label="主屏页面">
              {movePageNotice && (
                <MovePageNotice role="status">{movePageNotice}</MovePageNotice>
              )}
              {visiblePageIndices.map((pageIndex, position) => {
                const previous = visiblePageIndices[position - 1]
                return (
                  <Fragment key={pageIndex}>
                    {previous !== undefined && pageIndex - previous > 1 && (
                      <PageGap aria-hidden>…</PageGap>
                    )}
                    <PageDot
                      type="button"
                      active={pageIndex === currentPage}
                      aria-label={`转到第 ${pageIndex + 1} 页`}
                      aria-current={
                        pageIndex === currentPage ? "page" : undefined
                      }
                      onClick={() => {
                        setAnimatePage(Math.abs(pageIndex - currentPage) === 1)
                        setCurrentPage(pageIndex)
                      }}
                    />
                  </Fragment>
                )
              })}
              <PagePosition aria-live="polite">
                第 {currentPage + 1} 页，共 {pages.length} 页
              </PagePosition>
            </PageDots>
          </HomePager>
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
