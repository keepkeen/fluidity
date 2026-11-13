import type {
  CollisionDetection,
  PointerActivationConstraint,
  PointerSensorProps,
  SensorProps,
  TouchSensorOptions,
} from "@dnd-kit/core"
import { PointerSensor, PointerSensorOptions, TouchSensor } from "@dnd-kit/core"
import type { SortingStrategy } from "@dnd-kit/sortable"

import { HomeItem } from "../../services/homeLayout"
import { HomeDropPosition } from "../../services/homePagination"

export interface DeleteTarget {
  url: string
  label: string
  groupIndex?: number
  linkIndex?: number
}

export interface PageDragState {
  pointerId: number
  startX: number
  startY: number
  startedAt: number
  axis: "pending" | "horizontal" | "vertical"
}

export interface HomeDropIntent {
  overId: string
  position: HomeDropPosition
}

export interface HomeDragSnapshot {
  id: string
  kind: HomeItem["kind"]
  label: string
  hue: number
}

export const PAGE_SNAP_TRANSITION =
  "transform 240ms cubic-bezier(0.22, 1, 0.36, 1)"
export const EDGE_PAGE_DWELL_MS = 420
export const EDGE_PAGE_TRANSITION_LOCK_MS = 280
export const EDGE_PAGE_TARGET_GUTTER_PX = 20
export const PAGE_DRAG_AXIS_THRESHOLD_PX = 10
export const REORDER_INTENT_MS = 70
export const REORDER_ANIMATION_MS = 180
export const noHomeItemTransform: SortingStrategy = () => null
export const doNotAnimateHomeLayoutChange = () => false

export const sameHomeOrder = (
  left: string[] | null,
  right: string[] | null
): boolean =>
  left === right ||
  (!!left &&
    !!right &&
    left.length === right.length &&
    left.every((id, index) => id === right[index]))

export interface HomeDragPageFrame<T> {
  canonicalItems: readonly T[]
  previewItems: readonly T[] | null
}

/**
 * Keeps the canonical page containers mounted while a candidate order changes
 * the packed page count. A missing preview page is intentionally empty; null
 * is reserved for the non-dragging state where canonical content is visible.
 */
export const projectHomeDragPages = <T>(
  canonicalPages: readonly (readonly T[])[],
  previewPages: readonly (readonly T[])[] | null
): { frames: HomeDragPageFrame<T>[]; navigationPageCount: number } => {
  const renderedPageCount = previewPages
    ? Math.max(canonicalPages.length, previewPages.length)
    : canonicalPages.length

  return {
    // A preview may temporarily collapse the last canonical page. Keep that
    // page reachable so the user can reverse the edge turn or cancel back to
    // the exact origin during the same drag session.
    navigationPageCount: renderedPageCount,
    frames: Array.from({ length: renderedPageCount }, (_, pageIndex) => ({
      canonicalItems: canonicalPages[pageIndex] ?? [],
      previewItems: previewPages ? (previewPages[pageIndex] ?? []) : null,
    })),
  }
}

export const positionPageTrack = (
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

export const HOME_GESTURE_INTERACTIVE_SELECTOR =
  "button, a, input, textarea, select, [contenteditable], [data-widget-interactive]"
export const HOME_DRAG_ACTIVATOR_SELECTOR =
  '[data-home-app-tile="true"], [data-home-drag-handle="true"]'
export const HOME_PAGE_GESTURE_EXCLUDED_SELECTOR =
  '[data-fluidity-modal="true"], [data-home-widget-edit-surface="true"], [data-home-drag-handle="true"]'
export const HOME_PAGE_FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ")

export const HOME_SCREEN_READER_INSTRUCTIONS = {
  draggable:
    "使用指针按住并拖动应用图标；小组件请先长按进入编辑，再拖动其手柄。编辑模式下，可使用 Control 或 Command 加左右方向键在当前页调整顺序，也可使用移至上一页或移至下一页按钮跨页移动。",
}

/**
 * Business controls never start item DnD. They still participate in the
 * parent page gesture so a short press remains a click, a horizontal move
 * pages, and an intentional long press enters the shared home edit mode.
 * Explicit drag-only surfaces stay entirely under dnd-kit control.
 */
export const shouldCaptureHomeGestureFromTarget = (
  target: EventTarget | null,
  gesture: "item-drag" | "page"
): boolean => {
  if (!(target instanceof Element)) return true
  if (gesture === "page") {
    return !target.closest(HOME_PAGE_GESTURE_EXCLUDED_SELECTOR)
  }
  if (target.closest(HOME_DRAG_ACTIVATOR_SELECTOR)) return true
  return !target.closest(HOME_GESTURE_INTERACTIVE_SELECTOR)
}

export const isVisibleHomePageFocusTarget = (element: HTMLElement): boolean =>
  !element.closest('[hidden], [inert], [aria-hidden="true"]') &&
  element.getClientRects().length > 0

export const homeCollisionDetection: CollisionDetection = args => {
  const activePageContainers = args.droppableContainers.filter(container => {
    const node = container.node.current
    return (
      container.id !== args.active.id &&
      !!node &&
      !node.closest('[aria-hidden="true"]')
    )
  })
  if (activePageContainers.length === 0) return []

  const activePageGrid = activePageContainers[0].node.current?.closest(
    '[data-home-page-grid="true"]'
  )
  if (activePageGrid && args.pointerCoordinates) {
    const bounds = activePageGrid.getBoundingClientRect()
    const { x, y } = args.pointerCoordinates
    if (
      x < bounds.left ||
      x > bounds.right ||
      y < bounds.top ||
      y > bounds.bottom
    ) {
      return []
    }
  }

  if (!args.pointerCoordinates) return []
  const { x, y } = args.pointerCoordinates
  const liveContainers = activePageContainers.flatMap(container => {
    const rect = container.node.current?.getBoundingClientRect()
    return rect ? [{ container, rect }] : []
  })
  const pointerHits = liveContainers
    .filter(
      ({ rect }) =>
        x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
    )
    .sort((left, right) => {
      const leftDistance = Math.hypot(
        x - (left.rect.left + left.rect.width / 2),
        y - (left.rect.top + left.rect.height / 2)
      )
      const rightDistance = Math.hypot(
        x - (right.rect.left + right.rect.width / 2),
        y - (right.rect.top + right.rect.height / 2)
      )
      return leftDistance - rightDistance
    })
  const hit = pointerHits[0]
  return hit
    ? [
        {
          id: hit.container.id,
          data: { droppableContainer: hit.container, value: 0 },
        },
      ]
    : []
}

export const getClientX = (event: Event): number | null => {
  if (!("clientX" in event)) return null
  const clientX = Number(event.clientX)
  return Number.isFinite(clientX) ? clientX : null
}

export const getClientY = (event: Event): number | null => {
  if (!("clientY" in event)) return null
  const clientY = Number(event.clientY)
  return Number.isFinite(clientY) ? clientY : null
}

export const resolveHomeDropPosition = (
  pointerX: number | null,
  targetRect: { left: number; width: number }
): HomeDropPosition =>
  (pointerX ?? targetRect.left + targetRect.width / 2) <
  targetRect.left + targetRect.width / 2
    ? "before"
    : "after"

export const findHomeDropTargetAtPoint = (
  grid: HTMLElement | null | undefined,
  activeId: string,
  pointerX: number,
  pointerY: number
): { target: HTMLElement; rect: DOMRect } | null =>
  grid
    ? (Array.from(
        grid.querySelectorAll<HTMLElement>(":scope > [data-home-item-id]")
      )
        .filter(target => target.dataset.homeItemId !== activeId)
        .map(target => ({ target, rect: target.getBoundingClientRect() }))
        .filter(
          ({ rect }) =>
            pointerX >= rect.left &&
            pointerX <= rect.right &&
            pointerY >= rect.top &&
            pointerY <= rect.bottom
        )
        .sort((left, right) => {
          const leftDistance = Math.hypot(
            pointerX - (left.rect.left + left.rect.width / 2),
            pointerY - (left.rect.top + left.rect.height / 2)
          )
          const rightDistance = Math.hypot(
            pointerX - (right.rect.left + right.rect.width / 2),
            pointerY - (right.rect.top + right.rect.height / 2)
          )
          return leftDistance - rightDistance
        })[0] ?? null)
    : null

export const isPointInsideElement = (
  element: Element | null | undefined,
  pointerX: number,
  pointerY: number
): boolean => {
  if (!(element instanceof HTMLElement)) return false
  const rect = element.getBoundingClientRect()
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    pointerX >= rect.left &&
    pointerX <= rect.right &&
    pointerY >= rect.top &&
    pointerY <= rect.bottom
  )
}

export const isPointInsideActivePreviewSlot = (
  grid: HTMLElement | null | undefined,
  activeId: string,
  pointerX: number,
  pointerY: number
): boolean => {
  if (!grid) return false
  const escapedId = CSS.escape(activeId)
  return [
    grid.querySelector(`[data-home-item-id="${escapedId}"]`),
    grid.querySelector(`[data-home-preview-slot-id="${escapedId}"]`),
  ].some(element => isPointInsideElement(element, pointerX, pointerY))
}

export const isPointerInEdgeTurnGutter = (
  pointerX: number,
  bounds: DOMRect,
  direction: -1 | 1
): boolean =>
  direction < 0
    ? pointerX < bounds.left + EDGE_PAGE_TARGET_GUTTER_PX
    : pointerX > bounds.right - EDGE_PAGE_TARGET_GUTTER_PX

export const getHomePointerActivationConstraint = (
  target: EventTarget | null,
  pointerType: string,
  editMode: boolean
): PointerActivationConstraint => {
  if (editMode) return { distance: 4 }
  if (
    pointerType !== "touch" &&
    target instanceof Element &&
    target.closest('[data-home-app-tile="true"]')
  ) {
    return { distance: 8 }
  }
  return { delay: 220, tolerance: 8 }
}

export class HomePointerSensor extends PointerSensor {
  constructor(props: PointerSensorProps) {
    const target = props.event.target
    const pointerType =
      "pointerType" in props.event ? String(props.event.pointerType) : ""
    const editMode =
      target instanceof Element &&
      !!target.closest('[data-home-editing="true"]')
    super({
      ...props,
      options: {
        ...props.options,
        activationConstraint: getHomePointerActivationConstraint(
          target,
          pointerType,
          editMode
        ),
      },
    })
  }

  static activators = [
    {
      eventName: "onPointerDown" as const,
      handler: (
        { nativeEvent: event }: React.PointerEvent,
        { onActivation }: PointerSensorOptions
      ) => {
        if (event.pointerType === "touch") return false
        if (!shouldActivateHomePointerDrag(event)) return false
        onActivation?.({ event })
        return true
      },
    },
  ]
}

export class HomeTouchSensor extends TouchSensor {
  constructor(props: SensorProps<TouchSensorOptions>) {
    const target = props.event.target
    const editMode =
      target instanceof Element &&
      !!target.closest('[data-home-editing="true"]')
    super({
      ...props,
      options: {
        ...props.options,
        activationConstraint: getHomePointerActivationConstraint(
          target,
          "touch",
          editMode
        ),
      },
    })
  }

  static activators = [
    {
      eventName: "onTouchStart" as const,
      handler: (
        { nativeEvent: event }: React.TouchEvent,
        { onActivation }: PointerSensorOptions
      ) => {
        if (!shouldActivateHomeTouchDrag(event)) return false
        onActivation?.({ event })
        return true
      },
    },
  ]
}

export interface HomePointerActivationEvent {
  isPrimary: boolean
  button: number
  pointerType: string
  target: EventTarget | null
}

export const shouldActivateHomePointerDrag = (
  event: HomePointerActivationEvent
): boolean => {
  if (!event.isPrimary || event.button !== 0) return false
  return shouldCaptureHomeGestureFromTarget(event.target, "item-drag")
}

export const shouldActivateHomeTouchDrag = (
  event: Pick<TouchEvent, "target" | "touches">
): boolean => {
  if (event.touches.length !== 1) return false
  return shouldCaptureHomeGestureFromTarget(event.target, "item-drag")
}

export const shouldReservePointerForHomeItemDrag = (
  target: EventTarget | null,
  pointerType: string,
  editMode: boolean
): boolean =>
  target instanceof Element &&
  (editMode
    ? !!target.closest('[data-home-item-kind="app"]')
    : pointerType !== "touch" &&
      !!target.closest('[data-home-app-tile="true"]'))

/**
 * Bare arrow keys are a home-page navigation shortcut, not a global browser
 * shortcut. Keep focused toolbar/settings controls in charge of their keys.
 */
export const shouldHandleHomePageArrowKey = (
  target: EventTarget | null,
  currentPage: number
): boolean => {
  if (!(target instanceof Element)) return true
  if (target === document.body || target === document.documentElement)
    return true
  const page = target.closest<HTMLElement>('[data-home-page-grid="true"]')
  return page?.dataset.homePageIndex === String(currentPage)
}
