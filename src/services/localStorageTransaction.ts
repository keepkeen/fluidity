interface StorageSnapshot {
  key: string
  value: string | null
}

export class LocalStorageTransactionError extends Error {
  readonly originalError: unknown
  readonly rollbackComplete: boolean
  readonly failedKeys: string[]

  constructor(originalError: unknown, failedKeys: string[]) {
    const message =
      originalError instanceof Error ? originalError.message : String(originalError)
    super(message)
    this.name = "LocalStorageTransactionError"
    this.originalError = originalError
    this.failedKeys = [...new Set(failedKeys)]
    this.rollbackComplete = this.failedKeys.length === 0
  }
}

/**
 * Runs a synchronous group of localStorage writes as one recoverable unit.
 * Only the declared keys are restored, so unrelated usage data can continue
 * changing while settings are applied.
 */
export const runLocalStorageTransaction = <T>(
  keys: readonly string[],
  operation: () => T
): T => {
  const snapshots: StorageSnapshot[] = [...new Set(keys)].map(key => ({
    key,
    value: localStorage.getItem(key),
  }))

  try {
    return operation()
  } catch (error) {
    const failedKeys: string[] = []
    for (const snapshot of snapshots.reverse()) {
      try {
        if (snapshot.value === null) localStorage.removeItem(snapshot.key)
        else localStorage.setItem(snapshot.key, snapshot.value)
      } catch {
        failedKeys.push(snapshot.key)
      }
    }
    throw new LocalStorageTransactionError(error, failedKeys)
  }
}
