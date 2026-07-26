/**
 * Bing 每日壁纸服务
 * 获取 Bing 每日精选壁纸
 */

import { BingRegion } from "../data/data"

const BING_BASE_DEFAULT = "https://www.bing.com"
const BING_BASE_CN = "https://cn.bing.com"

const BING_BASE_BY_REGION: Record<BingRegion, string> = {
  cn: BING_BASE_CN,
  "en-US": BING_BASE_DEFAULT,
  "ja-JP": BING_BASE_DEFAULT,
  "de-DE": BING_BASE_DEFAULT,
}

interface BingImageResponse {
  images: {
    url: string
    urlbase: string
    copyright: string
    copyrightlink: string
    title: string
    startdate: string
    enddate: string
  }[]
}

const REGION_MARKET_MAP: Record<BingRegion, string> = {
  cn: "zh-CN",
  "en-US": "en-US",
  "ja-JP": "ja-JP",
  "de-DE": "de-DE",
}

const CACHE_KEY = "bing-wallpaper-cache"
const CACHE_DURATION = 6 * 60 * 60 * 1000 // 6小时缓存

const FETCH_TIMEOUT_MS = 10_000
const CORS_PROXY_ALLORIGINS = "https://api.allorigins.win/raw?url="
const BING_WALLPAPER_POOL_SIZE = 8

const toAbsoluteUrl = (base: string, raw: string): string => {
  if (raw.startsWith("http")) return raw
  if (raw.startsWith("//")) return `https:${raw}`
  return `${base}${raw.startsWith("/") ? "" : "/"}${raw}`
}

const randomInt = (maxExclusive: number): number => {
  if (maxExclusive <= 1) return 0
  try {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      const buf = new Uint32Array(1)
      crypto.getRandomValues(buf)
      return buf[0] % maxExclusive
    }
  } catch {
    // ignore
  }
  return Math.floor(Math.random() * maxExclusive)
}

const tryFetchJsonWithTimeout = async <T>(url: string): Promise<T> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
      redirect: "follow",
    })

    if (!response.ok) {
      const body = await response.text().catch(() => "")
      const bodySuffix = body ? `, body=${body.slice(0, 200)}` : ""
      throw new Error(`Bing API 请求失败: ${response.status}${bodySuffix}`)
    }

    return (await response.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

const fetchFirstBingResponse = async (
  apiUrls: string[]
): Promise<{ data: BingImageResponse; usedBase: string }> => {
  let lastError: unknown = null

  // 1) 扩展环境（newtab / popup 等）通常可直接跨域请求（已有 host_permissions），优先直连 Bing。
  for (const apiUrl of apiUrls) {
    try {
      const data = await tryFetchJsonWithTimeout<BingImageResponse>(apiUrl)
      return { data, usedBase: new URL(apiUrl).origin }
    } catch (error) {
      lastError = error
    }
  }

  // 2) 兜底：普通网页会受 CORS 限制，尝试通过公共 CORS 代理获取。
  for (const apiUrl of apiUrls) {
    try {
      const proxiedUrl = CORS_PROXY_ALLORIGINS + encodeURIComponent(apiUrl)
      const data = await tryFetchJsonWithTimeout<BingImageResponse>(proxiedUrl)
      return { data, usedBase: new URL(apiUrl).origin }
    } catch (error) {
      lastError = error
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Bing API 请求失败（未知错误）")
}

interface CachedBingWallpaper {
  url: string
  copyright: string
  title: string
  pool?: { url: string; copyright: string; title: string }[]
  lastPickedUrl?: string
  timestamp: number
  region: BingRegion
}

const normalizeCachedPick = (
  cached: CachedBingWallpaper
): { url: string; copyright: string; title: string } => {
  // Keep the currently selected wallpaper stable across calls.
  // `pool` exists only to support future "shuffle" features; we do not rotate
  // automatically on every `getWallpaper()` call, otherwise preview/background
  // can diverge.
  return { url: cached.url, copyright: cached.copyright, title: cached.title }
}

export const BingWallpaperService = {
  /**
   * 获取 Bing 每日壁纸
   * 优先使用缓存，缓存过期后重新获取
   */
  async getWallpaper(region: BingRegion = "cn"): Promise<{
    url: string
    copyright: string
    title: string
    fromCache: boolean
  }> {
    const cached = this.getCache()
    const isValidCache =
      cached && cached.region === region && !this.isCacheExpired(cached)
    if (isValidCache) {
      const picked = normalizeCachedPick(cached)
      if (!cached.lastPickedUrl) {
        // Backfill without changing the active wallpaper.
        this.setCache({ ...cached, lastPickedUrl: picked.url })
      }
      return { ...picked, fromCache: true }
    }

    try {
      const data = await this.fetchFromBing(region)
      this.setCache({
        ...data,
        lastPickedUrl: data.url,
        timestamp: Date.now(),
        region,
      })
      return {
        url: data.url,
        copyright: data.copyright,
        title: data.title,
        fromCache: false,
      }
    } catch (error) {
      // 如果获取失败但有过期缓存，仍然使用缓存
      if (cached) {
        return {
          url: cached.url,
          copyright: cached.copyright,
          title: cached.title,
          fromCache: true,
        }
      }
      throw error
    }
  },

  /**
   * 从 Bing API 获取壁纸
   */
  async fetchFromBing(region: BingRegion): Promise<{
    url: string
    copyright: string
    title: string
    pool: { url: string; copyright: string; title: string }[]
  }> {
    const market = REGION_MARKET_MAP[region]

    const primaryBase = BING_BASE_BY_REGION[region]
    const candidateBases =
      primaryBase === BING_BASE_CN
        ? [BING_BASE_CN, BING_BASE_DEFAULT]
        : [BING_BASE_DEFAULT, BING_BASE_CN]

    const candidateApiUrls = candidateBases.map(
      base =>
        `${base}/HPImageArchive.aspx?format=js&idx=0&n=${BING_WALLPAPER_POOL_SIZE}&mkt=${market}`
    )

    const { data, usedBase } = await fetchFirstBingResponse(candidateApiUrls)

    if (data.images.length === 0) {
      throw new Error("Bing API 返回数据为空")
    }

    const base = usedBase || primaryBase

    const pool = data.images
      .map(image => {
        const raw =
          image.url.trim() ||
          (image.urlbase ? `${image.urlbase}_1920x1080.jpg` : "")
        if (!raw) return null
        return {
          url: toAbsoluteUrl(base, raw),
          copyright: image.copyright,
          title: image.title || "",
        }
      })
      .filter(Boolean) as { url: string; copyright: string; title: string }[]

    if (pool.length === 0) {
      throw new Error("Bing API 图片字段缺失（url/urlbase）")
    }

    const picked = pool[randomInt(pool.length)]

    return {
      url: picked.url,
      copyright: picked.copyright,
      title: picked.title,
      pool,
    }
  },

  /**
   * 获取缓存
   */
  getCache(): CachedBingWallpaper | null {
    try {
      const data = localStorage.getItem(CACHE_KEY)
      return data ? (JSON.parse(data) as CachedBingWallpaper) : null
    } catch {
      return null
    }
  },

  /**
   * 设置缓存
   */
  setCache(data: CachedBingWallpaper): void {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data))
  },

  /**
   * 检查缓存是否过期
   */
  isCacheExpired(cache: CachedBingWallpaper): boolean {
    return Date.now() - cache.timestamp > CACHE_DURATION
  },

  /**
   * 清除缓存
   */
  clearCache(): void {
    localStorage.removeItem(CACHE_KEY)
  },

  /**
   * 强制刷新壁纸
   */
  async refresh(region: BingRegion = "cn") {
    this.clearCache()
    return this.getWallpaper(region)
  },
}
