import { getChromeLocal, hasChromeStorage, setChromeLocal } from "./extensionStore"
import { fetchWithTimeout } from "./http"
import {
  ensureRssPermissionForWithStatus,
  removeRssPermissionFor,
  resolveRssPermissionOrigin,
} from "./optionalPermissions"

export const RSS_SUBSCRIPTIONS_KEY = "fluidity.rss.subscriptions.v1"
export const RSS_READ_STATE_KEY = "fluidity.rss.readState.v1"
export const RSS_CACHE_KEY = "fluidity.rss.cache.v1"

const RSS_EVENT = "fluidity:rss-changed"
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024
const MAX_SUBSCRIPTIONS = 20
const MAX_ITEMS_PER_FEED = 50
const DEFAULT_REFRESH_MINUTES = 30
const MAX_CONCURRENT_REFRESHES = 4
const TOMBSTONE_RETENTION_MS = 90 * 24 * 60 * 60 * 1000
const MAX_SUBSCRIPTION_RECORDS = 80
const RSS_SUBSCRIPTIONS_LOCK = "fluidity:rss-subscriptions"
const RSS_READ_STATE_LOCK = "fluidity:rss-read-state"
const RSS_CACHE_LOCK = "fluidity:rss-cache"

let subscriptionMutationQueue: Promise<void> = Promise.resolve()
let readStateMutationQueue: Promise<void> = Promise.resolve()
let cacheMutationQueue: Promise<void> = Promise.resolve()

const withRssSubscriptionsLock = async <T>(
  operation: () => T | Promise<T>
): Promise<T> => {
  if (typeof navigator !== "undefined" && navigator.locks?.request) {
    return navigator.locks.request(RSS_SUBSCRIPTIONS_LOCK, operation)
  }

  const mutation = subscriptionMutationQueue.then(operation, operation)
  subscriptionMutationQueue = mutation.then(
    () => undefined,
    () => undefined
  )
  return mutation
}

const withRssReadStateLock = async <T>(
  operation: () => T | Promise<T>
): Promise<T> => {
  if (typeof navigator !== "undefined" && navigator.locks?.request) {
    return navigator.locks.request(RSS_READ_STATE_LOCK, operation)
  }

  const mutation = readStateMutationQueue.then(operation, operation)
  readStateMutationQueue = mutation.then(
    () => undefined,
    () => undefined
  )
  return mutation
}

const withRssCacheLock = async <T>(
  operation: () => T | Promise<T>
): Promise<T> => {
  if (typeof navigator !== "undefined" && navigator.locks?.request) {
    return navigator.locks.request(RSS_CACHE_LOCK, operation)
  }

  const mutation = cacheMutationQueue.then(operation, operation)
  cacheMutationQueue = mutation.then(
    () => undefined,
    () => undefined
  )
  return mutation
}

export interface RssSubscription {
  id: string
  url: string
  title: string
  enabled: boolean
  refreshMinutes: number
  createdAt: number
  updatedAt: number
  deletedAt?: number
}

export interface RssSubscriptionStore {
  version: 1
  subscriptions: Record<string, RssSubscription>
}

export interface RssItem {
  id: string
  feedId: string
  title: string
  url: string
  summary: string
  author?: string
  publishedAt: number
}

export interface RssFeedCache {
  feedId: string
  title: string
  etag?: string
  lastModified?: string
  fetchedAt: number
  nextRefreshAt: number
  failureCount: number
  items: RssItem[]
  error?: string
}

export interface RssCacheStore {
  version: 1
  feeds: Record<string, RssFeedCache>
}

export interface RssReadMarker {
  read: boolean
  updatedAt: number
  feedId: string
}

export type RssReadState = Record<string, RssReadMarker>

const hashString = (value: string): string => {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

export const normalizeRssUrl = (value: string): string => {
  const url = new URL(value.trim())
  const isLocal = ["localhost", "127.0.0.1"].includes(url.hostname)
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLocal)) {
    throw new Error("订阅地址必须使用 HTTPS；本机调试地址可以使用 HTTP")
  }
  if (url.username || url.password) throw new Error("订阅地址不能包含账号或密码")
  url.hash = ""
  return url.toString()
}

export const rssSubscriptionIdForUrl = (url: string): string =>
  `rss:${hashString(normalizeRssUrl(url))}`

const emptySubscriptions = (): RssSubscriptionStore => ({
  version: 1,
  subscriptions: {},
})

const emptyCache = (): RssCacheStore => ({ version: 1, feeds: {} })

const emitRssChanged = (): void => {
  window.dispatchEvent(new Event(RSS_EVENT))
}

export const readRssSubscriptions = (): RssSubscriptionStore => {
  try {
    const raw = localStorage.getItem(RSS_SUBSCRIPTIONS_KEY)
    if (!raw) return emptySubscriptions()
    const parsed = JSON.parse(raw) as Partial<RssSubscriptionStore>
    if (!parsed.subscriptions || typeof parsed.subscriptions !== "object") {
      return emptySubscriptions()
    }
    return { version: 1, subscriptions: parsed.subscriptions }
  } catch {
    return emptySubscriptions()
  }
}

export const writeRssSubscriptions = (
  store: RssSubscriptionStore,
  now = Date.now()
): void => {
  const records = Object.values(store.subscriptions)
  const activeSubscriptions = records
    .filter(item => !item.deletedAt)
    .sort((a, b) => b.updatedAt - a.updatedAt)
  const retainedTombstones = records
    .filter(
      item =>
        Boolean(item.deletedAt) &&
        now - (item.deletedAt ?? 0) <= TOMBSTONE_RETENTION_MS
    )
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, Math.max(0, MAX_SUBSCRIPTION_RECORDS - activeSubscriptions.length))
  // Tombstones are sync metadata. They may consume only the records left after
  // every live subscription has been retained.
  const subscriptions = [...activeSubscriptions, ...retainedTombstones]
  localStorage.setItem(
    RSS_SUBSCRIPTIONS_KEY,
    JSON.stringify({
      version: 1,
      subscriptions: Object.fromEntries(
        subscriptions.map(item => [item.id, item])
      ),
    })
  )
  emitRssChanged()
}

export const listRssSubscriptions = (): RssSubscription[] =>
  Object.values(readRssSubscriptions().subscriptions)
    .filter(item => !item.deletedAt)
    .sort((a, b) => a.createdAt - b.createdAt)

export const readRssReadState = (): RssReadState => {
  try {
    const raw = localStorage.getItem(RSS_READ_STATE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as RssReadState)
      : {}
  } catch {
    return {}
  }
}

export const writeRssReadState = (state: RssReadState): void => {
  const entries = Object.entries(state)
    .sort(([, a], [, b]) => b.updatedAt - a.updatedAt)
    .slice(0, 1000)
  localStorage.setItem(RSS_READ_STATE_KEY, JSON.stringify(Object.fromEntries(entries)))
  emitRssChanged()
}

export const setRssItemRead = (
  item: Pick<RssItem, "id" | "feedId">,
  read: boolean,
  now = Date.now()
): Promise<void> =>
  withRssReadStateLock(() => {
    const state = readRssReadState()
    state[item.id] = { read, updatedAt: now, feedId: item.feedId }
    writeRssReadState(state)
  })

export const setRssItemsRead = (
  items: Pick<RssItem, "id" | "feedId">[],
  read: boolean,
  now = Date.now()
): Promise<void> =>
  withRssReadStateLock(() => {
    const state = readRssReadState()
    for (const item of items) {
      state[item.id] = { read, updatedAt: now, feedId: item.feedId }
    }
    writeRssReadState(state)
  })

const localCacheFallbackKey = `${RSS_CACHE_KEY}.web`

export const readRssCache = async (): Promise<RssCacheStore> => {
  if (hasChromeStorage()) {
    return (await getChromeLocal<RssCacheStore>(RSS_CACHE_KEY)) ?? emptyCache()
  }
  try {
    const raw = localStorage.getItem(localCacheFallbackKey)
    return raw ? (JSON.parse(raw) as RssCacheStore) : emptyCache()
  } catch {
    return emptyCache()
  }
}

export const writeRssCache = async (cache: RssCacheStore): Promise<void> => {
  if (hasChromeStorage()) {
    await setChromeLocal(RSS_CACHE_KEY, cache)
    // chrome.storage.onChanged is already part of subscribeRss; emitting the
    // local event as well would make every mounted widget reload twice.
    return
  }
  localStorage.setItem(localCacheFallbackKey, JSON.stringify(cache))
  emitRssChanged()
}

const writeRssFeedCache = async (
  feedId: string,
  feed: RssFeedCache
): Promise<void> => {
  await writeRssFeedsCache([feed])
}

const writeRssFeedsCache = async (feeds: RssFeedCache[]): Promise<void> => {
  await withRssCacheLock(async () => {
    const latest = await readRssCache()
    feeds.forEach(feed => {
      latest.feeds[feed.feedId] = feed
    })
    await writeRssCache(latest)
  })
}

const removeRssFeedCache = async (feedId: string): Promise<void> => {
  await withRssCacheLock(async () => {
    const latest = await readRssCache()
    if (!(feedId in latest.feeds)) return
    delete latest.feeds[feedId]
    await writeRssCache(latest)
  })
}

const readResponseText = async (response: Response): Promise<string> => {
  const reader = response.body?.getReader()
  if (!reader) {
    const text = await response.text()
    if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) {
      throw new Error("订阅内容超过 2 MB")
    }
    return text
  }

  const decoder = new TextDecoder()
  const parts: string[] = []
  let bytesRead = 0

  let chunk = await reader.read()
  while (!chunk.done) {
    const { value } = chunk
    bytesRead += value.byteLength
    if (bytesRead > MAX_RESPONSE_BYTES) {
      await reader.cancel().catch(() => undefined)
      throw new Error("订阅内容超过 2 MB")
    }
    parts.push(decoder.decode(value, { stream: true }))
    chunk = await reader.read()
  }
  parts.push(decoder.decode())
  return parts.join("")
}

const elementsByLocalName = (root: ParentNode, name: string): Element[] =>
  Array.from(root.querySelectorAll("*")).filter(
    element => element.localName.toLowerCase() === name.toLowerCase()
  )

const firstByLocalName = (
  root: ParentNode,
  name: string
): Element | undefined => elementsByLocalName(root, name)[0]

const plainText = (value: string): string => {
  const document = new DOMParser().parseFromString(
    `<body>${value.replace(/<!doctype[^>]*>/gi, "")}</body>`,
    "text/html"
  )
  return (document.body.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 280)
}

const resolveWebUrl = (value: string, baseUrl: string): string | null => {
  try {
    const url = new URL(value.trim(), baseUrl)
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    url.hash = ""
    return url.toString()
  } catch {
    return null
  }
}

const parseDate = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const atomLink = (entry: Element): string => {
  const links = elementsByLocalName(entry, "link")
  const alternate = links.find(link => !link.getAttribute("rel") || link.getAttribute("rel") === "alternate")
  return alternate?.getAttribute("href") ?? alternate?.textContent ?? ""
}

export const parseRssXml = (
  xml: string,
  feedUrl: string,
  feedId = rssSubscriptionIdForUrl(feedUrl),
  now = Date.now()
): { title: string; items: RssItem[] } => {
  if (xml.length > MAX_RESPONSE_BYTES) throw new Error("订阅内容超过 2 MB，已停止解析")
  if (/<!doctype/i.test(xml)) throw new Error("订阅包含不受支持的 DOCTYPE")
  const document = new DOMParser().parseFromString(xml, "application/xml")
  if (document.querySelector("parsererror")) throw new Error("无法解析 RSS / Atom 内容")

  const root = document.documentElement
  const isAtom = root.localName.toLowerCase() === "feed"
  const channel = isAtom ? root : firstByLocalName(root, "channel") ?? root
  const feedTitle = firstByLocalName(channel, "title")?.textContent?.trim() || new URL(feedUrl).hostname
  const entries = isAtom
    ? elementsByLocalName(root, "entry")
    : [
        ...elementsByLocalName(channel, "item"),
        ...(root.localName.toLowerCase() === "rdf"
          ? elementsByLocalName(root, "item")
          : []),
      ]
  const seen = new Set<string>()
  const items: RssItem[] = []

  for (const entry of entries) {
    const title = firstByLocalName(entry, "title")?.textContent?.trim() || "未命名文章"
    const rawLink = isAtom
      ? atomLink(entry)
      : firstByLocalName(entry, "link")?.textContent ?? ""
    const url = resolveWebUrl(rawLink, feedUrl)
    if (!url) continue
    const guid =
      firstByLocalName(entry, "guid")?.textContent?.trim() ||
      firstByLocalName(entry, "id")?.textContent?.trim() ||
      url
    const id = `rss-item:${hashString(`${feedId}|${guid}`)}`
    if (seen.has(id)) continue
    seen.add(id)
    const dateText =
      firstByLocalName(entry, "pubDate")?.textContent ??
      firstByLocalName(entry, "published")?.textContent ??
      firstByLocalName(entry, "updated")?.textContent ??
      undefined
    const description =
      firstByLocalName(entry, "description")?.textContent ??
      firstByLocalName(entry, "summary")?.textContent ??
      firstByLocalName(entry, "content")?.textContent ??
      ""
    items.push({
      id,
      feedId,
      title: title.slice(0, 240),
      url,
      summary: plainText(description),
      author: firstByLocalName(entry, "creator")?.textContent?.trim() || firstByLocalName(entry, "author")?.textContent?.trim() || undefined,
      publishedAt: parseDate(dateText, now),
    })
  }

  return {
    title: feedTitle.slice(0, 120),
    items: items
      .sort((a, b) => b.publishedAt - a.publishedAt)
      .slice(0, MAX_ITEMS_PER_FEED),
  }
}

const refreshInFlight = new Map<string, Promise<RssFeedCache>>()

const backoffMs = (failureCount: number): number => {
  const schedule = [5, 15, 60, 180, 360]
  return schedule[Math.min(Math.max(0, failureCount - 1), schedule.length - 1)] * 60_000
}

export const fetchRssSubscription = async (
  subscription: RssSubscription,
  options: {
    force?: boolean
    now?: number
    signal?: AbortSignal
    persist?: boolean
    previous?: RssFeedCache
  } = {}
): Promise<RssFeedCache> => {
  const existingRequest = options.signal
    ? undefined
    : refreshInFlight.get(subscription.id)
  if (existingRequest) return existingRequest

  const request = (async () => {
    const now = options.now ?? Date.now()
    const cache = options.previous ? null : await readRssCache()
    const previous = options.previous ?? cache?.feeds[subscription.id]
    if (!options.force && previous && previous.nextRefreshAt > now) return previous
    const headers: Record<string, string> = {
      Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5",
    }
    if (previous?.etag) headers["If-None-Match"] = previous.etag
    if (previous?.lastModified) headers["If-Modified-Since"] = previous.lastModified

    try {
      const response = await fetchWithTimeout(
        subscription.url,
        {
          headers,
          credentials: "omit",
          referrerPolicy: "no-referrer",
          cache: "no-store",
          signal: options.signal,
        },
        { timeoutMs: 15_000, retries: 1 }
      )
      if (response.status === 304 && previous) {
        const next = {
          ...previous,
          fetchedAt: now,
          nextRefreshAt: now + subscription.refreshMinutes * 60_000,
          failureCount: 0,
          error: undefined,
        }
        if (options.persist !== false) await writeRssFeedCache(subscription.id, next)
        return next
      }
      if (!response.ok) throw new Error(`订阅请求失败（HTTP ${response.status}）`)
      const contentLength = Number(response.headers.get("content-length") ?? 0)
      if (contentLength > MAX_RESPONSE_BYTES) throw new Error("订阅内容超过 2 MB")
      const xml = await readResponseText(response)
      const parsed = parseRssXml(xml, subscription.url, subscription.id, now)
      const next: RssFeedCache = {
        feedId: subscription.id,
        title: parsed.title,
        etag: response.headers.get("etag") ?? undefined,
        lastModified: response.headers.get("last-modified") ?? undefined,
        fetchedAt: now,
        nextRefreshAt: now + subscription.refreshMinutes * 60_000,
        failureCount: 0,
        items: parsed.items,
      }
      if (options.persist !== false) await writeRssFeedCache(subscription.id, next)
      return next
    } catch (error) {
      const failureCount = (previous?.failureCount ?? 0) + 1
      const next: RssFeedCache = {
        feedId: subscription.id,
        title: previous?.title ?? subscription.title,
        etag: previous?.etag,
        lastModified: previous?.lastModified,
        fetchedAt: previous?.fetchedAt ?? 0,
        nextRefreshAt: now + backoffMs(failureCount),
        failureCount,
        items: previous?.items ?? [],
        error: error instanceof Error ? error.message : "订阅刷新失败",
      }
      if (options.signal?.aborted) throw error
      if (options.persist !== false) await writeRssFeedCache(subscription.id, next)
      return next
    }
  })()

  if (!options.signal) refreshInFlight.set(subscription.id, request)
  try {
    return await request
  } finally {
    if (!options.signal) refreshInFlight.delete(subscription.id)
  }
}

const rollbackUnusedRssPermission = async (url: string): Promise<boolean> =>
  withRssSubscriptionsLock(async () => {
    const origin = resolveRssPermissionOrigin(url)
    const permissionInUse = listRssSubscriptions().some(
      item => resolveRssPermissionOrigin(item.url) === origin
    )
    if (permissionInUse) return true
    return removeRssPermissionFor(url)
  })

const permissionRollbackError = (error: unknown): Error => {
  const message = error instanceof Error ? error.message : "RSS 操作失败"
  return new Error(`${message}；且新授予的订阅域名权限未能撤回，请在扩展设置中检查`)
}

export const addRssSubscription = async (
  inputUrl: string,
  now = Date.now()
): Promise<RssSubscription> => {
  const url = normalizeRssUrl(inputUrl)
  const permission = await ensureRssPermissionForWithStatus(url)
  if (!permission.granted) throw new Error("没有获得该订阅域名的访问权限")
  const id = rssSubscriptionIdForUrl(url)
  let committed = false

  try {
    const initial = readRssSubscriptions().subscriptions[id]
    const draft: RssSubscription = {
      id,
      url,
      title: initial?.title || new URL(url).hostname,
      enabled: true,
      refreshMinutes: initial?.refreshMinutes ?? DEFAULT_REFRESH_MINUTES,
      createdAt: initial?.createdAt ?? now,
      updatedAt: now,
    }
    // The network request intentionally runs outside the global mutation lock.
    // Its result is committed only after re-reading the latest subscription store.
    const preview = await fetchRssSubscription(draft, {
      force: true,
      now,
      persist: false,
    })
    if (preview.error && preview.items.length === 0) throw new Error(preview.error)

    const subscription = await withRssSubscriptionsLock(() => {
      const store = readRssSubscriptions()
      const existing = store.subscriptions[id]
      const activeCount = Object.values(store.subscriptions).filter(
        item => !item.deletedAt
      ).length
      if ((!existing || existing.deletedAt) && activeCount >= MAX_SUBSCRIPTIONS) {
        throw new Error("最多可以添加 20 个订阅源")
      }
      const next: RssSubscription = {
        ...draft,
        title: preview.title || existing?.title || draft.title,
        refreshMinutes: existing?.refreshMinutes ?? draft.refreshMinutes,
        createdAt: existing?.createdAt ?? draft.createdAt,
      }
      store.subscriptions[id] = next
      writeRssSubscriptions(store, now)
      committed = true
      return next
    })
    await writeRssFeedCache(id, preview)
    return subscription
  } catch (error) {
    if (permission.newlyGranted && !committed) {
      const rolledBack = await rollbackUnusedRssPermission(url)
      if (!rolledBack) throw permissionRollbackError(error)
    }
    throw error
  }
}

export const updateRssSubscription = async (
  id: string,
  patch: Partial<Pick<RssSubscription, "title" | "enabled" | "refreshMinutes">>,
  now = Date.now()
): Promise<RssSubscription | null> =>
  withRssSubscriptionsLock(() => {
    const store = readRssSubscriptions()
    const existing = store.subscriptions[id]
    if (!existing || existing.deletedAt) return null
    const refreshMinutes = [15, 30, 60, 180, 360].includes(
      Number(patch.refreshMinutes)
    )
      ? Number(patch.refreshMinutes)
      : existing.refreshMinutes
    const next = {
      ...existing,
      ...patch,
      refreshMinutes,
      title: patch.title?.trim() || existing.title,
      updatedAt: now,
    }
    store.subscriptions[id] = next
    writeRssSubscriptions(store, now)
    return next
  })

export const removeRssSubscription = async (
  id: string,
  now = Date.now()
): Promise<RssSubscription | null> => {
  let permissionRemovalFailed = false
  const next = await withRssSubscriptionsLock(async () => {
    const store = readRssSubscriptions()
    const existing = store.subscriptions[id]
    if (!existing) return null
    const removed = { ...existing, deletedAt: now, updatedAt: now, enabled: false }
    store.subscriptions[id] = removed
    writeRssSubscriptions(store, now)

    const removedOrigin = resolveRssPermissionOrigin(existing.url)
    const originStillInUse = Object.values(store.subscriptions).some(
      item =>
        !item.deletedAt &&
        item.id !== id &&
        resolveRssPermissionOrigin(item.url) === removedOrigin
    )
    if (!originStillInUse) {
      const hasRemovalApi =
        typeof chrome !== "undefined" &&
        Boolean(chrome.runtime?.id) &&
        Boolean(chrome.permissions?.remove)
      if (hasRemovalApi && !(await removeRssPermissionFor(existing.url))) {
        permissionRemovalFailed = true
      }
    }
    return removed
  })
  if (!next) return null

  await withRssReadStateLock(() => {
    const readState = readRssReadState()
    let readStateChanged = false
    for (const [itemId, marker] of Object.entries(readState)) {
      if (marker.feedId !== id) continue
      delete readState[itemId]
      readStateChanged = true
    }
    if (readStateChanged) writeRssReadState(readState)
  })
  await removeRssFeedCache(id).catch(() => undefined)
  if (permissionRemovalFailed) {
    throw new Error("订阅已移除，但域名访问权限未能撤回，请在扩展设置中手动检查")
  }
  return next
}

export const restoreRssSubscription = async (
  id: string,
  now = Date.now()
): Promise<RssSubscription | null> => {
  const candidate = readRssSubscriptions().subscriptions[id]
  if (!candidate) return null
  const permission = await ensureRssPermissionForWithStatus(candidate.url)
  if (!permission.granted) return null
  let committed = false
  let rollbackAttempted = false

  try {
    const restored = await withRssSubscriptionsLock(() => {
      const store = readRssSubscriptions()
      const existing = store.subscriptions[id]
      if (!existing) return null
      const next = {
        ...existing,
        deletedAt: undefined,
        updatedAt: now,
        enabled: true,
      }
      store.subscriptions[id] = next
      writeRssSubscriptions(store, now)
      committed = true
      return next
    })
    if (!restored && permission.newlyGranted) {
      rollbackAttempted = true
      const rolledBack = await rollbackUnusedRssPermission(candidate.url)
      if (!rolledBack) {
        throw new Error("恢复失败，且新授予的订阅域名权限未能撤回，请在扩展设置中检查")
      }
    }
    return restored
  } catch (error) {
    if (permission.newlyGranted && !committed && !rollbackAttempted) {
      const rolledBack = await rollbackUnusedRssPermission(candidate.url)
      if (!rolledBack) throw permissionRollbackError(error)
    }
    throw error
  }
}

export const getRssItems = async (
  subscriptionIds: string[],
  options: { unreadOnly?: boolean } = {}
): Promise<Array<RssItem & { feedTitle: string; read: boolean }>> => {
  const cache = await readRssCache()
  const readState = readRssReadState()
  const subscriptions = readRssSubscriptions().subscriptions
  const activeSubscriptionIds = subscriptionIds.filter(id => {
    const subscription = subscriptions[id]
    return Boolean(subscription?.enabled && !subscription.deletedAt)
  })
  return activeSubscriptionIds
    .flatMap(id => {
      const feed = cache.feeds[id]
      return (feed?.items ?? []).map(item => ({
        ...item,
        feedTitle: feed.title,
        read: Boolean(readState[item.id]?.read),
      }))
    })
    .filter(item => !options.unreadOnly || !item.read)
    .sort((a, b) => b.publishedAt - a.publishedAt)
    .slice(0, 500)
}

export const getRssWidgetData = async (
  subscriptionIds: string[],
  options: { unreadOnly?: boolean } = {}
): Promise<{
  items: Array<RssItem & { feedTitle: string; read: boolean }>
  allItems: Array<RssItem & { feedTitle: string; read: boolean }>
  feeds: RssFeedCache[]
}> => {
  const [cache, readState] = await Promise.all([readRssCache(), Promise.resolve(readRssReadState())])
  const subscriptions = readRssSubscriptions().subscriptions
  const activeIds = subscriptionIds.filter(id => {
    const subscription = subscriptions[id]
    return Boolean(subscription?.enabled && !subscription.deletedAt)
  })
  const allItems = activeIds
    .flatMap(id => {
      const feed = cache.feeds[id]
      return (feed?.items ?? []).map(item => ({
        ...item,
        feedTitle: feed.title,
        read: Boolean(readState[item.id]?.read),
      }))
    })
    .sort((a, b) => b.publishedAt - a.publishedAt)
    .slice(0, 500)
  return {
    items: options.unreadOnly ? allItems.filter(item => !item.read) : allItems,
    allItems,
    feeds: activeIds.map(id => cache.feeds[id]).filter((feed): feed is RssFeedCache => Boolean(feed)),
  }
}

const mapWithConcurrency = async <T, R>(
  values: T[],
  limit: number,
  mapper: (value: T) => Promise<R>
): Promise<R[]> => {
  const results = new Array<R>(values.length)
  let cursor = 0
  const workers = Array.from(
    { length: Math.min(limit, values.length) },
    async () => {
      while (cursor < values.length) {
        const index = cursor
        cursor += 1
        results[index] = await mapper(values[index])
      }
    }
  )
  await Promise.all(workers)
  return results
}

export const refreshRssSubscriptions = async (
  subscriptionIds: string[],
  options: { force?: boolean; signal?: AbortSignal } = {}
): Promise<RssFeedCache[]> => {
  const store = readRssSubscriptions()
  const subscriptions = subscriptionIds
    .map(id => store.subscriptions[id])
    .filter((item): item is RssSubscription => Boolean(item?.enabled && !item.deletedAt))
  if (subscriptions.length === 0) return []
  const initialCache = await readRssCache()
  const feeds = await mapWithConcurrency(
    subscriptions,
    MAX_CONCURRENT_REFRESHES,
    subscription =>
      fetchRssSubscription(subscription, {
        ...options,
        persist: false,
        previous: initialCache.feeds[subscription.id],
      })
  )
  if (options.signal?.aborted) throw new DOMException("请求已取消", "AbortError")
  await writeRssFeedsCache(feeds)
  return feeds
}

export const subscribeRss = (listener: () => void): (() => void) => {
  const onLocal = () => listener()
  const onStorage = (event: StorageEvent) => {
    if ([RSS_SUBSCRIPTIONS_KEY, RSS_READ_STATE_KEY].includes(event.key ?? "")) listener()
  }
  const onChromeStorage = (
    changes: Partial<Record<string, chrome.storage.StorageChange>>,
    areaName: string
  ) => {
    if (areaName === "local" && changes[RSS_CACHE_KEY]) listener()
  }
  window.addEventListener(RSS_EVENT, onLocal)
  window.addEventListener("storage", onStorage)
  if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener(onChromeStorage)
  }
  return () => {
    window.removeEventListener(RSS_EVENT, onLocal)
    window.removeEventListener("storage", onStorage)
    if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
      chrome.storage.onChanged.removeListener(onChromeStorage)
    }
  }
}
