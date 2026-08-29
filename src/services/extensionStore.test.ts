import { afterEach, describe, expect, it } from "vitest"

import { getChromeLocal, setChromeLocal } from "./extensionStore"

afterEach(() => {
  Reflect.deleteProperty(globalThis, "chrome")
})

describe("extensionStore", () => {
  it("propagates chrome.storage runtime errors", async () => {
    const runtime = { lastError: undefined as { message: string } | undefined }
    Object.defineProperty(globalThis, "chrome", {
      configurable: true,
      value: {
        runtime,
        storage: {
          local: {
            get: (_keys: string[], callback: (value: object) => void) => {
              runtime.lastError = { message: "storage unavailable" }
              callback({})
              runtime.lastError = undefined
            },
            set: (_value: object, callback: () => void) => {
              runtime.lastError = { message: "quota exceeded" }
              callback()
              runtime.lastError = undefined
            },
          },
        },
      },
    })

    await expect(getChromeLocal("key")).rejects.toThrow("storage unavailable")
    await expect(setChromeLocal("key", "value")).rejects.toThrow(
      "quota exceeded"
    )
  })
})
