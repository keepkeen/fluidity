/**
 * AI 报告生成服务
 * 围绕浏览时间与使用习惯生成周报/月报点评
 */

import { AISettingsManager, callDeepSeekAPI } from "./ai"
import { getAnalyticsSummary } from "./analytics"
import {
  getMonthlyBrowserUsageSummary,
  getWeeklyBrowserUsageSummary,
} from "./browserUsage"
import { getMonthString, getWeekString } from "./reportState"
import { aiLogger } from "../utils/logger"

const CACHE_KEY = "report-cache"

interface ReportCache {
  weeklyReport?: {
    weekId: string
    summary: string
    timestamp: number
  }
  monthlyReport?: {
    monthId: string
    summary: string
    timestamp: number
  }
}

interface WeeklyStats {
  linkClicks: number
  searches: number
  topLink: string | null
  browserMinutes: number
  browserTopDomains: string[]
  browserTopPages: string[]
}

interface MonthlyStats {
  linkClicks: number
  searches: number
  mostActiveHour: string
  topLinks: string[]
  monthName: string
  browserMinutes: number
  browserTopDomains: string[]
  browserTopPages: string[]
}

/**
 * 缓存管理
 */
const ReportCache = {
  get(): ReportCache {
    try {
      const data = localStorage.getItem(CACHE_KEY)
      return data ? (JSON.parse(data) as ReportCache) : {}
    } catch {
      return {}
    }
  },

  set(cache: ReportCache): void {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  },

  getWeekly(weekId: string): string | null {
    const cache = this.get()
    if (cache.weeklyReport?.weekId === weekId) {
      return cache.weeklyReport.summary
    }
    return null
  },

  setWeekly(weekId: string, summary: string): void {
    const cache = this.get()
    cache.weeklyReport = { weekId, summary, timestamp: Date.now() }
    this.set(cache)
  },

  getMonthly(monthId: string): string | null {
    const cache = this.get()
    if (cache.monthlyReport?.monthId === monthId) {
      // 兼容旧格式（summary|||forecast）
      return cache.monthlyReport.summary.split("|||")[0]
    }
    return null
  },

  setMonthly(monthId: string, summary: string): void {
    const cache = this.get()
    cache.monthlyReport = { monthId, summary, timestamp: Date.now() }
    this.set(cache)
  },
}

/**
 * 获取活跃时段描述
 */
const getActiveHourDescription = (hours: number[] | undefined): string => {
  if (!hours || hours.length === 0) return "暂无数据"

  const maxHour = hours.indexOf(Math.max(...hours))

  if (maxHour >= 5 && maxHour < 9) return "早晨 (5:00-9:00)"
  if (maxHour >= 9 && maxHour < 12) return "上午 (9:00-12:00)"
  if (maxHour >= 12 && maxHour < 14) return "中午 (12:00-14:00)"
  if (maxHour >= 14 && maxHour < 18) return "下午 (14:00-18:00)"
  if (maxHour >= 18 && maxHour < 22) return "晚上 (18:00-22:00)"
  return "深夜 (22:00-5:00)"
}

/**
 * 获取周报统计数据
 */
export const getWeeklyStats = (): WeeklyStats => {
  const summary = getAnalyticsSummary()

  return {
    linkClicks: summary.totalClicks,
    searches: summary.totalSearches,
    topLink: summary.topLinks[0]?.label || null,
    browserMinutes: 0,
    browserTopDomains: [],
    browserTopPages: [],
  }
}

/**
 * 获取月报统计数据
 */
export const getMonthlyStats = (): MonthlyStats => {
  const summary = getAnalyticsSummary()

  const now = new Date()
  const lastMonth = now.getMonth() === 0 ? 12 : now.getMonth()

  const monthNames = [
    "1月",
    "2月",
    "3月",
    "4月",
    "5月",
    "6月",
    "7月",
    "8月",
    "9月",
    "10月",
    "11月",
    "12月",
  ]

  return {
    linkClicks: summary.totalClicks,
    searches: summary.totalSearches,
    mostActiveHour: getActiveHourDescription(summary.activeHours),
    topLinks: summary.topLinks.slice(0, 5).map(l => l.label),
    monthName: monthNames[lastMonth - 1],
    browserMinutes: 0,
    browserTopDomains: [],
    browserTopPages: [],
  }
}

/**
 * 生成周报 Prompt
 */
const generateWeeklyPrompt = (stats: WeeklyStats): string => {
  return `你是一个友好的个人助手。请根据以下用户上周的浏览与使用数据，生成一段简短、有趣的周报总结（不超过80字）：

上周数据：
- 浏览时长: ${stats.browserMinutes} 分钟
- 常逛域名: ${stats.browserTopDomains.join(", ") || "暂无"}
- 常看页面: ${stats.browserTopPages.join(", ") || "暂无"}
- 链接点击: ${stats.linkClicks} 次
- 搜索次数: ${stats.searches} 次
- 最常访问: ${stats.topLink ?? "无"}

要求：
1. 语气轻松友好，像朋友一样
2. 点出时间主要花在哪里，帮用户对上周有个清晰认知
3. 如果浏览时长偏高，可以温柔提醒注意休息
4. 可以适当使用 emoji，但不要过多（最多2个）
5. 不要说"根据数据"之类的话，要自然

只输出总结内容，不要有其他内容。`
}

/**
 * 生成月报 Prompt
 */
const generateMonthlyPrompt = (stats: MonthlyStats): string => {
  return `你是一个友好的个人助手。请根据以下用户上月的浏览与使用数据，生成一段简短、有趣的月报总结（不超过100字）：

${stats.monthName}数据：
- 浏览时长: ${stats.browserMinutes} 分钟
- 常逛域名: ${stats.browserTopDomains.join(", ") || "暂无"}
- 常看页面: ${stats.browserTopPages.join(", ") || "暂无"}
- 链接点击: ${stats.linkClicks} 次
- 搜索次数: ${stats.searches} 次
- 最活跃时段: ${stats.mostActiveHour}
- 最常访问: ${stats.topLinks.join(", ") || "无"}

要求：
1. 语气轻松友好，像朋友一样
2. 总结时间主要花在哪里，帮用户回顾这个月的注意力去向
3. 如果某个网站占比特别高，可以点出来
4. 可以适当使用 emoji，但不要过多（最多2个）
5. 不要说"根据数据"之类的话，要自然

只输出总结内容，不要有其他内容。`
}

/**
 * 默认周报总结（无 AI 时）
 */
const getDefaultWeeklySummary = (stats: WeeklyStats): string => {
  if (stats.browserMinutes <= 0) {
    return "上周没有记录到浏览数据，开启时长统计后可以看到时间去向～"
  }
  const top = stats.browserTopDomains[0]
  return `上周浏览约 ${stats.browserMinutes} 分钟${
    top ? `，最常逛的是 ${top}` : ""
  }。新的一周合理安排时间！✨`
}

/**
 * 默认月报总结（无 AI 时）
 */
const getDefaultMonthlySummary = (stats: MonthlyStats): string => {
  if (stats.browserMinutes <= 0) {
    return `${stats.monthName}没有记录到浏览数据，开启时长统计后可以看到时间去向～`
  }
  const top = stats.browserTopDomains[0]
  return `${stats.monthName}共浏览约 ${stats.browserMinutes} 分钟${
    top ? `，时间主要花在 ${top}` : ""
  }。新的一月继续保持节奏！✨`
}

/**
 * 生成周报 AI 点评
 */
export const generateWeeklyReport = async (): Promise<{
  summary: string
  fromAI: boolean
}> => {
  const weekId = getWeekString(new Date())
  const settings = AISettingsManager.get()

  // 检查缓存
  const cached = ReportCache.getWeekly(weekId)
  if (cached) {
    return { summary: cached, fromAI: true }
  }

  const stats = getWeeklyStats()
  try {
    const usage = await getWeeklyBrowserUsageSummary(-1)
    stats.browserMinutes = Math.round(usage.totalSec / 60)
    stats.browserTopDomains = usage.topDomains
      .slice(0, 5)
      .map(d => `${d.domain}(${Math.round(d.sec / 60)}m)`)
    stats.browserTopPages = usage.topPages
      .slice(0, 5)
      .map(
        p =>
          `${p.title?.trim() ? p.title.trim() : p.page}(${Math.round(
            p.sec / 60
          )}m)`
      )
  } catch {
    // ignore
  }
  // 如果 AI 未配置，返回默认总结
  if (!settings.enabled || !settings.apiKey) {
    return { summary: getDefaultWeeklySummary(stats), fromAI: false }
  }

  // 调用 AI（未开启"发送浏览时长统计"时，浏览数据不得进入 prompt）
  try {
    const promptStats = settings.shareBrowserUsage
      ? stats
      : { ...stats, browserMinutes: 0, browserTopDomains: [], browserTopPages: [] }
    const prompt = generateWeeklyPrompt(promptStats)
    const summary = await callDeepSeekAPI(
      settings.apiKey,
      prompt,
      settings.model
    )

    // 缓存结果
    ReportCache.setWeekly(weekId, summary)

    return { summary, fromAI: true }
  } catch (error) {
    aiLogger.error("生成周报失败:", error)
    return { summary: getDefaultWeeklySummary(stats), fromAI: false }
  }
}

/**
 * 生成月报 AI 点评
 */
export const generateMonthlyReport = async (): Promise<{
  summary: string
  fromAI: boolean
}> => {
  const monthId = getMonthString(new Date())
  const settings = AISettingsManager.get()

  // 检查缓存
  const cached = ReportCache.getMonthly(monthId)
  if (cached) {
    return { summary: cached, fromAI: true }
  }

  const stats = getMonthlyStats()
  try {
    const now = new Date()
    const lastMonth = now.getMonth() === 0 ? 12 : now.getMonth()
    const year =
      now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
    const usage = await getMonthlyBrowserUsageSummary(year, lastMonth)
    stats.browserMinutes = Math.round(usage.totalSec / 60)
    stats.browserTopDomains = usage.topDomains
      .slice(0, 6)
      .map(d => `${d.domain}(${Math.round(d.sec / 60)}m)`)
    stats.browserTopPages = usage.topPages
      .slice(0, 6)
      .map(
        p =>
          `${p.title?.trim() ? p.title.trim() : p.page}(${Math.round(
            p.sec / 60
          )}m)`
      )
  } catch {
    // ignore
  }
  // 如果 AI 未配置，返回默认总结
  if (!settings.enabled || !settings.apiKey) {
    return { summary: getDefaultMonthlySummary(stats), fromAI: false }
  }

  // 调用 AI（未开启"发送浏览时长统计"时，浏览数据不得进入 prompt）
  try {
    const promptStats = settings.shareBrowserUsage
      ? stats
      : { ...stats, browserMinutes: 0, browserTopDomains: [], browserTopPages: [] }
    const prompt = generateMonthlyPrompt(promptStats)
    const summary = await callDeepSeekAPI(
      settings.apiKey,
      prompt,
      settings.model
    )

    // 缓存结果
    ReportCache.setMonthly(monthId, summary)

    return { summary, fromAI: true }
  } catch (error) {
    aiLogger.error("生成月报失败:", error)
    return { summary: getDefaultMonthlySummary(stats), fromAI: false }
  }
}
