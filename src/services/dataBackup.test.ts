import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  applyBackupValue,
  exportData,
  importData,
  importDataAsync,
} from "./dataBackup"

const WALLPAPER_KEY = "wallpaper-settings"
const CARD_AREA_KEY = "card-area-settings"

const localWallpaper = {
  source: "local",
  displayMode: "fullscreen",
  presetImage: "",
  customUrl: "",
  localImageData: "data:image/jpeg;base64,QUJD",
  bingRegion: "cn",
  blur: 4,
  brightness: 0.9,
  overlay: true,
  overlayOpacity: 0.3,
}

const cardArea = {
  displayMode: "full",
}

const theme = (name: string) => ({
  name,
  colors: { "--bg-primary": "#000000" },
  image: "",
})

const searchSettings = (engine: string) => ({
  engine,
  fastForward: {},
})

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("exportData", () => {
  it("includes wallpaper and card-area settings", () => {
    localStorage.setItem(WALLPAPER_KEY, JSON.stringify(localWallpaper))
    localStorage.setItem(CARD_AREA_KEY, JSON.stringify(cardArea))

    const backup = exportData()
    expect(backup.data[WALLPAPER_KEY]).toBeDefined()
    expect(backup.data[CARD_AREA_KEY]).toBeDefined()
  })

  it("strips base64 image data but keeps other preferences", () => {
    localStorage.setItem(WALLPAPER_KEY, JSON.stringify(localWallpaper))

    const backup = exportData()
    const wallpaper = backup.data[WALLPAPER_KEY] as typeof localWallpaper
    expect(wallpaper.localImageData).toBeNull()
    expect(wallpaper.source).toBe("preset")
    expect(wallpaper.blur).toBe(4)
  })

  it("exports widget data but never exports the device-local RSS cache", () => {
    localStorage.setItem("fluidity.homeLayout.v2", JSON.stringify({ version: 2 }))
    localStorage.setItem("fluidity.laterRead.v1", JSON.stringify({ version: 1 }))
    localStorage.setItem("fluidity.rss.subscriptions.v1", JSON.stringify({ version: 1 }))
    localStorage.setItem("fluidity.rss.readState.v1", JSON.stringify({ one: { read: true } }))
    localStorage.setItem("fluidity.rss.cache.v1.web", JSON.stringify({ private: "cache" }))

    const data = exportData().data
    expect(data["fluidity.homeLayout.v2"]).toBeDefined()
    expect(data["fluidity.laterRead.v1"]).toBeDefined()
    expect(data["fluidity.rss.subscriptions.v1"]).toBeDefined()
    expect(data["fluidity.rss.readState.v1"]).toBeDefined()
    expect(data["fluidity.rss.cache.v1.web"]).toBeUndefined()
  })
})

describe("importData", () => {
  const makeBackup = (data: Record<string, unknown>) => ({
    version: "1.0.0",
    exportedAt: new Date().toISOString(),
    data,
    metadata: { totalKeys: Object.keys(data).length, includesApiKey: false },
  })

  it("lets the background atomically persist imported browser usage", async () => {
    const usage = { version: 1, days: {}, recent: [] }
    const order: string[] = []
    const chromeValues = new Map<string, unknown>()
    vi.stubGlobal("chrome", {
      runtime: {
        lastError: undefined,
        sendMessage(
          message: { type: string; replacement: unknown },
          callback: (response: { ok: boolean }) => void
        ) {
          order.push("runtime:replace")
          expect(message.type).toBe("fluidity:usageReplacePersisted")
          expect(message.replacement).toEqual(
            expect.objectContaining({ version: 1, days: {}, recent: [] })
          )
          chromeValues.set("fluidity.browserUsage.v1", message.replacement)
          callback({ ok: true })
        },
      },
      storage: {
        local: {
          get(keys: string[], callback: (result: Record<string, unknown>) => void) {
            callback(
              Object.fromEntries(
                keys.flatMap(key =>
                  chromeValues.has(key) ? [[key, chromeValues.get(key)]] : []
                )
              )
            )
          },
          set(value: Record<string, unknown>, callback: () => void) {
            order.push("storage:set")
            Object.entries(value).forEach(([key, item]) =>
              chromeValues.set(key, item)
            )
            callback()
          },
          remove(key: string, callback: () => void) {
            chromeValues.delete(key)
            callback()
          },
        },
      },
    })

    const result = await importDataAsync(
      makeBackup({ "fluidity.browserUsage.v1": usage })
    )

    expect(result.success).toBe(true)
    expect(order).toEqual(["runtime:replace"])
    expect(chromeValues.get("fluidity.browserUsage.v1")).toEqual(
      expect.objectContaining({ version: 1, days: {}, recent: [] })
    )
  })

  it("keeps the previous usage snapshot when the background cannot replace it", async () => {
    const previous = { version: 1, updatedAt: 1, days: { old: {} } }
    const chromeValues = new Map<string, unknown>([
      ["fluidity.browserUsage.v1", previous],
    ])
    vi.stubGlobal("chrome", {
      runtime: {
        lastError: { message: "worker unavailable" },
        sendMessage(
          _message: unknown,
          callback: (response?: { ok: boolean }) => void
        ) {
          callback(undefined)
        },
      },
      storage: {
        local: {
          get(keys: string[], callback: (result: Record<string, unknown>) => void) {
            callback(
              Object.fromEntries(
                keys.flatMap(key =>
                  chromeValues.has(key) ? [[key, chromeValues.get(key)]] : []
                )
              )
            )
          },
          set(value: Record<string, unknown>, callback: () => void) {
            Object.entries(value).forEach(([key, item]) =>
              chromeValues.set(key, item)
            )
            callback()
          },
          remove(key: string, callback: () => void) {
            chromeValues.delete(key)
            callback()
          },
        },
      },
    })

    const result = await importDataAsync(
      makeBackup({
        "fluidity.browserUsage.v1": { version: 1, days: {}, recent: [] },
      })
    )

    expect(result.success).toBe(false)
    expect(chromeValues.get("fluidity.browserUsage.v1")).toEqual(previous)
  })

  it("uses the shared layout lock for single-value sync writes", async () => {
    const request = vi.fn(
      async (
        _name: string,
        _options: { mode: string },
        operation: () => void
      ) => operation()
    )
    vi.stubGlobal("navigator", { locks: { request } })
    const layout = {
      version: 2,
      order: [],
      widgets: {},
      pageShortcutModifier: "alt",
    }

    await applyBackupValue("fluidity.homeLayout.v2", layout)

    expect(request).toHaveBeenCalledWith(
      "fluidity.homeLayout.v2",
      { mode: "exclusive" },
      expect.any(Function)
    )
    expect(JSON.parse(localStorage.getItem("fluidity.homeLayout.v2") ?? "{}"))
      .toEqual(layout)
  })

  it("holds the shared layout lock through async chrome import and notification", async () => {
    const order: string[] = []
    let lockHeld = false
    vi.stubGlobal("navigator", {
      locks: {
        request: async (
          _name: string,
          _options: { mode: string },
          operation: () => Promise<unknown>
        ) => {
          order.push("lock:start")
          lockHeld = true
          try {
            return await operation()
          } finally {
            lockHeld = false
            order.push("lock:end")
          }
        },
      },
    })
    const chromeValues = new Map<string, unknown>()
    vi.stubGlobal("chrome", {
      runtime: {
        lastError: undefined,
        sendMessage(
          _message: unknown,
          callback: (response: { ok: boolean }) => void
        ) {
          expect(lockHeld).toBe(true)
          order.push("runtime:replace")
          callback({ ok: true })
        },
      },
      storage: {
        local: {
          get(keys: string[], callback: (result: Record<string, unknown>) => void) {
            callback(
              Object.fromEntries(
                keys.flatMap(key =>
                  chromeValues.has(key) ? [[key, chromeValues.get(key)]] : []
                )
              )
            )
          },
          set(value: Record<string, unknown>, callback: () => void) {
            expect(lockHeld).toBe(true)
            order.push("storage:set")
            Object.entries(value).forEach(([key, item]) =>
              chromeValues.set(key, item)
            )
            callback()
          },
          remove(key: string, callback: () => void) {
            chromeValues.delete(key)
            callback()
          },
        },
      },
    })

    const result = await importDataAsync(
      makeBackup({
        "fluidity.homeLayout.v2": {
          version: 2,
          order: [],
          widgets: {},
          pageShortcutModifier: "alt",
        },
        "fluidity.browserUsage.v1": { version: 1, days: {}, recent: [] },
      })
    )

    expect(result.success).toBe(true)
    expect(order).toEqual([
      "lock:start",
      "runtime:replace",
      "lock:end",
    ])
  })

  it("preserves this device's local wallpaper image on overwrite", () => {
    localStorage.setItem(WALLPAPER_KEY, JSON.stringify(localWallpaper))

    const incoming = {
      ...localWallpaper,
      localImageData: null,
      source: "preset",
      blur: 10,
    }
    const result = importData(makeBackup({ [WALLPAPER_KEY]: incoming }), {
      overwrite: true,
    })
    expect(result.success).toBe(true)

    const stored = JSON.parse(
      localStorage.getItem(WALLPAPER_KEY) ?? "{}"
    ) as typeof localWallpaper
    expect(stored.localImageData).toBe(localWallpaper.localImageData)
    expect(stored.source).toBe("local")
    expect(stored.blur).toBe(10)
  })

  it("round-trips card area settings", () => {
    localStorage.setItem(CARD_AREA_KEY, JSON.stringify(cardArea))

    const result = importData(makeBackup({ [CARD_AREA_KEY]: cardArea }), {
      overwrite: true,
    })
    expect(result.success).toBe(true)
    expect(
      (JSON.parse(localStorage.getItem(CARD_AREA_KEY) ?? "{}") as typeof cardArea)
        .displayMode
    ).toBe("full")
  })

  it("round-trips regular settings keys", () => {
    const links = [
      { title: "Dev", links: [{ label: "GitHub", value: "https://github.com" }] },
    ]
    localStorage.setItem("link-groups", JSON.stringify(links))
    const backup = exportData()

    localStorage.clear()
    const result = importData(backup, { overwrite: true })
    expect(result.success).toBe(true)
    expect(JSON.parse(localStorage.getItem("link-groups") ?? "[]")).toEqual(
      links
    )
  })

  it.each([
    [
      "link-groups",
      [{ title: "Broken", links: [{ label: "Missing URL" }] }],
    ],
    ["ai-settings", { enabled: "yes", apiKey: "secret" }],
    [
      "fluidity.homeLayout.v2",
      {
        version: 2,
        order: ["widget:broken"],
        widgets: { broken: { instanceId: 7, type: "rss" } },
      },
    ],
  ])("rejects malformed %s before changing any local value", (key, value) => {
    localStorage.setItem(CARD_AREA_KEY, JSON.stringify(cardArea))
    localStorage.setItem(key, JSON.stringify({ preserved: true }))

    const result = importData(
      makeBackup({
        [CARD_AREA_KEY]: { displayMode: "hidden" },
        [key]: value,
      })
    )

    expect(result.success).toBe(false)
    expect(result.importedKeys).toEqual([])
    expect(result.errors.join(" ")).toContain("备份数据结构无效")
    expect(JSON.parse(localStorage.getItem(CARD_AREA_KEY) ?? "{}"))
      .toEqual(cardArea)
    expect(JSON.parse(localStorage.getItem(key) ?? "{}"))
      .toEqual({ preserved: true })
  })

  it("rejects malformed browser usage before taking any snapshots", async () => {
    const storageGet = vi.fn()
    vi.stubGlobal("chrome", {
      runtime: { lastError: undefined },
      storage: {
        local: {
          get: storageGet,
          set: vi.fn(),
          remove: vi.fn(),
        },
      },
    })
    localStorage.setItem("themes", JSON.stringify([theme("preserved")]))

    const result = await importDataAsync(
      makeBackup({
        themes: [theme("incoming")],
        "fluidity.browserUsage.v1": {
          version: 1,
          days: { today: { totalSec: "lots" } },
          recent: [],
        },
      })
    )

    expect(result.success).toBe(false)
    expect(result.importedKeys).toEqual([])
    expect(storageGet).not.toHaveBeenCalled()
    expect(JSON.parse(localStorage.getItem("themes") ?? "[]")).toEqual([
      theme("preserved"),
    ])
  })

  it.each([
    [
      "negative timing parameters",
      {
        version: 1,
        days: {},
        recent: [],
        retentionDays: -1,
        intervalMs: -1,
        maxGapMs: -1,
      },
    ],
    [
      "an invalid hourly bucket count",
      {
        version: 1,
        days: {
          "2026-08-18": {
            totalSec: 1,
            byDomain: {},
            byPage: {},
            byHour: [1, 2],
            updatedAt: 1,
          },
        },
        recent: [],
      },
    ],
    [
      "negative accumulated seconds",
      {
        version: 1,
        days: {
          "2026-08-18": {
            totalSec: -1,
            byDomain: { "example.com": -1 },
            byPage: {},
            byHour: new Array(24).fill(0),
            updatedAt: 1,
          },
        },
        recent: [],
      },
    ],
    [
      "a reversed recent segment",
      {
        version: 1,
        days: {},
        recent: [
          {
            startTs: 2,
            endTs: 1,
            domain: "example.com",
            page: "https://example.com",
          },
        ],
      },
    ],
    [
      "a current segment whose counted time exceeds its last heartbeat",
      {
        version: 1,
        days: {},
        recent: [],
        current: {
          key: "example.com https://example.com",
          domain: "example.com",
          page: "https://example.com",
          startTs: 1,
          lastTs: 2,
          countedTs: 3,
        },
      },
    ],
  ])("rejects browser usage with %s", (_label, usage) => {
    localStorage.setItem("themes", JSON.stringify([theme("preserved")]))

    const result = importData(
      makeBackup({
        themes: [theme("incoming")],
        "fluidity.browserUsage.v1": usage,
      })
    )

    expect(result.success).toBe(false)
    expect(result.importedKeys).toEqual([])
    expect(result.errors.join(" ")).toContain("备份数据结构无效")
    expect(JSON.parse(localStorage.getItem("themes") ?? "[]")).toEqual([
      theme("preserved"),
    ])
  })

  it("normalizes supported legacy records and still skips unknown keys", () => {
    const result = importData(
      makeBackup({
        "search-history": ["  legacy search  "],
        "fluidity.homeLayout.v1": {
          order: ["widget:screen-time", "widget:screen-time"],
          hiddenWidgets: [],
        },
        "future-feature": { untouched: true },
      })
    )

    expect(result.success).toBe(true)
    expect(result.skippedKeys).toEqual(["future-feature"])
    expect(JSON.parse(localStorage.getItem("search-history") ?? "[]"))
      .toEqual([{ query: "legacy search", engine: "", timestamp: 0 }])
  })

  it("normalizes a minimal legacy browser usage store before writing it", async () => {
    const chromeValues = new Map<string, unknown>()
    vi.stubGlobal("chrome", {
      runtime: { lastError: undefined },
      storage: {
        local: {
          get(keys: string[], callback: (result: Record<string, unknown>) => void) {
            callback(
              Object.fromEntries(
                keys.flatMap(key =>
                  chromeValues.has(key) ? [[key, chromeValues.get(key)]] : []
                )
              )
            )
          },
          set(value: Record<string, unknown>, callback: () => void) {
            Object.entries(value).forEach(([key, item]) => {
              chromeValues.set(key, item)
            })
            callback()
          },
          remove(key: string, callback: () => void) {
            chromeValues.delete(key)
            callback()
          },
        },
      },
    })

    const result = await importDataAsync(
      makeBackup({
        "fluidity.browserUsage.v1": { version: 1, days: {}, recent: [] },
      })
    )

    expect(result.success).toBe(true)
    expect(chromeValues.get("fluidity.browserUsage.v1")).toMatchObject({
      version: 1,
      updatedAt: 0,
      retentionDays: 30,
      intervalMs: 5000,
      maxGapMs: 15000,
      current: null,
      days: {},
      recent: [],
    })
  })

  it("rolls back every local key when one write fails", () => {
    localStorage.setItem("search-settings", JSON.stringify({ engine: "old" }))
    localStorage.setItem("themes", JSON.stringify(["old-theme"]))
    const originalSetItem = Storage.prototype.setItem
    let injected = false
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key: string,
      value: string
    ) {
      if (key === "themes" && !injected) {
        injected = true
        throw new Error("quota")
      }
      return originalSetItem.call(this, key, value)
    })

    const result = importData(
      makeBackup({
        "search-settings": searchSettings("new"),
        themes: [theme("new-theme")],
      }),
      { overwrite: true }
    )

    expect(result.success).toBe(false)
    expect(result.importedKeys).toEqual([])
    expect(JSON.parse(localStorage.getItem("search-settings") ?? "{}")).toEqual({
      engine: "old",
    })
    expect(JSON.parse(localStorage.getItem("themes") ?? "[]")).toEqual([
      "old-theme",
    ])
    expect(result.rollbackComplete).toBe(true)
    expect(result.failedKeys).toEqual([])
  })

  it("reports an incomplete local rollback without claiming recovery", () => {
    localStorage.setItem("search-settings", JSON.stringify({ engine: "old" }))
    const originalSetItem = Storage.prototype.setItem
    let operationFailed = false
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key: string,
      value: string
    ) {
      if (key === "themes" && !operationFailed) {
        operationFailed = true
        throw new Error("quota")
      }
      if (operationFailed && key === "search-settings") {
        throw new Error("restore failed")
      }
      return originalSetItem.call(this, key, value)
    })

    const result = importData(
      makeBackup({
        "search-settings": searchSettings("new"),
        themes: [theme("new-theme")],
      })
    )

    expect(result.success).toBe(false)
    expect(result.rollbackComplete).toBe(false)
    expect(result.failedKeys).toEqual(["search-settings"])
    expect(result.errors.join(" ")).toContain("回滚未完整完成")
  })

  it("rejects a future incompatible backup before writing", () => {
    localStorage.setItem("themes", JSON.stringify(["safe"]))
    const result = importData({
      ...makeBackup({ themes: ["unsafe"] }),
      version: "2.0.0",
    })
    expect(result.success).toBe(false)
    expect(JSON.parse(localStorage.getItem("themes") ?? "[]")).toEqual(["safe"])
  })

  it("does not report extension-storage backup fields as unknown skips", () => {
    const result = importData(
      makeBackup({
        themes: [theme("imported")],
        "fluidity.browserUsage.v1": { version: 1, days: {}, recent: [] },
      })
    )

    expect(result.success).toBe(true)
    expect(result.skippedKeys).not.toContain("fluidity.browserUsage.v1")
    expect(result.importedKeys).toEqual(["themes"])
  })

  it("reports chrome-storage keys whose rollback also fails", async () => {
    let runtimeError: { message: string } | undefined
    const chromeValues = new Map<string, unknown>()
    vi.stubGlobal("chrome", {
      runtime: {
        get lastError() {
          return runtimeError
        },
      },
      storage: {
        local: {
          get(keys: string[], callback: (result: Record<string, unknown>) => void) {
            callback(
              Object.fromEntries(
                keys.flatMap(key =>
                  chromeValues.has(key) ? [[key, chromeValues.get(key)]] : []
                )
              )
            )
          },
          set(value: Record<string, unknown>, callback: () => void) {
            Object.entries(value).forEach(([key, item]) => {
              chromeValues.set(key, item)
            })
            runtimeError = { message: "chrome import failed" }
            callback()
            runtimeError = undefined
          },
          remove(_key: string, callback: () => void) {
            runtimeError = { message: "chrome rollback failed" }
            callback()
            runtimeError = undefined
          },
        },
      },
    })
    localStorage.setItem("themes", JSON.stringify(["before"]))

    const result = await importDataAsync(
      makeBackup({
        themes: [theme("after")],
        "fluidity.browserUsage.v1": { version: 1, days: {}, recent: [] },
      })
    )

    expect(result.success).toBe(false)
    expect(result.rollbackComplete).toBe(false)
    expect(result.failedKeys).toEqual(["fluidity.browserUsage.v1"])
    expect(result.skippedKeys).not.toContain("fluidity.browserUsage.v1")
    expect(JSON.parse(localStorage.getItem("themes") ?? "[]")).toEqual([
      "before",
    ])
  })

  it("preserves a local value changed while an async import is in flight", async () => {
    let runtimeError: { message: string } | undefined
    vi.stubGlobal("chrome", {
      runtime: {
        get lastError() {
          return runtimeError
        },
      },
      storage: {
        local: {
          get(keys: string[], callback: (result: Record<string, unknown>) => void) {
            callback(Object.fromEntries(keys.map(key => [key, undefined])))
          },
          set(_value: Record<string, unknown>, callback: () => void) {
            localStorage.setItem("themes", JSON.stringify(["concurrent"]))
            runtimeError = { message: "chrome import failed" }
            callback()
            runtimeError = undefined
          },
          remove(_key: string, callback: () => void) {
            callback()
          },
        },
      },
    })
    localStorage.setItem("themes", JSON.stringify(["before"]))

    const result = await importDataAsync(
      makeBackup({
        themes: [theme("imported")],
        "fluidity.browserUsage.v1": { version: 1, days: {}, recent: [] },
      })
    )

    expect(result.success).toBe(false)
    expect(result.rollbackComplete).toBe(false)
    expect(result.failedKeys).toContain("themes")
    expect(result.errors.join(" ")).toContain("导入期间产生的新数据")
    expect(JSON.parse(localStorage.getItem("themes") ?? "[]")).toEqual([
      "concurrent",
    ])
  })

  it("fails before usage replacement and preserves a concurrent heartbeat", async () => {
    let runtimeError: { message: string } | undefined
    const usageKey = "fluidity.browserUsage.v1"
    const domainKey = "fluidity.browserUsage.domainApps.v1"
    const concurrentUsage = { version: 1, days: { today: 12 }, recent: [] }
    const chromeValues = new Map<string, unknown>()
    vi.stubGlobal("chrome", {
      runtime: {
        get lastError() {
          return runtimeError
        },
      },
      storage: {
        local: {
          get(keys: string[], callback: (result: Record<string, unknown>) => void) {
            callback(
              Object.fromEntries(
                keys.flatMap(key =>
                  chromeValues.has(key) ? [[key, chromeValues.get(key)]] : []
                )
              )
            )
          },
          set(value: Record<string, unknown>, callback: () => void) {
            const [key, next] = Object.entries(value)[0]
            if (key === domainKey) {
              chromeValues.set(usageKey, concurrentUsage)
              runtimeError = { message: "second chrome import failed" }
              callback()
              runtimeError = undefined
              return
            }
            chromeValues.set(key, next)
            callback()
          },
          remove(key: string, callback: () => void) {
            chromeValues.delete(key)
            callback()
          },
        },
      },
    })

    const result = await importDataAsync(
      makeBackup({
        [usageKey]: { version: 1, days: {}, recent: [] },
        [domainKey]: {},
      })
    )

    expect(result.success).toBe(false)
    expect(result.rollbackComplete).toBe(true)
    expect(result.failedKeys).toEqual([])
    expect(chromeValues.get(usageKey)).toEqual(concurrentUsage)
  })

  it("rolls back a semantically equal chrome value despite reordered keys", async () => {
    const domainKey = "fluidity.browserUsage.domainApps.v1"
    const settingsKey = "fluidity.browserUsage.settings.v1"
    const originalDomain = {
      "example.com": { name: "Before", updatedAt: 1, source: "manual" },
    }
    const importedDomain = {
      "example.com": { name: "After", updatedAt: 2, source: "ai" },
    }
    const originalSettings = {
      enabled: false,
      includePagePath: false,
      includePageTitle: false,
    }
    const chromeValues = new Map<string, unknown>([
      [domainKey, originalDomain],
      [settingsKey, originalSettings],
    ])
    vi.stubGlobal("chrome", {
      runtime: {
        lastError: undefined,
        sendMessage(
          _message: unknown,
          callback: (response: { ok: boolean; error?: string }) => void
        ) {
          callback({ ok: false, error: "registration failed" })
        },
      },
      storage: {
        local: {
          get(keys: string[], callback: (result: Record<string, unknown>) => void) {
            callback(
              Object.fromEntries(
                keys.flatMap(key =>
                  chromeValues.has(key) ? [[key, chromeValues.get(key)]] : []
                )
              )
            )
          },
          set(value: Record<string, unknown>, callback: () => void) {
            Object.entries(value).forEach(([key, item]) => {
              if (key === domainKey) {
                const domain = item as typeof importedDomain
                const record = domain["example.com"]
                chromeValues.set(key, {
                  "example.com": {
                    source: record.source,
                    name: record.name,
                    updatedAt: record.updatedAt,
                  },
                })
              } else {
                chromeValues.set(key, item)
              }
            })
            callback()
          },
          remove(key: string, callback: () => void) {
            chromeValues.delete(key)
            callback()
          },
        },
      },
    })

    const result = await importDataAsync(
      makeBackup({
        [domainKey]: importedDomain,
        [settingsKey]: {
          enabled: true,
          includePagePath: false,
          includePageTitle: false,
        },
      })
    )

    expect(result.success).toBe(false)
    expect(result.rollbackComplete).toBe(true)
    expect(result.failedKeys).toEqual([])
    expect(chromeValues.get(domainKey)).toEqual({
      "example.com": {
        source: "manual",
        name: "Before",
        updatedAt: 1,
      },
    })
  })

  it("returns a structured failure when the chrome snapshot cannot be read", async () => {
    let runtimeError: { message: string } | undefined
    vi.stubGlobal("chrome", {
      runtime: {
        get lastError() {
          return runtimeError
        },
      },
      storage: {
        local: {
          get(_keys: string[], callback: (result: Record<string, unknown>) => void) {
            runtimeError = { message: "snapshot unavailable" }
            callback({})
            runtimeError = undefined
          },
        },
      },
    })
    localStorage.setItem("themes", JSON.stringify(["before"]))

    const result = await importDataAsync(
      makeBackup({
        themes: [theme("after")],
        "fluidity.browserUsage.v1": { version: 1, days: {}, recent: [] },
      })
    )

    expect(result).toMatchObject({
      success: false,
      rollbackComplete: true,
      failedKeys: [],
      importedKeys: [],
    })
    expect(result.errors.join(" ")).toContain("snapshot unavailable")
    expect(JSON.parse(localStorage.getItem("themes") ?? "[]")).toEqual([
      "before",
    ])
  })
})
