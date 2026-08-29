import { beforeEach, describe, expect, it } from "vitest"

import { LinkClickRecord } from "./analytics"
import {
  findForgottenLinks,
  hideRediscovery,
  isRediscoveryHidden,
  pickDailyRediscoveries,
  readRediscoveryState,
  restoreRediscovery,
} from "./rediscovery"
import { linkGroup } from "../data/data"

const DAY_MS = 24 * 60 * 60 * 1000
const NOW = 1_800_000_000_000

const groups: linkGroup[] = [
  {
    title: "工具",
    links: [
      { label: "常用站", value: "https://often.example.com" },
      { label: "遗忘站", value: "https://forgotten.example.com" },
      { label: "从未点", value: "https://never.example.com" },
    ],
  },
  {
    title: "杂项",
    links: [{ label: "非网页", value: "javascript:alert(1)" }],
  },
]

const record = (
  url: string,
  lastClicked: number
): [string, LinkClickRecord] => [
  url,
  { label: url, url, group: "工具", clicks: 3, lastClicked, clickHistory: [] },
]

const analytics = Object.fromEntries([
  record("https://often.example.com", NOW - 2 * DAY_MS),
  record("https://forgotten.example.com", NOW - 45 * DAY_MS),
])

beforeEach(() => localStorage.clear())

describe("findForgottenLinks", () => {
  it("keeps never-clicked and stale links, drops recent and non-http ones", () => {
    const found = findForgottenLinks(groups, analytics, NOW)
    const urls = found.map(f => f.url).sort()
    expect(urls).toEqual([
      "https://forgotten.example.com",
      "https://never.example.com",
    ])
  })

  it("marks never-clicked links with null lastClicked", () => {
    const found = findForgottenLinks(groups, analytics, NOW)
    const never = found.find(f => f.url === "https://never.example.com")
    expect(never?.lastClicked).toBeNull()
    const stale = found.find(f => f.url === "https://forgotten.example.com")
    expect(stale?.lastClicked).toBe(NOW - 45 * DAY_MS)
  })
})

describe("pickDailyRediscoveries", () => {
  const candidates = Array.from({ length: 10 }, (_, i) => ({
    label: `链接 ${i}`,
    url: `https://site-${i}.example.com`,
    groupTitle: "组",
    lastClicked: null,
  }))

  it("is deterministic within the same day", () => {
    const a = pickDailyRediscoveries(candidates, "2026-07-26", {}, NOW)
    const b = pickDailyRediscoveries(candidates, "2026-07-26", {}, NOW)
    expect(a).toEqual(b)
    expect(a).toHaveLength(2)
  })

  it("rotates across days", () => {
    const days = ["2026-07-26", "2026-07-27", "2026-07-28", "2026-07-29"]
    const pickSets = days.map(day =>
      pickDailyRediscoveries(candidates, day, {}, NOW)
        .map(p => p.url)
        .join(",")
    )
    // 四天里至少出现两种不同组合（哈希轮换）
    expect(new Set(pickSets).size).toBeGreaterThan(1)
  })

  it("excludes snoozed links until their snooze expires", () => {
    const target = pickDailyRediscoveries(candidates, "2026-07-26", {}, NOW)[0]
    const snoozed = { [target.url]: NOW + DAY_MS }
    const next = pickDailyRediscoveries(candidates, "2026-07-26", snoozed, NOW)
    expect(next.map(p => p.url)).not.toContain(target.url)

    const expired = { [target.url]: NOW - 1 }
    const afterExpiry = pickDailyRediscoveries(
      candidates,
      "2026-07-26",
      expired,
      NOW
    )
    expect(afterExpiry.map(p => p.url)).toContain(target.url)
  })
})

describe("rediscovery hide undo", () => {
  it("records a newer restore tombstone so an older synced hide cannot return", () => {
    const url = "https://forgotten.example.com"
    hideRediscovery(url, 100)
    expect(isRediscoveryHidden(readRediscoveryState(), url)).toBe(true)

    restoreRediscovery(url, 200)
    const restored = readRediscoveryState()
    expect(isRediscoveryHidden(restored, url)).toBe(false)
    expect(restored.hidden[url]).toBe(100)
    expect(restored.restored[url]).toBe(200)
  })
})
