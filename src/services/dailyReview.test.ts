import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  callAI: vi.fn(),
  getSettings: vi.fn(),
  getUsage: vi.fn(),
}))

vi.mock("./ai", () => ({
  AISettingsManager: { get: mocks.getSettings },
  callDeepSeekAPI: mocks.callAI,
}))

vi.mock("./browserUsage", () => ({
  getBrowserUsageSummaryForDay: mocks.getUsage,
}))

import { DAILY_REVIEW_KEY, getDailyReview } from "./dailyReview"

const yesterday = (): string => {
  const date = new Date()
  date.setDate(date.getDate() - 1)
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  mocks.getUsage.mockResolvedValue({
    totalSec: 3600,
    topDomains: [{ domain: "private.example", sec: 3600 }],
    topPages: [
      {
        page: "https://private.example/secret",
        domain: "private.example",
        title: "Private page",
        sec: 3600,
      },
    ],
    byHour: new Array<number>(24).fill(0),
  })
})

describe("daily review AI master switch", () => {
  it("does not call AI or expose a cached AI review while disabled", async () => {
    mocks.getSettings.mockReturnValue({
      enabled: false,
      apiKey: "sk-still-saved",
      shareBrowserUsage: true,
      model: "provider-model",
    })
    localStorage.setItem(
      DAILY_REVIEW_KEY,
      JSON.stringify({
        version: 1,
        day: yesterday(),
        summary: "PRIVATE_CACHED_AI_REVIEW",
        fromAI: true,
        updatedAt: Date.now(),
      })
    )

    const result = await getDailyReview()

    expect(result?.fromAI).toBe(false)
    expect(result?.summary).not.toContain("PRIVATE_CACHED_AI_REVIEW")
    expect(mocks.callAI).not.toHaveBeenCalled()
  })
})
