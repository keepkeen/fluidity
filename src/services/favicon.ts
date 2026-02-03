/**
 * Favicon 服务
 * 获取网站图标并缓存到 localStorage
 */

const FAVICON_CACHE_KEY = "favicon-cache"
const LINK_GROUPS_KEY = "link-groups"
const CACHE_EXPIRY_DAYS = 7
const MAX_CACHE_ENTRIES = 500

interface FaviconCacheEntry {
  url: string | null // null 表示获取失败
  timestamp: number
}

type FaviconCache = Record<string, FaviconCacheEntry>

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
  )}&size=${size}&scale_factor=1x`

const getFaviconCandidateUrls = (url: string, size: number): string[] => {
  const domain = extractDomain(url)
  if (!domain) return []

  // Keep original preference order from the UI component:
  // 1) site favicon.ico
  // 2) DuckDuckGo
  // 3) Google
  // 4) Chromium internal favicon cache (as a last-resort fallback)
  const candidates = [
    `https://${domain}/favicon.ico`,
    `https://icons.duckduckgo.com/ip3/${domain}.ico`,
    `https://www.google.com/s2/favicons?domain=${domain}&sz=${size * 2}`,
  ]

  candidates.push(buildChromeFavicon2Url(url, size))

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
  faviconUrl: string | null
): boolean => {
  if (!link || typeof link !== "object") return false
  const value = (link as { value?: unknown }).value
  if (typeof value !== "string") return false
  if (extractDomain(value) !== domain) return false

  const current = (link as { icon?: unknown }).icon
  if (current === faviconUrl) return false
  ;(link as { icon?: string | null }).icon = faviconUrl
  return true
}

const persistToLinkGroups = (url: string, faviconUrl: string | null): void => {
  const domain = extractDomain(url)
  if (!domain) return

  const groups = readLinkGroups()
  if (!groups) return

  let changed = false
  for (const group of groups) {
    const links = getLinksFromGroup(group)
    if (!links) continue
    for (const link of links) {
      if (tryUpdateLinkIconForDomain(link, domain, faviconUrl)) changed = true
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
    return data ? (JSON.parse(data) as FaviconCache) : {}
  } catch {
    return {}
  }
}

/**
 * 保存缓存
 */
const setCache = (cache: FaviconCache): void => {
  try {
    localStorage.setItem(FAVICON_CACHE_KEY, JSON.stringify(cache))
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
  /**
   * 从缓存获取 favicon
   * 返回 undefined 表示未缓存，null 表示缓存了失败状态
   */
  getFromCache(url: string): string | null | undefined {
    const domain = extractDomain(url)
    if (!domain) return null

    const cache = getCache()
    const entry = cache[domain] as FaviconCacheEntry | undefined

    if (entry === undefined) return undefined

    // 检查是否过期
    const expiryTime = CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000
    if (Date.now() - entry.timestamp > expiryTime) {
      return undefined
    }

    return entry.url
  },

  /**
   * 保存到缓存
   */
  saveToCache(url: string, faviconUrl: string | null): void {
    const domain = extractDomain(url)
    if (!domain) return

    const cache = getCache()
    cache[domain] = {
      url: faviconUrl,
      timestamp: Date.now(),
    }

    // 检查是否需要清理
    if (Object.keys(cache).length > MAX_CACHE_ENTRIES * 1.2) {
      cleanupCache()
    } else {
      setCache(cache)
    }

    // Also persist to the link data model so icons can be backed up / synced.
    persistToLinkGroups(url, faviconUrl)
  },

  /**
   * 检查 favicon 是否可用（通过加载图片测试）
   */
  async checkFaviconAvailable(faviconUrl: string): Promise<boolean> {
    return new Promise(resolve => {
      const img = new Image()
      img.onload = () => resolve(true)
      img.onerror = () => resolve(false)
      img.src = faviconUrl
    })
  },

  /**
   * 获取 favicon（带缓存）
   */
  async getFavicon(url: string, size = 32): Promise<string | null> {
    // 先检查缓存
    const cached = this.getFromCache(url)
    if (cached !== undefined) {
      return cached
    }

    const candidates = getFaviconCandidateUrls(url, size)
    if (candidates.length === 0) {
      this.saveToCache(url, null)
      return null
    }

    for (const candidate of candidates) {
      const ok = await this.checkFaviconAvailable(candidate)
      if (ok) {
        this.saveToCache(url, candidate)
        return candidate
      }
    }

    this.saveToCache(url, null)
    return null
  },

  /**
   * 清除缓存
   */
  clearCache(): void {
    localStorage.removeItem(FAVICON_CACHE_KEY)
  },
}
