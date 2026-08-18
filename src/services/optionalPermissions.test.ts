import { afterEach, describe, expect, it, vi } from "vitest"

import { ensureAIPermissionsFor } from "./optionalPermissions"

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
