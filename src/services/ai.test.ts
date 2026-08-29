import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  AISettingsManager,
  callDeepSeekAPI,
  resolveAppNameForDomain,
  resolveChatCompletionsUrl,
} from "./ai"
import { resolveAIServicePermissionOrigin } from "./aiEndpoint"

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("OpenAI-compatible endpoint handling", () => {
  it("accepts either a base URL or a complete chat-completions endpoint", () => {
    expect(
      resolveChatCompletionsUrl("https://opencode.ai/zen/go/v1")
    ).toBe("https://opencode.ai/zen/go/v1/chat/completions")
    expect(
      resolveChatCompletionsUrl(
        "https://opencode.ai/zen/go/v1/chat/completions/"
      )
    ).toBe("https://opencode.ai/zen/go/v1/chat/completions")
  })

  it("preserves query parameters on complete and base URLs", () => {
    expect(
      resolveChatCompletionsUrl(
        "https://gateway.example/v1/chat/completions?api-version=2026-01-01"
      )
    ).toBe(
      "https://gateway.example/v1/chat/completions?api-version=2026-01-01"
    )
    expect(
      resolveChatCompletionsUrl(
        "https://gateway.example/v1?api-version=2026-01-01"
      )
    ).toBe(
      "https://gateway.example/v1/chat/completions?api-version=2026-01-01"
    )
  })

  it("allows local HTTP services but rejects remote plaintext endpoints", () => {
    expect(resolveChatCompletionsUrl("http://localhost:11434/v1")).toBe(
      "http://localhost:11434/v1/chat/completions"
    )
    expect(() =>
      resolveAIServicePermissionOrigin("http://[::1]:11434/v1")
    ).toThrow("必须使用 HTTPS")
    expect(() =>
      resolveChatCompletionsUrl("http://provider.example/v1")
    ).toThrow("必须使用 HTTPS")
  })

  it("uses the current draft endpoint and trims pasted credentials", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { content: "连接正常" } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    )

    await expect(
      callDeepSeekAPI("  sk-test-key\n", "你好", " deepseek-v4-flash ", {
        apiBaseUrl:
          "https://opencode.ai/zen/go/v1/chat/completions",
      })
    ).resolves.toBe("连接正常")

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("https://opencode.ai/zen/go/v1/chat/completions")
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer sk-test-key",
    })
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: "deepseek-v4-flash",
    })
  })

  it("clears provider-derived caches when endpoint or model changes", () => {
    AISettingsManager.set({
      apiKey: "sk-one",
      apiBaseUrl: "https://provider-one.example/v1",
      model: "model-one",
    })
    const cacheKeys = [
      "ai-cache",
      "ai-theme-cache",
      "report-cache",
      "fluidity.ai.dailyReview.v1",
    ]
    for (const key of cacheKeys) localStorage.setItem(key, "cached")

    AISettingsManager.set({
      apiBaseUrl: "https://provider-two.example/v1",
      model: "model-two",
    })

    for (const key of cacheKeys) expect(localStorage.getItem(key)).toBeNull()
  })

  it("invalidates legacy unscoped caches on first settings read", () => {
    localStorage.setItem(
      "ai-settings",
      JSON.stringify({
        enabled: true,
        apiKey: "sk-existing",
        apiBaseUrl: "https://provider.example/v1",
        model: "model-existing",
      })
    )
    localStorage.setItem("ai-cache", "old-provider-result")

    expect(AISettingsManager.get().model).toBe("model-existing")
    expect(localStorage.getItem("ai-cache")).toBeNull()
    expect(localStorage.getItem("ai-response-cache-scope.v1")).not.toBeNull()
  })
})

describe("browser usage privacy", () => {
  it("does not send a domain when browser usage sharing is disabled", async () => {
    AISettingsManager.set({
      enabled: true,
      apiKey: "sk-test-key",
      shareBrowserUsage: false,
    })
    const fetchMock = vi.spyOn(globalThis, "fetch")

    await expect(resolveAppNameForDomain("example.com")).resolves.toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
