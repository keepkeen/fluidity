import { describe, expect, it } from "vitest"

import { LinkClickRecord } from "./analytics"
import { frecencyScore, MAX_FREQUENT, rankLinkTiers } from "./frecency"
import { linkGroup } from "../data/data"

const DAY_MS = 24 * 60 * 60 * 1000
const NOW = 1_800_000_000_000

const record = (
  url: string,
  clickAgesDays: number[]
): [string, LinkClickRecord] => [
  url,
  {
    label: url,
    url,
    group: "组",
    clicks: clickAgesDays.length,
    lastClicked: NOW - Math.min(...clickAgesDays, 0) * DAY_MS,
    clickHistory: clickAgesDays.map(age => NOW - age * DAY_MS),
  },
]

describe("frecencyScore", () => {
  it("weights recent clicks higher than old ones", () => {
    const recent = frecencyScore([NOW - 1 * DAY_MS], NOW)
    const old = frecencyScore([NOW - 25 * DAY_MS], NOW)
    expect(recent).toBeGreaterThan(old)
  })

  it("accumulates over multiple clicks", () => {
    const one = frecencyScore([NOW - 1 * DAY_MS], NOW)
    const three = frecencyScore(
      [NOW - 1 * DAY_MS, NOW - 2 * DAY_MS, NOW - 3 * DAY_MS],
      NOW
    )
    expect(three).toBeGreaterThan(one)
  })

  it("returns 0 for never-clicked links", () => {
    expect(frecencyScore(undefined, NOW)).toBe(0)
    expect(frecencyScore([], NOW)).toBe(0)
  })
})

describe("rankLinkTiers", () => {
  const groups: linkGroup[] = [
    {
      title: "工作",
      links: [
        { label: "热门", value: "https://hot.example.com" },
        { label: "冷门", value: "https://cold.example.com" },
      ],
    },
    {
      title: "收藏",
      links: [{ label: "钉住的", value: "https://pinned.example.com" }],
    },
  ]

  const analytics = Object.fromEntries([
    record("https://hot.example.com", [1, 2, 3]),
    record("https://cold.example.com", [60]),
  ])

  it("puts high-frecency links in the frequent tier", () => {
    const tiers = rankLinkTiers(groups, analytics, new Set(), NOW)
    expect(tiers.frequent.map(l => l.url)).toContain("https://hot.example.com")
    expect(tiers.frequent.map(l => l.url)).not.toContain(
      "https://cold.example.com"
    )
  })

  it("pinned links lead the frequent tier regardless of score", () => {
    const tiers = rankLinkTiers(
      groups,
      analytics,
      new Set(["https://pinned.example.com"]),
      NOW
    )
    expect(tiers.frequent[0].url).toBe("https://pinned.example.com")
    expect(tiers.frequent[0].pinned).toBe(true)
  })

  it("removes frequent links from the rest tier and keeps group structure", () => {
    const tiers = rankLinkTiers(groups, analytics, new Set(), NOW)
    const restUrls = tiers.rest.flatMap(g => g.links.map(l => l.value))
    expect(restUrls).not.toContain("https://hot.example.com")
    expect(restUrls).toContain("https://cold.example.com")
    expect(tiers.rest.find(g => g.title === "工作")).toBeDefined()
  })

  it("caps the frequent tier at MAX_FREQUENT", () => {
    const many: linkGroup[] = [
      {
        title: "多",
        links: Array.from({ length: 20 }, (_, i) => ({
          label: `L${i}`,
          value: `https://site-${i}.example.com`,
        })),
      },
    ]
    const busyAnalytics = Object.fromEntries(
      many[0].links.map(l => record(l.value, [1]))
    )
    const tiers = rankLinkTiers(many, busyAnalytics, new Set(), NOW)
    expect(tiers.frequent).toHaveLength(MAX_FREQUENT)
  })
})
