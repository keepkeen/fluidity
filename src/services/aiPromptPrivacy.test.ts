import { describe, expect, it } from "vitest"

import { sanitizeAIPromptText } from "./aiPromptPrivacy"

describe("sanitizeAIPromptText", () => {
  it("retains hostnames while removing URL navigation details", () => {
    expect(
      sanitizeAIPromptText(
        "打开 https://example.com/private?q=secret 和 docs.example.org/team?id=1"
      )
    ).toBe("打开 example.com 和 docs.example.org")
  })

  it("redacts credential-shaped text and caller-provided secrets", () => {
    const sanitized = sanitizeAIPromptText(
      "Authorization: Bearer abc123 token=value password=hunter2 sk-public-test exact-secret",
      { secrets: ["exact-secret"] }
    )

    expect(sanitized).not.toContain("abc123")
    expect(sanitized).not.toContain("value")
    expect(sanitized).not.toContain("hunter2")
    expect(sanitized).not.toContain("sk-public-test")
    expect(sanitized).not.toContain("exact-secret")
  })

  it("enforces a caller-selected maximum length", () => {
    expect(sanitizeAIPromptText("x".repeat(100), { maxLength: 12 })).toBe(
      `${"x".repeat(11)}…`
    )
  })

  it("redacts configured secrets case-insensitively inside hostnames", () => {
    const sanitized = sanitizeAIPromptText("apikeycase9.private.example", {
      secrets: ["ApiKeyCase9"],
    })

    expect(sanitized.toLowerCase()).not.toContain("apikeycase9")
  })
})
