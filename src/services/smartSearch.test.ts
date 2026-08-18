import { describe, expect, it } from "vitest"

import { searchLinksOnly } from "./linkSearch"
import {
  matchSearchText,
  normalizeSearchText,
  rankSearchHistory,
} from "./smartSearch"

describe("smart search matching", () => {
  it("matches Chinese labels by Chinese, full pinyin, and initials", () => {
    expect(matchSearchText("知乎", "知").kind).toBe("literal")
    expect(matchSearchText("知乎", "zhihu")).toMatchObject({
      kind: "pinyin",
      score: expect.any(Number),
    })
    expect(matchSearchText("知乎", "zh").kind).toBe("initials")
  })

  it("supports common polyphonic readings", () => {
    expect(matchSearchText("重庆攻略", "chongqing").score).toBeGreaterThan(0)
    expect(matchSearchText("音乐银行", "yinyueyinhang").score).toBeGreaterThan(
      0
    )
  })

  it("tolerates English and pinyin typos", () => {
    expect(matchSearchText("Blender", "bldner").kind).toBe("fuzzy")
    expect(matchSearchText("知乎", "zhhiu").score).toBeGreaterThan(0)
  })

  it("normalizes case, accents, spaces, and punctuation", () => {
    expect(normalizeSearchText("  Café / Design  ")).toBe("cafedesign")
  })
})

describe("smart link and history ranking", () => {
  it("ranks label pinyin matches ahead of group-only matches", () => {
    const results = searchLinksOnly(
      [
        {
          title: "视频",
          links: [
            { label: "工具", value: "https://tools.example.com" },
            { label: "哔哩哔哩", value: "https://bilibili.com" },
          ],
        },
      ],
      "bilibili"
    )

    expect(results[0]?.label).toBe("哔哩哔哩")
  })

  it("de-duplicates history and ranks relevant recent queries", () => {
    const results = rankSearchHistory(
      [
        { query: "Blender 教程", timestamp: 40 },
        { query: "天气", timestamp: 30 },
        { query: "blender 教程", timestamp: 20 },
        { query: "Blender 插件", timestamp: 10 },
      ],
      "bldner",
      3
    )

    expect(results.map(result => result.query)).toEqual([
      "Blender 教程",
      "Blender 插件",
    ])
  })
})
