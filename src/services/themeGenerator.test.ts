import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  callAI: vi.fn(),
  getSettings: vi.fn(),
}))

vi.mock("./ai", () => ({
  AISettingsManager: { get: mocks.getSettings },
  callDeepSeekAPI: mocks.callAI,
}))

import { cacheThemes, generateThemes } from "./themeGenerator"

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
})

describe("AI theme master switch", () => {
  it("does not call the provider or expose a cached AI theme when disabled", async () => {
    mocks.getSettings.mockReturnValue({
      enabled: false,
      apiKey: "sk-still-saved",
      model: "provider-model",
    })
    cacheThemes("private design prompt", [
      {
        name: "cached AI result",
        bgPrimary: "#111111",
        bgSecondary: "#222222",
        bgHover: "#333333",
        textPrimary: "#ffffff",
        textSecondary: "#eeeeee",
        textMuted: "#cccccc",
        borderDefault: "#444444",
        borderActive: "#555555",
        accent: "#666666",
        accentHover: "#777777",
        accentText: "#ffffff",
        success: "#00aa00",
        glow: "#888888",
      },
    ])

    await expect(generateThemes("private design prompt")).resolves.toEqual({
      themes: [],
      error: "AI 助手已关闭，请先在 AI 设置中开启",
    })
    expect(mocks.callAI).not.toHaveBeenCalled()
  })
})
