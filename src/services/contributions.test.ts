import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { TodoContributions } from "./contributions"

const STORAGE_KEY = "todo-contributions"

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("getMonthBeforeLastTotal", () => {
  it("returns last year's November when current month is January", () => {
    vi.setSystemTime(new Date(2026, 0, 15))
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        "2025-11-10": 3,
        "2025-12-10": 5,
        "2026-11-10": 7,
      })
    )
    expect(TodoContributions.getMonthBeforeLastTotal()).toBe(3)
  })

  it("returns last year's December when current month is February", () => {
    vi.setSystemTime(new Date(2026, 1, 15))
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        "2025-12-10": 5,
        "2026-12-10": 9,
      })
    )
    expect(TodoContributions.getMonthBeforeLastTotal()).toBe(5)
  })

  it("stays in the same year from March onwards", () => {
    vi.setSystemTime(new Date(2026, 3, 15))
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        "2026-02-10": 4,
        "2025-02-10": 8,
      })
    )
    expect(TodoContributions.getMonthBeforeLastTotal()).toBe(4)
  })
})

describe("weekday names", () => {
  it("computes weekdays from local time, not UTC", () => {
    // 2026-07-26 是周日
    vi.setSystemTime(new Date(2026, 6, 26, 12, 0, 0))
    const days = TodoContributions.getLast7Days()
    expect(days[6]).toMatchObject({ date: "2026-07-26", weekday: "日" })
    expect(days[0]).toMatchObject({ date: "2026-07-20", weekday: "一" })
  })
})

describe("period strings", () => {
  it("formats month strings with zero padding", () => {
    expect(TodoContributions.getMonthString(new Date(2026, 0, 5))).toBe(
      "2026-01"
    )
    expect(TodoContributions.getMonthString(new Date(2026, 11, 31))).toBe(
      "2026-12"
    )
  })

  it("formats week strings", () => {
    expect(TodoContributions.getWeekString(new Date(2026, 0, 5))).toMatch(
      /^2026-W\d{2}$/
    )
  })
})
