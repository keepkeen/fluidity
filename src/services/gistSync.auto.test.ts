import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { startGistAutoSync } from "./gistSync"

const CONFIG_KEY = "fluidity.gistSync.config.v1"
const LEADER_KEY = "fluidity-sync.leader.v1"

describe("startGistAutoSync", () => {
  let stop: (() => void) | undefined
  let config: Record<string, unknown>
  let storageListeners: Set<
    (
      changes: Partial<Record<string, chrome.storage.StorageChange>>,
      areaName: string
    ) => void
  >

  beforeEach(() => {
    localStorage.clear()
    config = {}
    storageListeners = new Set()
    Object.defineProperty(globalThis, "chrome", {
      configurable: true,
      value: {
        storage: {
          local: {
            get: (keys: string[], callback: (value: Record<string, unknown>) => void) =>
              callback(Object.fromEntries(keys.map(key => [key, config[key]]))),
            set: (values: Record<string, unknown>, callback: () => void) => {
              Object.assign(config, values)
              callback()
            },
          },
          onChanged: {
            addListener: (
              listener: (
                changes: Partial<Record<string, chrome.storage.StorageChange>>,
                areaName: string
              ) => void
            ) => storageListeners.add(listener),
            removeListener: (
              listener: (
                changes: Partial<Record<string, chrome.storage.StorageChange>>,
                areaName: string
              ) => void
            ) => storageListeners.delete(listener),
          },
        },
      },
    })
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-30T00:00:00Z"))
  })

  afterEach(() => {
    stop?.()
    stop = undefined
    vi.useRealTimers()
    localStorage.clear()
    Reflect.deleteProperty(globalThis, "chrome")
  })

  it("does not elect or renew a leader until sync is enabled", async () => {
    stop = startGistAutoSync("startpage")
    await Promise.resolve()
    await Promise.resolve()

    expect(localStorage.getItem(LEADER_KEY)).toBeNull()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(localStorage.getItem(LEADER_KEY)).toBeNull()

    const enabledConfig = { enabled: true, deviceId: "test-device" }
    config[CONFIG_KEY] = enabledConfig
    for (const listener of [...storageListeners]) {
      listener(
        { [CONFIG_KEY]: { oldValue: undefined, newValue: enabledConfig } },
        "local"
      )
    }
    expect(localStorage.getItem(LEADER_KEY)).not.toBeNull()

    const disabledConfig = { enabled: false, deviceId: "test-device" }
    config[CONFIG_KEY] = disabledConfig
    for (const listener of [...storageListeners]) {
      listener(
        { [CONFIG_KEY]: { oldValue: enabledConfig, newValue: disabledConfig } },
        "local"
      )
    }
    expect(localStorage.getItem(LEADER_KEY)).toBeNull()

    await vi.advanceTimersByTimeAsync(10_000)
    expect(localStorage.getItem(LEADER_KEY)).toBeNull()
  })

  it("takes over an expired leader lease and pulls without a storage event", async () => {
    config[CONFIG_KEY] = { enabled: true, deviceId: "test-device" }
    localStorage.setItem(
      LEADER_KEY,
      JSON.stringify({
        id: "stale-leader",
        expiresAt: Date.now() + 6000,
      })
    )
    const statuses: Array<{ state: string; message?: string }> = []
    const onStatus = (event: Event) => {
      statuses.push(
        (event as CustomEvent<{ state: string; message?: string }>).detail
      )
    }
    window.addEventListener(
      "fluidity-sync.runtimeStatus.changed",
      onStatus
    )

    try {
      stop = startGistAutoSync("popup")
      await Promise.resolve()
      await Promise.resolve()

      expect(JSON.parse(localStorage.getItem(LEADER_KEY) ?? "{}").id).toBe(
        "stale-leader"
      )

      await vi.advanceTimersByTimeAsync(7000)

      const leader = JSON.parse(localStorage.getItem(LEADER_KEY) ?? "{}") as {
        id?: string
      }
      expect(leader.id).toMatch(/^popup_/)
      expect(statuses).toContainEqual(
        expect.objectContaining({
          state: "syncing",
          message: "正在拉取…",
        })
      )
    } finally {
      window.removeEventListener(
        "fluidity-sync.runtimeStatus.changed",
        onStatus
      )
    }
  })
})
