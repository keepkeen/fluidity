import { describe, expect, it } from "vitest"

import { deepMergeKey, planMerge } from "./syncMerge"
import { linkGroup } from "../data/data"

describe("deepMergeKey", () => {
  it("unions link groups and links from both sides", () => {
    const a: linkGroup[] = [
      { title: "工作", links: [{ label: "A", value: "https://a.com" }] },
    ]
    const b: linkGroup[] = [
      {
        title: "工作",
        links: [
          { label: "A旧名", value: "https://a.com" },
          { label: "B", value: "https://b.com" },
        ],
      },
      { title: "娱乐", links: [{ label: "C", value: "https://c.com" }] },
    ]
    const merged = deepMergeKey("link-groups", a, b) as linkGroup[]
    const work = merged.find(g => g.title === "工作")
    expect(work?.links.map(l => l.value).sort()).toEqual([
      "https://a.com",
      "https://b.com",
    ])
    // 同一链接以较新一侧（第一个参数）为准
    expect(work?.links.find(l => l.value === "https://a.com")?.label).toBe("A")
    expect(merged.find(g => g.title === "娱乐")).toBeDefined()
  })

  it("merges analytics with click-history union and is idempotent", () => {
    const rec = (history: number[]) => ({
      label: "L",
      url: "https://a.com",
      group: "G",
      clicks: history.length,
      lastClicked: Math.max(...history),
      clickHistory: history,
    })
    const a = { "https://a.com": rec([100, 200]) }
    const b = { "https://a.com": rec([200, 300]) }
    const once = deepMergeKey("link-analytics", a, b) as typeof a
    expect(once["https://a.com"].clickHistory).toEqual([100, 200, 300])
    expect(once["https://a.com"].clicks).toBe(3)
    expect(once["https://a.com"].lastClicked).toBe(300)
    const twice = deepMergeKey("link-analytics", once, b) as typeof a
    expect(twice).toEqual(once)
  })

  it("unions pins", () => {
    expect(
      deepMergeKey("fluidity.linkPins.v1", ["a", "b"], ["b", "c"])
    ).toEqual(["a", "b", "c"])
  })

  it("merges real search records, removes exact duplicates, and keeps 100", () => {
    const newer = Array.from({ length: 70 }, (_, index) => ({
      query: `new-${index}`,
      engine: "google",
      timestamp: 200 - index,
    }))
    const older = [
      { ...newer[0] },
      ...Array.from({ length: 70 }, (_, index) => ({
        query: `old-${index}`,
        engine: "bing",
        timestamp: 100 - index,
      })),
    ]

    const merged = deepMergeKey("search-history", newer, older) as Array<{
      query: string
      engine: string
      timestamp: number
    }>

    expect(merged).toHaveLength(100)
    expect(merged[0]).toEqual(newer[0])
    expect(merged.filter(record => record.query === "new-0")).toHaveLength(1)
    expect(merged.every(record => typeof record.query === "string")).toBe(true)
  })

  it("migrates legacy string search history instead of dropping it", () => {
    expect(deepMergeKey("search-history", ["旧搜索"], [])).toEqual([
      { query: "旧搜索", engine: "", timestamp: 0 },
    ])
  })

  it("keeps the newest per-item tombstone for later-read sync", () => {
    const merged = deepMergeKey(
      "fluidity.laterRead.v1",
      { version: 1, items: { a: { updatedAt: 100, title: "old" } } },
      {
        version: 1,
        items: { a: { updatedAt: 200, deletedAt: 200 }, b: { updatedAt: 50 } },
      }
    ) as { items: Record<string, { updatedAt: number; deletedAt?: number }> }
    expect(merged.items.a.deletedAt).toBe(200)
    expect(merged.items.b.updatedAt).toBe(50)
  })

  it("converges equal-timestamp updated records when local and remote swap", () => {
    const local = {
      version: 1,
      items: { same: { updatedAt: 100, title: "alpha", url: "https://a.test" } },
    }
    const remote = {
      version: 1,
      items: { same: { url: "https://b.test", title: "omega", updatedAt: 100 } },
    }

    const localFirst = deepMergeKey("fluidity.laterRead.v1", local, remote)
    const remoteFirst = deepMergeKey("fluidity.laterRead.v1", remote, local)

    expect(localFirst).toEqual(remoteFirst)
  })

  it("unions rediscovery snoozes and permanent hides", () => {
    expect(
      deepMergeKey(
        "fluidity.rediscovery.v1",
        { snoozed: { a: 100 }, hidden: { x: 300 } },
        { snoozed: { a: 200, b: 50 }, hidden: { y: 400 } }
      )
    ).toEqual({
      snoozed: { a: 200, b: 50 },
      hidden: { x: 300, y: 400 },
      restored: {},
    })
  })

  it("keeps rediscovery restore tombstones across devices", () => {
    expect(
      deepMergeKey(
        "fluidity.rediscovery.v1",
        { snoozed: {}, hidden: { a: 100 }, restored: { a: 200 } },
        { snoozed: {}, hidden: { a: 150 }, restored: {} }
      )
    ).toEqual({ snoozed: {}, hidden: { a: 150 }, restored: { a: 200 } })
  })

  it("merges RSS read markers independently by updatedAt", () => {
    const merged = deepMergeKey(
      "fluidity.rss.readState.v1",
      { same: { read: true, updatedAt: 300 }, local: { read: true, updatedAt: 1 } },
      { same: { read: false, updatedAt: 200 }, remote: { read: true, updatedAt: 2 } }
    ) as Record<string, { read: boolean }>
    expect(merged.same.read).toBe(true)
    expect(Object.keys(merged).sort()).toEqual(["local", "remote", "same"])
  })
})

describe("planMerge", () => {
  it("applies remote value when remote is newer", () => {
    const plan = planMerge({
      localData: { design: { v: "old" } },
      localTimestamps: { design: 100 },
      remoteData: { design: { v: "new" } },
      remoteTimestamps: { design: 200 },
      remoteFallbackTs: 0,
    })
    const entry = plan.find(p => p.key === "design")
    expect(entry?.value).toEqual({ v: "new" })
    expect(entry?.needsPush).toBe(false)
  })

  it("keeps local value and schedules push when local is newer", () => {
    const plan = planMerge({
      localData: { design: { v: "local" } },
      localTimestamps: { design: 300 },
      remoteData: { design: { v: "remote" } },
      remoteTimestamps: { design: 200 },
      remoteFallbackTs: 0,
    })
    const entry = plan.find(p => p.key === "design")
    expect(entry?.value).toBeUndefined()
    expect(entry?.needsPush).toBe(true)
  })

  it("keeps keys that exist on only one side", () => {
    const plan = planMerge({
      localData: { onlyLocal: 1 },
      localTimestamps: { onlyLocal: 100 },
      remoteData: { onlyRemote: 2 },
      remoteTimestamps: { onlyRemote: 100 },
      remoteFallbackTs: 0,
    })
    expect(plan.find(p => p.key === "onlyLocal")?.needsPush).toBe(true)
    expect(plan.find(p => p.key === "onlyRemote")?.value).toBe(2)
  })

  it("keeps one-sided keys when their timestamps are zero", () => {
    const plan = planMerge({
      localData: { onlyLocal: 1 },
      localTimestamps: {},
      remoteData: { onlyRemote: 2 },
      remoteTimestamps: {},
      remoteFallbackTs: 0,
    })
    expect(plan.find(p => p.key === "onlyLocal")).toMatchObject({
      timestamp: 0,
      needsPush: true,
    })
    expect(plan.find(p => p.key === "onlyRemote")).toMatchObject({
      value: 2,
      timestamp: 0,
      needsPush: false,
    })
  })

  it("deep-merge keys combine both sides and push when remote lacks data", () => {
    const plan = planMerge({
      localData: { "fluidity.linkPins.v1": ["a"] },
      localTimestamps: { "fluidity.linkPins.v1": 100 },
      remoteData: { "fluidity.linkPins.v1": ["b"] },
      remoteTimestamps: { "fluidity.linkPins.v1": 200 },
      remoteFallbackTs: 0,
    })
    const entry = plan.find(p => p.key === "fluidity.linkPins.v1")
    expect((entry?.value as string[]).sort()).toEqual(["a", "b"])
    expect(entry?.needsPush).toBe(true)
  })

  it("uses fallback timestamp for legacy remote envelopes", () => {
    const plan = planMerge({
      localData: { design: { v: "local" } },
      localTimestamps: { design: 100 },
      remoteData: { design: { v: "remote" } },
      remoteTimestamps: {},
      remoteFallbackTs: 500,
    })
    expect(plan.find(p => p.key === "design")?.value).toEqual({ v: "remote" })
  })

  it("deterministically converges different ordinary values at the same timestamp", () => {
    const first = planMerge({
      localData: { design: { z: 1, value: "alpha" } },
      localTimestamps: { design: 100 },
      remoteData: { design: { value: "omega", z: 1 } },
      remoteTimestamps: { design: 100 },
      remoteFallbackTs: 0,
    }).find(entry => entry.key === "design")
    const reversed = planMerge({
      localData: { design: { value: "omega", z: 1 } },
      localTimestamps: { design: 100 },
      remoteData: { design: { z: 1, value: "alpha" } },
      remoteTimestamps: { design: 100 },
      remoteFallbackTs: 0,
    }).find(entry => entry.key === "design")

    const firstWinner = first?.value ?? { z: 1, value: "alpha" }
    const reversedWinner = reversed?.value ?? { value: "omega", z: 1 }
    expect(firstWinner).toEqual(reversedWinner)
    expect([first?.needsPush, reversed?.needsPush].sort()).toEqual([false, true])
  })

  it("treats object key order as equal at the same timestamp", () => {
    const entry = planMerge({
      localData: { design: { a: 1, b: 2 } },
      localTimestamps: { design: 100 },
      remoteData: { design: { b: 2, a: 1 } },
      remoteTimestamps: { design: 100 },
      remoteFallbackTs: 0,
    }).find(item => item.key === "design")

    expect(entry?.value).toBeUndefined()
    expect(entry?.needsPush).toBe(false)
  })
})
