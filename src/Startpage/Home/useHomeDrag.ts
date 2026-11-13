import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"

import type { CollisionDetection } from "@dnd-kit/core"
import {
  DragEndEvent,
  DragMoveEvent,
  DragOverEvent,
  DragStartEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core"

import { linkGroup } from "../../data/data"
import {
  HomeItem,
  HomeLayoutState,
  readHomeLayout,
} from "../../services/homeLayout"
import {
  getOrderForItemOnPage,
  getOrderForRelativeDropOnPage,
  HomeDropPosition,
  HomeGridMetrics,
} from "../../services/homePagination"
import { getWidgetDefinition } from "../../services/widgetRegistry"
import { Links } from "../Settings/settingsHandler"

import type * as React from "react"
import { getAppTileHue } from "./HomeGrid.styles"
import {
  EDGE_PAGE_DWELL_MS,
  EDGE_PAGE_TARGET_GUTTER_PX,
  EDGE_PAGE_TRANSITION_LOCK_MS,
  findHomeDropTargetAtPoint,
  getClientX,
  getClientY,
  homeCollisionDetection,
  HomeDragSnapshot,
  HomeDropIntent,
  HomePointerSensor,
  HomeTouchSensor,
  isPointerInEdgeTurnGutter,
  isPointInsideActivePreviewSlot,
  PageDragState,
  positionPageTrack,
  REORDER_ANIMATION_MS,
  REORDER_INTENT_MS,
  resolveHomeDropPosition,
  sameHomeOrder,
} from "./homeInteraction"

interface Options {
  currentPage: number
  navigationPageCount: number
  items: HomeItem[]
  gridMetrics: HomeGridMetrics
  pageTrackRef: React.MutableRefObject<HTMLDivElement | null>
  setDragPreviewOrder: React.Dispatch<React.SetStateAction<string[] | null>>
  dragPreviewOrder: string[] | null
  itemDraggingRef: React.MutableRefObject<boolean>
  dragPointerXRef: React.MutableRefObject<number | null>
  dragPointerYRef: React.MutableRefObject<number | null>
  viewportRef: React.MutableRefObject<HTMLDivElement | null>
  setMovePageNotice: React.Dispatch<React.SetStateAction<string | null>>
  setAnimatePage: React.Dispatch<React.SetStateAction<boolean>>
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>
  cancelLongPress: () => void
  pageDragRef: React.MutableRefObject<PageDragState | null>
  suppressNextPageClickRef: React.MutableRefObject<boolean>
  setIsPageDragging: React.Dispatch<React.SetStateAction<boolean>>
  layoutRevisionRef: React.MutableRefObject<number>
  layout: HomeLayoutState
  setEditMode: React.Dispatch<React.SetStateAction<boolean>>
  externalLayoutPendingRef: React.MutableRefObject<boolean>
  setLayout: React.Dispatch<React.SetStateAction<HomeLayoutState>>
  setLinkGroups: React.Dispatch<React.SetStateAction<linkGroup[]>>
  persistOrderIfUnchanged: (
    expectedCurrentLayout: HomeLayoutState,
    expectedItemIds: string[],
    nextOrder: string[]
  ) => Promise<HomeLayoutState | null>
  showUndo: (message: string, undo: () => void) => void
  restoreOrderSnapshot: (
    expectedCurrentLayout: HomeLayoutState,
    expectedItemIds: string[],
    previousOrder: string[],
    onRestored?: () => void
  ) => Promise<boolean>
}

export const useHomeDrag = ({
  currentPage,
  navigationPageCount,
  items,
  gridMetrics,
  pageTrackRef,
  setDragPreviewOrder,
  dragPreviewOrder,
  itemDraggingRef,
  dragPointerXRef,
  dragPointerYRef,
  viewportRef,
  setMovePageNotice,
  setAnimatePage,
  setCurrentPage,
  cancelLongPress,
  pageDragRef,
  suppressNextPageClickRef,
  setIsPageDragging,
  layoutRevisionRef,
  layout,
  setEditMode,
  externalLayoutPendingRef,
  setLayout,
  setLinkGroups,
  persistOrderIfUnchanged,
  showUndo,
  restoreOrderSnapshot,
}: Options) => {
  const [dropIntent, setDropIntent] = useState<HomeDropIntent | null>(null)

  const [dragSnapshot, setDragSnapshot] = useState<HomeDragSnapshot | null>(
    null
  )

  const edgePageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const reorderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const reorderTargetRef = useRef<string | null>(null)

  const dragOrderRef = useRef<string[] | null>(null)

  const dragPageOrderRef = useRef<string[] | null>(null)

  const dragPreviewOrderRef = useRef<string[] | null>(null)

  const dragPreviewIntentRef = useRef<HomeDropIntent | null>(null)

  const dragPreviewRectsRef = useRef<Map<
    string,
    { left: number; top: number }
  > | null>(null)

  const dropIntentRef = useRef<HomeDropIntent | null>(null)

  const dragPointerRevisionRef = useRef(0)

  const dropIntentRevisionRef = useRef(-1)

  const activeDragIdRef = useRef<string | null>(null)

  const dragPointerStartXRef = useRef<number | null>(null)

  const dragPointerStartYRef = useRef<number | null>(null)

  const dragDestinationPageRef = useRef<number | null>(null)

  const dragOriginPageRef = useRef<number | null>(null)

  const dragEscapeGuardRef = useRef(false)

  const edgePageDirectionRef = useRef<-1 | 0 | 1>(0)

  const edgePageTransitionUntilRef = useRef(0)

  const edgePageScheduleRef = useRef<(direction: -1 | 1) => void>(
    () => undefined
  )

  const currentPageRef = useRef(0)

  const pagesLengthRef = useRef(1)

  const itemsRef = useRef<HomeItem[]>([])

  const gridMetricsRef = useRef<HomeGridMetrics>({ columns: 9, rows: 5 })

  const dragLayoutRevisionRef = useRef<number | null>(null)

  const dragPersistedLayoutRef = useRef<HomeLayoutState | null>(null)

  const dragPersistedItemIdsRef = useRef<string[] | null>(null)

  currentPageRef.current = currentPage
  pagesLengthRef.current = navigationPageCount
  itemsRef.current = items
  gridMetricsRef.current = gridMetrics

  const captureDragPreviewRects = useCallback(() => {
    const page = pageTrackRef.current?.querySelector<HTMLElement>(
      `[data-home-page-index="${currentPageRef.current}"]`
    )
    if (!page) {
      dragPreviewRectsRef.current = null
      return
    }
    dragPreviewRectsRef.current = new Map(
      Array.from(
        page.querySelectorAll<HTMLElement>(
          ":scope > [data-home-item-id]:not([data-home-preview-hidden='true'])"
        )
      ).flatMap(element => {
        const id = element.dataset.homeItemId
        const rect = element.getBoundingClientRect()
        return id && rect.width > 0 && rect.height > 0
          ? [[id, { left: rect.left, top: rect.top }] as const]
          : []
      })
    )
  }, [pageTrackRef])

  const updateDragPreviewOrder = useCallback(
    (order: string[] | null) => {
      if (sameHomeOrder(dragPreviewOrderRef.current, order)) return
      captureDragPreviewRects()
      const next = order ? [...order] : null
      dragPreviewOrderRef.current = next
      setDragPreviewOrder(next)
    },
    [captureDragPreviewRects, setDragPreviewOrder]
  )

  const restoreDragPagePreview = useCallback(() => {
    const pageOrder = dragPageOrderRef.current
    if (!pageOrder) return
    dragPreviewIntentRef.current = null
    dragOrderRef.current = pageOrder
    updateDragPreviewOrder(pageOrder)
  }, [updateDragPreviewOrder])

  useLayoutEffect(() => {
    const previousRects = dragPreviewRectsRef.current
    dragPreviewRectsRef.current = null
    if (!previousRects || previousRects.size === 0) return
    if (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return
    }
    const page = pageTrackRef.current?.querySelector<HTMLElement>(
      `[data-home-page-index="${currentPage}"]`
    )
    if (!page) return
    const activeId = activeDragIdRef.current
    page
      .querySelectorAll<HTMLElement>(
        ":scope > [data-home-item-id]:not([data-home-preview-hidden='true'])"
      )
      .forEach(element => {
        const id = element.dataset.homeItemId
        const previous = id ? previousRects.get(id) : null
        if (!id || id === activeId || !previous || !element.animate) return
        const current = element.getBoundingClientRect()
        const deltaX = previous.left - current.left
        const deltaY = previous.top - current.top
        if (Math.hypot(deltaX, deltaY) < 1) return
        element.animate(
          [
            { transform: `translate3d(${deltaX}px, ${deltaY}px, 0)` },
            { transform: "translate3d(0, 0, 0)" },
          ],
          {
            duration: REORDER_ANIMATION_MS,
            easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          }
        )
      })
  }, [currentPage, dragPreviewOrder, pageTrackRef])

  useEffect(() => {
    const trackPointer = (event: PointerEvent) => {
      if (!itemDraggingRef.current) return
      dragPointerXRef.current = event.clientX
      dragPointerYRef.current = event.clientY
      dragPointerRevisionRef.current += 1

      // PointerSensor can coalesce its React onDragMove callback while the
      // pointer is travelling quickly. Arm the first edge turn from the native
      // capture listener as well, then let the self-rescheduling edge state
      // machine handle a pointer that remains stationary at the gutter.
      const viewport = viewportRef.current
      if (!viewport) return
      const bounds = viewport.getBoundingClientRect()
      const withinViewportY =
        event.clientY >= bounds.top && event.clientY <= bounds.bottom
      const direction = !withinViewportY
        ? 0
        : event.clientX < bounds.left + EDGE_PAGE_TARGET_GUTTER_PX
          ? -1
          : event.clientX > bounds.right - EDGE_PAGE_TARGET_GUTTER_PX
            ? 1
            : 0
      if (direction === 0) {
        if (edgePageTimerRef.current) {
          clearTimeout(edgePageTimerRef.current)
          edgePageTimerRef.current = null
        }
        edgePageDirectionRef.current = 0
        return
      }
      if (
        edgePageTimerRef.current &&
        edgePageDirectionRef.current === direction
      ) {
        return
      }
      edgePageScheduleRef.current(direction)
    }
    document.addEventListener("pointermove", trackPointer, true)
    return () => document.removeEventListener("pointermove", trackPointer, true)
  }, [dragPointerXRef, dragPointerYRef, itemDraggingRef, viewportRef])

  /* 图标按位移拖，小组件按长按拖；编辑模式内统一即拖即走。 */
  const sensors = useSensors(
    useSensor(HomePointerSensor),
    useSensor(HomeTouchSensor)
  )
  const detectHomeCollision = useCallback<CollisionDetection>(
    args => {
      const pointerCoordinates =
        dragPointerXRef.current !== null && dragPointerYRef.current !== null
          ? { x: dragPointerXRef.current, y: dragPointerYRef.current }
          : args.pointerCoordinates
      return homeCollisionDetection({ ...args, pointerCoordinates })
    },
    [dragPointerXRef, dragPointerYRef]
  )

  const getLatestDragOrder = useCallback((): string[] => {
    const currentIds = itemsRef.current.map(item => item.id)
    const currentIdSet = new Set(currentIds)
    const preview = dragOrderRef.current ?? currentIds
    const next = preview.filter(id => currentIdSet.has(id))
    const included = new Set(next)
    currentIds.forEach(id => {
      if (!included.has(id)) next.push(id)
    })
    return next
  }, [])

  const getValidDropOrder = useCallback(
    (
      order: string[],
      itemId: string,
      overId: string,
      position: HomeDropPosition
    ): string[] | null => {
      const requestedPage =
        dragDestinationPageRef.current ?? dragOriginPageRef.current
      if (requestedPage === null) return null

      const targetPage = Math.min(
        requestedPage,
        Math.max(0, pagesLengthRef.current - 1)
      )
      const currentItems = itemsRef.current
      const itemById = new Map(currentItems.map(item => [item.id, item]))
      const orderedIds = order.filter(id => itemById.has(id))
      const included = new Set(orderedIds)
      currentItems.forEach(item => {
        if (!included.has(item.id)) orderedIds.push(item.id)
      })
      const orderedItems = orderedIds.flatMap(id => {
        const item = itemById.get(id)
        return item ? [item] : []
      })
      return getOrderForRelativeDropOnPage(
        orderedItems,
        gridMetricsRef.current,
        itemId,
        overId,
        position,
        targetPage
      )
    },
    []
  )

  const previewDraggedItemOnPage = useCallback(
    (itemId: string, targetPage: number): boolean => {
      if (targetPage < 0 || targetPage >= pagesLengthRef.current) return false
      const order = getLatestDragOrder()
      const itemById = new Map(itemsRef.current.map(item => [item.id, item]))
      const orderedItems = order.flatMap(id => {
        const item = itemById.get(id)
        return item ? [item] : []
      })
      const nextOrder = getOrderForItemOnPage(
        orderedItems,
        gridMetricsRef.current,
        itemId,
        targetPage
      )
      if (!nextOrder) {
        setMovePageNotice("当前自动布局没有可用位置，条目保持在原页")
        return false
      }

      dragDestinationPageRef.current = targetPage
      dragPreviewIntentRef.current = null
      dragOrderRef.current = nextOrder
      dragPageOrderRef.current = nextOrder
      updateDragPreviewOrder(nextOrder)
      setMovePageNotice(null)
      setAnimatePage(true)
      edgePageTransitionUntilRef.current =
        performance.now() + EDGE_PAGE_TRANSITION_LOCK_MS
      currentPageRef.current = targetPage
      setCurrentPage(targetPage)
      return true
    },
    [
      getLatestDragOrder,
      setAnimatePage,
      setCurrentPage,
      setMovePageNotice,
      updateDragPreviewOrder,
    ]
  )

  const clearEdgeTimer = useCallback(() => {
    if (edgePageTimerRef.current) clearTimeout(edgePageTimerRef.current)
    edgePageTimerRef.current = null
    edgePageDirectionRef.current = 0
  }, [])

  const clearReorderTimer = useCallback(() => {
    if (reorderTimerRef.current) clearTimeout(reorderTimerRef.current)
    reorderTimerRef.current = null
    reorderTargetRef.current = null
  }, [])

  const clearDropIntent = useCallback(() => {
    dropIntentRef.current = null
    dropIntentRevisionRef.current = -1
    setDropIntent(null)
  }, [])

  const settleEdgePageTransition = useCallback(() => {
    if (edgePageTransitionUntilRef.current <= 0) return
    edgePageTransitionUntilRef.current = 0
    positionPageTrack(pageTrackRef.current, currentPageRef.current, 0, false)
  }, [pageTrackRef])

  const scheduleEdgePageTurn = useCallback(
    (direction: -1 | 1) => {
      if (edgePageTimerRef.current) clearTimeout(edgePageTimerRef.current)
      edgePageDirectionRef.current = direction
      edgePageTimerRef.current = setTimeout(() => {
        edgePageTimerRef.current = null
        if (
          !itemDraggingRef.current ||
          edgePageDirectionRef.current !== direction
        ) {
          return
        }

        const viewport = viewportRef.current
        const pointerX = dragPointerXRef.current
        const pointerY = dragPointerYRef.current
        if (!viewport || pointerX === null || pointerY === null) {
          clearEdgeTimer()
          return
        }
        const bounds = viewport.getBoundingClientRect()
        const stillAtRequestedEdge =
          pointerY >= bounds.top &&
          pointerY <= bounds.bottom &&
          isPointerInEdgeTurnGutter(pointerX, bounds, direction)
        if (!stillAtRequestedEdge) {
          clearEdgeTimer()
          return
        }

        const activeId = activeDragIdRef.current
        const targetPage = currentPageRef.current + direction
        if (
          !activeId ||
          targetPage < 0 ||
          targetPage >= pagesLengthRef.current
        ) {
          edgePageDirectionRef.current = direction
          return
        }

        if (!previewDraggedItemOnPage(activeId, targetPage)) {
          clearEdgeTimer()
          return
        }

        setMovePageNotice(`已进入第 ${targetPage + 1} 页，移到目标位置后松开`)
        edgePageTimerRef.current = setTimeout(() => {
          edgePageTimerRef.current = null
          edgePageTransitionUntilRef.current = 0
          if (
            itemDraggingRef.current &&
            edgePageDirectionRef.current === direction
          ) {
            edgePageScheduleRef.current(direction)
          }
        }, EDGE_PAGE_TRANSITION_LOCK_MS)
      }, EDGE_PAGE_DWELL_MS)
    },
    [
      clearEdgeTimer,
      dragPointerXRef,
      dragPointerYRef,
      itemDraggingRef,
      previewDraggedItemOnPage,
      setMovePageNotice,
      viewportRef,
    ]
  )
  edgePageScheduleRef.current = scheduleEdgePageTurn

  useEffect(
    () => () => {
      clearEdgeTimer()
      clearReorderTimer()
      dropIntentRef.current = null
      dragPreviewIntentRef.current = null
      dropIntentRevisionRef.current = -1
      edgePageTransitionUntilRef.current = 0
    },
    [clearEdgeTimer, clearReorderTimer]
  )

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      cancelLongPress()
      clearEdgeTimer()
      clearReorderTimer()
      clearDropIntent()
      updateDragPreviewOrder(null)
      dragPreviewIntentRef.current = null
      pageDragRef.current = null
      edgePageTransitionUntilRef.current = 0
      itemDraggingRef.current = true
      dragEscapeGuardRef.current = true
      const pointerX = getClientX(event.activatorEvent)
      const pointerY = getClientY(event.activatorEvent)
      dragPointerStartXRef.current = pointerX
      dragPointerStartYRef.current = pointerY
      dragPointerXRef.current = pointerX
      dragPointerYRef.current = pointerY
      dragDestinationPageRef.current = null
      dragOriginPageRef.current = currentPageRef.current
      suppressNextPageClickRef.current = true
      setIsPageDragging(false)
      positionPageTrack(pageTrackRef.current, currentPageRef.current, 0, false)
      const activeId = String(event.active.id)
      activeDragIdRef.current = activeId
      dragLayoutRevisionRef.current = layoutRevisionRef.current
      dragPersistedLayoutRef.current = layout
      dragPersistedItemIdsRef.current = items.map(item => item.id)
      const draggedItem = items.find(item => item.id === activeId)
      setDragSnapshot(
        draggedItem
          ? {
              id: activeId,
              kind: draggedItem.kind,
              label:
                draggedItem.kind === "app"
                  ? draggedItem.label
                  : getWidgetDefinition(draggedItem.widget.type).title,
              hue:
                draggedItem.kind === "app" ? getAppTileHue(draggedItem.url) : 0,
            }
          : null
      )
      const order = items.map(item => item.id)
      if (order.includes(activeId)) {
        dragOrderRef.current = order
        dragPageOrderRef.current = order
      }
      setMovePageNotice(null)
      setEditMode(true)
    },
    [
      cancelLongPress,
      clearDropIntent,
      clearEdgeTimer,
      clearReorderTimer,
      dragPointerXRef,
      dragPointerYRef,
      itemDraggingRef,
      items,
      layout,
      layoutRevisionRef,
      pageDragRef,
      pageTrackRef,
      setEditMode,
      setIsPageDragging,
      setMovePageNotice,
      suppressNextPageClickRef,
      updateDragPreviewOrder,
    ]
  )

  const handleDragOver = useCallback(
    ({ active, over }: DragOverEvent) => {
      const activeId = String(active.id)
      if (edgePageDirectionRef.current !== 0) {
        const viewport = viewportRef.current
        const pointerX = dragPointerXRef.current
        const direction = edgePageDirectionRef.current
        if (
          !viewport ||
          pointerX === null ||
          isPointerInEdgeTurnGutter(
            pointerX,
            viewport.getBoundingClientRect(),
            direction
          )
        ) {
          clearReorderTimer()
          clearDropIntent()
          return
        }
        settleEdgePageTransition()
        clearEdgeTimer()
      }
      const pointerX = dragPointerXRef.current
      const pointerY = dragPointerYRef.current
      const activePageGrid = pageTrackRef.current?.querySelector<HTMLElement>(
        '[data-home-page-grid="true"][aria-hidden="false"]'
      )
      const pointerTarget =
        pointerX !== null && pointerY !== null
          ? findHomeDropTargetAtPoint(
              activePageGrid,
              activeId,
              pointerX,
              pointerY
            )
          : null
      const pointerInsidePreviewSlot =
        pointerX !== null &&
        pointerY !== null &&
        isPointInsideActivePreviewSlot(
          activePageGrid,
          activeId,
          pointerX,
          pointerY
        )
      const overId =
        pointerX !== null && pointerY !== null
          ? (pointerTarget?.target.dataset.homeItemId ?? null)
          : over && active.id !== over.id
            ? String(over.id)
            : null
      // The active placeholder is the exact position currently previewed by
      // the grid. During the short FLIP animation a neighbour's visual rect
      // can cross that placeholder; do not let that transient overlap create
      // a new relative target underneath the pointer. Keeping the placeholder
      // sticky is what makes cross-page placement feel like an iOS home screen.
      if (pointerInsidePreviewSlot) {
        clearReorderTimer()
        const previewIntent = dragPreviewIntentRef.current
        const currentIntent = dropIntentRef.current
        if (
          previewIntent &&
          currentIntent?.overId === previewIntent.overId &&
          currentIntent.position === previewIntent.position
        ) {
          return
        }
        if (!previewIntent) {
          clearDropIntent()
          restoreDragPagePreview()
          return
        }
      }
      if (!overId) {
        clearReorderTimer()
        const previewIntent = dragPreviewIntentRef.current
        const currentIntent = dropIntentRef.current
        if (
          pointerInsidePreviewSlot &&
          previewIntent &&
          currentIntent?.overId === previewIntent.overId &&
          currentIntent.position === previewIntent.position
        ) {
          return
        }
        clearDropIntent()
        restoreDragPagePreview()
        return
      }
      const visibleTarget =
        pointerTarget?.target ??
        pageTrackRef.current?.querySelector<HTMLElement>(
          `[data-home-page-grid="true"][aria-hidden="false"] [data-home-item-id="${CSS.escape(overId)}"]`
        )
      const position = resolveHomeDropPosition(
        pointerX,
        visibleTarget?.getBoundingClientRect() ??
          over?.rect ?? {
            left: pointerX ?? 0,
            width: 0,
          }
      )
      const nextOrder = getValidDropOrder(
        getLatestDragOrder(),
        activeId,
        overId,
        position
      )
      if (!nextOrder) {
        clearReorderTimer()
        clearDropIntent()
        restoreDragPagePreview()
        setMovePageNotice("这个位置空间不足，请换一侧或其他条目")
        return
      }
      setMovePageNotice(null)
      const intent = { overId, position }
      const previousIntent = dropIntentRef.current
      if (
        previousIntent &&
        (previousIntent.overId !== overId ||
          previousIntent.position !== position) &&
        dropIntentRevisionRef.current === dragPointerRevisionRef.current
      ) {
        return
      }
      if (
        previousIntent?.overId !== overId ||
        previousIntent.position !== position
      ) {
        dropIntentRef.current = intent
        dropIntentRevisionRef.current = dragPointerRevisionRef.current
        setDropIntent(intent)
      }
      const intentKey = `${overId}:${position}`
      if (reorderTimerRef.current && reorderTargetRef.current === intentKey) {
        return
      }
      if (!reorderTimerRef.current && reorderTargetRef.current === intentKey) {
        return
      }
      clearReorderTimer()
      reorderTargetRef.current = intentKey
      reorderTimerRef.current = setTimeout(() => {
        reorderTimerRef.current = null
        dragPreviewIntentRef.current = intent
        dragOrderRef.current = nextOrder
        updateDragPreviewOrder(nextOrder)
      }, REORDER_INTENT_MS)
    },
    [
      clearDropIntent,
      clearEdgeTimer,
      clearReorderTimer,
      dragPointerXRef,
      dragPointerYRef,
      getLatestDragOrder,
      getValidDropOrder,
      pageTrackRef,
      restoreDragPagePreview,
      setMovePageNotice,
      settleEdgePageTransition,
      updateDragPreviewOrder,
      viewportRef,
    ]
  )

  const handleDragMove = useCallback(
    (event: DragMoveEvent) => {
      const viewport = viewportRef.current
      const initial = event.active.rect.current.initial
      if (!viewport || !initial) return
      const bounds = viewport.getBoundingClientRect()
      const pointerX =
        dragPointerXRef.current ??
        (dragPointerStartXRef.current !== null
          ? dragPointerStartXRef.current + event.delta.x
          : initial.left + initial.width / 2 + event.delta.x)
      const pointerY =
        dragPointerYRef.current ??
        (dragPointerStartYRef.current !== null
          ? dragPointerStartYRef.current + event.delta.y
          : initial.top + initial.height / 2 + event.delta.y)
      dragPointerXRef.current = pointerX
      dragPointerYRef.current = pointerY
      if (pointerY < bounds.top || pointerY > bounds.bottom) {
        clearEdgeTimer()
        clearReorderTimer()
        clearDropIntent()
        restoreDragPagePreview()
        return
      }
      const direction =
        pointerX < bounds.left + EDGE_PAGE_TARGET_GUTTER_PX
          ? -1
          : pointerX > bounds.right - EDGE_PAGE_TARGET_GUTTER_PX
            ? 1
            : 0
      if (direction === 0) {
        settleEdgePageTransition()
        clearEdgeTimer()
        handleDragOver(event)
        return
      }
      clearReorderTimer()
      clearDropIntent()
      restoreDragPagePreview()
      const targetPage = currentPageRef.current + direction
      if (targetPage < 0 || targetPage >= pagesLengthRef.current) {
        if (edgePageTimerRef.current) clearTimeout(edgePageTimerRef.current)
        edgePageTimerRef.current = null
        edgePageDirectionRef.current = direction
        return
      }
      if (
        edgePageTimerRef.current &&
        edgePageDirectionRef.current === direction
      ) {
        return
      }
      scheduleEdgePageTurn(direction)
    },
    [
      clearDropIntent,
      clearEdgeTimer,
      clearReorderTimer,
      dragPointerXRef,
      dragPointerYRef,
      handleDragOver,
      restoreDragPagePreview,
      scheduleEdgePageTurn,
      settleEdgePageTransition,
      viewportRef,
    ]
  )

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active } = event
      const activeId = String(active.id)
      const releaseIntent = dropIntentRef.current
      const releasePreviewIntent = dragPreviewIntentRef.current
      const pointerX =
        dragPointerXRef.current ??
        (dragPointerStartXRef.current !== null
          ? dragPointerStartXRef.current + event.delta.x
          : null)
      const pointerY =
        dragPointerYRef.current ??
        (dragPointerStartYRef.current !== null
          ? dragPointerStartYRef.current + event.delta.y
          : null)
      const activePageGrid = pageTrackRef.current?.querySelector<HTMLElement>(
        '[data-home-page-grid="true"][aria-hidden="false"]'
      )
      const gridBounds = viewportRef.current?.getBoundingClientRect()
      const insideActivePage =
        pointerX !== null && pointerY !== null && gridBounds
          ? pointerX >= gridBounds.left &&
            pointerX <= gridBounds.right &&
            pointerY >= gridBounds.top &&
            pointerY <= gridBounds.bottom
          : false
      const releaseTarget =
        insideActivePage &&
        pointerX !== null &&
        pointerY !== null &&
        activePageGrid
          ? findHomeDropTargetAtPoint(
              activePageGrid,
              activeId,
              pointerX,
              pointerY
            )
          : null
      const releaseOnPreviewSlot =
        insideActivePage &&
        pointerX !== null &&
        pointerY !== null &&
        isPointInsideActivePreviewSlot(
          activePageGrid,
          activeId,
          pointerX,
          pointerY
        )
      const layoutChangedDuringDrag =
        dragLayoutRevisionRef.current !== layoutRevisionRef.current
      const persistedLayoutAtDragStart = dragPersistedLayoutRef.current
      const persistedItemIdsAtDragStart = dragPersistedItemIdsRef.current
      const originPage = dragOriginPageRef.current
      const destinationPage = dragDestinationPageRef.current
      const previousOrder = itemsRef.current.map(item => item.id)
      const movedItem = itemsRef.current.find(item => item.id === activeId)

      clearEdgeTimer()
      clearReorderTimer()
      clearDropIntent()
      updateDragPreviewOrder(null)
      dragPreviewIntentRef.current = null
      edgePageTransitionUntilRef.current = 0
      itemDraggingRef.current = false
      dragEscapeGuardRef.current = false
      activeDragIdRef.current = null
      dragLayoutRevisionRef.current = null
      dragPersistedLayoutRef.current = null
      dragPersistedItemIdsRef.current = null
      dragPointerStartXRef.current = null
      dragPointerStartYRef.current = null
      dragPointerXRef.current = null
      dragPointerYRef.current = null

      let finalOrder = getLatestDragOrder()
      let shouldCommit = false
      let invalidDrop = false
      const releasePosition = releaseTarget
        ? resolveHomeDropPosition(pointerX, releaseTarget.rect)
        : null
      const releaseMatchesIntentTarget =
        !!releaseIntent &&
        releaseTarget?.target.dataset.homeItemId === releaseIntent.overId &&
        releaseIntent.position === releasePosition
      const releaseMatchesCrossPageBase =
        !releaseIntent &&
        releaseOnPreviewSlot &&
        originPage !== null &&
        destinationPage !== null &&
        destinationPage !== originPage &&
        !!dragPageOrderRef.current
      if (!layoutChangedDuringDrag && releaseMatchesCrossPageBase) {
        dragOrderRef.current = dragPageOrderRef.current
        finalOrder = getLatestDragOrder()
        shouldCommit = finalOrder.includes(activeId)
      } else if (
        !layoutChangedDuringDrag &&
        releaseIntent &&
        (releaseMatchesIntentTarget ||
          (releaseOnPreviewSlot &&
            releasePreviewIntent?.overId === releaseIntent.overId &&
            releasePreviewIntent.position === releaseIntent.position))
      ) {
        const candidate = getValidDropOrder(
          finalOrder,
          activeId,
          releaseIntent.overId,
          releaseIntent.position
        )
        if (candidate) {
          finalOrder = candidate
          shouldCommit = true
        } else {
          invalidDrop = true
        }
      }

      dragDestinationPageRef.current = null
      dragOriginPageRef.current = null
      dragOrderRef.current = null
      dragPageOrderRef.current = null
      setDragSnapshot(null)
      setMovePageNotice(null)
      setEditMode(true)
      setTimeout(() => {
        suppressNextPageClickRef.current = false
      }, 0)

      if (!shouldCommit || !finalOrder.includes(activeId)) {
        if (destinationPage !== null && originPage !== null) {
          const restoredPage = Math.min(
            originPage,
            Math.max(0, pagesLengthRef.current - 1)
          )
          setAnimatePage(true)
          currentPageRef.current = restoredPage
          setCurrentPage(restoredPage)
        }
        if (layoutChangedDuringDrag) {
          externalLayoutPendingRef.current = false
          setLayout(readHomeLayout())
          setLinkGroups(Links.getWithFallback())
          setMovePageNotice("布局已在其他位置更新，本次拖动未保存")
        } else if (invalidDrop) {
          setMovePageNotice("这个位置空间不足，请换一侧或其他条目")
        }
        return
      }
      if (sameHomeOrder(previousOrder, finalOrder)) return
      if (!persistedLayoutAtDragStart || !persistedItemIdsAtDragStart) {
        externalLayoutPendingRef.current = false
        setLayout(readHomeLayout())
        setLinkGroups(Links.getWithFallback())
        setMovePageNotice("布局状态已变化，本次拖动未保存")
        return
      }
      const persistedLayout = await persistOrderIfUnchanged(
        persistedLayoutAtDragStart,
        persistedItemIdsAtDragStart,
        finalOrder
      )
      if (!persistedLayout) {
        externalLayoutPendingRef.current = false
        setLayout(readHomeLayout())
        setLinkGroups(Links.getWithFallback())
        setMovePageNotice("布局已在其他页面更新，本次拖动未保存")
        return
      }
      const label =
        movedItem?.kind === "app"
          ? movedItem.label
          : movedItem
            ? getWidgetDefinition(movedItem.widget.type).title
            : "条目"
      showUndo(`已移动${label}`, () => {
        restoreOrderSnapshot(
          persistedLayout,
          persistedItemIdsAtDragStart,
          previousOrder,
          () => {
            if (originPage !== null) {
              setAnimatePage(true)
              setCurrentPage(originPage)
            }
          }
        )
      })
    },
    [
      dragPointerXRef,
      dragPointerYRef,
      pageTrackRef,
      viewportRef,
      layoutRevisionRef,
      clearEdgeTimer,
      clearReorderTimer,
      clearDropIntent,
      updateDragPreviewOrder,
      itemDraggingRef,
      getLatestDragOrder,
      setMovePageNotice,
      setEditMode,
      persistOrderIfUnchanged,
      showUndo,
      getValidDropOrder,
      suppressNextPageClickRef,
      setAnimatePage,
      setCurrentPage,
      externalLayoutPendingRef,
      setLayout,
      setLinkGroups,
      restoreOrderSnapshot,
    ]
  )

  const handleDragCancel = useCallback(() => {
    clearEdgeTimer()
    clearReorderTimer()
    clearDropIntent()
    updateDragPreviewOrder(null)
    dragPreviewIntentRef.current = null
    edgePageTransitionUntilRef.current = 0
    itemDraggingRef.current = false
    activeDragIdRef.current = null
    dragLayoutRevisionRef.current = null
    dragPersistedLayoutRef.current = null
    dragPersistedItemIdsRef.current = null
    dragPointerStartXRef.current = null
    dragPointerStartYRef.current = null
    dragPointerXRef.current = null
    dragPointerYRef.current = null

    const loadedExternalLayout = externalLayoutPendingRef.current
    if (loadedExternalLayout) {
      externalLayoutPendingRef.current = false
      setLayout(readHomeLayout())
      setLinkGroups(Links.getWithFallback())
      setMovePageNotice("已载入其他页面保存的最新布局")
    }

    if (dragOriginPageRef.current !== null) {
      const restoredPage = Math.min(
        dragOriginPageRef.current,
        Math.max(0, pagesLengthRef.current - 1)
      )
      setAnimatePage(true)
      currentPageRef.current = restoredPage
      setCurrentPage(restoredPage)
    }
    if (!loadedExternalLayout) setMovePageNotice(null)

    dragDestinationPageRef.current = null
    dragOriginPageRef.current = null
    dragOrderRef.current = null
    dragPageOrderRef.current = null
    setDragSnapshot(null)
    setTimeout(() => {
      dragEscapeGuardRef.current = false
      suppressNextPageClickRef.current = false
    }, 0)
  }, [
    clearDropIntent,
    clearEdgeTimer,
    clearReorderTimer,
    dragPointerXRef,
    dragPointerYRef,
    externalLayoutPendingRef,
    itemDraggingRef,
    setAnimatePage,
    setCurrentPage,
    setLayout,
    setLinkGroups,
    setMovePageNotice,
    suppressNextPageClickRef,
    updateDragPreviewOrder,
  ])

  return {
    currentPageRef,
    dragEscapeGuardRef,
    sensors,
    detectHomeCollision,
    handleDragStart,
    handleDragMove,
    handleDragOver,
    handleDragEnd,
    handleDragCancel,
    dropIntent,
    activeDragIdRef,
    dragSnapshot,
  }
}
