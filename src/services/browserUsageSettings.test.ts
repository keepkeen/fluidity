import { afterEach, describe, expect, it } from "vitest"

import {
  BROWSER_USAGE_SETTINGS_KEY,
  DEFAULT_BROWSER_USAGE_SETTINGS,
  setBrowserUsageSettings,
} from "./browserUsageSettings"

const installChrome = (response: { ok: boolean; error?: string }) => {
  const data: Record<string, unknown> = {
    [BROWSER_USAGE_SETTINGS_KEY]: DEFAULT_BROWSER_USAGE_SETTINGS,
  }

  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: {
      runtime: {
        lastError: undefined,
        sendMessage: (
          _message: unknown,
          callback: (value: { ok: boolean; error?: string }) => void
        ) => callback(response),
      },
      storage: {
        local: {
          get: (
            keys: string[],
            callback: (value: Record<string, unknown>) => void
          ) =>
            callback(
              Object.fromEntries(keys.map(key => [key, data[key]]))
            ),
          set: (
            values: Record<string, unknown>,
            callback: () => void
          ) => {
            Object.assign(data, values)
            callback()
          },
        },
      },
    },
  })

  return data
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "chrome")
})

describe("setBrowserUsageSettings", () => {
  it("rolls back storage when the background registration fails", async () => {
    const data = installChrome({ ok: false, error: "registration failed" })

    await expect(
      setBrowserUsageSettings({
        ...DEFAULT_BROWSER_USAGE_SETTINGS,
        enabled: true,
      })
    ).rejects.toThrow("registration failed")

    expect(data[BROWSER_USAGE_SETTINGS_KEY]).toEqual(
      DEFAULT_BROWSER_USAGE_SETTINGS
    )
  })

  it("keeps the enabled setting only after background confirmation", async () => {
    const data = installChrome({ ok: true })

    await setBrowserUsageSettings({
      ...DEFAULT_BROWSER_USAGE_SETTINGS,
      enabled: true,
    })

    expect(data[BROWSER_USAGE_SETTINGS_KEY]).toMatchObject({ enabled: true })
  })
})
