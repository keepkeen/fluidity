import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AISettingsManager } from "./ai"
import { organizeLinksWithAI, resetOrganizeStatus } from "./linkOrganizer"

beforeEach(() => {
  localStorage.clear()
  resetOrganizeStatus()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("organizeLinksWithAI", () => {
  it("uses the configured OpenAI-compatible endpoint and model", async () => {
    AISettingsManager.set({
      apiKey: "sk-opencode-test",
      apiBaseUrl: "https://opencode.ai/zen/go/v1",
      model: "deepseek-v4-flash",
    })
    const organized = [
      {
        title: "开发工具",
        links: [{ label: "GitHub", value: "https://github.com" }],
      },
    ]
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            { message: { content: `\`\`\`json\n${JSON.stringify(organized)}\n\`\`\`` } },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    )

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
    ).resolves.toEqual(organized)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("https://opencode.ai/zen/go/v1/chat/completions")
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: "deepseek-v4-flash",
      max_tokens: 4000,
    })
  })
})
