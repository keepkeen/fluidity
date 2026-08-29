/**
 * Favicon 服务
 * 获取网站图标并缓存到 localStorage
 */

const FAVICON_CACHE_KEY = "favicon-cache"
const LINK_GROUPS_KEY = "link-groups"
const CACHE_EXPIRY_DAYS = 7
const MAX_CACHE_ENTRIES = 500
const ICON_LOAD_TIMEOUT_MS = 5000

interface FaviconCacheEntry {
  url: string | null // null 表示获取失败
  timestamp: number
  sourceSize?: number
}

type FaviconCache = Record<string, FaviconCacheEntry>

let cachedRaw: string | null | undefined
let cachedParsed: FaviconCache = {}
const faviconInFlight = new Map<string, Promise<string | null>>()

/**
 * 从 URL 提取域名
 */
const extractDomain = (url: string): string | null => {
  try {
    const urlObj = new URL(url)
    return urlObj.hostname
  } catch {
    return null
  }
}

// `chrome://favicon2` is Chromium-only; if unsupported, image load will fail.
const buildChromeFavicon2Url = (pageUrl: string, size: number): string =>
  `chrome://favicon2/?page_url=${encodeURIComponent(
    pageUrl
  )}&size=${size}&scale_factor=2x`

const normalizedSourceSize = (size: number): number =>
  Math.min(256, Math.max(32, Math.ceil(size)))

const inferSourceSize = (faviconUrl: string | null): number => {
  if (!faviconUrl) return 0
  try {
    const parsed = new URL(faviconUrl)
    const size = Number(parsed.searchParams.get("sz") ?? parsed.searchParams.get("size"))
    return Number.isFinite(size) ? size : 0
  } catch {
    return 0
  }
}

const getFaviconCandidateUrls = (url: string, size: number): string[] => {
  const domain = extractDomain(url)
  if (!domain) return []

  const targetOrigin = (() => {
    try {
      return new URL(url).origin
    } catch {
      return null
    }
  })()
  const siteFaviconUrl = `https://${domain}/favicon.ico`
  const duckDuckGoFaviconUrl = `https://icons.duckduckgo.com/ip3/${domain}.ico`
  const sourceSize = normalizedSourceSize(size)
  const googleFaviconUrl = `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(
    targetOrigin ?? `https://${domain}`
  )}&sz=${sourceSize}`

  // The startpage usually renders links from other origins. Some sites block
  // direct favicon loads with CORP, and some icon services return noisy 404s.
  const isCrossOriginPage =
    Boolean(targetOrigin) && window.location.origin !== targetOrigin

  // Keep original preference order from the UI component:
  // 1) site favicon.ico
  // 2) DuckDuckGo
  // 3) Google
  // 4) Chromium internal favicon cache (as a last-resort fallback)
  const candidates = isCrossOriginPage
    ? [googleFaviconUrl]
    : [siteFaviconUrl, duckDuckGoFaviconUrl, googleFaviconUrl]

  candidates.push(buildChromeFavicon2Url(url, sourceSize))

  return candidates
}

const readLinkGroups = (): unknown[] | null => {
  const raw = localStorage.getItem(LINK_GROUPS_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

const getLinksFromGroup = (group: unknown): unknown[] | null => {
  if (!group || typeof group !== "object") return null
  const links = (group as { links?: unknown }).links
  return Array.isArray(links) ? links : null
}

const tryUpdateLinkIconForDomain = (
  link: unknown,
  domain: string,
  faviconUrl: string,
  sourceSize: number
): boolean => {
  if (!link || typeof link !== "object") return false
  const value = (link as { value?: unknown }).value
  if (typeof value !== "string") return false
  if (extractDomain(value) !== domain) return false

  const current = (link as { icon?: unknown }).icon
  if (current === faviconUrl) return false
  if (typeof current === "string" && current.length > 0) {
    const currentSize = inferSourceSize(current)
    // Unknown icon URLs may be user-provided. Preserve them instead of
    // replacing them with a provider result whose quality we can compare.
    if (currentSize === 0 || currentSize > sourceSize) return false
  }
  (link as { icon?: string }).icon = faviconUrl
  return true
}

const persistToLinkGroups = (
  url: string,
  faviconUrl: string,
  sourceSize: number
): void => {
  const domain = extractDomain(url)
  if (!domain) return

  const groups = readLinkGroups()
  if (!groups) return

  let changed = false
  for (const group of groups) {
    const links = getLinksFromGroup(group)
    if (!links) continue
    for (const link of links) {
      if (tryUpdateLinkIconForDomain(link, domain, faviconUrl, sourceSize)) {
        changed = true
      }
    }
  }

  if (!changed) return
  try {
    localStorage.setItem(LINK_GROUPS_KEY, JSON.stringify(groups))
  } catch {
    // ignore
  }
}

/**
 * 获取缓存
 */
const getCache = (): FaviconCache => {
  try {
    const data = localStorage.getItem(FAVICON_CACHE_KEY)
    if (data === cachedRaw) return cachedParsed
    cachedRaw = data
    cachedParsed = data ? (JSON.parse(data) as FaviconCache) : {}
    return cachedParsed
  } catch {
    cachedRaw = undefined
    cachedParsed = {}
    return {}
  }
}

/**
 * 保存缓存
 */
const setCache = (cache: FaviconCache): void => {
  try {
    const serialized = JSON.stringify(cache)
    localStorage.setItem(FAVICON_CACHE_KEY, serialized)
    cachedRaw = serialized
    cachedParsed = cache
  } catch {
    // localStorage 可能已满，忽略错误
  }
}

/**
 * 清理过期和超量的缓存条目
 */
const cleanupCache = (): void => {
  const cache = getCache()
  const now = Date.now()
  const expiryTime = CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000

  // 过滤过期条目
  const validEntries = Object.entries(cache).filter(
    ([, entry]) => now - entry.timestamp < expiryTime
  )

  // 如果仍然超量，按时间排序并保留最新的
  if (validEntries.length > MAX_CACHE_ENTRIES) {
    validEntries.sort((a, b) => b[1].timestamp - a[1].timestamp)
    validEntries.length = MAX_CACHE_ENTRIES
  }

  const newCache: FaviconCache = {}
  validEntries.forEach(([domain, entry]) => {
    newCache[domain] = entry
  })

  setCache(newCache)
}

/**
 * Favicon 服务
 */
export const FaviconService = {
  isSufficientSource(faviconUrl: string, minimumSize: number): boolean {
    const inferred = inferSourceSize(faviconUrl)
    // Unknown URLs may be user-provided/custom and must not be discarded.
    return inferred === 0 || inferred >= normalizedSourceSize(minimumSize)
  },

  /**
   * 从缓存获取 favicon
   * 返回 undefined 表示未缓存，null 表示缓存了失败状态
   */
  getFromCache(
    url: string,
    minimumSize = 0
  ): string | null | undefined {
    const domain = extractDomain(url)
    if (!domain) return null

    const cache = getCache()
    const entry = cache[domain] as FaviconCacheEntry | undefined

    if (entry === undefined) return undefined

    // 检查是否过期
    const expiryDays = entry.url === null ? 1 : CACHE_EXPIRY_DAYS
    const expiryTime = expiryDays * 24 * 60 * 60 * 1000
    if (Date.now() - entry.timestamp > expiryTime) {
      return undefined
    }

    const storedSize = entry.sourceSize ?? inferSourceSize(entry.url)
    if (
      entry.url &&
      storedSize > 0 &&
      storedSize < normalizedSourceSize(minimumSize)
    ) {
      return undefined
    }

    return entry.url
  },

  /**
   * 保存到缓存
   */
  saveToCache(
    url: string,
    faviconUrl: string | null,
    sourceSize = 0
  ): void {
    const domain = extractDomain(url)
    if (!domain) return

    const cache = getCache()
    const existing = cache[domain]
    const existingSize = existing?.sourceSize ?? inferSourceSize(existing?.url ?? null)
    const nextSize =
      faviconUrl === null
        ? normalizedSourceSize(sourceSize)
        : Math.max(sourceSize, inferSourceSize(faviconUrl))

    // Resolution is monotonic per domain. A late low-resolution lookup or a
    // failed lookup must not erase a successful, higher-quality result.
    if (
      existing?.url &&
      (faviconUrl === null || existingSize === 0 || existingSize > nextSize)
    ) {
      return
    }

    cache[domain] = {
      url: faviconUrl,
      timestamp: Date.now(),
      sourceSize: nextSize,
    }

    // 检查是否需要清理
    if (Object.keys(cache).length > MAX_CACHE_ENTRIES * 1.2) {
      cleanupCache()
    } else {
      setCache(cache)
    }

    // Only successful results belong in the link data model. A failed lookup
    // is useful as a short-lived cache marker but must not erase a saved icon.
    if (faviconUrl) persistToLinkGroups(url, faviconUrl, nextSize)
  },

  /**
   * 检查 favicon 是否可用（通过加载图片测试）
   */
  async checkFaviconAvailable(faviconUrl: string): Promise<boolean> {
    return new Promise(resolve => {
      const img = new Image()
      let settled = false
      const finish = (available: boolean) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        img.onload = null
        img.onerror = null
        resolve(available)
      }
      const timer = setTimeout(() => finish(false), ICON_LOAD_TIMEOUT_MS)
      img.onload = () => finish(true)
      img.onerror = () => finish(false)
      img.src = faviconUrl
    })
  },

  /**
   * 获取 favicon（带缓存）
   */
  async getFavicon(url: string, size = 32): Promise<string | null> {
    const sourceSize = normalizedSourceSize(size)
    // 先检查缓存
    const cached = this.getFromCache(url, sourceSize)
    if (cached !== undefined) {
      return cached
    }

    const domain = extractDomain(url)
    const requestKey = domain ? `${domain}:${sourceSize}` : `${url}:${sourceSize}`
    const existingRequest = faviconInFlight.get(requestKey)
    if (existingRequest) return existingRequest

    const request = (async () => {
      const candidates = getFaviconCandidateUrls(url, sourceSize)
      if (candidates.length === 0) {
        this.saveToCache(url, null, sourceSize)
        return null
      }

      for (const candidate of candidates) {
        const ok = await this.checkFaviconAvailable(candidate)
        if (ok) {
          this.saveToCache(url, candidate, sourceSize)
          const effective = this.getFromCache(url)
          return effective === undefined ? candidate : effective
        }
      }

      this.saveToCache(url, null, sourceSize)
      const effective = this.getFromCache(url)
      return effective === undefined ? null : effective
    })()

    faviconInFlight.set(requestKey, request)
    try {
      return await request
    } finally {
      faviconInFlight.delete(requestKey)
    }
  },

  /**
   * 清除缓存
   */
  clearCache(): void {
    localStorage.removeItem(FAVICON_CACHE_KEY)
    cachedRaw = null
    cachedParsed = {}
  },
}
