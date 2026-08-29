import { describe, expect, it, vi } from "vitest"

import { isVisibleModalFocusTarget } from "./Modal"

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
