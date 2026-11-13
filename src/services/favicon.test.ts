import { beforeEach, describe, expect, it, vi } from "vitest"

import { FaviconService } from "./favicon"

const PAGE = "https://example.com/path"

beforeEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
  FaviconService.clearCache()
})

describe("FaviconService resolution cache", () => {
  it("upgrades a provider URL that is too small for the home screen", () => {
    const lowResolution =
      "https://www.google.com/s2/favicons?domain=example.com&sz=28"
    FaviconService.saveToCache(PAGE, lowResolution, 28)

    expect(FaviconService.getFromCache(PAGE, 128)).toBeUndefined()
    expect(FaviconService.isSufficientSource(lowResolution, 128)).toBe(false)
  })

  it("reuses a sufficiently large provider URL", () => {
    const highResolution =
      "https://www.google.com/s2/favicons?domain=example.com&sz=128"
    FaviconService.saveToCache(PAGE, highResolution, 128)

    expect(FaviconService.getFromCache(PAGE, 128)).toBe(highResolution)
    expect(FaviconService.isSufficientSource(highResolution, 128)).toBe(true)
  })

  it("never sends a bookmark path or query to the favicon provider", async () => {
    const privatePage =
      "https://example.com/private/document?token=sensitive#section"
    const checked: string[] = []
    vi.spyOn(FaviconService, "checkFaviconAvailable").mockImplementation(
      async candidate => {
        checked.push(candidate)
        return true
      }
    )

    await FaviconService.getFavicon(privatePage, 128)

    const providerUrl = new URL(checked[0])
    expect(providerUrl.searchParams.get("domain_url")).toBe(
      "https://example.com"
    )
    expect(checked[0]).not.toContain("private")
    expect(checked[0]).not.toContain("sensitive")
  })

  it("shares an in-flight lookup between links on the same domain", async () => {
    let resolveAvailability: ((available: boolean) => void) | undefined
    const check = vi
      .spyOn(FaviconService, "checkFaviconAvailable")
      .mockImplementation(
        () =>
          new Promise(resolve => {
            resolveAvailability = resolve
          })
      )

    const first = FaviconService.getFavicon("https://example.com/one", 128)
    const second = FaviconService.getFavicon("https://example.com/two", 128)
    await vi.waitFor(() => expect(check).toHaveBeenCalledTimes(1))

    resolveAvailability?.(true)
    await expect(Promise.all([first, second])).resolves.toHaveLength(2)
    expect(check).toHaveBeenCalledTimes(1)
  })

  it("does not repopulate cleared caches when an older lookup completes", async () => {
    vi.useFakeTimers()
    try {
      localStorage.setItem(
        "link-groups",
        JSON.stringify([
          {
            title: "测试",
            links: [{ label: "Example", value: PAGE }],
          },
        ])
      )
      let resolveAvailability: ((available: boolean) => void) | undefined
      const check = vi
        .spyOn(FaviconService, "checkFaviconAvailable")
        .mockImplementation(
          () =>
            new Promise<boolean>(resolve => {
              resolveAvailability = resolve
            })
        )

      const pending = FaviconService.getFavicon(PAGE, 128)
      expect(check).toHaveBeenCalledTimes(1)

      FaviconService.clearCache()
      resolveAvailability?.(true)
      await expect(pending).resolves.toBeNull()
      await vi.runAllTimersAsync()

      expect(localStorage.getItem("favicon-cache")).toBeNull()
      const groups = JSON.parse(localStorage.getItem("link-groups") ?? "[]") as {
        links: { icon?: string }[]
      }[]
      expect(groups[0].links[0].icon).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it("caps cold favicon lookup concurrency", async () => {
    let active = 0
    let maximum = 0
    vi.spyOn(FaviconService, "checkFaviconAvailable").mockImplementation(
      async () => {
        active += 1
        maximum = Math.max(maximum, active)
        await new Promise(resolve => setTimeout(resolve, 5))
        active -= 1
        return true
      }
    )

    await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        FaviconService.getFavicon(`https://site-${index}.example/page`, 128)
      )
    )

    expect(maximum).toBeLessThanOrEqual(6)
    expect(maximum).toBeGreaterThan(1)
  })

  it("does not let a late low-resolution lookup replace a high-resolution result", async () => {
    localStorage.setItem(
      "link-groups",
      JSON.stringify([
        {
          title: "测试",
          links: [{ label: "示例", value: PAGE }],
        },
      ])
    )
    const resolvers = new Map<number, (available: boolean) => void>()
    vi.spyOn(FaviconService, "checkFaviconAvailable").mockImplementation(
      candidate =>
        new Promise(resolve => {
          const size = Number(new URL(candidate).searchParams.get("sz"))
          resolvers.set(size, resolve)
        })
    )

    const highRequest = FaviconService.getFavicon(`${PAGE}/high`, 128)
    const lowRequest = FaviconService.getFavicon(`${PAGE}/low`, 64)
    await vi.waitFor(() => {
      expect([...resolvers.keys()].sort((a, b) => a - b)).toEqual([64, 128])
    })

    resolvers.get(128)?.(true)
    const high = await highRequest
    resolvers.get(64)?.(true)
    const low = await lowRequest

    expect(low).toBe(high)
    expect(FaviconService.getFromCache(PAGE, 128)).toBe(high)
    await vi.waitFor(() => {
      const groups = JSON.parse(localStorage.getItem("link-groups") ?? "[]") as {
        links: { icon?: string }[]
      }[]
      expect(groups[0].links[0].icon).toBe(high)
    })
  })

  it("does not replace a successful cached icon with a failed lookup", () => {
    const highResolution =
      "https://www.google.com/s2/favicons?domain=example.com&sz=128"
    FaviconService.saveToCache(PAGE, highResolution, 128)

    FaviconService.saveToCache(PAGE, null, 64)

    expect(FaviconService.getFromCache(PAGE, 128)).toBe(highResolution)
  })
})
