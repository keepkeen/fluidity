import { describe, expect, it } from "vitest"

import { isSafeLinkUrl } from "./urlSafety"

describe("isSafeLinkUrl", () => {
  it("allows http/https/mailto links", () => {
    expect(isSafeLinkUrl("https://example.com")).toBe(true)
    expect(isSafeLinkUrl("http://example.com/path?q=1")).toBe(true)
    expect(isSafeLinkUrl("mailto:someone@example.com")).toBe(true)
  })

  it("blocks executable schemes", () => {
    expect(isSafeLinkUrl("javascript:alert(1)")).toBe(false)
    expect(isSafeLinkUrl("JavaScript:alert(1)")).toBe(false)
    expect(isSafeLinkUrl("data:text/html,<script>alert(1)</script>")).toBe(
      false
    )
    expect(isSafeLinkUrl("vbscript:msgbox(1)")).toBe(false)
    expect(isSafeLinkUrl("file:///etc/passwd")).toBe(false)
  })

  it("allows scheme-less relative values", () => {
    expect(isSafeLinkUrl("example.com")).toBe(true)
    expect(isSafeLinkUrl("/local/path")).toBe(true)
  })
})
