import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { Search, Wallpaper } from "./settingsHandler"

const KEY = "search-settings"

const validSettings = {
  engine: "https://duckduckgo.com/?q=",
  fastForward: { g: "https://google.com" },
}

const corruptKeysFor = (key: string): string[] => {
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k?.startsWith(`${key}.corrupt.`)) keys.push(k)
  }
  return keys
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe("readLocalJson via Search", () => {
  it("round-trips valid settings", () => {
    Search.set(validSettings)
    expect(Search.get()).toEqual(validSettings)
  })

  it("quarantines corrupt JSON and returns undefined", () => {
    localStorage.setItem(KEY, "{not json")
    expect(Search.get()).toBeUndefined()
    expect(localStorage.getItem(KEY)).toBeNull()
    expect(corruptKeysFor(KEY)).toHaveLength(1)
  })

  it("quarantines schema-mismatched data", () => {
    localStorage.setItem(KEY, JSON.stringify({ unexpected: true }))
    expect(Search.get()).toBeUndefined()
    expect(corruptKeysFor(KEY)).toHaveLength(1)
  })

  it("keeps only the latest corrupt backup per key", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 1, 10, 0, 0))
    localStorage.setItem(KEY, "{bad one")
    Search.get()
    expect(corruptKeysFor(KEY)).toHaveLength(1)

    vi.setSystemTime(new Date(2026, 6, 1, 10, 0, 1))
    localStorage.setItem(KEY, "{bad two")
    Search.get()

    const backups = corruptKeysFor(KEY)
    expect(backups).toHaveLength(1)
    expect(localStorage.getItem(backups[0])).toBe("{bad two")
  })
})

describe("writeLocalJson quota handling", () => {
  it("notifies the user and rethrows when storage is full", () => {
    const listener = vi.fn()
    window.addEventListener("show-notification", listener)
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("quota exceeded", "QuotaExceededError")
      })

    expect(() => Search.set(validSettings)).toThrow()
    expect(listener).toHaveBeenCalledTimes(1)

    setItem.mockRestore()
    window.removeEventListener("show-notification", listener)
  })
})

describe("Wallpaper legacy settings migration", () => {
  it("preserves a manually selected preset from before followTheme existed", () => {
    localStorage.setItem(
      "wallpaper-settings",
      JSON.stringify({
        source: "preset",
        presetImage: "wallpapers/manual.svg",
      })
    )

    expect(Wallpaper.getWithFallback()).toMatchObject({
      presetImage: "wallpapers/manual.svg",
      followTheme: false,
    })
  })

  it("uses the matching theme wallpaper when no legacy preset was selected", () => {
    localStorage.setItem(
      "wallpaper-settings",
      JSON.stringify({ source: "preset", presetImage: "" })
    )

    expect(Wallpaper.getWithFallback().followTheme).toBe(true)
  })

  it("preserves a saved preset even when another source is currently active", () => {
    localStorage.setItem(
      "wallpaper-settings",
      JSON.stringify({
        source: "custom-url",
        customUrl: "https://example.com/current.jpg",
        presetImage: "wallpapers/saved.svg",
      })
    )

    expect(Wallpaper.getWithFallback().followTheme).toBe(false)
  })
})
