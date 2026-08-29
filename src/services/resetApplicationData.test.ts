import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { resetApplicationData } from "./resetApplicationData"

const installChrome = (
  options: {
    permissionRemovalSucceeds?: boolean
    grantedPermissions?: string[]
    grantedOrigins?: string[]
    usageSettingsChangeSucceeds?: boolean
    usageResetSucceeds?: boolean
  } = {}
) => {
  const operations: string[] = []
  const sentMessages: unknown[] = []
  const local: Record<string, unknown> = {
    "fluidity.browserUsage.settings.v1": { enabled: true },
    "fluidity.browserUsage.v1": { days: { today: {} } },
    "fluidity.gistSync.config.v1": {
      enabled: true,
      token: "secret",
      gistId: "gist-id",
    },
  }
  const session: Record<string, unknown> = {
    "fluidity.gistSync.password.v1": "password",
  }
  const listeners = new Set<(
    changes: Record<string, chrome.storage.StorageChange>,
    area: string
  ) => void>()

  const area = (data: Record<string, unknown>) => ({
    get: (keys: string[], callback: (value: Record<string, unknown>) => void) =>
      callback(Object.fromEntries(keys.map(key => [key, data[key]]))),
    set: (values: Record<string, unknown>, callback: () => void) => {
      Object.assign(data, values)
      callback()
    },
    remove: (key: string, callback: () => void) => {
      delete data[key]
      callback()
    },
    clear: (callback: () => void) => {
      operations.push(data === local ? "local:clear" : "session:clear")
      Object.keys(data).forEach(key => delete data[key])
      callback()
    },
  })

  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: {
      runtime: {
        id: "extension-id",
        lastError: undefined,
        getManifest: () => ({
          permissions: ["storage", "scripting", "activeTab"],
          host_permissions: ["https://www.bing.com/*"],
        }),
        sendMessage: (message: unknown, callback: (value: { ok: boolean }) => void) => {
          sentMessages.push(message)
          const type = (message as { type?: string }).type
          operations.push(`message:${type ?? "unknown"}`)
          const ok = type === "fluidity:usageReset"
            ? options.usageResetSucceeds !== false
            : type === "fluidity:usageSettingsChanged"
              ? options.usageSettingsChangeSucceeds !== false
              : true
          if (type === "fluidity:usageReset" && ok) {
            delete local["fluidity.browserUsage.v1"]
            operations.push("usage:deleted")
          }
          callback({
            ok,
          })
        },
      },
      permissions: {
        contains: vi.fn(async () => true),
        getAll: vi.fn(async () => {
          operations.push("permissions:getAll")
          return {
            permissions: options.grantedPermissions ?? [
              "storage",
              "scripting",
              "activeTab",
              "bookmarks",
            ],
            origins: options.grantedOrigins ?? [
              "https://www.bing.com/*",
              "http://*/*",
              "https://*/*",
            ],
          }
        }),
        remove: vi.fn(async () => {
          operations.push("permissions:remove")
          return options.permissionRemovalSucceeds ?? true
        }),
      },
      storage: {
        local: area(local),
        session: area(session),
        onChanged: {
          addListener: (listener: typeof listeners extends Set<infer T> ? T : never) =>
            listeners.add(listener),
          removeListener: (listener: typeof listeners extends Set<infer T> ? T : never) =>
            listeners.delete(listener),
        },
      },
    },
  })

  return { local, operations, sentMessages, session }
}

describe("resetApplicationData", () => {
  beforeEach(() => {
    localStorage.setItem("link-groups", "[]")
    sessionStorage.setItem("temporary", "value")
  })

  afterEach(() => {
    Reflect.deleteProperty(globalThis, "chrome")
    localStorage.clear()
    sessionStorage.clear()
  })

  it("clears local, extension-local and extension-session stores", async () => {
    const stores = installChrome()

    await resetApplicationData()

    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
    expect(stores.local).toEqual({})
    expect(stores.session).toEqual({})
    expect(chrome.permissions.remove).toHaveBeenCalledWith({
      permissions: ["bookmarks"],
      origins: ["http://*/*", "https://*/*"],
    })
    expect(stores.sentMessages).toContainEqual({ type: "fluidity:usageReset" })
    expect(stores.operations).toContain("usage:deleted")
    expect(stores.operations.indexOf("permissions:remove")).toBeLessThan(
      stores.operations.indexOf("message:fluidity:usageSettingsChanged")
    )
    expect(stores.operations.indexOf("message:fluidity:usageReset")).toBeLessThan(
      stores.operations.indexOf("local:clear")
    )
  })

  it("does not silently clear data when optional permission revocation fails", async () => {
    const stores = installChrome({ permissionRemovalSucceeds: false })

    await expect(resetApplicationData()).rejects.toThrow("无法撤销扩展可选权限")

    expect(localStorage.getItem("link-groups")).toBe("[]")
    expect(stores.local["fluidity.browserUsage.v1"]).toBeDefined()
    expect(stores.local["fluidity.gistSync.config.v1"]).toEqual({
      enabled: true,
      token: "secret",
      gistId: "gist-id",
    })
    expect(stores.operations).not.toContain("message:fluidity:usageReset")
  })

  it("revokes fine-grained AI, sync and RSS origins while preserving required access", async () => {
    installChrome({
      grantedPermissions: ["storage", "scripting", "activeTab", "bookmarks"],
      grantedOrigins: [
        "https://www.bing.com/*",
        "https://api.deepseek.com/*",
        "https://api.github.com/*",
        "https://feeds.example.com/*",
      ],
    })

    await resetApplicationData()

    expect(chrome.permissions.remove).toHaveBeenCalledWith({
      permissions: ["bookmarks"],
      origins: [
        "https://api.deepseek.com/*",
        "https://api.github.com/*",
        "https://feeds.example.com/*",
      ],
    })
  })

  it("keeps data intact when the usage runtime cannot be reset", async () => {
    const stores = installChrome({ usageResetSucceeds: false })

    await expect(resetApplicationData()).rejects.toThrow("浏览统计后台重置失败")

    expect(localStorage.getItem("link-groups")).toBe("[]")
    expect(stores.local["fluidity.browserUsage.v1"]).toBeDefined()
    expect(stores.local["fluidity.gistSync.config.v1"]).toMatchObject({
      enabled: false,
      token: "secret",
      gistId: "gist-id",
    })
    expect(stores.session["fluidity.gistSync.password.v1"]).toBe("password")
    expect(stores.operations).not.toContain("local:clear")
  })

  it("does not clear data when browser usage cannot be disabled first", async () => {
    const stores = installChrome({ usageSettingsChangeSucceeds: false })

    await expect(resetApplicationData()).rejects.toThrow(
      "无法安全停止后台服务"
    )

    expect(stores.local["fluidity.browserUsage.v1"]).toBeDefined()
    expect(stores.local["fluidity.gistSync.config.v1"]).toEqual({
      enabled: true,
      token: "secret",
      gistId: "gist-id",
    })
    expect(stores.operations).not.toContain("message:fluidity:usageReset")
    expect(stores.operations).not.toContain("local:clear")
  })

  it("fails closed when optional permissions cannot be enumerated", async () => {
    const stores = installChrome()
    Reflect.deleteProperty(chrome.permissions, "getAll")

    await expect(resetApplicationData()).rejects.toThrow("扩展关键接口不可用")

    expect(stores.local["fluidity.browserUsage.v1"]).toBeDefined()
    expect(stores.operations).not.toContain("local:clear")
  })

  it.each(["sendMessage", "local", "permissions"] as const)(
    "fails closed when extension API %s is unavailable",
    async missing => {
      const stores = installChrome()
      if (missing === "sendMessage") {
        Reflect.deleteProperty(chrome.runtime, "sendMessage")
      } else if (missing === "local") {
        Reflect.deleteProperty(chrome.storage, "local")
      } else {
        Reflect.deleteProperty(chrome, "permissions")
      }

      await expect(resetApplicationData()).rejects.toThrow("扩展关键接口不可用")

      expect(localStorage.getItem("link-groups")).toBe("[]")
      expect(stores.local["fluidity.browserUsage.v1"]).toBeDefined()
      expect(stores.local["fluidity.gistSync.config.v1"]).toEqual({
        enabled: true,
        token: "secret",
        gistId: "gist-id",
      })
      expect(stores.operations).toEqual([])
    }
  )

  it("uses the Web session fallback when chrome.storage.session is unavailable", async () => {
    const stores = installChrome()
    Reflect.deleteProperty(chrome.storage, "session")

    await resetApplicationData()

    expect(stores.local).toEqual({})
    expect(sessionStorage.length).toBe(0)
    expect(stores.operations).not.toContain("session:clear")
  })

  it("keeps the Web fallback when no extension runtime exists", async () => {
    Reflect.deleteProperty(globalThis, "chrome")

    await resetApplicationData()

    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
  })
})
