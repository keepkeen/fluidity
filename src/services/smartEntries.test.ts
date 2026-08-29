import { describe, expect, it } from "vitest"

import { LinkClickRecord } from "./analytics"
import { rankSmartEntries } from "./smartEntries"
import { linkGroup } from "../data/data"

const NOW = new Date("2026-08-19T09:30:00+08:00").getTime()
const groups: linkGroup[] = [
  {
    title: "工作",
    links: [
      { label: "晨会", value: "https://meet.example.com/daily" },
      { label: "文档", value: "https://docs.example.com" },
      { label: "同域", value: "https://docs.example.com/other" },
    ],
  },
  {
    title: "阅读",
    links: [{ label: "新闻", value: "https://news.example.com" }],
  },
]

const record = (
  url: string,
  history: number[]
): LinkClickRecord => ({
  label: url,
  url,
  group: "工作",
  clicks: history.length,
  lastClicked: Math.max(...history),
  clickHistory: history,
})

describe("rankSmartEntries", () => {
  it("uses local context, explains the result, and keeps domain diversity", () => {
    const yesterdaySameHour = NOW - 24 * 60 * 60 * 1000
    const analytics = {
      "https://meet.example.com/daily": record(
        "https://meet.example.com/daily",
        [yesterdaySameHour, NOW - 7 * 24 * 60 * 60 * 1000]
      ),
      "https://docs.example.com": record("https://docs.example.com", [NOW - 1_000]),
      "https://docs.example.com/other": record(
        "https://docs.example.com/other",
        [NOW - 2_000]
      ),
    }

    const ranked = rankSmartEntries(groups, analytics, {
      now: NOW,
      limit: 4,
      analyticsEnabled: true,
    })
    expect(ranked.some(entry => entry.reason === "这个时段常用")).toBe(true)
    expect(ranked.filter(entry => new URL(entry.url).hostname === "docs.example.com"))
      .toHaveLength(1)
    expect(ranked.every(entry => Number.isFinite(entry.score))).toBe(true)
  })

  it("honors privacy and explicit exclusions", () => {
    const analytics = {
      "https://docs.example.com": record("https://docs.example.com", [NOW - 1_000]),
    }
    expect(
      rankSmartEntries(groups, analytics, { analyticsEnabled: false })
    ).toEqual([])
    expect(
      rankSmartEntries(groups, analytics, {
        analyticsEnabled: true,
        excludedUrls: ["https://docs.example.com"],
      })
    ).toEqual([])
  })
})
