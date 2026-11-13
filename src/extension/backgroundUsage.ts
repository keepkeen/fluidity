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

interface UsageRuntimeReplaceOperations {
  discardPendingWrite(): void
  waitForWrites(): Promise<unknown>
  capturePersisted(): Promise<unknown>
  persistReplacement(): Promise<unknown>
  restorePersisted(previous: unknown): Promise<unknown>
  clearMemory(): void
  resetTimestamp(): void
  reloadPersisted(): Promise<number>
  primeTimestamp(timestamp: number): void
}

/**
 * Replaces the service worker's cached usage snapshot with an imported one.
 *
 * The caller must run this inside the usage event queue. A heartbeat queued
 * before the replacement may leave a debounced checkpoint behind, so detach
 * that checkpoint before waiting for writes that have already reached
 * storage. The imported value is then persisted once more from inside the
 * queue, making it the last write, before memory is reloaded from storage.
 */
export const replaceUsageRuntime = async (
  operations: UsageRuntimeReplaceOperations
): Promise<void> => {
  operations.discardPendingWrite()
  await operations.waitForWrites()
  // A failed in-flight write can schedule its retry while waitForWrites is
  // settling. Detach that retry as well before the replacement becomes final.
  operations.discardPendingWrite()
  const previous = await operations.capturePersisted()
  try {
    await operations.persistReplacement()
    operations.clearMemory()
    operations.resetTimestamp()
    const latestTimestamp = await operations.reloadPersisted()
    operations.primeTimestamp(latestTimestamp)
  } catch (error) {
    await operations.restorePersisted(previous)
    operations.clearMemory()
    operations.resetTimestamp()
    const restoredTimestamp = await operations.reloadPersisted()
    operations.primeTimestamp(restoredTimestamp)
    throw error
  }
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
