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
      enabled: true,
      apiKey: "sk-opencode-test",
      apiBaseUrl: "https://opencode.ai/zen/go/v1",
      model: "deepseek-v4-flash",
    })
  }

  it("does not send links when the master switch is disabled", async () => {
    AISettingsManager.set({
      enabled: false,
      apiKey: "sk-still-saved",
    })
    const fetchMock = vi.spyOn(globalThis, "fetch")

    await expect(
      organizeLinksWithAI(
        [
          {
            title: "private group",
            links: [
              { label: "private label", value: "https://private.example" },
            ],
          },
        ],
        "private instruction"
      )
    ).rejects.toThrow("AI 助手已关闭")
    expect(fetchMock).not.toHaveBeenCalled()
  })

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
        links: [{ token: "item-001", label: "GitHub" }],
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
    ).resolves.toEqual([
      {
        title: "开发工具",
        links: [{ label: "GitHub", value: "https://github.com" }],
      },
    ])

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
        links: [{ token: "item-001", label: "GitHub 新名称" }],
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
          links: [{ token: "item-001", label: "A" }],
        },
      ],
    },
    {
      name: "新增",
      output: [
        {
          title: "整理结果",
          links: [
            { token: "item-001", label: "A" },
            { token: "item-002", label: "B" },
            { token: "item-003", label: "C" },
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
            { token: "item-001", label: "A" },
            { token: "item-001", label: "A 副本" },
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
    ).rejects.toThrow("完整全排列")
  })

  it("never puts URL paths, queries, credentials or configured secrets in the prompt", async () => {
    configureAI()
    const fetchMock = mockOrganizedResponse([
      {
        title: "开发工具",
        links: [{ token: "item-001", label: "GitHub" }],
      },
    ])

    await organizeLinksWithAI(
      [
        {
          title:
            "Authorization: Bearer sk-opencode-test https://internal.example/team?q=hidden",
          links: [
            {
              label:
                "https://github.com/private/label?password=hunter2 token=label-secret",
              value:
                "https://sk-opencode-test.github.com/private/repo?token=url-secret&password=hunter2",
              icon: "data:image/png;base64,private-icon",
            },
          ],
        },
      ],
      "移动 https://planner.example/private?q=secret；api_key=instruction-secret"
    )

    const requestBody = JSON.parse(
      String(fetchMock.mock.calls[0][1]?.body)
    ) as { messages: { content: string }[] }
    const prompt = requestBody.messages[0].content

    expect(prompt).toContain("github.com")
    expect(prompt).toContain("internal.example")
    expect(prompt).toContain("planner.example")
    expect(prompt).toContain('"token": "item-001"')
    for (const secret of [
      "/private",
      "?q=",
      "?token=",
      "url-secret",
      "label-secret",
      "hunter2",
      "instruction-secret",
      "sk-opencode-test",
      "private-icon",
    ]) {
      expect(prompt).not.toContain(secret)
    }
  })

  it("rejects unexpected output fields instead of trusting model metadata", async () => {
    configureAI()
    mockOrganizedResponse([
      {
        title: "开发工具",
        links: [
          {
            token: "item-001",
            label: "GitHub",
            value: "https://attacker.example",
          },
        ],
      },
    ])

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
    ).rejects.toThrow("链接不合法")
  })
})
