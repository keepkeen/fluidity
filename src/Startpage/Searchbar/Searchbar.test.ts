import { describe, expect, it } from "vitest"

import { isSpaceActivationTarget } from "./Searchbar"

describe("global search typing target detection", () => {
  it("preserves Space activation for native and ARIA controls", () => {
    const button = document.createElement("button")
    const buttonIcon = document.createElement("span")
    button.append(buttonIcon)

    const roleButton = document.createElement("div")
    roleButton.setAttribute("role", "button")
    const roleButtonLabel = document.createElement("span")
    roleButton.append(roleButtonLabel)

    expect(isSpaceActivationTarget(buttonIcon)).toBe(true)
    expect(isSpaceActivationTarget(roleButtonLabel)).toBe(true)
  })

  it("allows Space to start search from non-interactive content", () => {
    expect(isSpaceActivationTarget(document.createElement("div"))).toBe(false)
    expect(isSpaceActivationTarget(null)).toBe(false)
  })
})
