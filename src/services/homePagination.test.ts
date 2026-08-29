import { describe, expect, it } from "vitest"

import { HomeItem } from "./homeLayout"
import {
  getHomeGridMetrics,
  getOrderForItemOnPage,
  getVisiblePageIndices,
  paginateHomeItems,
} from "./homePagination"
import { WidgetSize } from "./widgetRegistry"

const widget = (id: string, size: WidgetSize = "medium"): HomeItem => ({
  kind: "widget",
  id,
  widget: {
    instanceId: id,
    type: "read-later",
    size,
    config: {},
  },
})
const app = (id: string): HomeItem => ({
  kind: "app",
  id,
  url: `https://${id}.example.com`,
  label: id,
  groupTitle: "测试",
})

describe("getHomeGridMetrics", () => {
  it("uses compact 2x2 widgets on narrow screens", () => {
    expect(getHomeGridMetrics(390, 440)).toEqual({
      columns: 4,
      rows: 4,
    })
  })

  it("expands the grid while keeping a bounded page", () => {
    expect(getHomeGridMetrics(1040, 590)).toEqual({
      columns: 9,
      rows: 5,
    })
  })

  it("reduces the grid on a short narrow viewport instead of shrinking tiles", () => {
    expect(getHomeGridMetrics(320, 360)).toEqual({
      columns: 3,
      rows: 3,
    })
  })
})

describe("paginateHomeItems", () => {
  it("accounts for widget area instead of slicing by item count", () => {
    const metrics = { columns: 4, rows: 4 }
    const items = [widget("one"), widget("two"), ...Array.from({ length: 9 }, (_, i) => app(`a${i}`))]
    const pages = paginateHomeItems(items, metrics)

    expect(pages).toHaveLength(2)
    expect(pages[0]).toHaveLength(10)
    expect(pages.flat().map(item => item.id)).toEqual(items.map(item => item.id))
  })

  it("returns one empty page for an empty home", () => {
    expect(
      paginateHomeItems([], { columns: 4, rows: 4 })
    ).toEqual([[]])
  })
})

describe("getOrderForItemOnPage", () => {
  it("verifies the packed destination instead of filling an earlier page gap", () => {
    const metrics = { columns: 3, rows: 3 }
    const items = [
      widget("w1"),
      widget("w2"),
      ...Array.from({ length: 6 }, (_, index) => app(`a${index}`)),
    ]
    expect(paginateHomeItems(items, metrics).map(page => page.map(i => i.id))).toEqual([
      ["w1"],
      ["w2", "a0", "a1", "a2", "a3", "a4"],
      ["a5"],
    ])

    const order = getOrderForItemOnPage(items, metrics, "a5", 1)
    expect(order).not.toBeNull()
    const reordered = order!.map(id => items.find(item => item.id === id)!)
    const destination = paginateHomeItems(reordered, metrics).findIndex(page =>
      page.some(item => item.id === "a5")
    )
    expect(destination).toBe(1)
  })

  it("packs semantic wide and large sizes and clamps large widgets on narrow pages", () => {
    const desktop = { columns: 6, rows: 3 }
    const items = [widget("wide", "wide"), widget("large", "large")]
    expect(paginateHomeItems(items, desktop)).toHaveLength(1)

    const narrow = { columns: 3, rows: 3 }
    expect(paginateHomeItems([widget("large", "large")], narrow)).toEqual([
      [widget("large", "large")],
    ])
  })
})

describe("getVisiblePageIndices", () => {
  it("keeps long page lists compact around the current page", () => {
    expect(getVisiblePageIndices(30, 14)).toEqual([0, 12, 13, 14, 15, 16, 29])
  })
})
