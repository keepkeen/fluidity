import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getSettings: vi.fn(),
  callAI: vi.fn(),
  getAnalytics: vi.fn(),
  getWeeklyUsage: vi.fn(),
  getMonthlyUsage: vi.fn(),
}))

vi.mock("./ai", () => ({
  AISettingsManager: { get: mocks.getSettings },
  callDeepSeekAPI: mocks.callAI,
}))

vi.mock("./analytics", () => ({
  getAnalyticsSummary: mocks.getAnalytics,
}))

vi.mock("./browserUsage", () => ({
  getWeeklyBrowserUsageSummary: mocks.getWeeklyUsage,
  getMonthlyBrowserUsageSummary: mocks.getMonthlyUsage,
}))

vi.mock("./reportState", () => ({
  getWeekString: () => "2026-W35",
  getMonthString: () => "2026-08",
}))

import { generateMonthlyReport, generateWeeklyReport } from "./reportGenerator"

const settings = (shareHabits: boolean, shareBrowserUsage: boolean) => ({
  enabled: true,
  apiKey: "sk-test",
  model: "test-model",
  shareHabits,
  shareBrowserUsage,
})

const promptFromLastCall = (): string => String(mocks.callAI.mock.calls.at(-1)?.[1])

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  mocks.callAI.mockResolvedValue("AI summary")
  mocks.getAnalytics.mockReturnValue({
    topLinks: [{ label: "PRIVATE_LINK", group: "PRIVATE_GROUP", clicks: 9 }],
    recentSearches: ["PRIVATE_QUERY"],
    activeHours: Array.from({ length: 24 }, (_, hour) => (hour === 9 ? 5 : 0)),
    totalClicks: 9,
    totalSearches: 7,
  })
  const usage = {
    totalSec: 3600,
    topDomains: [{ domain: "private.example", sec: 1800 }],
    topPages: [
      {
        page: "https://private.example/secret",
        domain: "private.example",
        title: "PRIVATE_PAGE",
        sec: 1200,
      },
    ],
    byHour: new Array<number>(24).fill(0),
  }
  mocks.getWeeklyUsage.mockResolvedValue(usage)
  mocks.getMonthlyUsage.mockResolvedValue(usage)
})

describe("report AI privacy", () => {
  it("weekly report hides habits while retaining allowed browser usage", async () => {
    mocks.getSettings.mockReturnValue(settings(false, true))

    await generateWeeklyReport()

    const prompt = promptFromLastCall()
    expect(prompt).toContain("private.example")
    expect(prompt).not.toContain("PRIVATE_LINK")
    expect(prompt).toContain("链接点击: 0 次")
    expect(prompt).toContain("搜索次数: 0 次")
  })

  it("weekly report hides browser usage while retaining allowed habits", async () => {
    mocks.getSettings.mockReturnValue(settings(true, false))

    await generateWeeklyReport()

    const prompt = promptFromLastCall()
    expect(prompt).toContain("PRIVATE_LINK")
    expect(prompt).not.toContain("private.example")
    expect(prompt).not.toContain("PRIVATE_PAGE")
    expect(prompt).toContain("浏览时长: 0 分钟")
  })

  it("monthly report hides habits while retaining allowed browser usage", async () => {
    mocks.getSettings.mockReturnValue(settings(false, true))

    await generateMonthlyReport()

    const prompt = promptFromLastCall()
    expect(prompt).toContain("private.example")
    expect(prompt).not.toContain("PRIVATE_LINK")
    expect(prompt).toContain("链接点击: 0 次")
    expect(prompt).toContain("最活跃时段: 暂无数据")
  })

  it("monthly report hides browser usage while retaining allowed habits", async () => {
    mocks.getSettings.mockReturnValue(settings(true, false))

    await generateMonthlyReport()

    const prompt = promptFromLastCall()
    expect(prompt).toContain("PRIVATE_LINK")
    expect(prompt).not.toContain("private.example")
    expect(prompt).not.toContain("PRIVATE_PAGE")
    expect(prompt).toContain("浏览时长: 0 分钟")
  })
})
