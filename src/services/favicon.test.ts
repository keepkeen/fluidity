import { beforeEach, describe, expect, it, vi } from "vitest"

import { FaviconService } from "./favicon"

const PAGE = "https://example.com/path"

beforeEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
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
})
