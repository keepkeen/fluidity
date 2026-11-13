import { saveHomeOrderIfUnchanged } from "./useHomePersistence"
import { describe, expect, it } from "vitest"

import { HOME_LAYOUT_KEY, HomeLayoutState } from "../../services/homeLayout"
import {
  getHomePointerActivationConstraint,
  HOME_SCREEN_READER_INSTRUCTIONS,
  projectHomeDragPages,
  shouldActivateHomePointerDrag,
  shouldActivateHomeTouchDrag,
  shouldCaptureHomeGestureFromTarget,
  shouldHandleHomePageArrowKey,
  shouldReservePointerForHomeItemDrag,
} from "./homeInteraction"

const pointer = (target: Element, pointerType: "mouse" | "touch") => ({
  isPrimary: true,
  button: 0,
  pointerType,
  target,
})

describe("home pointer drag arbitration", () => {
  it("keeps widget controls out of item DnD while allowing page gestures", () => {
    const widget = document.createElement("div")
    const button = document.createElement("button")
    const link = document.createElement("a")
    const interactive = document.createElement("div")
    interactive.dataset.widgetInteractive = "true"
    const interactiveChild = document.createElement("span")
    interactive.append(interactiveChild)
    widget.append(button, link, interactive)

    for (const target of [button, link, interactiveChild]) {
      expect(shouldCaptureHomeGestureFromTarget(target, "item-drag")).toBe(
        false
      )
      expect(shouldCaptureHomeGestureFromTarget(target, "page")).toBe(true)
      expect(shouldActivateHomePointerDrag(pointer(target, "mouse"))).toBe(
        false
      )
      expect(
        shouldActivateHomeTouchDrag({
          target,
          touches: [{ identifier: 1 }] as unknown as TouchList,
        })
      ).toBe(false)
    }
  })

  it("keeps app tiles and explicit handles available to item dragging", () => {
    const appTile = document.createElement("button")
    appTile.dataset.homeAppTile = "true"
    const dragHandle = document.createElement("button")
    dragHandle.dataset.homeDragHandle = "true"

    expect(shouldCaptureHomeGestureFromTarget(appTile, "item-drag")).toBe(true)
    expect(shouldCaptureHomeGestureFromTarget(appTile, "page")).toBe(true)
    expect(shouldCaptureHomeGestureFromTarget(dragHandle, "item-drag")).toBe(
      true
    )
    expect(shouldCaptureHomeGestureFromTarget(dragHandle, "page")).toBe(false)
  })

  it("lets the first touch long-press continue into dragging", () => {
    const home = document.createElement("div")
    home.dataset.homeEditing = "false"
    const widgetBody = document.createElement("div")
    home.append(widgetBody)

    expect(shouldActivateHomePointerDrag(pointer(widgetBody, "touch"))).toBe(
      true
    )
  })

  it("allows the next touch sequence on the edit drag surface", () => {
    const home = document.createElement("div")
    home.dataset.homeEditing = "true"
    const editSurface = document.createElement("div")
    editSurface.dataset.homeWidgetEditSurface = "true"
    home.append(editSurface)

    expect(shouldActivateHomePointerDrag(pointer(editSurface, "touch"))).toBe(
      true
    )
  })

  it("uses a touch sensor that can prevent scrolling after long-press activation", () => {
    const home = document.createElement("div")
    const widgetBody = document.createElement("div")
    home.append(widgetBody)

    expect(
      shouldActivateHomeTouchDrag({
        target: widgetBody,
        touches: [{ identifier: 1 }] as unknown as TouchList,
      })
    ).toBe(true)
    expect(
      shouldActivateHomeTouchDrag({
        target: widgetBody,
        touches: [{ identifier: 1 }, { identifier: 2 }] as unknown as TouchList,
      })
    ).toBe(false)
  })

  it("preserves same-sequence mouse drag activation", () => {
    const home = document.createElement("div")
    home.dataset.homeEditing = "false"
    const widgetBody = document.createElement("div")
    home.append(widgetBody)

    expect(shouldActivateHomePointerDrag(pointer(widgetBody, "mouse"))).toBe(
      true
    )
  })

  it("reserves mouse gestures that start on an app for item dragging", () => {
    const app = document.createElement("div")
    app.dataset.homeItemKind = "app"
    const icon = document.createElement("button")
    icon.dataset.homeAppTile = "true"
    app.append(icon)

    expect(shouldReservePointerForHomeItemDrag(icon, "mouse", false)).toBe(true)
  })

  it("keeps blank-space mouse gestures and first-touch app gestures for paging", () => {
    const blank = document.createElement("div")
    const app = document.createElement("div")
    app.dataset.homeItemKind = "app"
    const icon = document.createElement("button")
    icon.dataset.homeAppTile = "true"
    const label = document.createElement("span")
    app.append(icon)
    app.append(label)

    expect(shouldReservePointerForHomeItemDrag(blank, "mouse", false)).toBe(
      false
    )
    expect(shouldReservePointerForHomeItemDrag(icon, "touch", false)).toBe(
      false
    )
    expect(shouldReservePointerForHomeItemDrag(icon, "touch", true)).toBe(true)
    expect(shouldReservePointerForHomeItemDrag(label, "mouse", false)).toBe(
      false
    )
  })

  it("uses separate activation constraints for apps, widgets, and edit mode", () => {
    const app = document.createElement("div")
    app.dataset.homeItemKind = "app"
    const icon = document.createElement("button")
    icon.dataset.homeAppTile = "true"
    const label = document.createElement("span")
    app.append(icon)
    app.append(label)
    const widget = document.createElement("div")
    widget.dataset.homeItemKind = "widget"

    expect(getHomePointerActivationConstraint(icon, "mouse", false)).toEqual({
      distance: 8,
    })
    expect(getHomePointerActivationConstraint(widget, "mouse", false)).toEqual({
      delay: 220,
      tolerance: 8,
    })
    expect(getHomePointerActivationConstraint(label, "mouse", false)).toEqual({
      delay: 220,
      tolerance: 8,
    })
    expect(getHomePointerActivationConstraint(widget, "mouse", true)).toEqual({
      distance: 4,
    })
  })
})

describe("home drag accessibility instructions", () => {
  it("describes the pointer and implemented keyboard controls without Space", () => {
    const instructions = HOME_SCREEN_READER_INSTRUCTIONS.draggable

    expect(instructions).toContain("按住并拖动")
    expect(instructions).toContain("Control")
    expect(instructions).toContain("Command")
    expect(instructions).toContain("移至上一页")
    expect(instructions).not.toMatch(/Space|空格/i)
  })
})

describe("conditional home order persistence", () => {
  const layout = (
    order: string[],
    widgets: HomeLayoutState["widgets"] = {}
  ): HomeLayoutState => ({
    version: 2,
    order,
    widgets,
    pageShortcutModifier: "alt",
  })

  it("does not overwrite an order that changed in another tab", () => {
    localStorage.setItem(
      HOME_LAYOUT_KEY,
      JSON.stringify({
        version: 2,
        order: ["newer"],
        widgets: {},
        pageShortcutModifier: "alt",
      })
    )

    expect(saveHomeOrderIfUnchanged(layout(["stale"]), ["dragged"])).toBeNull()
    expect(
      JSON.parse(localStorage.getItem(HOME_LAYOUT_KEY) ?? "{}").order
    ).toEqual(["newer"])
  })

  it("writes when the persisted order still matches the drag snapshot", () => {
    localStorage.setItem(
      HOME_LAYOUT_KEY,
      JSON.stringify({
        version: 2,
        order: ["before"],
        widgets: {},
        pageShortcutModifier: "alt",
      })
    )

    expect(
      saveHomeOrderIfUnchanged(layout(["before"]), ["after", "before"])?.order
    ).toEqual(["after", "before"])
  })

  it("rejects an order computed before a widget size changed", () => {
    const before = layout(["widget:one"], {
      "widget:one": {
        instanceId: "widget:one",
        type: "rss",
        size: "small",
        config: {},
      },
    })
    const resized = layout(["widget:one"], {
      "widget:one": {
        ...before.widgets["widget:one"],
        size: "large",
      },
    })
    localStorage.setItem(HOME_LAYOUT_KEY, JSON.stringify(resized))

    expect(saveHomeOrderIfUnchanged(before, ["widget:one"])).toBeNull()
    expect(
      JSON.parse(localStorage.getItem(HOME_LAYOUT_KEY) ?? "{}").widgets[
        "widget:one"
      ].size
    ).toBe("large")
  })
})

describe("home drag page projection", () => {
  it("renders a newly added preview page and exposes it to drag navigation", () => {
    const projection = projectHomeDragPages(
      [["a", "b"], ["c"]],
      [["a"], ["b"], ["c"]]
    )

    expect(projection.navigationPageCount).toBe(3)
    expect(projection.frames).toEqual([
      { canonicalItems: ["a", "b"], previewItems: ["a"] },
      { canonicalItems: ["c"], previewItems: ["b"] },
      { canonicalItems: [], previewItems: ["c"] },
    ])
  })

  it("keeps a removed canonical page mounted but treats its preview as empty", () => {
    const projection = projectHomeDragPages(
      [["a"], ["b"], ["c"]],
      [["a", "b"], ["c"]]
    )

    expect(projection.navigationPageCount).toBe(3)
    expect(projection.frames).toHaveLength(3)
    expect(projection.frames[2]).toEqual({
      canonicalItems: ["c"],
      previewItems: [],
    })
  })

  it("restores canonical pages when a preview is cancelled", () => {
    const canonicalPages = [["a"], ["b"], ["c"]]
    const projection = projectHomeDragPages(canonicalPages, null)

    expect(projection.navigationPageCount).toBe(3)
    expect(projection.frames).toEqual(
      canonicalPages.map(canonicalItems => ({
        canonicalItems,
        previewItems: null,
      }))
    )
  })
})

describe("home keyboard page navigation scope", () => {
  it("handles bare arrows from the document body or the active page", () => {
    const page = document.createElement("section")
    page.dataset.homePageGrid = "true"
    page.dataset.homePageIndex = "2"
    const button = document.createElement("button")
    page.append(button)

    expect(shouldHandleHomePageArrowKey(document.body, 2)).toBe(true)
    expect(shouldHandleHomePageArrowKey(button, 2)).toBe(true)
  })

  it("does not hijack arrows from toolbars or inactive pages", () => {
    const toolbarButton = document.createElement("button")
    const inactivePage = document.createElement("section")
    inactivePage.dataset.homePageGrid = "true"
    inactivePage.dataset.homePageIndex = "1"
    const inactiveButton = document.createElement("button")
    inactivePage.append(inactiveButton)

    expect(shouldHandleHomePageArrowKey(toolbarButton, 2)).toBe(false)
    expect(shouldHandleHomePageArrowKey(inactiveButton, 2)).toBe(false)
  })
})
