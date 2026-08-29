import { describe, expect, it } from "vitest"

import {
  createUsageEventSequencer,
  resetUsageRuntime,
  shouldMutateUsageState,
} from "./backgroundUsage"

describe("usage event sequencing", () => {
  it("runs async state mutations strictly in arrival order", async () => {
    const sequencer = createUsageEventSequencer()
    const order: string[] = []
    let releaseFirst: (() => void) | undefined

    const first = sequencer.enqueue(async () => {
      order.push("first:start")
      await new Promise<void>(resolve => {
        releaseFirst = resolve
      })
      order.push("first:end")
    })
    const second = sequencer.enqueue(() => {
      order.push("second")
    })

    await Promise.resolve()
    expect(order).toEqual(["first:start"])

    releaseFirst?.()
    await Promise.all([first, second])
    expect(order).toEqual(["first:start", "first:end", "second"])
  })

  it("rejects timestamps older than persisted or already accepted events", () => {
    const sequencer = createUsageEventSequencer()
    sequencer.primeTimestamp(200)

    expect(sequencer.acceptTimestamp(199)).toBe(false)
    expect(sequencer.acceptTimestamp(200)).toBe(true)
    expect(sequencer.acceptTimestamp(250)).toBe(true)
    expect(sequencer.acceptTimestamp(220)).toBe(false)
    expect(sequencer.getLastTimestamp()).toBe(250)
    sequencer.resetTimestamp()
    expect(sequencer.getLastTimestamp()).toBe(0)
  })

  it("detaches cached state before removing persisted usage", async () => {
    const order: string[] = []
    let cached: { days: string[] } | null = { days: ["stale"] }
    let persisted: { days: string[] } | undefined = { days: ["stale"] }

    await resetUsageRuntime({
      waitForWrites: async () => {
        order.push("writes:settled")
      },
      clearMemory: () => {
        order.push("memory:cleared")
        cached = null
      },
      resetTimestamp: () => order.push("timestamp:reset"),
      removePersisted: async () => {
        order.push("storage:removed")
        persisted = undefined
      },
    })

    const loadAfterReset = () => cached ?? persisted ?? { days: [] }
    expect(order).toEqual([
      "writes:settled",
      "memory:cleared",
      "timestamp:reset",
      "storage:removed",
    ])
    expect(loadAfterReset()).toEqual({ days: [] })
  })

  it("blocks idle and stop mutations after collection is disabled", () => {
    expect(shouldMutateUsageState(false)).toBe(false)
    expect(shouldMutateUsageState(true)).toBe(true)
  })
})
