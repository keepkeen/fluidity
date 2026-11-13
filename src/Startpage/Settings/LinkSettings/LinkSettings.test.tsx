import React, { act } from "react"
import { createRoot, Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  organizeLinks: vi.fn(),
  organizeHome: vi.fn(),
  persistedAI: {
    enabled: true,
    greetingEnabled: true,
    apiKey: "sk-test",
    apiBaseUrl: "https://provider.example/v1",
    model: "model-test",
    collectLinkClicks: true,
    shareHabits: true,
  },
}))

vi.mock("./LinkGroupEditor", () => ({ LinkGroupEditor: () => null }))
vi.mock("./OptionTextArea", () => ({ OptionTextArea: () => null }))
vi.mock("../../../services/bookmarkImport", () => ({
  importBookmarksAsLinkGroups: vi.fn(),
  isBookmarkImportSupported: () => false,
}))
vi.mock("../../../services/analytics", () => ({
  LinkAnalytics: { get: () => ({}) },
}))
vi.mock("../../../services/homeLayout", () => ({
  HOME_LAYOUT_KEY: "fluidity.homeLayout.v2",
  readHomeLayout: () => ({ order: ["app:https://example.com"] }),
  saveHomeLayout: vi.fn(),
}))
vi.mock("../../../services/ai", () => ({
  AISettingsManager: {
    get: () => ({ ...mocks.persistedAI }),
  },
}))
vi.mock("../../../services/linkOrganizer", () => ({
  getOrganizeStatus: () => "idle",
  organizeLinksWithAI: mocks.organizeLinks,
  subscribeOrganizeStatus: () => () => undefined,
}))
vi.mock("../../../services/homeOrderOrganizer", () => ({
  organizeHomeOrderWithAI: mocks.organizeHome,
  sortAppOrderByUsage: () => ["app:https://example.com"],
}))

import { LinkSettings } from "./LinkSettings"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const pendingUntilAborted = (signal: AbortSignal): Promise<never> =>
  new Promise((_resolve, reject) => {
    signal.addEventListener(
      "abort",
      () => reject(new DOMException("cancelled", "AbortError")),
      { once: true }
    )
  })

const findButton = (container: HTMLElement, label: string): HTMLButtonElement => {
  const button = [...container.querySelectorAll("button")].find(
    candidate => candidate.textContent?.trim() === label
  )
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Button not found: ${label}`)
  }
  return button
}

describe("LinkSettings AI request cancellation", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    mocks.organizeLinks.mockReset()
    mocks.organizeHome.mockReset()
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.restoreAllMocks()
  })

  it("aborts both organizer calls from the visible cancel button", async () => {
    let linkSignal: AbortSignal | undefined
    let homeSignal: AbortSignal | undefined
    mocks.organizeLinks.mockImplementation(
      (_groups, _instruction, options: { signal: AbortSignal }) => {
        linkSignal = options.signal
        return pendingUntilAborted(options.signal)
      }
    )
    mocks.organizeHome.mockImplementation(
      (_groups, _order, _analytics, options: { signal: AbortSignal }) => {
        homeSignal = options.signal
        return pendingUntilAborted(options.signal)
      }
    )
    const notifications = vi.fn()
    window.addEventListener("show-notification", notifications)

    await act(async () => {
      root.render(
        <LinkSettings
          linkGroups={[
            {
              title: "测试",
              links: [{ label: "示例", value: "https://example.com" }],
            },
          ]}
          setLinkGroups={vi.fn()}
          homeAppOrder={null}
          setHomeAppOrder={vi.fn()}
          homeLayoutOrder={["app:https://example.com"]}
          aiSettings={{
            enabled: true,
            greetingEnabled: true,
            apiKey: "sk-test",
            apiBaseUrl: "https://provider.example/v1",
            model: "model-test",
            cacheMinutes: 60,
            collectLinkClicks: true,
            collectSearchHistory: true,
            shareHabits: true,
            shareBrowserUsage: false,
          }}
          appliedRevision={0}
          onOrganizeBusyChange={vi.fn()}
        />
      )
    })
    await act(async () => {
      findButton(container, "AI 整理与排序").click()
    })
    await act(async () => {
      findButton(document.body, "生成整理草稿").click()
    })

    expect(linkSignal?.aborted).toBe(false)
    expect(homeSignal?.aborted).toBe(false)
    await act(async () => {
      findButton(document.body, "取消整理").click()
      await Promise.resolve()
    })

    expect(linkSignal?.aborted).toBe(true)
    expect(homeSignal?.aborted).toBe(true)
    expect(document.querySelector('[data-ai-organize-preview="true"]')).toBeNull()
    expect(
      [...document.querySelectorAll("button")].some(
        button => button.textContent?.trim() === "取消整理"
      )
    ).toBe(false)
    expect(notifications).not.toHaveBeenCalled()
    window.removeEventListener("show-notification", notifications)
  })

  it("blocks AI generation when the tested connection is still an unsaved draft", async () => {
    await act(async () => {
      root.render(
        <LinkSettings
          linkGroups={[
            {
              title: "测试",
              links: [{ label: "示例", value: "https://example.com" }],
            },
          ]}
          setLinkGroups={vi.fn()}
          homeAppOrder={null}
          setHomeAppOrder={vi.fn()}
          homeLayoutOrder={["app:https://example.com"]}
          aiSettings={{
            enabled: true,
            greetingEnabled: true,
            apiKey: "sk-new-unsaved",
            apiBaseUrl: "https://provider.example/v1",
            model: "model-test",
            cacheMinutes: 60,
            collectLinkClicks: true,
            collectSearchHistory: true,
            shareHabits: true,
            shareBrowserUsage: false,
          }}
          appliedRevision={0}
          onOrganizeBusyChange={vi.fn()}
        />
      )
    })
    await act(async () => findButton(container, "AI 整理与排序").click())

    expect(document.body.textContent).toContain("AI 连接配置尚未应用")
    expect(findButton(document.body, "生成整理草稿").disabled).toBe(true)
    expect(mocks.organizeLinks).not.toHaveBeenCalled()
    expect(mocks.organizeHome).not.toHaveBeenCalled()
  })

  it("rejects an AI result when its source draft changed while awaiting", async () => {
    let resolveLinks: ((groups: unknown) => void) | undefined
    let resolveHome: ((result: unknown) => void) | undefined
    mocks.organizeLinks.mockImplementation(
      () => new Promise(resolve => (resolveLinks = resolve))
    )
    mocks.organizeHome.mockImplementation(
      () => new Promise(resolve => (resolveHome = resolve))
    )
    const notifications: CustomEvent[] = []
    const onNotification = (event: Event) =>
      notifications.push(event as CustomEvent)
    window.addEventListener("show-notification", onNotification)

    const renderWithLabel = async (label: string) => {
      await act(async () => {
        root.render(
          <LinkSettings
            linkGroups={[
              {
                title: "测试",
                links: [{ label, value: "https://example.com" }],
              },
            ]}
            setLinkGroups={vi.fn()}
            homeAppOrder={null}
            setHomeAppOrder={vi.fn()}
            homeLayoutOrder={["app:https://example.com"]}
            aiSettings={{
              enabled: true,
              greetingEnabled: true,
              apiKey: "sk-test",
              apiBaseUrl: "https://provider.example/v1",
              model: "model-test",
              cacheMinutes: 60,
              collectLinkClicks: true,
              collectSearchHistory: true,
              shareHabits: true,
              shareBrowserUsage: false,
            }}
            appliedRevision={0}
            onOrganizeBusyChange={vi.fn()}
          />
        )
      })
    }

    await renderWithLabel("示例")
    await act(async () => findButton(container, "AI 整理与排序").click())
    await act(async () => findButton(document.body, "生成整理草稿").click())
    await renderWithLabel("等待期间的新名称")
    await act(async () => {
      resolveLinks?.([
        {
          title: "AI",
          links: [{ label: "旧结果", value: "https://example.com" }],
        },
      ])
      resolveHome?.({
        orderedAppIds: ["app:https://example.com"],
        summary: "done",
      })
      await Promise.resolve()
    })

    expect(document.querySelector('[data-ai-organize-preview="true"]')).toBeNull()
    expect(notifications.at(-1)?.detail.title).toBe("整理结果已过期")
    window.removeEventListener("show-notification", onNotification)
  })
})
