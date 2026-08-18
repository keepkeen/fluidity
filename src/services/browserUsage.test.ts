import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  BROWSER_USAGE_STORAGE_KEY,
  BrowserUsageStoreV1,
  getTodayBrowserUsageSummary,
} from "./browserUsage"

const NOW = new Date(2026, 7, 18, 15, 0, 0).getTime()

const installChromeStore = (store: BrowserUsageStoreV1) => {
  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: {
      storage: {
        local: {
          get: (_keys: string[], callback: (result: object) => void) =>
            callback({ [BROWSER_USAGE_STORAGE_KEY]: store }),
        },
      },
    },
  })
}

const createStore = (): BrowserUsageStoreV1 => ({
  version: 1,
  updatedAt: NOW - 2000,
  retentionDays: 30,
  intervalMs: 5000,
  maxGapMs: 15000,
  current: {
    key: "example.com https://example.com",
    domain: "example.com",
    page: "https://example.com",
    startTs: NOW - 2000,
    lastTs: NOW - 2000,
    countedTs: NOW - 2000,
  },
  recent: [],
  days: {},
})

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
  Reflect.deleteProperty(globalThis, "chrome")
})

describe("getTodayBrowserUsageSummary", () => {
  it("shows the live first heartbeat before a second heartbeat arrives", async () => {
    installChromeStore(createStore())

    const summary = await getTodayBrowserUsageSummary()

    expect(summary.totalSec).toBeCloseTo(2)
    expect(summary.topDomains[0]).toEqual({ domain: "example.com", sec: 2 })
  })

  it("adds only the uncounted current tail to persisted totals", async () => {
    const store = createStore()
    store.current = { ...store.current!, startTs: NOW - 5000, countedTs: NOW - 1000 }
    const today = "2026-08-18"
    store.days[today] = {
      totalSec: 4,
      byDomain: { "example.com": 4 },
      byPage: {
        "https://example.com": { sec: 4, domain: "example.com" },
      },
      byHour: new Array<number>(24).fill(0),
      updatedAt: NOW - 1000,
    }
    installChromeStore(store)

    const summary = await getTodayBrowserUsageSummary()

    expect(summary.totalSec).toBeCloseTo(5)
    expect(summary.topDomains[0]?.sec).toBeCloseTo(5)
  })
})
