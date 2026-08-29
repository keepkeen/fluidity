import { HomeItem } from "./homeLayout"

export interface HomeGridMetrics {
  columns: number
  rows: number
}

export type HomeDropPosition = "before" | "after"

/**
 * 按稳定的相对落点移动主页条目。先移除 active 再定位 over，使同一个
 * before/after 意图无论重复应用多少次都得到相同顺序。
 */
export const moveHomeItemRelative = (
  order: string[],
  activeId: string,
  overId: string,
  position: HomeDropPosition
): string[] => {
  const activeIndex = order.indexOf(activeId)
  const overIndex = order.indexOf(overId)
  if (activeId === overId || activeIndex < 0 || overIndex < 0) return order

  const next = [...order]
  next.splice(activeIndex, 1)
  const remainingOverIndex = next.indexOf(overId)
  next.splice(
    position === "before" ? remainingOverIndex : remainingOverIndex + 1,
    0,
    activeId
  )

  return next.every((id, index) => id === order[index]) ? order : next
}

/**
 * 只接受分页后仍能同时兑现目标页和 before/after 关系的落点。
 * 混合尺寸条目位于容量边界时，这两个约束可能无法同时满足；返回 null
 * 比静默把 before 反转成 after 更符合用户看到的落点标记。
 */
export const getOrderForRelativeDropOnPage = (
  items: HomeItem[],
  metrics: HomeGridMetrics,
  activeId: string,
  overId: string,
  position: HomeDropPosition,
  targetPage: number
): string[] | null => {
  if (targetPage < 0 || activeId === overId) return null
  const order = items.map(item => item.id)
  const candidateOrder = moveHomeItemRelative(
    order,
    activeId,
    overId,
    position
  )
  if (!candidateOrder.includes(activeId) || !candidateOrder.includes(overId)) {
    return null
  }

  const itemById = new Map(items.map(item => [item.id, item]))
  const candidateItems = candidateOrder.flatMap(id => {
    const item = itemById.get(id)
    return item ? [item] : []
  })
  const pages = paginateHomeItems(candidateItems, metrics)
  const activePage = pages.findIndex(pageItems =>
    pageItems.some(item => item.id === activeId)
  )
  const overPage = pages.findIndex(pageItems =>
    pageItems.some(item => item.id === overId)
  )

  return activePage === targetPage && overPage === targetPage
    ? candidateOrder
    : null
}

const MIN_COLUMNS = 3
const MAX_COLUMNS = 10
const MIN_ROWS = 3
const MAX_ROWS = 6
const GRID_GAP = 14
const DESKTOP_CELL = 96
const MOBILE_CELL = 80
const COMPACT_CELL = 88

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

export const getHomeGridMetrics = (
  width: number,
  height: number
): HomeGridMetrics => {
  const targetCell =
    width < 360 ? COMPACT_CELL : width <= 600 ? MOBILE_CELL : DESKTOP_CELL
  const columns = clamp(
    Math.floor((Math.max(width, 0) + GRID_GAP) / (targetCell + GRID_GAP)),
    MIN_COLUMNS,
    MAX_COLUMNS
  )
  const rows = clamp(
    Math.floor((Math.max(height, 0) + GRID_GAP) / (targetCell + GRID_GAP)),
    MIN_ROWS,
    MAX_ROWS
  )

  return {
    columns,
    rows,
  }
}

export const getHomeItemSpan = (
  item: HomeItem,
  metrics: HomeGridMetrics
): { columns: number; rows: number } => {
  if (item.kind === "app") return { columns: 1, rows: 1 }
  const requested =
    item.widget.size === "small"
      ? { columns: 1, rows: 1 }
      : item.widget.size === "wide"
        ? { columns: 2, rows: 1 }
        : item.widget.size === "medium"
          ? { columns: 2, rows: 2 }
          : { columns: 4, rows: 2 }
  return {
    columns: Math.min(metrics.columns, requested.columns),
    rows: Math.min(metrics.rows, requested.rows),
  }
}

const tryPlace = (
  occupied: boolean[][],
  span: { columns: number; rows: number },
  metrics: HomeGridMetrics
): boolean => {
  for (let row = 0; row <= metrics.rows - span.rows; row++) {
    for (let column = 0; column <= metrics.columns - span.columns; column++) {
      let available = true
      for (let y = row; y < row + span.rows && available; y++) {
        for (let x = column; x < column + span.columns; x++) {
          if (occupied[y][x]) {
            available = false
            break
          }
        }
      }
      if (!available) continue

      for (let y = row; y < row + span.rows; y++) {
        for (let x = column; x < column + span.columns; x++) {
          occupied[y][x] = true
        }
      }
      return true
    }
  }

  return false
}

const emptyPage = (metrics: HomeGridMetrics): boolean[][] =>
  Array.from({ length: metrics.rows }, () =>
    new Array<boolean>(metrics.columns).fill(false)
  )

/**
 * Packs the ordered home items into fixed viewport pages. Widgets occupy a
 * square block while apps occupy one cell; item order remains the persisted
 * global order and the final page is allowed to contain intentional whitespace.
 */
export const paginateHomeItems = (
  items: HomeItem[],
  metrics: HomeGridMetrics
): HomeItem[][] => {
  if (items.length === 0) return [[]]

  const pages: HomeItem[][] = [[]]
  let occupied = emptyPage(metrics)

  items.forEach(item => {
    const span = getHomeItemSpan(item, metrics)
    if (!tryPlace(occupied, span, metrics)) {
      pages.push([])
      occupied = emptyPage(metrics)
      // Responsive metrics always fit built-in widgets; retain an item even if
      // future widget sizes exceed a page so data never disappears.
      void tryPlace(occupied, span, metrics)
    }
    pages[pages.length - 1].push(item)
  })

  return pages
}

/**
 * Finds the least disruptive insertion point that actually places an item on
 * the requested page after the two-dimensional packing algorithm runs.
 */
export const getOrderForItemOnPage = (
  items: HomeItem[],
  metrics: HomeGridMetrics,
  itemId: string,
  targetPage: number
): string[] | null => {
  const item = items.find(candidate => candidate.id === itemId)
  const currentIndex = items.findIndex(candidate => candidate.id === itemId)
  if (!item || currentIndex < 0 || targetPage < 0) return null

  const remaining = items.filter(candidate => candidate.id !== itemId)
  let best: { order: string[]; distance: number } | null = null

  for (let insertionIndex = 0; insertionIndex <= remaining.length; insertionIndex++) {
    const candidate = [...remaining]
    candidate.splice(insertionIndex, 0, item)
    const pageIndex = paginateHomeItems(candidate, metrics).findIndex(pageItems =>
      pageItems.some(pageItem => pageItem.id === itemId)
    )
    if (pageIndex !== targetPage) continue

    const distance = Math.abs(insertionIndex - currentIndex)
    if (!best || distance < best.distance) {
      best = {
        order: candidate.map(candidateItem => candidateItem.id),
        distance,
      }
    }
  }

  return best?.order ?? null
}

export const getVisiblePageIndices = (
  totalPages: number,
  currentPage: number,
  maximum = 7
): number[] => {
  if (totalPages <= maximum) {
    return Array.from({ length: totalPages }, (_, index) => index)
  }

  const visible = new Set([0, totalPages - 1, currentPage])
  let distance = 1
  while (visible.size < maximum) {
    const before = currentPage - distance
    const after = currentPage + distance
    if (before > 0) visible.add(before)
    if (visible.size < maximum && after < totalPages - 1) visible.add(after)
    if (before <= 0 && after >= totalPages - 1) break
    distance++
  }

  return [...visible].sort((a, b) => a - b)
}
