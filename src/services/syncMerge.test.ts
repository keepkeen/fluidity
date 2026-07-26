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

  it("unions todos by id, newer side wins per id", () => {
    const newer = [{ id: "1", text: "改过", done: true }]
    const older = [
      { id: "1", text: "原始", done: false },
      { id: "2", text: "只在旧侧", done: false },
    ]
    const merged = deepMergeKey("todos", newer, older) as {
      id: string
      text: string
    }[]
    expect(merged).toHaveLength(2)
    expect(merged.find(t => t.id === "1")?.text).toBe("改过")
    expect(merged.find(t => t.id === "2")?.text).toBe("只在旧侧")
  })

  it("takes per-day max for contributions (idempotent)", () => {
    const a = { "2026-07-25": 3 }
    const b = { "2026-07-25": 5, "2026-07-24": 2 }
    const once = deepMergeKey("todo-contributions", a, b)
    const twice = deepMergeKey("todo-contributions", once, b)
    expect(once).toEqual({ "2026-07-25": 5, "2026-07-24": 2 })
    expect(twice).toEqual(once)
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

  it("deep-merge keys combine both sides and push when remote lacks data", () => {
    const plan = planMerge({
      localData: { todos: [{ id: "a" }] },
      localTimestamps: { todos: 100 },
      remoteData: { todos: [{ id: "b" }] },
      remoteTimestamps: { todos: 200 },
      remoteFallbackTs: 0,
    })
    const entry = plan.find(p => p.key === "todos")
    expect((entry?.value as { id: string }[]).map(t => t.id).sort()).toEqual([
      "a",
      "b",
    ])
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
})
