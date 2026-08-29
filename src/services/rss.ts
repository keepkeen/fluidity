import { getChromeLocal, hasChromeStorage, setChromeLocal } from "./extensionStore"
import { fetchWithTimeout } from "./http"
import { ensureRssPermissionFor } from "./optionalPermissions"

export const RSS_SUBSCRIPTIONS_KEY = "fluidity.rss.subscriptions.v1"
export const RSS_READ_STATE_KEY = "fluidity.rss.readState.v1"
export const RSS_CACHE_KEY = "fluidity.rss.cache.v1"

const RSS_EVENT = "fluidity:rss-changed"
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024
const MAX_SUBSCRIPTIONS = 20
const MAX_ITEMS_PER_FEED = 50
const DEFAULT_REFRESH_MINUTES = 30

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

export const writeRssSubscriptions = (store: RssSubscriptionStore): void => {
  localStorage.setItem(RSS_SUBSCRIPTIONS_KEY, JSON.stringify(store))
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
): void => {
  const state = readRssReadState()
  state[item.id] = { read, updatedAt: now, feedId: item.feedId }
  writeRssReadState(state)
}

export const setRssItemsRead = (
  items: Pick<RssItem, "id" | "feedId">[],
  read: boolean,
  now = Date.now()
): void => {
  const state = readRssReadState()
  for (const item of items) {
    state[item.id] = { read, updatedAt: now, feedId: item.feedId }
  }
  writeRssReadState(state)
}

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

let cacheMutationQueue: Promise<void> = Promise.resolve()

const writeRssFeedCache = async (
  feedId: string,
  feed: RssFeedCache
): Promise<void> => {
  const mutation = cacheMutationQueue.then(async () => {
    const latest = await readRssCache()
    latest.feeds[feedId] = feed
    await writeRssCache(latest)
  })
  cacheMutationQueue = mutation.catch(() => undefined)
  await mutation
}

const removeRssFeedCache = async (feedId: string): Promise<void> => {
  const mutation = cacheMutationQueue.then(async () => {
    const latest = await readRssCache()
    if (!(feedId in latest.feeds)) return
    delete latest.feeds[feedId]
    await writeRssCache(latest)
  })
  cacheMutationQueue = mutation.catch(() => undefined)
  await mutation
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
  options: { force?: boolean; now?: number } = {}
): Promise<RssFeedCache> => {
  const existingRequest = refreshInFlight.get(subscription.id)
  if (existingRequest) return existingRequest

  const request = (async () => {
    const now = options.now ?? Date.now()
    const cache = await readRssCache()
    const previous = cache.feeds[subscription.id]
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
        await writeRssFeedCache(subscription.id, next)
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
      await writeRssFeedCache(subscription.id, next)
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
      await writeRssFeedCache(subscription.id, next)
      return next
    }
  })()

  refreshInFlight.set(subscription.id, request)
  try {
    return await request
  } finally {
    refreshInFlight.delete(subscription.id)
  }
}

export const addRssSubscription = async (
  inputUrl: string,
  now = Date.now()
): Promise<RssSubscription> => {
  const url = normalizeRssUrl(inputUrl)
  const permitted = await ensureRssPermissionFor(url)
  if (!permitted) throw new Error("没有获得该订阅域名的访问权限")
  const store = readRssSubscriptions()
  const activeCount = Object.values(store.subscriptions).filter(item => !item.deletedAt).length
  if (activeCount >= MAX_SUBSCRIPTIONS) throw new Error("最多可以添加 20 个订阅源")
  const id = rssSubscriptionIdForUrl(url)
  const existing = store.subscriptions[id]
  const draft: RssSubscription = {
    id,
    url,
    title: existing?.title || new URL(url).hostname,
    enabled: true,
    refreshMinutes: existing?.refreshMinutes ?? DEFAULT_REFRESH_MINUTES,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
  const preview = await fetchRssSubscription(draft, { force: true, now })
  if (preview.error && preview.items.length === 0) throw new Error(preview.error)
  const subscription = { ...draft, title: preview.title || draft.title }
  store.subscriptions[id] = subscription
  writeRssSubscriptions(store)
  return subscription
}

export const updateRssSubscription = (
  id: string,
  patch: Partial<Pick<RssSubscription, "title" | "enabled" | "refreshMinutes">>,
  now = Date.now()
): RssSubscription | null => {
  const store = readRssSubscriptions()
  const existing = store.subscriptions[id]
  if (!existing || existing.deletedAt) return null
  const refreshMinutes = [15, 30, 60, 180, 360].includes(Number(patch.refreshMinutes))
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
  writeRssSubscriptions(store)
  return next
}

export const removeRssSubscription = (id: string, now = Date.now()): RssSubscription | null => {
  const store = readRssSubscriptions()
  const existing = store.subscriptions[id]
  if (!existing) return null
  const next = { ...existing, deletedAt: now, updatedAt: now, enabled: false }
  store.subscriptions[id] = next
  writeRssSubscriptions(store)

  const readState = readRssReadState()
  let readStateChanged = false
  for (const [itemId, marker] of Object.entries(readState)) {
    if (marker.feedId !== id) continue
    delete readState[itemId]
    readStateChanged = true
  }
  if (readStateChanged) writeRssReadState(readState)
  void removeRssFeedCache(id).catch(() => undefined)
  return next
}

export const restoreRssSubscription = (id: string, now = Date.now()): RssSubscription | null => {
  const store = readRssSubscriptions()
  const existing = store.subscriptions[id]
  if (!existing) return null
  const next = { ...existing, deletedAt: undefined, updatedAt: now, enabled: true }
  store.subscriptions[id] = next
  writeRssSubscriptions(store)
  return next
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

export const refreshRssSubscriptions = async (
  subscriptionIds: string[],
  options: { force?: boolean } = {}
): Promise<RssFeedCache[]> => {
  const store = readRssSubscriptions()
  const subscriptions = subscriptionIds
    .map(id => store.subscriptions[id])
    .filter((item): item is RssSubscription => Boolean(item?.enabled && !item.deletedAt))
  return await Promise.all(
    subscriptions.map(subscription => fetchRssSubscription(subscription, options))
  )
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
