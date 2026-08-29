export const LATER_READ_KEY = "fluidity.laterRead.v1"

const LATER_READ_EVENT = "fluidity:later-read-changed"
const DAY_MS = 24 * 60 * 60 * 1000
const TOMBSTONE_RETENTION_MS = 90 * DAY_MS
const COMPLETED_RETENTION_MS = 30 * DAY_MS
const MAX_ITEMS = 500

export interface LaterReadItem {
  id: string
  url: string
  title: string
  createdAt: number
  updatedAt: number
  openedAt?: number
  completedAt?: number
  snoozedUntil?: number
  deletedAt?: number
}

export interface LaterReadStoreV1 {
  version: 1
  items: Record<string, LaterReadItem>
}

const emptyStore = (): LaterReadStoreV1 => ({ version: 1, items: {} })

const normalizeUrl = (value: string): string | null => {
  try {
    const url = new URL(value.trim())
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    url.hash = ""
    return url.toString()
  } catch {
    return null
  }
}

const hashString = (value: string): string => {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

export const laterReadIdForUrl = (url: string): string =>
  `later:${hashString(normalizeUrl(url) ?? url.trim())}`

const isItem = (value: unknown): value is LaterReadItem => {
  if (!value || typeof value !== "object") return false
  const item = value as Partial<LaterReadItem>
  return (
    typeof item.id === "string" &&
    typeof item.url === "string" &&
    typeof item.title === "string" &&
    typeof item.createdAt === "number" &&
    typeof item.updatedAt === "number"
  )
}

export const readLaterStore = (): LaterReadStoreV1 => {
  try {
    const raw = localStorage.getItem(LATER_READ_KEY)
    if (!raw) return emptyStore()
    const parsed = JSON.parse(raw) as Partial<LaterReadStoreV1>
    if (!parsed.items || typeof parsed.items !== "object") return emptyStore()
    const items: Record<string, LaterReadItem> = {}
    for (const value of Object.values(parsed.items)) {
      if (isItem(value)) items[value.id] = value
    }
    return { version: 1, items }
  } catch {
    return emptyStore()
  }
}

const pruneStore = (store: LaterReadStoreV1, now: number): LaterReadStoreV1 => {
  const eligible = Object.values(store.items)
    .filter(item => {
      if (item.deletedAt) return now - item.deletedAt <= TOMBSTONE_RETENTION_MS
      if (item.completedAt) {
        return now - item.completedAt <= COMPLETED_RETENTION_MS
      }
      return true
    })
    .sort((a, b) => b.updatedAt - a.updatedAt)
  const active = eligible.filter(item => !item.deletedAt && !item.completedAt)
  const history = eligible.filter(item => item.deletedAt || item.completedAt)
  // Capacity pruning must never silently delete an unfinished item. Active
  // inbox entries are all retained; only completed items and tombstones use
  // the bounded historical allowance.
  const retained = [
    ...active,
    ...history.slice(0, Math.max(0, MAX_ITEMS - active.length)),
  ]
  return {
    version: 1,
    items: Object.fromEntries(retained.map(item => [item.id, item])),
  }
}

export const writeLaterReadStore = (
  store: LaterReadStoreV1,
  now = Date.now()
): void => {
  localStorage.setItem(LATER_READ_KEY, JSON.stringify(pruneStore(store, now)))
  window.dispatchEvent(new Event(LATER_READ_EVENT))
}

const updateItem = (
  id: string,
  updater: (item: LaterReadItem) => LaterReadItem,
  now: number
): LaterReadItem | null => {
  const store = readLaterStore()
  const existing = store.items[id]
  if (!existing) return null
  const next = updater(existing)
  store.items[id] = { ...next, updatedAt: now }
  writeLaterReadStore(store, now)
  return store.items[id]
}

export const addLaterRead = (
  url: string,
  title: string,
  now = Date.now()
): LaterReadItem | null => {
  const normalized = normalizeUrl(url)
  if (!normalized) return null
  const store = readLaterStore()
  const id = laterReadIdForUrl(normalized)
  const existing = store.items[id]
  const item: LaterReadItem = {
    id,
    url: normalized,
    title: title.trim() || new URL(normalized).hostname,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    openedAt: existing?.openedAt,
  }
  store.items[id] = item
  writeLaterReadStore(store, now)
  return item
}

export const listLaterRead = (options: {
  now?: number
  includeCompleted?: boolean
  includeSnoozed?: boolean
} = {}): LaterReadItem[] => {
  const now = options.now ?? Date.now()
  return Object.values(readLaterStore().items)
    .filter(item => !item.deletedAt)
    .filter(item => options.includeCompleted || !item.completedAt)
    .filter(
      item =>
        options.includeSnoozed ||
        !item.snoozedUntil ||
        item.snoozedUntil <= now
    )
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export const markLaterReadOpened = (
  id: string,
  now = Date.now()
): LaterReadItem | null =>
  updateItem(id, item => ({ ...item, openedAt: now }), now)

export const completeLaterRead = (
  id: string,
  now = Date.now()
): LaterReadItem | null =>
  updateItem(
    id,
    item => ({
      ...item,
      completedAt: now,
      snoozedUntil: undefined,
      deletedAt: undefined,
    }),
    now
  )

export const restoreLaterRead = (
  id: string,
  now = Date.now()
): LaterReadItem | null =>
  updateItem(
    id,
    item => ({
      ...item,
      completedAt: undefined,
      snoozedUntil: undefined,
      deletedAt: undefined,
    }),
    now
  )

export const snoozeLaterRead = (
  id: string,
  days = 7,
  now = Date.now()
): LaterReadItem | null =>
  updateItem(
    id,
    item => ({
      ...item,
      snoozedUntil: now + Math.max(1, days) * DAY_MS,
      completedAt: undefined,
      deletedAt: undefined,
    }),
    now
  )

export const removeLaterRead = (
  id: string,
  now = Date.now()
): LaterReadItem | null =>
  updateItem(id, item => ({ ...item, deletedAt: now }), now)

export const restoreLaterReadSnapshot = (
  item: LaterReadItem,
  now = Date.now()
): void => {
  const store = readLaterStore()
  store.items[item.id] = { ...item, updatedAt: now }
  writeLaterReadStore(store, now)
}

export const subscribeLaterRead = (listener: () => void): (() => void) => {
  const onLocal = () => listener()
  const onStorage = (event: StorageEvent) => {
    if (event.key === LATER_READ_KEY) listener()
  }
  window.addEventListener(LATER_READ_EVENT, onLocal)
  window.addEventListener("storage", onStorage)
  return () => {
    window.removeEventListener(LATER_READ_EVENT, onLocal)
    window.removeEventListener("storage", onStorage)
  }
}

export const isLaterReadUrl = (url: string): boolean => {
  const normalized = normalizeUrl(url)
  if (!normalized) return false
  const item = readLaterStore().items[laterReadIdForUrl(normalized)]
  return Boolean(item && !item.deletedAt && !item.completedAt)
}
