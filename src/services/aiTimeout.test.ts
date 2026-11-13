import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("./http", () => ({
  fetchWithTimeout: vi.fn(),
}))

import { callDeepSeekAPI } from "./ai"
import { fetchWithTimeout } from "./http"

beforeEach(() => {
  localStorage.clear()
  vi.mocked(fetchWithTimeout).mockReset()
})

describe("AI request options", () => {
  it("passes a feature-specific timeout to the shared HTTP client", async () => {
    const controller = new AbortController()
    vi.mocked(fetchWithTimeout).mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { content: "完成" } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    )

    await callDeepSeekAPI("sk-test", "整理链接", "model-test", {
      apiBaseUrl: "https://provider.example/v1",
      timeoutMs: 60_000,
      signal: controller.signal,
    })

    expect(fetchWithTimeout).toHaveBeenCalledWith(
      "https://provider.example/v1/chat/completions",
      expect.objectContaining({ signal: controller.signal }),
      expect.objectContaining({ timeoutMs: 60_000 })
    )
  })
})
