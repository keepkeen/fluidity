import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  callAI: vi.fn(),
  getSettings: vi.fn(),
}))

vi.mock("./ai", () => ({
  AISettingsManager: { get: mocks.getSettings },
  callDeepSeekAPI: mocks.callAI,
}))

import { linkGroup } from "../data/data"
import { LinkClickRecord } from "./analytics"
import {
  buildHomeOrderCandidates,
  getValidHomeAppIds,
  mergeAppOrderPreservingWidgets,
  organizeHomeOrderWithAI,
  sortAppOrderByUsage,
} from "./homeOrderOrganizer"

const NOW = Date.UTC(2026, 8, 3)
const DAY = 24 * 60 * 60 * 1000
const groups: linkGroup[] = [
  {
    title: "开发",
    links: [
      {
        label: "GitHub",
        value: "https://github.com/private/repo?token=secret",
      },
      {
        label: "文档",
        value: "https://docs.example.com/team/hidden?q=private",
      },
      { label: "新闻", value: "https://news.example.com/today" },
    ],
  },
]
const githubUrl = groups[0].links[0].value
const docsUrl = groups[0].links[1].value
const newsUrl = groups[0].links[2].value

const analytics: Record<string, LinkClickRecord> = {
  [githubUrl]: {
    label: "GitHub",
    url: githubUrl,
    group: "开发",
    clicks: 8,
    lastClicked: NOW - DAY,
    clickHistory: [NOW - DAY, NOW - 5 * DAY, NOW - 40 * DAY],
  },
}

beforeEach(() => {
  mocks.callAI.mockReset()
  mocks.getSettings.mockReset()
  mocks.getSettings.mockReturnValue({
    enabled: true,
    apiKey: "sk-never-send-me",
    apiBaseUrl: "https://provider.example/v1",
    model: "provider-model",
  })
})

describe("home order candidates", () => {
  it("sends only hostnames and opaque tokens without usage by default", async () => {
    mocks.callAI.mockResolvedValue(
      JSON.stringify({
        orderedIds: ["item-001", "item-002", "item-003"],
        summary: "保持当前顺序",
      })
    )

    await organizeHomeOrderWithAI(groups, [], analytics, {
      instruction: "按主题排列",
      now: NOW,
    })

    const prompt = mocks.callAI.mock.calls[0][1] as string
    expect(prompt).toContain("github.com")
    expect(prompt).toContain('"token":"item-001"')
    expect(prompt).not.toContain("/private/repo")
    expect(prompt).not.toContain("?token=secret")
    expect(prompt).not.toContain(githubUrl)
    expect(prompt).not.toContain("clickHistory")
    expect(prompt).not.toContain('"clicks"')
    expect(prompt).not.toContain("lastClicked")
    expect(prompt).not.toContain("sk-never-send-me")
  })

  it("sanitizes URL-like labels, group names, instructions and configured secrets", async () => {
    mocks.callAI.mockResolvedValue(
      JSON.stringify({ orderedIds: ["item-001"], summary: "ok" })
    )
    const sensitiveGroups: linkGroup[] = [
      {
        title:
          "Authorization: Bearer sk-never-send-me https://team.example/private?token=group-secret",
        links: [
          {
            label:
              "https://label.example/private?q=label-secret password=hunter2",
            value:
              "https://sk-never-send-me.target.example/private?token=url-secret",
          },
        ],
      },
    ]

    await organizeHomeOrderWithAI(sensitiveGroups, [], {}, {
      instruction:
        "按 https://plan.example/private?q=instruction-secret api_key=hidden 排序",
    })

    const prompt = mocks.callAI.mock.calls[0][1] as string
    for (const hostname of [
      "team.example",
      "label.example",
      "target.example",
      "plan.example",
    ]) {
      expect(prompt).toContain(hostname)
    }
    for (const secret of [
      "/private",
      "group-secret",
      "label-secret",
      "hunter2",
      "url-secret",
      "instruction-secret",
      "hidden",
      "sk-never-send-me",
    ]) {
      expect(prompt).not.toContain(secret)
    }
  })

  it("includes aggregate usage only when explicitly enabled", () => {
    const withoutUsage = buildHomeOrderCandidates(groups, [], analytics, {
      now: NOW,
    })
    const withUsage = buildHomeOrderCandidates(groups, [], analytics, {
      includeUsage: true,
      now: NOW,
    })

    expect(withoutUsage[0]).not.toHaveProperty("clicks")
    expect(withUsage[0]).toMatchObject({
      clicks: 8,
      recentClicks30d: 2,
    })
    expect(withUsage[0].frecency).toBeGreaterThan(0)
    expect(JSON.stringify(withUsage)).not.toContain(String(NOW - DAY))
  })
})

describe("AI home order organization", () => {
  it("does not construct or send a prompt when the master switch is disabled", async () => {
    mocks.getSettings.mockReturnValue({
      enabled: false,
      apiKey: "sk-still-saved",
      apiBaseUrl: "https://provider.example/v1",
      model: "provider-model",
    })

    await expect(
      organizeHomeOrderWithAI(groups, [], analytics, {
        instruction: "private instruction",
      })
    ).rejects.toThrow("AI 助手已关闭")
    expect(mocks.callAI).not.toHaveBeenCalled()
  })

  it("accepts a markdown JSON fence and maps opaque tokens back to app IDs", async () => {
    mocks.callAI.mockResolvedValue(`\`\`\`json
{"orderedIds":["item-003","item-001","item-002"],"summary":"新闻优先"}
\`\`\``)

    await expect(
      organizeHomeOrderWithAI(groups, [], analytics)
    ).resolves.toEqual({
      orderedAppIds: [
        `app:${newsUrl}`,
        `app:${githubUrl}`,
        `app:${docsUrl}`,
      ],
      summary: "新闻优先",
    })
  })

  it.each([
    ["遗漏", ["item-001", "item-002"]],
    ["重复", ["item-001", "item-002", "item-002"]],
    ["新增", ["item-001", "item-002", "unknown"]],
  ])("rejects an orderedIds list with %s tokens", async (_, orderedIds) => {
    mocks.callAI.mockResolvedValue(
      JSON.stringify({ orderedIds, summary: "invalid" })
    )

    await expect(
      organizeHomeOrderWithAI(groups, [], analytics)
    ).rejects.toThrow("完整全排列")
  })

  it("uses the configured OpenAI-compatible provider options", async () => {
    mocks.callAI.mockResolvedValue(
      JSON.stringify({
        orderedIds: ["item-001", "item-002", "item-003"],
        summary: "ok",
      })
    )

    await organizeHomeOrderWithAI(groups, [], analytics, {
      includeUsage: true,
    })

    expect(mocks.callAI).toHaveBeenCalledWith(
      "sk-never-send-me",
      expect.any(String),
      "provider-model",
      expect.objectContaining({
        apiBaseUrl: "https://provider.example/v1",
        temperature: 0.1,
        timeoutMs: 60_000,
      })
    )
    expect(mocks.callAI.mock.calls[0][1]).toContain('"clicks":8')
  })
})

describe("local home ordering", () => {
  it("sorts by frecency, then clicks, preserving current order on ties", () => {
    const localAnalytics: Record<string, LinkClickRecord> = {
      [githubUrl]: {
        label: "GitHub",
        url: githubUrl,
        group: "开发",
        clicks: 2,
        lastClicked: NOW - DAY,
        clickHistory: [NOW - DAY],
      },
      [docsUrl]: {
        label: "文档",
        url: docsUrl,
        group: "开发",
        clicks: 100,
        lastClicked: NOW - 20 * DAY,
        clickHistory: [NOW - 20 * DAY],
      },
      [newsUrl]: {
        label: "新闻",
        url: newsUrl,
        group: "开发",
        clicks: 2,
        lastClicked: NOW - DAY,
        clickHistory: [NOW - DAY],
      },
    }
    const current = [
      `app:${newsUrl}`,
      "widget:clock",
      `app:${githubUrl}`,
      `app:${docsUrl}`,
    ]

    expect(sortAppOrderByUsage(groups, current, localAnalytics, NOW)).toEqual([
      `app:${newsUrl}`,
      `app:${githubUrl}`,
      `app:${docsUrl}`,
    ])
  })

  it("replaces app slots, preserves widgets, and appends new apps", () => {
    expect(
      mergeAppOrderPreservingWidgets(
        ["widget:weather", "app:old-a", "widget:rss", "app:old-b"],
        ["app:new-b", "app:new-a", "app:new-c"],
        ["app:new-a", "app:new-b", "app:new-c"]
      )
    ).toEqual([
      "widget:weather",
      "app:new-b",
      "widget:rss",
      "app:new-a",
      "app:new-c",
    ])
  })

  it("reconciles a stale draft against current apps before filling slots", () => {
    const mixed = [
      "widget:first",
      "app:a",
      "widget:second",
      "app:b",
      "app:c",
    ]

    expect(
      mergeAppOrderPreservingWidgets(
        mixed,
        ["app:gone", "app:b"],
        ["app:a", "app:b", "app:c"]
      )
    ).toEqual([
      "widget:first",
      "app:b",
      "widget:second",
      "app:a",
      "app:c",
    ])
  })

  it("derives unique valid app IDs in current link-group order", () => {
    expect(
      getValidHomeAppIds([
        {
          title: "one",
          links: [
            { label: "A", value: "https://a.example" },
            { label: "B", value: "https://b.example" },
          ],
        },
        {
          title: "two",
          links: [
            { label: "A again", value: "https://a.example" },
            { label: "C", value: "https://c.example" },
          ],
        },
      ])
    ).toEqual([
      "app:https://a.example",
      "app:https://b.example",
      "app:https://c.example",
    ])
  })
})
