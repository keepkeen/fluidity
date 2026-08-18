import { beforeEach, describe, expect, it, vi } from "vitest"

const { callAIMock } = vi.hoisted(() => ({
  callAIMock: vi.fn(),
}))

vi.mock("./ai", () => ({
  AISettingsManager: {
    get: () => ({
      apiKey: "sk-test",
      apiBaseUrl: "https://provider.example/v1",
      model: "model-test",
    }),
  },
  callDeepSeekAPI: callAIMock,
}))

import { organizeLinksWithAI, resetOrganizeStatus } from "./linkOrganizer"

beforeEach(() => {
  callAIMock.mockReset()
  resetOrganizeStatus()
})

describe("link organizer request options", () => {
  it("keeps the longer timeout required for large link sets", async () => {
    callAIMock.mockResolvedValue(
      JSON.stringify([
        {
          title: "开发工具",
          links: [{ label: "GitHub", value: "https://github.com" }],
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
      ""
    )

    expect(callAIMock).toHaveBeenCalledWith(
      "sk-test",
      expect.any(String),
      "model-test",
      expect.objectContaining({
        apiBaseUrl: "https://provider.example/v1",
        timeoutMs: 60_000,
      })
    )
  })
})
