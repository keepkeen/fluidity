import React, { act } from "react"
import { createRoot, Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SearchHistory } from "../../services/analytics"
import { emitSettingsApplied } from "../../services/settingsEvents"
import {
  getSuggestionIdentity,
  isSpaceActivationTarget,
  Searchbar,
} from "./Searchbar"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

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

describe("search suggestion identity", () => {
  it("keeps same-label links with different destinations distinct", () => {
    const first = getSuggestionIdentity({
      text: "文档",
      type: "quicklink",
      url: "https://first.example/docs",
    })
    const second = getSuggestionIdentity({
      text: "文档",
      type: "quicklink",
      url: "https://second.example/docs",
    })

    expect(first).not.toBe(second)
  })

  it("deduplicates analytics and bookmark suggestions for one destination", () => {
    const bookmark = getSuggestionIdentity({
      text: "不同的书签名称",
      type: "quicklink",
      url: "https://example.com/page#bookmark",
    })
    const analytics = getSuggestionIdentity({
      text: "旧名称",
      type: "link",
      url: "https://example.com/page#recent",
    })

    expect(bookmark).toBe(analytics)
  })
})

const groups = (label: string, url: string) => [
  {
    title: "开发",
    links: [{ label, value: url }],
  },
]

const setInputValue = async (
  input: HTMLInputElement,
  value: string
): Promise<void> => {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set
    setter?.call(input, value)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
}

describe("live search suggestions", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(async () => {
    localStorage.clear()
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))
    )
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    await act(async () => root.render(React.createElement(Searchbar)))
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("reads a real locally tracked search into the default suggestions", async () => {
    await act(async () => SearchHistory.trackSearch("fluidity history", "google"))
    const input = container.querySelector<HTMLInputElement>('[aria-label="搜索"]')
    if (!input) throw new Error("Search input not found")

    await act(async () => input.focus())

    expect(container.textContent).toContain("fluidity history")
    expect(container.textContent).toContain("最近搜索")
  })

  it("removes stale default history after another tab clears it", async () => {
    await act(async () => SearchHistory.trackSearch("跨标签历史", "google"))
    const input = container.querySelector<HTMLInputElement>('[aria-label="搜索"]')
    if (!input) throw new Error("Search input not found")

    await act(async () => input.focus())
    expect(container.textContent).toContain("跨标签历史")

    localStorage.removeItem("search-history")
    await act(async () => {
      window.dispatchEvent(new StorageEvent("storage", { key: "search-history" }))
    })

    expect(input.value).toBe("")
    expect(container.textContent).not.toContain("跨标签历史")
  })

  it("removes expanded history immediately when this page clears it", async () => {
    await act(async () => SearchHistory.trackSearch("同页历史", "google"))
    const input = container.querySelector<HTMLInputElement>('[aria-label="搜索"]')
    if (!input) throw new Error("Search input not found")

    await act(async () => input.focus())
    expect(container.textContent).toContain("同页历史")

    await act(async () => SearchHistory.clear())

    expect(input.value).toBe("")
    expect(container.textContent).not.toContain("同页历史")
  })

  it("refreshes the current query and engine UI after search settings change", async () => {
    const input = container.querySelector<HTMLInputElement>('[aria-label="搜索"]')
    if (!input) throw new Error("Search input not found")
    await act(async () => input.focus())
    await setInputValue(input, "实时快捷词")
    expect(container.querySelectorAll('[role="option"]')).toHaveLength(0)

    localStorage.setItem(
      "search-settings",
      JSON.stringify({
        engine: "example.search/?query={{query}}",
        placeholder: "新的搜索提示",
        fastForward: { "实时快捷词": "https://shortcut.example" },
        customEngines: [],
        openInNewTab: false,
      })
    )
    await act(async () => {
      window.dispatchEvent(new StorageEvent("storage", { key: "search-settings" }))
    })

    expect(input.value).toBe("实时快捷词")
    expect(input.placeholder).toBe("新的搜索提示")
    expect(container.textContent).toContain("实时快捷词")
    expect(container.textContent).toContain("快捷")
  })

  it("refreshes expanded default suggestions after cross-tab analytics changes", async () => {
    localStorage.setItem(
      "link-groups",
      JSON.stringify(groups("统计标签", "https://analytics.example"))
    )
    const input = container.querySelector<HTMLInputElement>('[aria-label="搜索"]')
    if (!input) throw new Error("Search input not found")
    await act(async () => input.focus())
    expect(container.textContent).not.toContain("统计标签")

    localStorage.setItem(
      "link-analytics",
      JSON.stringify({
        "https://analytics.example": {
          label: "统计标签",
          url: "https://analytics.example",
          group: "开发",
          clicks: 3,
          lastClicked: Date.now(),
          clickHistory: [Date.now()],
        },
      })
    )
    await act(async () => {
      window.dispatchEvent(new StorageEvent("storage", { key: "link-analytics" }))
    })

    expect(input.value).toBe("")
    expect(container.textContent).toContain("统计标签")
    expect(container.textContent).toContain("常用")
  })

  it("refreshes the same query after a cross-tab link-groups update", async () => {
    localStorage.setItem(
      "link-groups",
      JSON.stringify(groups("旧标签", "https://old.example"))
    )
    await act(async () => {
      window.dispatchEvent(new StorageEvent("storage", { key: "link-groups" }))
    })

    const input = container.querySelector<HTMLInputElement>('[aria-label="搜索"]')
    if (!input) throw new Error("Search input not found")
    await act(async () => input.focus())
    await setInputValue(input, "标签")
    expect(container.textContent).toContain("旧标签")

    localStorage.setItem(
      "link-groups",
      JSON.stringify(groups("新标签", "https://new.example"))
    )
    await act(async () => {
      window.dispatchEvent(new StorageEvent("storage", { key: "link-groups" }))
    })

    expect(input.value).toBe("标签")
    expect(container.textContent).toContain("新标签")
    expect(container.textContent).not.toContain("旧标签")
  })

  it("refreshes link suggestions when settings are applied", async () => {
    localStorage.setItem(
      "link-groups",
      JSON.stringify(groups("应用前标签", "https://before.example"))
    )
    await act(async () => emitSettingsApplied())

    const input = container.querySelector<HTMLInputElement>('[aria-label="搜索"]')
    if (!input) throw new Error("Search input not found")
    await act(async () => input.focus())
    await setInputValue(input, "标签")
    expect(container.textContent).toContain("应用前标签")

    localStorage.setItem(
      "link-groups",
      JSON.stringify(groups("应用后标签", "https://after.example"))
    )
    await act(async () => emitSettingsApplied())

    expect(container.textContent).toContain("应用后标签")
    expect(container.textContent).not.toContain("应用前标签")
  })

  it("uses newly applied link opening behavior without reloading", async () => {
    localStorage.setItem(
      "link-groups",
      JSON.stringify(groups("新窗口标签", "https://new-tab.example"))
    )
    await act(async () => emitSettingsApplied())

    const input = container.querySelector<HTMLInputElement>('[aria-label="搜索"]')
    if (!input) throw new Error("Search input not found")
    await act(async () => input.focus())
    await setInputValue(input, "/新窗口")
    expect(container.querySelector('[role="option"]')).not.toBeNull()

    localStorage.setItem(
      "link-display-settings",
      JSON.stringify({ mode: "grid", openInNewTab: true })
    )
    await act(async () => emitSettingsApplied())
    const suggestion = container.querySelector<HTMLElement>('[role="option"]')
    if (!suggestion) throw new Error("Link suggestion not found after apply")

    const open = vi.spyOn(window, "open").mockImplementation(() => null)
    await act(async () => {
      suggestion.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, cancelable: true })
      )
    })

    expect(open).toHaveBeenCalledWith(
      "https://new-tab.example",
      "_blank",
      "noopener,noreferrer"
    )
    open.mockRestore()
  })

  it("uses link opening behavior changed in another tab", async () => {
    localStorage.setItem(
      "link-groups",
      JSON.stringify(groups("跨标签打开", "https://cross-tab.example"))
    )
    await act(async () => {
      window.dispatchEvent(new StorageEvent("storage", { key: "link-groups" }))
    })

    const input = container.querySelector<HTMLInputElement>('[aria-label="搜索"]')
    if (!input) throw new Error("Search input not found")
    await act(async () => input.focus())
    await setInputValue(input, "/跨标签")

    localStorage.setItem(
      "link-display-settings",
      JSON.stringify({ mode: "grid", openInNewTab: true })
    )
    await act(async () => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: "link-display-settings" })
      )
    })
    const suggestion = container.querySelector<HTMLElement>('[role="option"]')
    if (!suggestion) throw new Error("Link suggestion not found")

    const open = vi.spyOn(window, "open").mockImplementation(() => null)
    await act(async () => {
      suggestion.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, cancelable: true })
      )
    })

    expect(open).toHaveBeenCalledWith(
      "https://cross-tab.example",
      "_blank",
      "noopener,noreferrer"
    )
    open.mockRestore()
  })
})
