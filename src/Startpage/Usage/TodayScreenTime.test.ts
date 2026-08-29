import { describe, expect, it } from "vitest"

import { hasScreenTimeTrendData } from "./TodayScreenTime"

describe("screen-time empty state", () => {
  it("does not render an all-zero trend", () => {
    expect(
      hasScreenTimeTrendData(
        [
          { minutes: 0 },
          { minutes: 0 },
        ],
        0
      )
    ).toBe(false)
  })

  it("keeps a trend when today or history contains usage", () => {
    expect(hasScreenTimeTrendData([{ minutes: 5 }], 0)).toBe(true)
    expect(hasScreenTimeTrendData([{ minutes: 0 }], 3)).toBe(true)
  })
})
