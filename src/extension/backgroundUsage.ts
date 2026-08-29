export interface UsageEventSequencer {
  enqueue<T>(task: () => Promise<T> | T): Promise<T>
  acceptTimestamp(timestamp: number): boolean
  primeTimestamp(timestamp: number): void
  resetTimestamp(): void
  getLastTimestamp(): number
}

interface UsageRuntimeResetOperations {
  waitForWrites(): Promise<unknown>
  clearMemory(): void
  resetTimestamp(): void
  removePersisted(): Promise<unknown>
}

/**
 * Resets the service worker's cached usage state in a strict order. Storage is
 * removed only after queued writes settle and the stale in-memory snapshot has
 * been detached, so later idle events cannot resurrect it.
 */
export const resetUsageRuntime = async (
  operations: UsageRuntimeResetOperations
): Promise<void> => {
  await operations.waitForWrites()
  operations.clearMemory()
  operations.resetTimestamp()
  await operations.removePersisted()
}

/** Stop/idle events must not even load usage state after collection is off. */
export const shouldMutateUsageState = (enabled: boolean): boolean => enabled

/**
 * Keeps usage state mutations in arrival order and rejects events that would
 * move the persisted browsing timeline backwards.
 */
export const createUsageEventSequencer = (): UsageEventSequencer => {
  let tail: Promise<void> = Promise.resolve()
  let lastTimestamp = 0

  return {
    enqueue<T>(task: () => Promise<T> | T): Promise<T> {
      const next = tail.then(task)
      tail = next.then(
        () => undefined,
        () => undefined
      )
      return next
    },

    acceptTimestamp(timestamp: number): boolean {
      if (!Number.isFinite(timestamp) || timestamp < lastTimestamp) return false
      lastTimestamp = timestamp
      return true
    },

    primeTimestamp(timestamp: number): void {
      if (!Number.isFinite(timestamp)) return
      lastTimestamp = Math.max(lastTimestamp, timestamp)
    },

    resetTimestamp(): void {
      lastTimestamp = 0
    },

    getLastTimestamp(): number {
      return lastTimestamp
    },
  }
}
