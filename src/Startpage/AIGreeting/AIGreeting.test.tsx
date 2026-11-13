import React, { act } from "react"
import { createRoot, Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { AISettings } from "../../services/ai"

const aiState = vi.hoisted(() => ({
  settings: {
    enabled: false,
    greetingEnabled: false,
    apiKey: "",
    apiBaseUrl: "https://api.example.test/v1",
    model: "test-model",
    cacheMinutes: 60,
    collectLinkClicks: false,
    collectSearchHistory: true,
    shareHabits: false,
    shareBrowserUsage: false,
  } as AISettings,
}))

vi.mock("../../services/ai", () => ({
  AISettingsManager: {
    get: vi.fn(() => aiState.settings),
  },
  getAIGreeting: vi.fn(),
  getDefaultGreeting: vi.fn(() => "默认问候"),
  refreshAIGreeting: vi.fn(),
}))

vi.mock("../../services/dailyReview", () => ({
  DAILY_REVIEW_KEY: "fluidity.ai.dailyReview.v1",
  getDailyReview: vi.fn(async () => null),
}))

import { getAIGreeting } from "../../services/ai"
import { getDailyReview } from "../../services/dailyReview"
import { SETTINGS_APPLIED_EVENT } from "../../services/settingsEvents"
import { AIGreeting } from "./AIGreeting"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const configuredSettings = (): AISettings => ({
  ...aiState.settings,
  enabled: true,
  greetingEnabled: true,
  apiKey: "test-key",
})

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(next => {
    resolve = next
  })
  return { promise, resolve }
}

const flush = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
}

describe("AIGreeting live settings", () => {
  let container: HTMLDivElement
  let root: Root
  let mounted: boolean

  beforeEach(() => {
    aiState.settings = {
      ...aiState.settings,
      enabled: false,
      greetingEnabled: false,
      apiKey: "",
    }
    vi.mocked(getAIGreeting).mockReset()
    vi.mocked(getDailyReview).mockReset().mockResolvedValue(null)
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    mounted = true
  })

  afterEach(async () => {
    if (mounted) await act(async () => root.unmount())
    container.remove()
  })

  it("ignores an old AI response after greeting is disabled", async () => {
    aiState.settings = configuredSettings()
    const oldRequest = deferred<{
      message: string
      fromCache: boolean
    }>()
    vi.mocked(getAIGreeting).mockReturnValueOnce(oldRequest.promise)

    await act(async () => {
      root.render(<AIGreeting />)
      await flush()
    })
    expect(container.textContent).toContain("正在思考")

    aiState.settings = { ...aiState.settings, greetingEnabled: false }
    await act(async () => {
      window.dispatchEvent(new Event(SETTINGS_APPLIED_EVENT))
      await flush()
    })
    expect(container.textContent).toContain("默认问候")
    expect(container.textContent).not.toContain("AI")
    expect(container.querySelector('button[title="刷新提示"]')).toBeNull()

    await act(async () => {
      oldRequest.resolve({ message: "已经过期的 AI 问候", fromCache: false })
      await flush()
    })
    expect(container.textContent).toContain("默认问候")
    expect(container.textContent).not.toContain("已经过期")
  })

  it("refreshes from current settings and badges only a real AI result", async () => {
    await act(async () => {
      root.render(<AIGreeting />)
      await flush()
    })
    expect(getAIGreeting).not.toHaveBeenCalled()
    expect(container.textContent).toContain("默认问候")

    aiState.settings = configuredSettings()
    vi.mocked(getAIGreeting).mockResolvedValueOnce({
      message: "来自 AI 的问候",
      fromCache: false,
    })
    await act(async () => {
      window.dispatchEvent(new Event(SETTINGS_APPLIED_EVENT))
      await flush()
    })
    expect(container.textContent).toContain("来自 AI 的问候AI")
    expect(container.querySelector('button[title="刷新提示"]')).not.toBeNull()

    vi.mocked(getAIGreeting).mockResolvedValueOnce({
      message: "请求失败后的默认问候",
      fromCache: false,
      error: "provider failed",
    })
    await act(async () => {
      window.dispatchEvent(new StorageEvent("storage", { key: "ai-cache" }))
      await flush()
    })
    expect(container.textContent).toContain("请求失败后的默认问候")
    expect(container.textContent).not.toContain("默认问候AI")
  })

  it("routes storage changes and coalesces duplicate events", async () => {
    aiState.settings = configuredSettings()
    vi.mocked(getAIGreeting).mockResolvedValue({
      message: "AI 问候",
      fromCache: true,
    })
    vi.mocked(getDailyReview).mockResolvedValue({
      summary: "昨日总结",
      fromAI: false,
      day: "2026-09-02",
    })

    await act(async () => {
      root.render(<AIGreeting />)
      await flush()
    })
    expect(getAIGreeting).toHaveBeenCalledTimes(1)
    expect(getDailyReview).toHaveBeenCalledTimes(1)

    await act(async () => {
      window.dispatchEvent(new StorageEvent("storage", { key: "ai-cache" }))
      window.dispatchEvent(new StorageEvent("storage", { key: "ai-cache" }))
      await flush()
    })
    expect(getAIGreeting).toHaveBeenCalledTimes(2)
    expect(getDailyReview).toHaveBeenCalledTimes(1)

    await act(async () => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "fluidity.ai.dailyReview.v1",
        })
      )
      await flush()
    })
    expect(getAIGreeting).toHaveBeenCalledTimes(2)
    expect(getDailyReview).toHaveBeenCalledTimes(2)

    await act(async () => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: "ai-settings" })
      )
      window.dispatchEvent(
        new StorageEvent("storage", { key: "ai-settings" })
      )
      await flush()
    })
    expect(getAIGreeting).toHaveBeenCalledTimes(3)
    expect(getDailyReview).toHaveBeenCalledTimes(3)
  })

  it("ignores async completion after unmount", async () => {
    aiState.settings = configuredSettings()
    const request = deferred<{ message: string; fromCache: boolean }>()
    vi.mocked(getAIGreeting).mockReturnValueOnce(request.promise)

    await act(async () => {
      root.render(<AIGreeting />)
      await flush()
    })
    await act(async () => root.unmount())
    mounted = false

    await act(async () => {
      request.resolve({ message: "卸载后的结果", fromCache: false })
      await flush()
    })
    expect(container.textContent).toBe("")
  })
})
