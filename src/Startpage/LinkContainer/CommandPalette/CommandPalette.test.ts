import { describe, expect, it } from "vitest"

import { performSearch } from "./CommandPalette"

const groups = [
  {
    title: "常用工具",
    links: [
      { label: "重庆银行", value: "https://bank.example.com" },
      { label: "GitHub", value: "https://github.com" },
    ],
  },
]

describe("command palette search", () => {
  it("uses the same pinyin initials matching as the main search", () => {
    const labels = performSearch(groups, "cqyh").map(result => result.label)
    expect(labels).toContain("重庆银行")
    expect(labels).not.toContain("GitHub")
  })

  it("matches small typing mistakes and URL text", () => {
    expect(performSearch(groups, "githb").map(result => result.label)).toContain(
      "GitHub"
    )
    expect(
      performSearch(groups, "bankexample").map(result => result.label)
    ).toContain("重庆银行")
  })
})
