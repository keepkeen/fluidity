import { describe, expect, it, vi } from "vitest"

import {
  isTopmostModal,
  isVisibleModalFocusTarget,
  syncModalAccessibility,
} from "./Modal"

describe("modal focus target visibility", () => {
  it("keeps visible controls in the focus loop", () => {
    const button = document.createElement("button")
    document.body.append(button)
    vi.spyOn(button, "getClientRects").mockReturnValue({
      length: 1,
    } as DOMRectList)

    expect(isVisibleModalFocusTarget(button)).toBe(true)
    button.remove()
  })

  it("excludes controls hidden by modal state or layout", () => {
    const hiddenRegion = document.createElement("div")
    hiddenRegion.setAttribute("aria-hidden", "true")
    const button = document.createElement("button")
    hiddenRegion.append(button)
    document.body.append(hiddenRegion)
    const getClientRects = vi
      .spyOn(button, "getClientRects")
      .mockReturnValue({ length: 1 } as DOMRectList)

    expect(isVisibleModalFocusTarget(button)).toBe(false)

    hiddenRegion.removeAttribute("aria-hidden")
    hiddenRegion.setAttribute("inert", "")
    expect(isVisibleModalFocusTarget(button)).toBe(false)

    hiddenRegion.removeAttribute("inert")
    getClientRects.mockReturnValue({ length: 0 } as DOMRectList)
    expect(isVisibleModalFocusTarget(button)).toBe(false)
    hiddenRegion.remove()
  })
})

describe("nested modal focus ownership", () => {
  it("only lets the most recently mounted dialog trap focus", () => {
    const parent = document.createElement("div")
    const child = document.createElement("div")
    parent.dataset.fluidityModalDialog = "true"
    child.dataset.fluidityModalDialog = "true"
    document.body.append(parent, child)

    expect(isTopmostModal(parent)).toBe(false)
    expect(isTopmostModal(child)).toBe(true)

    child.remove()
    expect(isTopmostModal(parent)).toBe(true)
    parent.remove()
  })

  it("makes every background dialog inert and restores it on child removal", () => {
    const parent = document.createElement("div")
    const child = document.createElement("div")
    parent.dataset.fluidityModalDialog = "true"
    child.dataset.fluidityModalDialog = "true"
    document.body.append(parent, child)

    syncModalAccessibility()
    expect(parent.getAttribute("aria-hidden")).toBe("true")
    expect(parent.hasAttribute("inert")).toBe(true)
    expect(child.hasAttribute("aria-hidden")).toBe(false)
    expect(child.hasAttribute("inert")).toBe(false)

    syncModalAccessibility(child)
    child.remove()
    expect(parent.hasAttribute("aria-hidden")).toBe(false)
    expect(parent.hasAttribute("inert")).toBe(false)
    parent.remove()
  })

  it("restores pre-existing accessibility attributes exactly", () => {
    const parent = document.createElement("div")
    const child = document.createElement("div")
    parent.dataset.fluidityModalDialog = "true"
    child.dataset.fluidityModalDialog = "true"
    parent.setAttribute("aria-hidden", "false")
    parent.setAttribute("inert", "")
    document.body.append(parent, child)

    syncModalAccessibility()
    syncModalAccessibility(child)
    child.remove()
    expect(parent.getAttribute("aria-hidden")).toBe("false")
    expect(parent.hasAttribute("inert")).toBe(true)
    parent.remove()
  })
})
