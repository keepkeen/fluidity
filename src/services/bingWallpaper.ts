/**
 * Bing 每日壁纸服务
 * 获取 Bing 每日精选壁纸
 */

import { BingRegion } from "../data/data"

const BING_API_BASE = "https://www.bing.com"

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

interface CachedBingWallpaper {
  url: string
  copyright: string
  title: string
  timestamp: number
  region: BingRegion
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
    // 检查缓存
    const cached = this.getCache()
    if (cached && cached.region === region && !this.isCacheExpired(cached)) {
      return {
        url: cached.url,
        copyright: cached.copyright,
        title: cached.title,
        fromCache: true,
      }
    }

    // 获取新数据
    try {
      const data = await this.fetchFromBing(region)
      this.setCache({
        ...data,
        timestamp: Date.now(),
        region,
      })
      return { ...data, fromCache: false }
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
  }> {
    const market = REGION_MARKET_MAP[region]

    // 使用 CORS 代理
    const proxyUrl = "https://api.allorigins.win/raw?url="
    const apiUrl = `${BING_API_BASE}/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=${market}`

    const response = await fetch(proxyUrl + encodeURIComponent(apiUrl))

    if (!response.ok) {
      throw new Error(`Bing API 请求失败: ${response.status}`)
    }

    const data = (await response.json()) as BingImageResponse

    if (!data.images || data.images.length === 0) {
      throw new Error("Bing API 返回数据为空")
    }

    const image = data.images[0]
    // Bing 返回的是相对路径，需要拼接完整 URL
    // 使用 1920x1080 分辨率
    const fullUrl = `${BING_API_BASE}${image.urlbase}_1920x1080.jpg`

    return {
      url: fullUrl,
      copyright: image.copyright,
      title: image.title || "",
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
