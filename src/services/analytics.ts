/**
 * 用户行为分析服务
 * 收集链接点击、搜索历史等数据，用于 AI 智能提示
 */

// 链接点击记录
export interface LinkClickRecord {
  label: string
  url: string
  group: string
  clicks: number
  lastClicked: number
  // 保留最近30天的点击时间戳
  clickHistory: number[]
}

// 搜索历史记录
export interface SearchRecord {
  query: string
  engine: string
  timestamp: number
}

/** Normalizes pre-0.6 string history entries into the current record model. */
export const normalizeSearchRecords = (value: unknown): SearchRecord[] => {
  if (!Array.isArray(value)) return []
  return value.flatMap(entry => {
    if (typeof entry === "string" && entry.trim()) {
      return [{ query: entry.trim(), engine: "", timestamp: 0 }]
    }
    if (!entry || typeof entry !== "object") return []
    const record = entry as Partial<SearchRecord>
    if (
      typeof record.query !== "string" ||
      typeof record.engine !== "string" ||
      typeof record.timestamp !== "number" ||
      !Number.isFinite(record.timestamp)
    ) {
      return []
    }
    return [record as SearchRecord]
  })
}

// 分析数据汇总
export interface AnalyticsSummary {
  topLinks: { label: string; group: string; clicks: number }[]
  recentSearches: string[]
  activeHours: number[] // 0-23 小时的活跃度
  totalClicks: number
  totalSearches: number
}

const STORAGE_KEYS = {
  LINK_ANALYTICS: "link-analytics",
  SEARCH_HISTORY: "search-history",
  AI_SETTINGS: "ai-settings",
}

interface CollectionSettings {
  collectLinkClicks: boolean
  collectSearchHistory: boolean
}

/**
 * 获取数据收集设置
 */
const getCollectionSettings = (): CollectionSettings => {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.AI_SETTINGS)
    if (data) {
      const settings = JSON.parse(data) as Partial<CollectionSettings>
      return {
        collectLinkClicks: settings.collectLinkClicks ?? true,
        collectSearchHistory: settings.collectSearchHistory ?? true,
      }
    }
  } catch {
    // ignore
  }
  return {
    collectLinkClicks: true,
    collectSearchHistory: true,
  }
}

export const isLinkAnalyticsEnabled = (): boolean =>
  getCollectionSettings().collectLinkClicks

const MAX_SEARCH_HISTORY = 100 // 最多保存100条搜索记录
const MAX_CLICK_HISTORY_DAYS = 30 // 保留30天的点击历史

/**
 * 链接分析服务
 */
export const LinkAnalytics = {
  get(): Record<string, LinkClickRecord> {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.LINK_ANALYTICS)
      return data ? (JSON.parse(data) as Record<string, LinkClickRecord>) : {}
    } catch {
      return {}
    }
  },

  set(data: Record<string, LinkClickRecord>): void {
    localStorage.setItem(STORAGE_KEYS.LINK_ANALYTICS, JSON.stringify(data))
  },

  /**
   * 记录链接点击
   */
  trackClick(url: string, label: string, group: string): void {
    // 检查是否允许收集链接点击数据
    const settings = getCollectionSettings()
    if (!settings.collectLinkClicks) return

    const analytics = this.get()
    const now = Date.now()
    const thirtyDaysAgo = now - MAX_CLICK_HISTORY_DAYS * 24 * 60 * 60 * 1000

    if (url in analytics) {
      // 更新现有记录
      const existing = analytics[url]
      existing.clicks += 1
      existing.lastClicked = now
      existing.clickHistory = [
        ...existing.clickHistory.filter(t => t > thirtyDaysAgo),
        now,
      ]
    } else {
      // 创建新记录
      analytics[url] = {
        label,
        url,
        group,
        clicks: 1,
        lastClicked: now,
        clickHistory: [now],
      }
    }

    this.set(analytics)
  },

  /**
   * 获取最常访问的链接
   */
  getTopLinks(limit = 5): { label: string; group: string; clicks: number }[] {
    const analytics = this.get()
    return Object.values(analytics)
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, limit)
      .map(({ label, group, clicks }) => ({ label, group, clicks }))
  },

  /**
   * 获取最近访问的链接
   */
  getRecentLinks(
    limit = 5
  ): { label: string; group: string; url: string; lastClicked: number }[] {
    const analytics = this.get()
    return Object.values(analytics)
      .sort((a, b) => b.lastClicked - a.lastClicked)
      .slice(0, limit)
      .map(({ label, group, url, lastClicked }) => ({
        label,
        group,
        url,
        lastClicked,
      }))
  },

  /**
   * 获取活跃时段分布 (0-23小时)
   */
  getActiveHours(): number[] {
    const analytics = this.get()
    const hours: number[] = new Array<number>(24).fill(0)

    Object.values(analytics).forEach(record => {
      record.clickHistory.forEach(timestamp => {
        const hour = new Date(timestamp).getHours()
        hours[hour]++
      })
    })

    return hours
  },

  /**
   * 清除所有链接点击记录
   */
  clear(): void {
    localStorage.removeItem(STORAGE_KEYS.LINK_ANALYTICS)
  },
}

/**
 * 搜索历史服务
 */
export const SearchHistory = {
  get(): SearchRecord[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SEARCH_HISTORY)
      return data ? normalizeSearchRecords(JSON.parse(data) as unknown) : []
    } catch {
      return []
    }
  },

  set(data: SearchRecord[]): void {
    localStorage.setItem(STORAGE_KEYS.SEARCH_HISTORY, JSON.stringify(data))
  },

  /**
   * 记录搜索
   */
  trackSearch(query: string, engine: string): void {
    if (!query.trim()) return

    // 检查是否允许收集搜索历史
    const settings = getCollectionSettings()
    if (!settings.collectSearchHistory) return

    const history = this.get()
    const newRecord: SearchRecord = {
      query: query.trim(),
      engine,
      timestamp: Date.now(),
    }

    // 添加到开头，保持最大数量限制
    const updated = [newRecord, ...history].slice(0, MAX_SEARCH_HISTORY)
    this.set(updated)
  },

  /**
   * 获取最近搜索
   */
  getRecent(limit = 10): string[] {
    return this.get()
      .slice(0, limit)
      .map(r => r.query)
  },

  /**
   * 获取搜索关键词频率
   */
  getKeywordFrequency(): Record<string, number> {
    const history = this.get()
    const frequency: Record<string, number> = {}

    history.forEach(record => {
      // 分词统计
      const words = record.query.toLowerCase().split(/\s+/)
      words.forEach(word => {
        if (word.length > 1) {
          frequency[word] = (frequency[word] || 0) + 1
        }
      })
    })

    return frequency
  },

  /**
   * 清除所有搜索历史
   */
  clear(): void {
    localStorage.removeItem(STORAGE_KEYS.SEARCH_HISTORY)
  },
}

/**
 * 获取分析数据汇总
 */
export const getAnalyticsSummary = (): AnalyticsSummary => {
  const linkAnalytics = LinkAnalytics.get()
  const searchHistory = SearchHistory.get()

  return {
    topLinks: LinkAnalytics.getTopLinks(5),
    recentSearches: SearchHistory.getRecent(5),
    activeHours: LinkAnalytics.getActiveHours(),
    totalClicks: Object.values(linkAnalytics).reduce(
      (sum, r) => sum + r.clicks,
      0
    ),
    totalSearches: searchHistory.length,
  }
}

/**
 * 是否允许向 AI 发送使用习惯（常用链接/搜索/统计）。
 * 旧版是 5 个独立开关：任一被关闭视为不共享，避免迁移扩大共享范围。
 */
const getShareHabits = (): boolean => {
  try {
    const data = localStorage.getItem("ai-settings")
    if (data) {
      const settings = JSON.parse(data) as Record<string, unknown>
      if (typeof settings.shareHabits === "boolean") {
        return settings.shareHabits
      }
      const legacy = [
        settings.shareTopLinks,
        settings.shareRecentSearches,
        settings.shareTodos,
        settings.shareClickStats,
        settings.shareSearchStats,
      ]
      return !legacy.some(v => v === false)
    }
  } catch {
    // ignore
  }
  return true
}

/**
 * 获取时间段描述
 */
const getTimeOfDay = (hour: number): string => {
  if (hour >= 5 && hour < 9) return "早晨"
  if (hour >= 9 && hour < 12) return "上午"
  if (hour >= 12 && hour < 14) return "中午"
  if (hour >= 14 && hour < 18) return "下午"
  if (hour >= 18 && hour < 22) return "晚上"
  return "深夜"
}

/**
 * 生成 AI 提示的上下文数据
 */
export const generateAIContext = (): string => {
  const summary = getAnalyticsSummary()
  const now = new Date()

  const context: Record<string, unknown> = {
    currentTime: getTimeOfDay(now.getHours()),
    weekday: ["日", "一", "二", "三", "四", "五", "六"][now.getDay()],
  }

  if (getShareHabits()) {
    context.topLinks =
      summary.topLinks.length > 0
        ? summary.topLinks.map(l => `${l.label}(${l.group})`)
        : ["暂无数据"]
    context.recentSearches =
      summary.recentSearches.length > 0 ? summary.recentSearches : ["暂无数据"]
    context.totalClicks = summary.totalClicks
    context.totalSearches = summary.totalSearches
  }

  return JSON.stringify(context, null, 2)
}
