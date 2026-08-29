import { afterEach, describe, expect, it } from "vitest"

import {
  BROWSER_USAGE_PERMISSION_ORIGINS,
  BROWSER_USAGE_SETTINGS_KEY,
  DEFAULT_BROWSER_USAGE_SETTINGS,
  narrowBrowserUsagePermissions,
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

describe("narrowBrowserUsagePermissions", () => {
  it("removes broad access before preserving only exact service origins", async () => {
    const calls: string[] = []
    let broadGranted = true
    let exactGranted = false

    Object.defineProperty(globalThis, "chrome", {
      configurable: true,
      value: {
        permissions: {
          contains: async ({ origins }: { origins?: string[] }) => {
            if (
              origins?.length === 1 &&
              BROWSER_USAGE_PERMISSION_ORIGINS.includes(origins[0])
            ) {
              calls.push(`contains:${origins[0]}`)
              return broadGranted
            }
            calls.push("contains:exact")
            return exactGranted
          },
          remove: async ({ origins }: { origins?: string[] }) => {
            calls.push(`remove:${origins?.join(",")}`)
            broadGranted = false
            return true
          },
          request: async ({ origins }: { origins?: string[] }) => {
            calls.push(`request:${origins?.join(",")}`)
            exactGranted = true
            return true
          },
        },
      },
    })

    await expect(
      narrowBrowserUsagePermissions([
        "https://api.example.com/*",
        "https://api.example.com/*",
        "https://api.github.com/*",
      ])
    ).resolves.toEqual({
      hadBroadPermissions: true,
      serviceOriginsGranted: true,
    })
    expect(calls).toEqual([
      "contains:http://*/*",
      "contains:https://*/*",
      `remove:${BROWSER_USAGE_PERMISSION_ORIGINS.join(",")}`,
      "contains:exact",
      "request:https://api.example.com/*,https://api.github.com/*",
    ])
  })

  it("removes a remaining single broad origin", async () => {
    const removed: string[][] = []
    Object.defineProperty(globalThis, "chrome", {
      configurable: true,
      value: {
        permissions: {
          contains: async ({ origins }: { origins?: string[] }) =>
            origins?.[0] === "https://*/*",
          remove: async ({ origins }: { origins?: string[] }) => {
            removed.push(origins ?? [])
            return true
          },
          request: async () => true,
        },
      },
    })

    await expect(narrowBrowserUsagePermissions([])).resolves.toEqual({
      hadBroadPermissions: true,
      serviceOriginsGranted: true,
    })
    expect(removed).toEqual([["https://*/*"]])
  })

  it("does not request new origins when broad access was not granted", async () => {
    let requested = false
    Object.defineProperty(globalThis, "chrome", {
      configurable: true,
      value: {
        permissions: {
          contains: async () => false,
          remove: async () => true,
          request: async () => {
            requested = true
            return true
          },
        },
      },
    })

    await expect(
      narrowBrowserUsagePermissions(["https://api.example.com/*"])
    ).resolves.toEqual({
      hadBroadPermissions: false,
      serviceOriginsGranted: true,
    })
    expect(requested).toBe(false)
  })

  it("reports a failed broad permission revocation", async () => {
    Object.defineProperty(globalThis, "chrome", {
      configurable: true,
      value: {
        permissions: {
          contains: async () => true,
          remove: async () => false,
        },
      },
    })

    await expect(narrowBrowserUsagePermissions([])).rejects.toThrow(
      "全站访问权限撤销失败"
    )
  })

  it("fails closed when an extension permission API is incomplete", async () => {
    Object.defineProperty(globalThis, "chrome", {
      configurable: true,
      value: {
        runtime: { id: "extension-id" },
        permissions: {},
      },
    })

    await expect(narrowBrowserUsagePermissions([])).rejects.toThrow(
      "权限接口不可用"
    )
  })
})
