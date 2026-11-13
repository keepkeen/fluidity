/**
 * Node 26 exposes an experimental, unconfigured `localStorage` global. It can
 * shadow jsdom's implementation with `undefined`, so install the same minimal
 * Storage contract explicitly for deterministic browser-service tests.
 */
class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()

  get length(): number {
    return this.values.size
  }

  clear(): void {
    this.values.clear()
  }

  getItem(key: string): string | null {
    return this.values.get(String(key)) ?? null
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null
  }

  removeItem(key: string): void {
    this.values.delete(String(key))
  }

  setItem(key: string, value: string): void {
    this.values.set(String(key), String(value))
  }
}

Object.defineProperties(globalThis, {
  Storage: { configurable: true, value: MemoryStorage },
  localStorage: { configurable: true, value: new MemoryStorage() },
  sessionStorage: { configurable: true, value: new MemoryStorage() },
})
