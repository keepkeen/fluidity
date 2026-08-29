import { describe, expect, it } from "vitest"

import { shouldActivateHomePointerDrag } from "./HomeGrid"

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
})
