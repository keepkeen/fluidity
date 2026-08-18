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
export const useFavicon = (
  url: string,
  size = 16,
  icon?: string | null,
  sourceSize = size
): UseFaviconResult => {
  const [state, setState] = useState<UseFaviconResult>(() => {
    const initialIcon =
      typeof icon === "string" &&
      FaviconService.isSufficientSource(icon, sourceSize)
        ? icon
        : null
    if (initialIcon) return { favicon: initialIcon, loading: false }
    if (!url) return { favicon: null, loading: false }

    // 首次渲染就同步读取本地缓存，避免页面重新挂载时先闪回占位字母。
    const cached = FaviconService.getFromCache(url, sourceSize)
    return cached === undefined
      ? { favicon: null, loading: true }
      : { favicon: cached, loading: false }
  })

  useEffect(() => {
    let active = true
    // Preserve custom/high-resolution icon overrides, but upgrade legacy
    // provider URLs whose requested size is too small for this surface.
    if (
      typeof icon === "string" &&
      icon.length > 0 &&
      FaviconService.isSufficientSource(icon, sourceSize)
    ) {
      setState({ favicon: icon, loading: false })
      return () => {
        active = false
      }
    }

    if (!url) {
      setState({ favicon: null, loading: false })
      return () => {
        active = false
      }
    }

    // 先检查缓存
    const cached = FaviconService.getFromCache(url, sourceSize)
    if (cached !== undefined) {
      setState({ favicon: cached, loading: false })
      return () => {
        active = false
      }
    }

    // 异步获取
    setState(current => ({ ...current, loading: true }))
    void FaviconService.getFavicon(url, sourceSize).then(result => {
      if (active) setState({ favicon: result, loading: false })
    })
    return () => {
      active = false
    }
  }, [url, sourceSize, icon])

  return state
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
