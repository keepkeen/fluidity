import { afterEach, describe, expect, it, vi } from "vitest"

import {
  ensureAIPermissionsFor,
  ensureOriginPermissions,
  resolveRssPermissionOrigins,
} from "./optionalPermissions"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("custom AI origin permissions", () => {
  it("requests permission for the currently configured service origin", async () => {
    const contains = vi.fn().mockResolvedValue(false)
    const request = vi.fn().mockResolvedValue(true)
    vi.stubGlobal("chrome", { permissions: { contains, request } })

    await expect(
      ensureAIPermissionsFor(
        "https://opencode.ai/zen/go/v1/chat/completions?source=fluidity"
      )
    ).resolves.toBe(true)
    expect(request).toHaveBeenCalledWith({
      origins: ["https://opencode.ai/*"],
    })
  })

  it("rejects remote plaintext origins before requesting permission", async () => {
    const contains = vi.fn().mockResolvedValue(false)
    const request = vi.fn().mockResolvedValue(true)
    vi.stubGlobal("chrome", { permissions: { contains, request } })

    await expect(
      ensureAIPermissionsFor("http://provider.example/v1")
    ).resolves.toBe(false)
    expect(contains).not.toHaveBeenCalled()
    expect(request).not.toHaveBeenCalled()
  })
})

describe("permission API availability", () => {
  it("fails closed in a real extension runtime when the API is missing", async () => {
    vi.stubGlobal("chrome", { runtime: { id: "extension-id" } })

    await expect(
      ensureOriginPermissions(["https://feeds.example.com/*"])
    ).resolves.toBe(false)
  })

  it("keeps the Web fallback when there is no extension runtime", async () => {
    vi.stubGlobal("chrome", undefined)

    await expect(
      ensureOriginPermissions(["https://feeds.example.com/*"])
    ).resolves.toBe(true)
  })
})

describe("RSS permission origins", () => {
  it("deduplicates feed hosts for one batched permission request", async () => {
    const contains = vi.fn().mockResolvedValue(false)
    const request = vi.fn().mockResolvedValue(true)
    vi.stubGlobal("chrome", {
      runtime: { id: "extension-id" },
      permissions: { contains, request },
    })
    const origins = resolveRssPermissionOrigins([
      "https://feeds.example.com/news.xml",
      "https://feeds.example.com/tech.xml",
      "https://other.example.com/feed",
    ])

    await expect(ensureOriginPermissions(origins)).resolves.toBe(true)
    expect(origins).toEqual([
      "https://feeds.example.com/*",
      "https://other.example.com/*",
    ])
    expect(contains).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledWith({ origins })
  })
})
