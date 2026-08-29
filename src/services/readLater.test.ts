import { beforeEach, describe, expect, it } from "vitest"

import {
  addLaterRead,
  completeLaterRead,
  isLaterReadUrl,
  listLaterRead,
  readLaterStore,
  removeLaterRead,
  restoreLaterRead,
  snoozeLaterRead,
} from "./readLater"

const NOW = 1_800_000_000_000

beforeEach(() => localStorage.clear())

describe("read later", () => {
  it("deduplicates normalized URLs and restores a completed item on re-add", () => {
    const first = addLaterRead("https://example.com/article#part", "旧标题", NOW)!
    completeLaterRead(first.id, NOW + 1)
    const second = addLaterRead(
      "https://example.com/article",
      "新标题",
      NOW + 2
    )!

    expect(second.id).toBe(first.id)
    expect(second.title).toBe("新标题")
    expect(second.completedAt).toBeUndefined()
    expect(Object.keys(readLaterStore().items)).toHaveLength(1)
  })

  it("keeps snoozed, completed, and deleted items out of the active inbox", () => {
    const snoozed = addLaterRead("https://a.example.com", "A", NOW)!
    const completed = addLaterRead("https://b.example.com", "B", NOW + 1)!
    const removed = addLaterRead("https://c.example.com", "C", NOW + 2)!

    snoozeLaterRead(snoozed.id, 7, NOW + 3)
    completeLaterRead(completed.id, NOW + 4)
    removeLaterRead(removed.id, NOW + 5)

    expect(listLaterRead({ now: NOW + 6 })).toEqual([])
    expect(
      listLaterRead({
        now: NOW + 6,
        includeCompleted: true,
        includeSnoozed: true,
      }).map(item => item.id)
    ).toEqual([completed.id, snoozed.id])
    restoreLaterRead(completed.id, NOW + 7)
    expect(isLaterReadUrl(completed.url)).toBe(true)
  })

  it("rejects non-web protocols", () => {
    expect(addLaterRead("javascript:alert(1)", "bad", NOW)).toBeNull()
  })

  it("never drops unfinished items when the history capacity is exceeded", () => {
    for (let index = 0; index < 501; index += 1) {
      addLaterRead(
        `https://example.com/article/${index}`,
        `Article ${index}`,
        NOW + index
      )
    }

    expect(listLaterRead({ now: NOW + 1000 })).toHaveLength(501)
  })
})
