import { describe, expect, it } from "vitest"

import { formatAIError } from "./AISettings"

describe("formatAIError", () => {
  it("shows the provider's nested 401 message instead of blaming DeepSeek", () => {
    expect(
      formatAIError(
        new Error(
          'API 请求失败: 401 - {"type":"error","error":{"type":"AuthError","message":"Request blocked by upstream provider."}}'
        )
      )
    ).toBe("认证失败（401）：Request blocked by upstream provider.")
  })

  it("shows invalid-key details returned by a compatible provider", () => {
    expect(
      formatAIError(
        new Error(
          'API 请求失败: 401 - {"error":{"message":"Invalid API key."}}'
        )
      )
    ).toBe("认证失败（401）：Invalid API key.")
  })

  it("shows endpoint validation errors without replacing them", () => {
    expect(
      formatAIError(new Error("API 地址必须使用 HTTPS；仅本机服务可使用 HTTP"))
    ).toBe("API 地址必须使用 HTTPS；仅本机服务可使用 HTTP")
  })
})
