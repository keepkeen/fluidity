import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import { DndContext, DragOverlay } from "@dnd-kit/core"
import { SortableContext } from "@dnd-kit/sortable"
import {
  faCheck,
  faPen,
  faPlus,
  faTableCellsLarge,
} from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"

import { Modal } from "../../components/Modal"
import { LinkAnalytics } from "../../services/analytics"
import {
  addWidgetInstance,
  buildHomeItems,
  HomeItem,
  HomeLayoutState,
  readHomeLayout,
  removeWidgetInstance,
  saveHomeLayout,
  updateWidgetInstanceIfUnchanged,
  withHomeLayoutLock,
} from "../../services/homeLayout"
import {
  getHomeGridMetrics,
  getOrderForItemOnPage,
  getOrderForRelativeDropOnPage,
  getVisiblePageIndices,
  HomeGridMetrics,
  paginateHomeItems,
} from "../../services/homePagination"
import { navigateToLink } from "../../services/linkSearch"
import { LaterReadItem } from "../../services/readLater"
import {
  getWidgetDefinition,
  WidgetInstance,
  WidgetSize,
  WidgetType,
} from "../../services/widgetRegistry"
import { CommandPalette } from "../LinkContainer/CommandPalette/CommandPalette"
import { Links } from "../Settings/settingsHandler"
import { WidgetGallery, WidgetSettings } from "../Widgets/WidgetControls"
import { HomeOverview } from "./HomeOverview"

import {
  AppEntry,
  AppIconBox,
  AppLabel,
  cellSpan,
  ConfirmButton,
  ConfirmButtons,
  ConfirmCard,
  ConfirmText,
  ConfirmTitle,
  DoneButton,
  DragAppGlyph,
  DragPreview,
  DragPreviewSlot,
  DragWidgetBody,
  DragWidgetCard,
  DragWidgetHeader,
  EditToolbar,
  EditToolButton,
  EmptyHome,
  EmptyHomeAction,
  HomePager,
  MovePageNotice,
  PageDot,
  PageDots,
  PageEditButton,
  PageGap,
  PageGrid,
  PagePosition,
  PageTrack,
  PageViewport,
  UndoButton,
  UndoToast,
} from "./HomeGrid.styles"
import {
  DeleteTarget,
  HOME_SCREEN_READER_INSTRUCTIONS,
  noHomeItemTransform,
  projectHomeDragPages,
  sameHomeOrder,
} from "./homeInteraction"
import { SortableItem } from "./SortableHomeItem"
import { useHomeDrag } from "./useHomeDrag"
import { useHomePaging } from "./useHomePaging"
import { useHomePersistence } from "./useHomePersistence"
/**
 * iOS 风格主屏：小组件与应用图标同网格。
 * 长按进入抖动编辑模式：拖拽排序、✕ 删除；"完成"或 Escape 退出。
 */

// ============ 主组件 ============

export const HomeGrid = () => {
  const [editMode, setEditMode] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const [settled, setSettled] = useState(false)
  const [currentPage, setCurrentPage] = useState(0)
  const [animatePage, setAnimatePage] = useState(true)
  const [isPageDragging, setIsPageDragging] = useState(false)
  const [movePageNotice, setMovePageNotice] = useState<string | null>(null)
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [overviewOpen, setOverviewOpen] = useState(false)
  const [settingsInstanceId, setSettingsInstanceId] = useState<string | null>(
    null
  )
  const [dragPreviewOrder, setDragPreviewOrder] = useState<string[] | null>(
    null
  )
  const [undoAction, setUndoAction] = useState<{
    message: string
    undo: () => void
  } | null>(null)
  const [gridMetrics, setGridMetrics] = useState<HomeGridMetrics>({
    columns: 9,
    rows: 5,
  })
  const gridRef = useRef<HTMLDivElement | null>(null)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const pageTrackRef = useRef<HTMLDivElement | null>(null)
  const itemDraggingRef = useRef(false)
  const dragPointerXRef = useRef<number | null>(null)
  const dragPointerYRef = useRef<number | null>(null)

  const {
    linkGroups,
    layout,
    persistOrderIfUnchanged,
    setLayout,
    layoutRevisionRef,
    externalLayoutPendingRef,
    setLinkGroups,
    commitLayout,
  } = useHomePersistence({ itemDraggingRef })
  // 入场动画结束后移除 animation，避免重排移动 DOM 时动画重启闪烁
  useEffect(() => {
    const timer = setTimeout(() => setSettled(true), 1100)
    return () => clearTimeout(timer)
  }, [])

  const layoutItems = useMemo(
    () => buildHomeItems(linkGroups, layout, LinkAnalytics.get(), Date.now()),
    [linkGroups, layout]
  )
  /*
   * 拖动时保持真实页面树不变。候选顺序通过 CSS grid order 与轻量跨页
   * 占位投影，避免 favicon/小组件重挂载；松手后才一次性提交真实顺序。
   */
  const items = layoutItems
  const pages = useMemo(
    () => paginateHomeItems(items, gridMetrics),
    [items, gridMetrics]
  )
  const dragPreviewPages = useMemo(() => {
    if (!dragPreviewOrder) return null
    const itemById = new Map(items.map(item => [item.id, item]))
    const seen = new Set<string>()
    const orderedItems = dragPreviewOrder.flatMap(id => {
      const item = itemById.get(id)
      if (!item || seen.has(id)) return []
      seen.add(id)
      return [item]
    })
    items.forEach(item => {
      if (!seen.has(item.id)) orderedItems.push(item)
    })
    return paginateHomeItems(orderedItems, gridMetrics)
  }, [dragPreviewOrder, gridMetrics, items])
  const dragPageProjection = useMemo(
    () => projectHomeDragPages(pages, dragPreviewPages),
    [dragPreviewPages, pages]
  )
  const navigationPageCount = dragPageProjection.navigationPageCount
  const itemIndexById = useMemo(
    () => new Map(items.map((item, index) => [item.id, index])),
    [items]
  )
  const visibleAppUrlsByPage = useMemo(
    () =>
      pages.map(pageItems =>
        pageItems.flatMap(item => (item.kind === "app" ? [item.url] : []))
      ),
    [pages]
  )
  const [mountedPageIndices, setMountedPageIndices] = useState<Set<number>>(
    () => new Set([0, 1])
  )
  const visiblePageIndices = useMemo(
    () =>
      getVisiblePageIndices(
        navigationPageCount,
        currentPage,
        gridMetrics.columns <= 4 ? 5 : 7
      ),
    [currentPage, gridMetrics.columns, navigationPageCount]
  )
  const widgetCounts = useMemo(() => {
    const counts: Partial<Record<WidgetType, number>> = {}
    Object.values(layout.widgets).forEach(widget => {
      counts[widget.type] = (counts[widget.type] ?? 0) + 1
    })
    return counts
  }, [layout.widgets])
  const settingsInstance = settingsInstanceId
    ? (layout.widgets[settingsInstanceId] ?? null)
    : null

  const showUndo = useCallback((message: string, undo: () => void) => {
    setUndoAction({
      message,
      undo: () => {
        undo()
        setUndoAction(null)
      },
    })
  }, [])

  const restoreOrderSnapshot = useCallback(
    async (
      expectedCurrentLayout: HomeLayoutState,
      expectedItemIds: string[],
      previousOrder: string[],
      onRestored?: () => void
    ): Promise<boolean> => {
      if (
        !(await persistOrderIfUnchanged(
          expectedCurrentLayout,
          expectedItemIds,
          previousOrder
        ))
      ) {
        setMovePageNotice("布局已在其他页面更新，为避免覆盖新顺序，本次未撤销")
        return false
      }
      onRestored?.()
      return true
    },
    [persistOrderIfUnchanged]
  )

  const {
    pendingMovedItemFocusRef,
    cancelLongPress,
    pageDragRef,
    suppressNextPageClickRef,
    handlePointerDown,
    finishPageDrag,
    handlePointerMove,
    handlePageClickCapture,
    handleWheel,
  } = useHomePaging({
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
  })
  const {
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
  } = useHomeDrag({
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
  })
  useEffect(() => {
    if (!undoAction) return
    const timer = setTimeout(() => setUndoAction(null), 6500)
    return () => clearTimeout(timer)
  }, [undoAction])

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
    const maximumPage = Math.max(0, navigationPageCount - 1)
    if (currentPage <= maximumPage) return
    currentPageRef.current = maximumPage
    setCurrentPage(maximumPage)
  }, [currentPage, currentPageRef, navigationPageCount])

  useEffect(() => {
    setMountedPageIndices(previous => {
      const next = new Set(
        [...previous].filter(
          pageIndex => pageIndex < dragPageProjection.frames.length
        )
      )
      for (
        let pageIndex = Math.max(0, currentPage - 1);
        pageIndex <=
        Math.min(dragPageProjection.frames.length - 1, currentPage + 1);
        pageIndex += 1
      ) {
        next.add(pageIndex)
      }
      const unchanged =
        next.size === previous.size &&
        [...next].every(pageIndex => previous.has(pageIndex))
      return unchanged ? previous : next
    })
  }, [currentPage, dragPageProjection.frames.length])

  // iOS 式：点击网格空隙或网格外的壁纸区域退出编辑
  useEffect(() => {
    if (
      !editMode ||
      deleteTarget ||
      galleryOpen ||
      overviewOpen ||
      settingsInstanceId
    ) {
      return
    }
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node
      const grid = gridRef.current
      if (!grid) return
      if (
        target instanceof HTMLElement &&
        target.closest(
          "button, a, input, textarea, select, [role='dialog'], [data-home-edit-control], [data-widget-interactive]"
        )
      ) {
        return
      }
      const clickedPageGap =
        target instanceof HTMLElement && target.dataset.homePageGrid === "true"
      if (target === grid || clickedPageGap || !grid.contains(target)) {
        setEditMode(false)
      }
    }
    window.addEventListener("click", onClick)
    return () => window.removeEventListener("click", onClick)
  }, [deleteTarget, editMode, galleryOpen, overviewOpen, settingsInstanceId])

  // Escape 退出编辑
  useEffect(() => {
    if (!editMode) return
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key === "Escape" &&
        !itemDraggingRef.current &&
        !dragEscapeGuardRef.current
      ) {
        setEditMode(false)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [dragEscapeGuardRef, editMode])

  const moveItemToPage = useCallback(
    async (itemId: string, targetPage: number): Promise<boolean> => {
      if (targetPage < 0 || targetPage >= pages.length) return false
      const sourcePage = pages.findIndex(pageItems =>
        pageItems.some(item => item.id === itemId)
      )
      const nextOrder = getOrderForItemOnPage(
        items,
        gridMetrics,
        itemId,
        targetPage
      )
      if (!nextOrder) {
        setMovePageNotice("当前自动布局没有可用位置，条目保持在原页")
        return false
      }
      setMovePageNotice(null)
      const previousOrder = items.map(item => item.id)
      const movedItem = items.find(item => item.id === itemId)
      const persistedLayout = await persistOrderIfUnchanged(
        layout,
        previousOrder,
        nextOrder
      )
      if (!persistedLayout) {
        setLayout(readHomeLayout())
        setMovePageNotice("布局已在其他页面更新，本次移动未保存")
        return false
      }
      setAnimatePage(true)
      setCurrentPage(targetPage)
      if (!sameHomeOrder(previousOrder, nextOrder)) {
        const label =
          movedItem?.kind === "app"
            ? movedItem.label
            : movedItem
              ? getWidgetDefinition(movedItem.widget.type).title
              : "条目"
        showUndo(`已移动${label}到第 ${targetPage + 1} 页`, () => {
          restoreOrderSnapshot(
            persistedLayout,
            previousOrder,
            previousOrder,
            () => {
              if (sourcePage >= 0) {
                setAnimatePage(true)
                setCurrentPage(sourcePage)
              }
            }
          )
        })
      }
      return true
    },
    [
      gridMetrics,
      items,
      layout,
      pages,
      persistOrderIfUnchanged,
      restoreOrderSnapshot,
      setLayout,
      showUndo,
    ]
  )

  const handleMovePage = useCallback(
    async (item: HomeItem, direction: -1 | 1) => {
      const sourcePage = pages.findIndex(pageItems =>
        pageItems.some(candidate => candidate.id === item.id)
      )
      const targetPage = sourcePage + direction
      if (sourcePage < 0 || targetPage < 0 || targetPage >= pages.length) return

      const focusedItem =
        document.activeElement instanceof HTMLElement
          ? document.activeElement.closest<HTMLElement>(
              `[data-home-item-id="${CSS.escape(item.id)}"]`
            )
          : null
      if (focusedItem) {
        pendingMovedItemFocusRef.current = {
          page: targetPage,
          itemId: item.id,
        }
      }
      if (!(await moveItemToPage(item.id, targetPage))) {
        pendingMovedItemFocusRef.current = null
      }
    },
    [moveItemToPage, pages, pendingMovedItemFocusRef]
  )

  const moveItemWithinPage = useCallback(
    async (itemId: string, direction: -1 | 1): Promise<boolean> => {
      const pageIndex = pages.findIndex(pageItems =>
        pageItems.some(item => item.id === itemId)
      )
      const pageItems = pages[pageIndex]
      if (!pageItems) return false
      const itemIndex = pageItems.findIndex(item => item.id === itemId)
      const adjacent = pageItems[itemIndex + direction]
      if (itemIndex < 0 || !adjacent) return false

      const previousOrder = items.map(item => item.id)
      const nextOrder = getOrderForRelativeDropOnPage(
        items,
        gridMetrics,
        itemId,
        adjacent.id,
        direction < 0 ? "before" : "after",
        pageIndex
      )
      if (!nextOrder) {
        setMovePageNotice("这个位置空间不足，请改用拖动调整")
        return false
      }

      const movedItem = items.find(item => item.id === itemId)
      const label =
        movedItem?.kind === "app"
          ? movedItem.label
          : movedItem
            ? getWidgetDefinition(movedItem.widget.type).title
            : "条目"
      const persistedLayout = await persistOrderIfUnchanged(
        layout,
        previousOrder,
        nextOrder
      )
      if (!persistedLayout) {
        setLayout(readHomeLayout())
        setMovePageNotice("布局已在其他页面更新，本次调整未保存")
        return false
      }
      setMovePageNotice(`${label}已${direction < 0 ? "前移" : "后移"}，可撤销`)
      showUndo(`已${direction < 0 ? "前移" : "后移"}${label}`, () => {
        restoreOrderSnapshot(persistedLayout, previousOrder, previousOrder)
      })
      return true
    },
    [
      gridMetrics,
      items,
      layout,
      pages,
      persistOrderIfUnchanged,
      restoreOrderSnapshot,
      setLayout,
      showUndo,
    ]
  )

  // 编辑模式下为当前焦点条目提供不依赖指针的页内重排。
  useEffect(() => {
    if (!editMode) return
    const onKey = (event: KeyboardEvent) => {
      if (
        event.isComposing ||
        (!event.ctrlKey && !event.metaKey) ||
        (event.key !== "ArrowLeft" && event.key !== "ArrowRight")
      ) {
        return
      }
      const target = event.target
      if (!(target instanceof HTMLElement)) return
      if (target.closest('[role="dialog"], [data-fluidity-modal="true"]')) {
        return
      }
      const item = target.closest<HTMLElement>("[data-home-item-id]")
      const itemId = item?.dataset.homeItemId
      if (!itemId) return
      event.preventDefault()
      event.stopPropagation()
      void moveItemWithinPage(itemId, event.key === "ArrowLeft" ? -1 : 1)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [editMode, moveItemWithinPage])

  const handleOpen = useCallback((item: Extract<HomeItem, { kind: "app" }>) => {
    navigateToLink(item.url, item.label, item.groupTitle)
  }, [])

  const handleRemove = useCallback(
    async (item: HomeItem) => {
      if (item.kind === "widget") {
        const removal = await withHomeLayoutLock(() => {
          const latest = readHomeLayout()
          const removed = latest.widgets[item.id]
          if (!removed) {
            setLayout(latest)
            return null
          }
          const orderIndex = Math.max(0, latest.order.indexOf(item.id))
          const next = removeWidgetInstance(latest, item.id)
          saveHomeLayout(next)
          setLayout(next)
          return { removed, orderIndex }
        })
        if (!removal) {
          setMovePageNotice("组件已在其他页面被移除")
          setSettingsInstanceId(null)
          return
        }
        setSettingsInstanceId(null)
        showUndo(
          `已移除${getWidgetDefinition(removal.removed.type).title}`,
          () => {
            void commitLayout(current => {
              if (current.widgets[removal.removed.instanceId]) return current
              const order = [...current.order]
              order.splice(removal.orderIndex, 0, removal.removed.instanceId)
              return {
                ...current,
                widgets: {
                  ...current.widgets,
                  [removal.removed.instanceId]: removal.removed,
                },
                order: [...new Set(order)],
              }
            })
          }
        )
        return
      }
      setDeleteTarget({ url: item.url, label: item.label })
    },
    [commitLayout, setLayout, showUndo]
  )

  const handleAddWidget = useCallback(
    async (type: WidgetType, size: WidgetSize) => {
      const addedInstance = await withHomeLayoutLock(() => {
        const latest = readHomeLayout()
        const result = addWidgetInstance(latest, type, { size })
        if (!result) return null
        saveHomeLayout(result.state)
        setLayout(result.state)
        return result.instance
      })
      if (!addedInstance) return
      setGalleryOpen(false)
      setEditMode(true)
      setSettingsInstanceId(addedInstance.instanceId)
    },
    [setLayout]
  )

  const handleUpdateWidget = useCallback(
    async (
      instance: WidgetInstance,
      expected: WidgetInstance
    ): Promise<string | null> => {
      try {
        return await withHomeLayoutLock(() => {
          const latest = readHomeLayout()
          const next = updateWidgetInstanceIfUnchanged(
            latest,
            expected,
            instance
          )
          if (!next) {
            setLayout(latest)
            return "组件已在其他页面被修改或移除，请重新打开后再编辑"
          }
          saveHomeLayout(next)
          setLayout(next)
          return null
        })
      } catch (error) {
        return error instanceof Error ? error.message : "保存组件失败"
      }
    },
    [setLayout]
  )

  const handleDuplicateWidget = useCallback(
    (instance: WidgetInstance) => {
      void commitLayout(current => {
        const result = addWidgetInstance(current, instance.type, {
          size: instance.size,
          config: instance.config,
        })
        return result?.state ?? current
      })
      setSettingsInstanceId(null)
    },
    [commitLayout]
  )

  const handleAddBookmark = useCallback(
    (item: LaterReadItem, groupTitle: string) => {
      void withHomeLayoutLock(() => {
        const current = Links.getWithFallback()
        if (
          current.some(group =>
            group.links.some(link => link.value === item.url)
          )
        ) {
          setLinkGroups(current)
          return
        }
        const groupExists = current.some(group => group.title === groupTitle)
        const next = groupExists
          ? current.map(group =>
              group.title === groupTitle
                ? {
                    ...group,
                    links: [
                      ...group.links,
                      { label: item.title, value: item.url },
                    ],
                  }
                : group
            )
          : [
              ...current,
              {
                title: groupTitle || "稍后阅读",
                links: [{ label: item.title, value: item.url }],
              },
            ]
        Links.set(next)
        setLinkGroups(next)
      })
    },
    [setLinkGroups]
  )

  const confirmDelete = useCallback(() => {
    if (!deleteTarget) return
    const target = deleteTarget
    setDeleteTarget(null)
    void withHomeLayoutLock(() => {
      const previous = Links.getWithFallback()
      const groups = previous
        .map((group, groupIndex) => ({
          ...group,
          links:
            target.groupIndex === groupIndex &&
            target.linkIndex !== undefined &&
            group.links[target.linkIndex]?.value === target.url
              ? group.links.filter(
                  (_link, linkIndex) => linkIndex !== target.linkIndex
                )
              : target.groupIndex === undefined
                ? group.links.filter(link => link.value !== target.url)
                : group.links,
        }))
        .filter(group => group.links.length > 0)
      Links.set(groups)
      setLinkGroups(groups)
      return { previous, groups }
    }).then(({ previous, groups }) => {
      showUndo(`已删除${target.label}`, () => {
        void withHomeLayoutLock(() => {
          const current = Links.getWithFallback()
          if (JSON.stringify(current) !== JSON.stringify(groups)) {
            setLinkGroups(current)
            setMovePageNotice(
              "链接已在其他页面更新，为避免覆盖新内容，本次未撤销"
            )
            return
          }
          Links.set(previous)
          setLinkGroups(previous)
        })
      })
    })
  }, [deleteTarget, setLinkGroups, showUndo])

  const requestLinkRemoval = useCallback((url: string, label: string) => {
    setDeleteTarget({ url, label })
  }, [])

  // 命令面板删除入口复用同一确认
  const requestDeleteFromPalette = useCallback(
    (groupIndex: number, linkIndex: number) => {
      const target = linkGroups[groupIndex]?.links[linkIndex]
      if (
        target &&
        typeof target.value === "string" &&
        typeof target.label === "string"
      ) {
        setDeleteTarget({
          url: target.value,
          label: target.label,
          groupIndex,
          linkIndex,
        })
      }
    },
    [linkGroups]
  )

  return (
    <>
      <DndContext
        sensors={sensors}
        accessibility={{
          screenReaderInstructions: HOME_SCREEN_READER_INSTRUCTIONS,
        }}
        collisionDetection={detectHomeCollision}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext
          items={(pages[currentPage] ?? []).map(item => item.id)}
          strategy={noHomeItemTransform}
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
              onPointerDownCapture={handlePointerDown}
              onPointerUp={event => finishPageDrag(event)}
              onPointerCancel={event => finishPageDrag(event, true)}
              onPointerMove={handlePointerMove}
              onPointerLeave={event => {
                // Layout can shift while asynchronous widget data arrives.
                // Do not cancel a stationary long-press merely because the
                // viewport moved under the pointer; cancel only when the
                // pointer is actually outside its current bounds.
                const bounds = event.currentTarget.getBoundingClientRect()
                if (
                  event.clientX < bounds.left ||
                  event.clientX > bounds.right ||
                  event.clientY < bounds.top ||
                  event.clientY > bounds.bottom
                ) {
                  cancelLongPress()
                }
              }}
              onClickCapture={handlePageClickCapture}
              onDragStart={event => event.preventDefault()}
              onWheel={handleWheel}
            >
              <PageTrack ref={pageTrackRef} data-home-page-track="true">
                {dragPageProjection.frames.map(
                  ({ canonicalItems: pageItems, previewItems }, pageIndex) => {
                    const previewIndexById = previewItems
                      ? new Map(
                          previewItems.map((item, index) => [item.id, index])
                        )
                      : null
                    const canonicalIds = new Set(pageItems.map(item => item.id))
                    const previewSlots = previewItems
                      ? previewItems.filter(item => !canonicalIds.has(item.id))
                      : []
                    const mounted =
                      mountedPageIndices.has(pageIndex) ||
                      Math.abs(pageIndex - currentPage) <= 1

                    return (
                      <PageGrid
                        key={`page-${pageIndex}`}
                        columns={gridMetrics.columns}
                        rows={gridMetrics.rows}
                        data-home-page-grid="true"
                        data-home-page-index={pageIndex}
                        aria-hidden={pageIndex !== currentPage}
                        {...(pageIndex !== currentPage ? { inert: "" } : {})}
                      >
                        {mounted &&
                          pageIndex === currentPage &&
                          pageItems.length === 0 &&
                          (!previewItems || previewItems.length === 0) && (
                            <EmptyHome data-home-edit-control>
                              <h3>这一页还是空的</h3>
                              <p>
                                可以从右上角设置导入或添加标签，也可以先放入一个已有小组件。
                              </p>
                              <EmptyHomeAction
                                type="button"
                                onPointerDown={event => event.stopPropagation()}
                                onClick={() => setGalleryOpen(true)}
                              >
                                添加小组件
                              </EmptyHomeAction>
                            </EmptyHome>
                          )}
                        {mounted &&
                          pageItems.map(item => {
                            const index = itemIndexById.get(item.id) ?? 0
                            return (
                              <SortableItem
                                key={item.id}
                                item={item}
                                index={index}
                                editMode={editMode}
                                settled={settled}
                                gridMetrics={gridMetrics}
                                active={pageIndex === currentPage}
                                visibleAppUrls={
                                  visibleAppUrlsByPage[pageIndex] ?? []
                                }
                                onOpen={handleOpen}
                                onRemove={handleRemove}
                                onConfigure={instance =>
                                  setSettingsInstanceId(instance.instanceId)
                                }
                                onUpdateWidget={async (instance, expected) => {
                                  if (item.kind !== "widget") {
                                    return "应用图标不能保存为小组件"
                                  }
                                  const error = await handleUpdateWidget(
                                    instance,
                                    expected ?? item.widget
                                  )
                                  if (error) setMovePageNotice(error)
                                  return error
                                }}
                                onAddBookmark={handleAddBookmark}
                                onUndoableAction={showUndo}
                                linkGroups={linkGroups}
                                onRequestLinkRemoval={requestLinkRemoval}
                                pageIndex={pageIndex}
                                totalPages={navigationPageCount}
                                onMovePage={handleMovePage}
                                dropPosition={
                                  dropIntent?.overId === item.id
                                    ? dropIntent.position
                                    : null
                                }
                                previewOrder={
                                  previewIndexById?.get(item.id) ?? null
                                }
                                previewHidden={
                                  !!previewIndexById &&
                                  !previewIndexById.has(item.id)
                                }
                              />
                            )
                          })}
                        {mounted &&
                          previewSlots.map(item => {
                            const span = cellSpan(item, gridMetrics)
                            return (
                              <DragPreviewSlot
                                key={`preview-slot:${item.id}`}
                                data-home-preview-slot-id={item.id}
                                data-home-preview-slot-active={
                                  activeDragIdRef.current === item.id
                                    ? "true"
                                    : undefined
                                }
                                col={span.col}
                                row={span.row}
                                previewOrder={
                                  previewIndexById?.get(item.id) ?? 0
                                }
                                kind={item.kind}
                                aria-hidden="true"
                                {...{ inert: "" }}
                              />
                            )
                          })}
                      </PageGrid>
                    )
                  }
                )}
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
                第 {currentPage + 1} 页，共 {navigationPageCount} 页
              </PagePosition>
              {!editMode && (
                <PageEditButton
                  type="button"
                  aria-label="编辑主页"
                  title="编辑主页"
                  data-home-edit-control
                  onClick={() => setEditMode(true)}
                >
                  <FontAwesomeIcon icon={faPen} />
                </PageEditButton>
              )}
            </PageDots>
          </HomePager>
        </SortableContext>
        <DragOverlay
          dropAnimation={null}
          zIndex={1000}
          style={{ pointerEvents: "none" }}
        >
          {dragSnapshot && (
            <DragPreview
              data-home-drag-overlay="true"
              data-home-drag-overlay-id={dragSnapshot.id}
              aria-hidden="true"
              {...{ inert: "" }}
            >
              {dragSnapshot.kind === "app" ? (
                <AppEntry>
                  <AppIconBox
                    style={
                      {
                        "--tile-hue": String(dragSnapshot.hue),
                      } as React.CSSProperties
                    }
                  >
                    <DragAppGlyph>
                      {Array.from(dragSnapshot.label.trim())[0] ?? "•"}
                    </DragAppGlyph>
                  </AppIconBox>
                  <AppLabel>{dragSnapshot.label}</AppLabel>
                </AppEntry>
              ) : (
                <DragWidgetCard>
                  <DragWidgetHeader>{dragSnapshot.label}</DragWidgetHeader>
                  <DragWidgetBody />
                </DragWidgetCard>
              )}
            </DragPreview>
          )}
        </DragOverlay>
      </DndContext>

      {editMode && (
        <EditToolbar data-home-edit-control>
          <EditToolButton
            type="button"
            onPointerDown={event => {
              event.stopPropagation()
              setGalleryOpen(true)
            }}
            onClick={() => setGalleryOpen(true)}
          >
            <FontAwesomeIcon icon={faPlus} />
            组件
          </EditToolButton>
          <EditToolButton
            type="button"
            onPointerDown={event => {
              event.stopPropagation()
              setOverviewOpen(true)
            }}
            onClick={() => setOverviewOpen(true)}
          >
            <FontAwesomeIcon icon={faTableCellsLarge} />
            总览
          </EditToolButton>
          <DoneButton type="button" onClick={() => setEditMode(false)}>
            <FontAwesomeIcon icon={faCheck} />
            完成
          </DoneButton>
        </EditToolbar>
      )}

      {galleryOpen && (
        <WidgetGallery
          counts={widgetCounts}
          onClose={() => setGalleryOpen(false)}
          onAdd={handleAddWidget}
        />
      )}

      {settingsInstance && (
        <WidgetSettings
          instance={settingsInstance}
          currentPage={Math.max(
            0,
            pages.findIndex(pageItems =>
              pageItems.some(item => item.id === settingsInstance.instanceId)
            )
          )}
          pageCount={pages.length}
          onClose={() => setSettingsInstanceId(null)}
          onSave={handleUpdateWidget}
          onRemove={() => {
            const item = items.find(
              candidate => candidate.id === settingsInstance.instanceId
            )
            if (item) handleRemove(item)
          }}
          onDuplicate={() => handleDuplicateWidget(settingsInstance)}
          onMovePage={page =>
            void moveItemToPage(settingsInstance.instanceId, page)
          }
          onUndoableAction={showUndo}
        />
      )}

      {overviewOpen && (
        <HomeOverview
          pages={pages}
          currentPage={currentPage}
          onClose={() => setOverviewOpen(false)}
          onNavigate={page => {
            setAnimatePage(false)
            setCurrentPage(page)
            setOverviewOpen(false)
          }}
          onMoveItem={moveItemToPage}
        />
      )}

      {undoAction && (
        <UndoToast role="status">
          <span>{undoAction.message}</span>
          <UndoButton type="button" onClick={undoAction.undo}>
            撤销
          </UndoButton>
        </UndoToast>
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
