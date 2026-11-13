import { describe, expect, it } from "vitest"

import { getLinkGroupsSearchFingerprint, searchLinksOnly } from "./linkSearch"

describe("link search cache identity", () => {
  it("includes searchable link content so the same query cannot return stale data", () => {
    const before = [
      {
        title: "开发",
        links: [{ label: "旧标签", value: "https://old.example" }],
      },
    ]
    const after = [
      {
        title: "开发",
        links: [{ label: "新标签", value: "https://new.example" }],
      },
    ]

    expect(getLinkGroupsSearchFingerprint(before)).not.toBe(
      getLinkGroupsSearchFingerprint(after)
    )
    expect(searchLinksOnly(before, "标签").map(link => link.label)).toEqual([
      "旧标签",
    ])
    expect(searchLinksOnly(after, "标签").map(link => link.label)).toEqual([
      "新标签",
    ])
  })
})
