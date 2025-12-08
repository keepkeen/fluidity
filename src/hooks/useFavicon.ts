/**
 * Favicon React Hook
 * 异步获取网站图标
 */

import { useState, useEffect } from "react"

import { FaviconService } from "../services/favicon"

interface UseFaviconResult {
  favicon: string | null
  loading: boolean
}

/**
 * 获取单个 URL 的 favicon
 */
export const useFavicon = (url: string, size = 16): UseFaviconResult => {
  const [favicon, setFavicon] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!url) {
      setFavicon(null)
      setLoading(false)
      return
    }

    // 先检查缓存
    const cached = FaviconService.getFromCache(url)
    if (cached !== undefined) {
      setFavicon(cached)
      setLoading(false)
      return
    }

    // 异步获取
    setLoading(true)
    void FaviconService.getFavicon(url, size).then(result => {
      setFavicon(result)
      setLoading(false)
    })
  }, [url, size])

  return { favicon, loading }
}

/**
 * 批量获取多个 URL 的 favicon
 */
export const useFavicons = (
  urls: string[],
  size = 16
): Map<string, string | null> => {
  const [favicons, setFavicons] = useState<Map<string, string | null>>(
    new Map()
  )

  useEffect(() => {
    if (urls.length === 0) {
      setFavicons(new Map())
      return
    }

    const newFavicons = new Map<string, string | null>()

    // 先从缓存获取
    const uncachedUrls: string[] = []
    urls.forEach(url => {
      const cached = FaviconService.getFromCache(url)
      if (cached !== undefined) {
        newFavicons.set(url, cached)
      } else {
        uncachedUrls.push(url)
      }
    })

    // 更新已缓存的
    if (newFavicons.size > 0) {
      setFavicons(new Map(newFavicons))
    }

    // 异步获取未缓存的
    if (uncachedUrls.length > 0) {
      void Promise.all(
        uncachedUrls.map(async url => {
          const favicon = await FaviconService.getFavicon(url, size)
          return { url, favicon }
        })
      ).then(results => {
        results.forEach(({ url, favicon }) => {
          newFavicons.set(url, favicon)
        })
        setFavicons(new Map(newFavicons))
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urls.join(","), size])

  return favicons
}
