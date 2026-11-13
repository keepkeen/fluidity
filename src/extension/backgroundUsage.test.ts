import { describe, expect, it } from "vitest"

import {
  createUsageEventSequencer,
  replaceUsageRuntime,
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

  it("makes an imported snapshot the last write before reloading memory", async () => {
    const order: string[] = []
    const imported = { updatedAt: 500, days: { imported: true } }
    let pending: object | null = { updatedAt: 100, days: { stale: true } }
    let persisted: object = imported
    let cached: object | null = pending
    let primedTimestamp = 0

    await replaceUsageRuntime({
      discardPendingWrite: () => {
        order.push("pending:discarded")
        pending = null
      },
      waitForWrites: async () => {
        order.push("writes:settled")
        // An already-issued background write can finish after the UI import.
        persisted = { updatedAt: 200, days: { stale: true } }
        // Its failure handler may also reintroduce a retry checkpoint.
        pending = { updatedAt: 200, days: { stale: true } }
      },
      capturePersisted: async () => {
        order.push("storage:captured")
        return persisted
      },
      persistReplacement: async () => {
        order.push("replacement:persisted")
        persisted = imported
      },
      restorePersisted: async previous => {
        order.push("storage:restored")
        persisted = previous as object
      },
      clearMemory: () => {
        order.push("memory:cleared")
        cached = null
      },
      resetTimestamp: () => {
        order.push("timestamp:reset")
        primedTimestamp = 0
      },
      reloadPersisted: async () => {
        order.push("storage:reloaded")
        cached = persisted
        return 500
      },
      primeTimestamp: timestamp => {
        order.push("timestamp:primed")
        primedTimestamp = timestamp
      },
    })

    expect(order).toEqual([
      "pending:discarded",
      "writes:settled",
      "pending:discarded",
      "storage:captured",
      "replacement:persisted",
      "memory:cleared",
      "timestamp:reset",
      "storage:reloaded",
      "timestamp:primed",
    ])
    expect(pending).toBeNull()
    expect(persisted).toBe(imported)
    expect(cached).toBe(imported)
    expect(primedTimestamp).toBe(500)
  })

  it("restores the previous persisted and in-memory state when replacement fails", async () => {
    const previous = { updatedAt: 300, days: { previous: true } }
    let persisted: object | undefined = previous
    let cached: object | null = previous
    let primedTimestamp = 0

    await expect(
      replaceUsageRuntime({
        discardPendingWrite: () => undefined,
        waitForWrites: async () => undefined,
        capturePersisted: async () => persisted,
        persistReplacement: async () => {
          persisted = { updatedAt: 500, days: { imported: true } }
          throw new Error("reload failed")
        },
        restorePersisted: async snapshot => {
          persisted = snapshot as object | undefined
        },
        clearMemory: () => {
          cached = null
        },
        resetTimestamp: () => {
          primedTimestamp = 0
        },
        reloadPersisted: async () => {
          cached = persisted ?? null
          return Number((persisted as { updatedAt?: number } | undefined)?.updatedAt ?? 0)
        },
        primeTimestamp: timestamp => {
          primedTimestamp = timestamp
        },
      })
    ).rejects.toThrow("reload failed")

    expect(persisted).toEqual(previous)
    expect(cached).toEqual(previous)
    expect(primedTimestamp).toBe(300)
  })

  it("blocks idle and stop mutations after collection is disabled", () => {
    expect(shouldMutateUsageState(false)).toBe(false)
    expect(shouldMutateUsageState(true)).toBe(true)
  })
})
