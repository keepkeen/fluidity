import { describe, expect, it } from "vitest"

import {
  getHomePointerActivationConstraint,
  shouldActivateHomePointerDrag,
  shouldReservePointerForHomeItemDrag,
} from "./HomeGrid"

const pointer = (
  target: Element,
  pointerType: "mouse" | "touch"
) => ({
  isPrimary: true,
  button: 0,
  pointerType,
  target,
})

describe("home pointer drag arbitration", () => {
  it("keeps the first touch sequence for entering edit mode", () => {
    const home = document.createElement("div")
    home.dataset.homeEditing = "false"
    const widgetBody = document.createElement("div")
    home.append(widgetBody)

    expect(shouldActivateHomePointerDrag(pointer(widgetBody, "touch"))).toBe(
      false
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

    expect(shouldReservePointerForHomeItemDrag(icon, "mouse", false)).toBe(
      true
    )
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
    expect(
      getHomePointerActivationConstraint(widget, "mouse", false)
    ).toEqual({ delay: 220, tolerance: 8 })
    expect(getHomePointerActivationConstraint(label, "mouse", false)).toEqual({
      delay: 220,
      tolerance: 8,
    })
    expect(getHomePointerActivationConstraint(widget, "mouse", true)).toEqual(
      { distance: 4 }
    )
  })
})
