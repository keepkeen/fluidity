import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  generateAIContext,
  isSearchHistoryEnabled,
  LinkAnalytics,
  SearchHistory,
  type LinkClickRecord,
} from "./analytics"

const record = (url: string, lastClicked: number): LinkClickRecord => ({
  label: url,
  url,
  group: "test",
  clicks: 600,
  lastClicked,
  clickHistory: Array.from({ length: 600 }, (_, index) => index),
})

beforeEach(() => {
  const values = new Map<string, string>()
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() {
      return values.size
    },
  } satisfies Storage)
})

describe("LinkAnalytics compaction", () => {
  it("drops deleted-link orphans and caps per-link timestamp history", () => {
    const kept = "https://kept.example"
    const removed = "https://removed.example"
    localStorage.setItem(
      "link-groups",
      JSON.stringify([
        { title: "test", links: [{ label: "kept", value: kept }] },
      ])
    )

    LinkAnalytics.set({
      [kept]: record(kept, 2),
      [removed]: record(removed, 1),
    })

    const analytics = LinkAnalytics.get()
    expect(Object.keys(analytics)).toEqual([kept])
    expect(analytics[kept].clickHistory).toHaveLength(500)
    expect(analytics[kept].clickHistory[0]).toBe(100)
  })

  it("keeps URL identity for local search without exposing it in AI summaries", () => {
    const url = "https://private.example/account/path"
    localStorage.setItem(
      "link-groups",
      JSON.stringify([{ title: "test", links: [{ label: "账户", value: url }] }])
    )
    LinkAnalytics.set({ [url]: { ...record(url, 2), label: "账户" } })

    expect(LinkAnalytics.getTopLinkRecords(1)[0].url).toBe(url)
    expect(LinkAnalytics.getTopLinks(1)[0]).toEqual({
      label: "账户",
      group: "test",
      clicks: 600,
    })
  })

  it("filters deleted links on read even when no later analytics write occurs", () => {
    const kept = "https://kept.example"
    const removed = "https://removed.example"
    localStorage.setItem(
      "link-groups",
      JSON.stringify([{ title: "test", links: [{ label: "kept", value: kept }] }])
    )
    localStorage.setItem(
      "link-analytics",
      JSON.stringify({
        [kept]: record(kept, 1),
        [removed]: record(removed, 2),
      })
    )

    expect(LinkAnalytics.getTopLinkRecords(5).map(item => item.url)).toEqual([
      kept,
    ])
  })
})

describe("local search history privacy", () => {
  it("records local history for a new user without enabling or uploading AI data", () => {
    expect(localStorage.getItem("ai-settings")).toBeNull()
    expect(isSearchHistoryEnabled()).toBe(true)

    SearchHistory.trackSearch("private local query", "google")

    expect(SearchHistory.getRecent()).toEqual(["private local query"])
    expect(localStorage.getItem("ai-settings")).toBeNull()
    expect(generateAIContext()).not.toContain("private local query")
  })

  it("preserves an existing explicit opt-out from local search history", () => {
    localStorage.setItem(
      "ai-settings",
      JSON.stringify({
        collectSearchHistory: false,
        shareHabits: false,
      })
    )

    expect(isSearchHistoryEnabled()).toBe(false)
    SearchHistory.trackSearch("must not persist", "google")
    expect(SearchHistory.get()).toEqual([])
  })

  it("only includes locally recorded history after separate AI sharing consent", () => {
    SearchHistory.trackSearch("shared after consent", "google")
    expect(generateAIContext()).not.toContain("shared after consent")

    localStorage.setItem(
      "ai-settings",
      JSON.stringify({ collectSearchHistory: true, shareHabits: true })
    )
    expect(generateAIContext()).toContain("shared after consent")
  })
})
