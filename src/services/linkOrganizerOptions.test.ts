import { beforeEach, describe, expect, it, vi } from "vitest"

const { callAIMock } = vi.hoisted(() => ({
  callAIMock: vi.fn(),
}))

vi.mock("./ai", () => ({
  AISettingsManager: {
    get: () => ({
      enabled: true,
      apiKey: "sk-test",
      apiBaseUrl: "https://provider.example/v1",
      model: "model-test",
    }),
  },
  callDeepSeekAPI: callAIMock,
}))

import {
  getOrganizeStatus,
  organizeLinksWithAI,
  resetOrganizeStatus,
} from "./linkOrganizer"

beforeEach(() => {
  callAIMock.mockReset()
  resetOrganizeStatus()
})

describe("link organizer request options", () => {
  it("keeps the longer timeout required for large link sets", async () => {
    const controller = new AbortController()
    callAIMock.mockResolvedValue(
      JSON.stringify([
        {
          title: "开发工具",
          links: [{ token: "item-001", label: "GitHub" }],
        },
      ])
    )

    await organizeLinksWithAI(
      [
        {
          title: "原分组",
          links: [{ label: "GitHub", value: "https://github.com" }],
        },
      ],
      "",
      { signal: controller.signal }
    )

    expect(callAIMock).toHaveBeenCalledWith(
      "sk-test",
      expect.any(String),
      "model-test",
      expect.objectContaining({
        apiBaseUrl: "https://provider.example/v1",
        timeoutMs: 60_000,
        signal: controller.signal,
      })
    )
  })

  it("returns to idle and preserves AbortError when cancelled", async () => {
    const abortError = new DOMException("cancelled", "AbortError")
    callAIMock.mockRejectedValue(abortError)

    await expect(
      organizeLinksWithAI(
        [
          {
            title: "原分组",
            links: [{ label: "GitHub", value: "https://github.com" }],
          },
        ],
        ""
      )
    ).rejects.toBe(abortError)
    expect(getOrganizeStatus()).toBe("idle")
  })
})
