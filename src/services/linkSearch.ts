/**
 * 统一的链接搜索服务
 * 提供链接搜索、导航和设置管理功能
 * 支持缓存和模糊匹配
 */

import { LinkAnalytics } from "./analytics"
import { linkGroup, dataElem } from "../data/data"
import { searchLogger } from "../utils/logger"

/**
 * 搜索结果类型
 */
export interface LinkSearchResult {
  type: "group" | "link"
  groupTitle: string
  groupIndex: number
  linkIndex: number
  label: string
  url?: string
  score?: number // 匹配分数，用于排序
}

// ============ 搜索缓存 ============

interface CacheEntry<T> {
  data: T
  timestamp: number
}

const CACHE_TTL = 5000 // 缓存有效期 5 秒

class SearchCache<T> {
  private cache = new Map<string, CacheEntry<T>>()
  private maxSize = 50

  get(key: string): T | null {
    const entry = this.cache.get(key)
    if (!entry) return null
    if (Date.now() - entry.timestamp > CACHE_TTL) {
      this.cache.delete(key)
      return null
    }
    return entry.data
  }

  set(key: string, data: T): void {
    // 清理过期缓存
    if (this.cache.size >= this.maxSize) {
      const now = Date.now()
      const keysToDelete: string[] = []
      this.cache.forEach((v, k) => {
        if (now - v.timestamp > CACHE_TTL) {
          keysToDelete.push(k)
        }
      })
      keysToDelete.forEach(k => this.cache.delete(k))
    }
    // 如果仍然超出限制，删除最旧的
    if (this.cache.size >= this.maxSize) {
      const firstKey = Array.from(this.cache.keys())[0]
      if (firstKey) this.cache.delete(firstKey)
    }
    this.cache.set(key, { data, timestamp: Date.now() })
  }

  clear(): void {
    this.cache.clear()
  }
}

const searchCache = new SearchCache<LinkSearchResult[]>()
const linksOnlyCache = new SearchCache<(dataElem & { groupTitle: string })[]>()

/**
 * 清除搜索缓存（当链接数据变化时调用）
 */
export const clearSearchCache = (): void => {
  searchCache.clear()
  linksOnlyCache.clear()
}

// ============ 模糊匹配 ============

/**
 * 计算模糊匹配分数
 * 分数越高匹配越好
 */
const calculateMatchScore = (text: string, query: string): number => {
  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()

  // 完全匹配
  if (lowerText === lowerQuery) return 100

  // 以查询开头
  if (lowerText.startsWith(lowerQuery)) return 90

  // 包含完整查询
  if (lowerText.includes(lowerQuery)) return 70

  // 模糊匹配：检查查询字符是否按顺序出现在文本中
  let queryIndex = 0
  let consecutiveBonus = 0
  let lastMatchIndex = -2

  for (let i = 0; i < lowerText.length && queryIndex < lowerQuery.length; i++) {
    if (lowerText[i] === lowerQuery[queryIndex]) {
      // 连续匹配加分
      if (i === lastMatchIndex + 1) {
        consecutiveBonus += 5
      }
      lastMatchIndex = i
      queryIndex++
    }
  }

  // 所有查询字符都找到了
  if (queryIndex === lowerQuery.length) {
    const baseScore = 50
    const lengthDiff = lowerText.length - lowerQuery.length
    const lengthPenalty = Math.max(0, lengthDiff / 2)
    return Math.max(10, baseScore + consecutiveBonus - lengthPenalty)
  }

  return 0
}

/**
 * 链接打开设置
 */
export interface LinkOpenSettings {
  openInNewTab: boolean // 是否在新标签页打开
}

const LINK_OPEN_SETTINGS_KEY = "link-open-settings"

/**
 * 默认链接打开设置
 */
export const defaultLinkOpenSettings: LinkOpenSettings = {
  openInNewTab: false,
}

/**
 * 链接打开设置管理
 */
export const LinkOpenSettingsManager = {
  get: (): LinkOpenSettings => {
    try {
      const data = localStorage.getItem(LINK_OPEN_SETTINGS_KEY)
      if (data) {
        const parsed = JSON.parse(data) as Partial<LinkOpenSettings>
        return { ...defaultLinkOpenSettings, ...parsed }
      }
    } catch {
      searchLogger.error("Failed to load link open settings")
    }
    return defaultLinkOpenSettings
  },

  set: (settings: LinkOpenSettings): void => {
    localStorage.setItem(LINK_OPEN_SETTINGS_KEY, JSON.stringify(settings))
  },
}

/**
 * 搜索链接
 * @param linkGroups 链接分组
 * @param query 搜索关键词
 * @returns 搜索结果
 */
export const searchLinks = (
  linkGroups: linkGroup[],
  query: string
): LinkSearchResult[] => {
  const q = query.toLowerCase().trim()
  const results: LinkSearchResult[] = []

  linkGroups.forEach((group, groupIndex) => {
    const groupMatches = group.title.toLowerCase().includes(q)
    const matchingLinks = group.links
      .map((link, linkIndex) => ({ link, linkIndex }))
      .filter(
        ({ link }) =>
          link.label.toLowerCase().includes(q) ||
          link.value.toLowerCase().includes(q)
      )

    const shouldIncludeGroup =
      q === "" || groupMatches || matchingLinks.length > 0
    if (!shouldIncludeGroup) return

    results.push({
      type: "group",
      groupTitle: group.title,
      groupIndex,
      linkIndex: -1,
      label: group.title,
    })

    const linksToShow =
      q === "" || groupMatches
        ? group.links.map((link, linkIndex) => ({ link, linkIndex }))
        : matchingLinks

    linksToShow.forEach(({ link, linkIndex }) => {
      results.push({
        type: "link",
        groupTitle: group.title,
        groupIndex,
        linkIndex,
        label: link.label,
        url: link.value,
      })
    })
  })

  return results
}

/**
 * 仅搜索链接（不包含分组标题）
 * 支持模糊匹配和缓存
 * @param linkGroups 链接分组
 * @param query 搜索关键词
 * @param options 搜索选项
 * @returns 匹配的链接列表（按相关性排序）
 */
export const searchLinksOnly = (
  linkGroups: linkGroup[],
  query: string,
  options: { fuzzy?: boolean; minScore?: number } = {}
): (dataElem & { groupTitle: string; score?: number })[] => {
  const q = query.toLowerCase().trim()
  if (!q) return []

  const { fuzzy = true, minScore = 10 } = options

  // 检查缓存
  const cacheKey = `${q}-${String(fuzzy)}-${minScore}`
  const cached = linksOnlyCache.get(cacheKey)
  if (cached) return cached

  const results: (dataElem & { groupTitle: string; score?: number })[] = []

  linkGroups.forEach(group => {
    group.links.forEach(link => {
      // 计算标签和 URL 的匹配分数
      const labelScore = calculateMatchScore(link.label, q)
      const urlScore = calculateMatchScore(link.value, q) * 0.5 // URL 匹配权重较低
      const score = Math.max(labelScore, urlScore)

      if (fuzzy ? score >= minScore : score >= 70) {
        results.push({
          ...link,
          groupTitle: group.title,
          score,
        })
      }
    })
  })

  // 按分数降序排序
  results.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))

  // 缓存结果
  linksOnlyCache.set(cacheKey, results)

  return results
}

/**
 * 获取最佳匹配的链接（用于自动补全）
 * @param linkGroups 链接分组
 * @param query 搜索关键词
 * @returns 最佳匹配的链接，如果没有则返回 null
 */
export const getBestMatch = (
  linkGroups: linkGroup[],
  query: string
): (dataElem & { groupTitle: string }) | null => {
  const results = searchLinksOnly(linkGroups, query)
  if (results.length === 0) return null

  // 优先返回标签以查询开头的结果
  const startsWithMatch = results.find(r =>
    r.label.toLowerCase().startsWith(query.toLowerCase())
  )
  if (startsWithMatch) return startsWithMatch

  // 否则返回第一个结果
  return results[0]
}

/**
 * 导航到链接
 * @param url 链接地址
 * @param label 链接标签
 * @param groupTitle 分组标题
 * @param openInNewTab 是否在新标签页打开（如果未指定，使用设置中的值）
 */
export const navigateToLink = (
  url: string,
  label: string,
  groupTitle: string,
  openInNewTab?: boolean
): void => {
  // 记录点击
  LinkAnalytics.trackClick(url, label, groupTitle)

  // 确定是否在新标签页打开
  const shouldOpenInNewTab =
    openInNewTab ?? LinkOpenSettingsManager.get().openInNewTab

  if (shouldOpenInNewTab) {
    window.open(url, "_blank", "noopener,noreferrer")
  } else {
    window.location.href = url
  }
}

/**
 * 获取链接索引列表（用于键盘导航）
 */
export const getLinkIndices = (results: LinkSearchResult[]): number[] =>
  results.map((r, i) => (r.type === "link" ? i : -1)).filter(i => i !== -1)
