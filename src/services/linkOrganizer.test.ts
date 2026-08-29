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
  const configureAI = () => {
    AISettingsManager.set({
      apiKey: "sk-opencode-test",
      apiBaseUrl: "https://opencode.ai/zen/go/v1",
      model: "deepseek-v4-flash",
    })
  }

  const mockOrganizedResponse = (organized: unknown) =>
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(organized) } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    )

  it("uses the configured OpenAI-compatible endpoint and model", async () => {
    configureAI()
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

  it("preserves original URLs and favicon metadata without applying the draft", async () => {
    configureAI()
    localStorage.setItem("link-groups", "persisted-before-apply")
    mockOrganizedResponse([
      {
        title: "开发工具",
        links: [{ label: "GitHub 新名称", value: "https://github.com" }],
      },
    ])

    await expect(
      organizeLinksWithAI(
        [
          {
            title: "原分组",
            links: [
              {
                label: "GitHub",
                value: "https://github.com",
                icon: "data:image/png;base64,icon",
              },
            ],
          },
        ],
        ""
      )
    ).resolves.toEqual([
      {
        title: "开发工具",
        links: [
          {
            label: "GitHub 新名称",
            value: "https://github.com",
            icon: "data:image/png;base64,icon",
          },
        ],
      },
    ])
    expect(localStorage.getItem("link-groups")).toBe("persisted-before-apply")
  })

  it.each([
    {
      name: "遗漏",
      output: [
        {
          title: "整理结果",
          links: [{ label: "A", value: "https://a.example" }],
        },
      ],
    },
    {
      name: "新增",
      output: [
        {
          title: "整理结果",
          links: [
            { label: "A", value: "https://a.example" },
            { label: "B", value: "https://b.example" },
            { label: "C", value: "https://c.example" },
          ],
        },
      ],
    },
    {
      name: "重复",
      output: [
        {
          title: "整理结果",
          links: [
            { label: "A", value: "https://a.example" },
            { label: "A 副本", value: "https://a.example" },
          ],
        },
      ],
    },
  ])("rejects AI output that has $name links", async ({ output }) => {
    configureAI()
    mockOrganizedResponse(output)

    await expect(
      organizeLinksWithAI(
        [
          {
            title: "原分组",
            links: [
              { label: "A", value: "https://a.example" },
              { label: "B", value: "https://b.example" },
            ],
          },
        ],
        ""
      )
    ).rejects.toThrow("与原始数据不一致")
  })
})
