import { useCallback, useEffect, useLayoutEffect, useRef } from "react"

import { HomeLayoutState } from "../../services/homeLayout"

import type * as React from "react"
import {
  DeleteTarget,
  HOME_PAGE_FOCUSABLE_SELECTOR,
  isVisibleHomePageFocusTarget,
  PAGE_DRAG_AXIS_THRESHOLD_PX,
  PageDragState,
  positionPageTrack,
  shouldCaptureHomeGestureFromTarget,
  shouldHandleHomePageArrowKey,
  shouldReservePointerForHomeItemDrag,
} from "./homeInteraction"

interface Options {
  pageTrackRef: React.MutableRefObject<HTMLDivElement | null>
  currentPage: number
  animatePage: boolean
  gridRef: React.MutableRefObject<HTMLDivElement | null>
  setAnimatePage: React.Dispatch<React.SetStateAction<boolean>>
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>
  navigationPageCount: number
  editMode: boolean
  setEditMode: React.Dispatch<React.SetStateAction<boolean>>
  itemDraggingRef: React.MutableRefObject<boolean>
  dragPointerXRef: React.MutableRefObject<number | null>
  dragPointerYRef: React.MutableRefObject<number | null>
  setIsPageDragging: React.Dispatch<React.SetStateAction<boolean>>
  viewportRef: React.MutableRefObject<HTMLDivElement | null>
  deleteTarget: DeleteTarget | null
  galleryOpen: boolean
  overviewOpen: boolean
  settingsInstanceId: string | null
  layout: HomeLayoutState
}

export const useHomePaging = ({
  pageTrackRef,
  currentPage,
  animatePage,
  gridRef,
  setAnimatePage,
  setCurrentPage,
  navigationPageCount,
  editMode,
  setEditMode,
  itemDraggingRef,
  dragPointerXRef,
  dragPointerYRef,
  setIsPageDragging,
  viewportRef,
  deleteTarget,
  galleryOpen,
  overviewOpen,
  settingsInstanceId,
  layout,
}: Options) => {
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const pressOriginRef = useRef<{ x: number; y: number } | null>(null)

  const pageDragRef = useRef<PageDragState | null>(null)

  const pendingKeyboardPageFocusRef = useRef<number | null>(null)

  const pendingMovedItemFocusRef = useRef<{
    page: number
    itemId: string
  } | null>(null)

  const suppressNextPageClickRef = useRef(false)

  const suppressClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  )

  const lastWheelAtRef = useRef(0)

  useLayoutEffect(() => {
    positionPageTrack(pageTrackRef.current, currentPage, 0, animatePage)
  }, [animatePage, currentPage, pageTrackRef])

  useLayoutEffect(() => {
    const pendingMovedItem = pendingMovedItemFocusRef.current
    if (
      pendingKeyboardPageFocusRef.current !== currentPage &&
      pendingMovedItem?.page !== currentPage
    ) {
      return
    }
    pendingKeyboardPageFocusRef.current = null
    pendingMovedItemFocusRef.current = null

    const page = pageTrackRef.current?.querySelector<HTMLElement>(
      `[data-home-page-index="${currentPage}"]`
    )
    const movedItem =
      page && pendingMovedItem
        ? page.querySelector<HTMLElement>(
            `[data-home-item-id="${CSS.escape(pendingMovedItem.itemId)}"]`
          )
        : null
    const movedItemControl = movedItem
      ? [
          movedItem.querySelector<HTMLElement>('[data-home-app-tile="true"]'),
          movedItem.querySelector<HTMLElement>(
            '[data-home-drag-handle="true"]'
          ),
          movedItem.querySelector<HTMLElement>('button[aria-label^="移至"]'),
        ].find(
          (control): control is HTMLElement =>
            control !== null && isVisibleHomePageFocusTarget(control)
        )
      : undefined
    const firstPageControl = page
      ? Array.from(
          page.querySelectorAll<HTMLElement>(HOME_PAGE_FOCUSABLE_SELECTOR)
        ).find(isVisibleHomePageFocusTarget)
      : undefined
    const fallbackPageDot = gridRef.current?.querySelector<HTMLElement>(
      `button[aria-label="转到第 ${currentPage + 1} 页"]`
    )

    const focusTarget = pendingMovedItem
      ? (movedItemControl ?? fallbackPageDot)
      : (firstPageControl ?? fallbackPageDot)
    focusTarget?.focus({ preventScroll: true })
  }, [currentPage, gridRef, pageTrackRef])

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
        Math.min(navigationPageCount - 1, Math.max(0, page + direction))
      )
    },
    [navigationPageCount, setAnimatePage, setCurrentPage]
  )

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!e.isPrimary || e.button !== 0) return
      const target = e.target
      if (!shouldCaptureHomeGestureFromTarget(target, "page")) return
      cancelLongPress()
      pressOriginRef.current = { x: e.clientX, y: e.clientY }
      pageDragRef.current = shouldReservePointerForHomeItemDrag(
        target,
        e.pointerType,
        editMode
      )
        ? null
        : {
            pointerId: e.pointerId,
            startX: e.clientX,
            startY: e.clientY,
            startedAt: performance.now(),
            axis: "pending",
          }
      if (!editMode) {
        longPressRef.current = setTimeout(() => {
          suppressNextPageClickRef.current = true
          if (suppressClickTimerRef.current) {
            clearTimeout(suppressClickTimerRef.current)
          }
          suppressClickTimerRef.current = setTimeout(() => {
            suppressNextPageClickRef.current = false
            suppressClickTimerRef.current = null
          }, 800)
          setEditMode(true)
        }, 480)
      }
    },
    [cancelLongPress, editMode, setEditMode]
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (itemDraggingRef.current) {
        dragPointerXRef.current = e.clientX
        dragPointerYRef.current = e.clientY
        return
      }

      const origin = pressOriginRef.current
      if (
        origin &&
        Math.hypot(e.clientX - origin.x, e.clientY - origin.y) > 10
      ) {
        cancelLongPress()
      }

      const drag = pageDragRef.current
      if (!drag || drag.pointerId !== e.pointerId || itemDraggingRef.current) {
        return
      }
      const dx = e.clientX - drag.startX
      const dy = e.clientY - drag.startY

      if (drag.axis === "pending") {
        // DnD's delayed long-press tolerance is 8px. Paging must not claim the
        // same 5–8px band and then hand the gesture to item dragging.
        if (
          Math.max(Math.abs(dx), Math.abs(dy)) < PAGE_DRAG_AXIS_THRESHOLD_PX
        ) {
          return
        }
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
      const atTrailingEdge = currentPage === navigationPageCount - 1 && dx < 0
      positionPageTrack(
        pageTrackRef.current,
        currentPage,
        atLeadingEdge || atTrailingEdge ? Math.round(dx * 0.24) : dx,
        false
      )
    },
    [
      cancelLongPress,
      currentPage,
      dragPointerXRef,
      dragPointerYRef,
      itemDraggingRef,
      navigationPageCount,
      pageTrackRef,
      setIsPageDragging,
    ]
  )

  const finishPageDragAt = useCallback(
    (pointerId: number, clientX: number, cancelled = false) => {
      cancelLongPress()
      const drag = pageDragRef.current
      pageDragRef.current = null
      if (!drag || drag.pointerId !== pointerId) return

      if (drag.axis === "horizontal") {
        const dx = clientX - drag.startX
        const elapsed = Math.max(1, performance.now() - drag.startedAt)
        const velocity = dx / elapsed
        const viewportWidth = viewportRef.current?.clientWidth ?? 0
        const passedDistance =
          Math.abs(dx) >= Math.max(48, viewportWidth * 0.13)
        const passedFlick = Math.abs(dx) >= 20 && Math.abs(velocity) >= 0.45
        const canChange =
          dx < 0 ? currentPage < navigationPageCount - 1 : currentPage > 0

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
    },
    [
      cancelLongPress,
      currentPage,
      navigationPageCount,
      pageTrackRef,
      setAnimatePage,
      setCurrentPage,
      setIsPageDragging,
      viewportRef,
    ]
  )

  const finishPageDrag = useCallback(
    (e: React.PointerEvent, cancelled = false) => {
      finishPageDragAt(e.pointerId, e.clientX, cancelled)

      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId)
        }
      } catch {
        // ignore
      }
    },
    [finishPageDragAt]
  )

  // Pointer capture can be denied by the browser when a swipe starts on a
  // nested business control. Always settle a page gesture on document-level
  // release so dragging outside the viewport cannot leave it half-finished.
  useEffect(() => {
    const finish = (event: PointerEvent) => {
      finishPageDragAt(
        event.pointerId,
        event.clientX,
        event.type === "pointercancel"
      )
    }
    document.addEventListener("pointerup", finish, true)
    document.addEventListener("pointercancel", finish, true)
    return () => {
      document.removeEventListener("pointerup", finish, true)
      document.removeEventListener("pointercancel", finish, true)
    }
  }, [finishPageDragAt])

  const handlePageClickCapture = useCallback((event: React.MouseEvent) => {
    const target = event.target
    if (
      target instanceof HTMLElement &&
      target.closest('[data-fluidity-modal="true"]')
    ) {
      return
    }
    if (!suppressNextPageClickRef.current) return
    suppressNextPageClickRef.current = false
    if (suppressClickTimerRef.current) {
      clearTimeout(suppressClickTimerRef.current)
      suppressClickTimerRef.current = null
    }
    event.preventDefault()
    event.stopPropagation()
  }, [])

  useEffect(
    () => () => {
      cancelLongPress()
      if (suppressClickTimerRef.current) {
        clearTimeout(suppressClickTimerRef.current)
      }
    },
    [cancelLongPress]
  )

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target
      if (target instanceof HTMLElement && target.closest('[role="dialog"]')) {
        return
      }
      const isEditable =
        target instanceof HTMLElement &&
        (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
          target.isContentEditable)
      if (
        isEditable ||
        editMode ||
        deleteTarget ||
        galleryOpen ||
        overviewOpen ||
        settingsInstanceId ||
        event.isComposing
      ) {
        return
      }

      if (
        (event.key === "ArrowLeft" || event.key === "ArrowRight") &&
        !shouldHandleHomePageArrowKey(target, currentPage)
      ) {
        return
      }

      if (event.key === "ArrowLeft" && currentPage > 0) {
        event.preventDefault()
        const activePage =
          document.activeElement instanceof HTMLElement
            ? document.activeElement.closest<HTMLElement>(
                '[data-home-page-grid="true"]'
              )
            : null
        pendingKeyboardPageFocusRef.current =
          activePage?.dataset.homePageIndex === String(currentPage)
            ? currentPage - 1
            : null
        setAnimatePage(true)
        setCurrentPage(page => page - 1)
        return
      }
      if (event.key === "ArrowRight" && currentPage < navigationPageCount - 1) {
        event.preventDefault()
        const activePage =
          document.activeElement instanceof HTMLElement
            ? document.activeElement.closest<HTMLElement>(
                '[data-home-page-grid="true"]'
              )
            : null
        pendingKeyboardPageFocusRef.current =
          activePage?.dataset.homePageIndex === String(currentPage)
            ? currentPage + 1
            : null
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
            : event.shiftKey &&
              !event.altKey &&
              !event.ctrlKey &&
              !event.metaKey
      if (!modifierPressed) return

      const page = Number(match[1]) - 1
      if (page < 0 || page >= navigationPageCount) return
      event.preventDefault()
      const activePage =
        document.activeElement instanceof HTMLElement
          ? document.activeElement.closest<HTMLElement>(
              '[data-home-page-grid="true"]'
            )
          : null
      pendingKeyboardPageFocusRef.current =
        page !== currentPage &&
        activePage?.dataset.homePageIndex === String(currentPage)
          ? page
          : null
      setAnimatePage(Math.abs(page - currentPage) === 1)
      setCurrentPage(page)
    }

    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [
    currentPage,
    deleteTarget,
    editMode,
    galleryOpen,
    layout.pageShortcutModifier,
    overviewOpen,
    navigationPageCount,
    settingsInstanceId,
    setAnimatePage,
    setCurrentPage,
  ])

  const handleWheel = useCallback(
    (event: React.WheelEvent) => {
      if (
        event.target instanceof HTMLElement &&
        event.target.closest('[role="dialog"], [data-fluidity-modal="true"]')
      ) {
        return
      }
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

  return {
    pendingMovedItemFocusRef,
    cancelLongPress,
    pageDragRef,
    suppressNextPageClickRef,
    handlePointerDown,
    finishPageDrag,
    handlePointerMove,
    handlePageClickCapture,
    handleWheel,
  }
}
