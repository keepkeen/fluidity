/**
 * Favicon 服务
 * 获取网站图标并缓存到 localStorage
 */

const FAVICON_CACHE_KEY = "favicon-cache"
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
   * 获取 Google Favicon API URL
   */
  getFaviconUrl(url: string, size = 32): string | null {
    const domain = extractDomain(url)
    if (!domain) return null
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=${size}`
  },

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

    // 获取 favicon URL
    const faviconUrl = this.getFaviconUrl(url, size)
    if (!faviconUrl) {
      this.saveToCache(url, null)
      return null
    }

    // 检查是否可用
    const isAvailable = await this.checkFaviconAvailable(faviconUrl)
    if (isAvailable) {
      this.saveToCache(url, faviconUrl)
      return faviconUrl
    } else {
      this.saveToCache(url, null)
      return null
    }
  },

  /**
   * 清除缓存
   */
  clearCache(): void {
    localStorage.removeItem(FAVICON_CACHE_KEY)
  },
}
