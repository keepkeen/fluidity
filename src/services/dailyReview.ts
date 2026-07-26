import { AISettingsManager, callDeepSeekAPI } from "./ai"
import { getBrowserUsageSummaryForDay } from "./browserUsage"
import { aiLogger } from "../utils/logger"

export const DAILY_REVIEW_KEY = "fluidity.ai.dailyReview.v1"

interface DailyReviewCacheV1 {
  version: 1
  day: string
  summary: string
  fromAI: boolean
  updatedAt: number
}

const pad2 = (n: number): string => String(n).padStart(2, "0")

const toDayStringLocal = (date: Date): string =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`

const getYesterdayStringLocal = (): string => {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return toDayStringLocal(d)
}

const getCache = (day: string): DailyReviewCacheV1 | null => {
  try {
    const raw = localStorage.getItem(DAILY_REVIEW_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<DailyReviewCacheV1>
    if (parsed.version !== 1) return null
    if (parsed.day !== day) return null
    if (typeof parsed.summary !== "string") return null
    return parsed as DailyReviewCacheV1
  } catch {
    return null
  }
}

const setCache = (payload: DailyReviewCacheV1): void => {
  try {
    localStorage.setItem(DAILY_REVIEW_KEY, JSON.stringify(payload))
  } catch {
    // ignore
  }
}

const buildFallbackSummary = (totalMinutes: number, topDomains: string[]) => {
  if (totalMinutes <= 0) {
    return "昨天没有记录到浏览活动，今天记得多使用起始页～"
  }
  if (totalMinutes < 30) {
    return `昨天浏览约 ${totalMinutes} 分钟，轻度使用。主要集中在 ${
      topDomains[0] ?? "常用网站"
    }。`
  }
  if (totalMinutes < 120) {
    return `昨天浏览约 ${totalMinutes} 分钟，节奏平稳。常逛 ${topDomains
      .slice(0, 2)
      .join("、")}。`
  }
  return `昨天浏览约 ${totalMinutes} 分钟，时长偏高。常逛 ${topDomains
    .slice(0, 3)
    .join("、")}，记得适当休息。`
}

const buildPrompt = (
  totalMinutes: number,
  topDomains: string[],
  topPages: string[]
): string => {
  return `你是一个友好的个人助手。请根据用户昨日的浏览数据，给出“点评+总结”，总字数不超过80字。

昨日数据：
- 浏览时长：${totalMinutes} 分钟
- 常逛域名：${topDomains.join(", ") || "暂无"}
- 常看页面：${topPages.join(", ") || "暂无"}

要求：
1) 语气自然友好，不要说“根据数据”
2) 给出简短点评 + 1 条建议
3) 可用 0-1 个 emoji
4) 只输出结果，不要多余解释`
}

export const getDailyReview = async (): Promise<{
  summary: string
  fromAI: boolean
  day: string
} | null> => {
  const day = getYesterdayStringLocal()
  const cached = getCache(day)
  if (cached) {
    return { summary: cached.summary, fromAI: cached.fromAI, day }
  }

  const summary = await getBrowserUsageSummaryForDay(day, {
    domains: 6,
    pages: 6,
  })
  const totalMinutes = Math.round(summary.totalSec / 60)
  const topDomains = summary.topDomains
    .slice(0, 5)
    .map(d => `${d.domain}(${Math.round(d.sec / 60)}m)`)
  const topPages = summary.topPages
    .slice(0, 5)
    .map(
      p =>
        `${p.title?.trim() ? p.title.trim() : p.page}(${Math.round(
          p.sec / 60
        )}m)`
    )

  const settings = AISettingsManager.get()
  if (!settings.enabled || !settings.apiKey || totalMinutes <= 0) {
    const fallback = buildFallbackSummary(
      totalMinutes,
      summary.topDomains.map(d => d.domain)
    )
    const payload: DailyReviewCacheV1 = {
      version: 1,
      day,
      summary: fallback,
      fromAI: false,
      updatedAt: Date.now(),
    }
    setCache(payload)
    return { summary: fallback, fromAI: false, day }
  }

  try {
    const prompt = buildPrompt(totalMinutes, topDomains, topPages)
    const result = await callDeepSeekAPI(
      settings.apiKey,
      prompt,
      settings.model,
      {
        maxTokens: 120,
        temperature: 0.6,
      }
    )

    const cleaned = result.trim()
    const payload: DailyReviewCacheV1 = {
      version: 1,
      day,
      summary: cleaned,
      fromAI: true,
      updatedAt: Date.now(),
    }
    setCache(payload)
    return { summary: cleaned, fromAI: true, day }
  } catch (error) {
    aiLogger.error("生成昨日回顾失败:", error)
    const fallback = buildFallbackSummary(
      totalMinutes,
      summary.topDomains.map(d => d.domain)
    )
    const payload: DailyReviewCacheV1 = {
      version: 1,
      day,
      summary: fallback,
      fromAI: false,
      updatedAt: Date.now(),
    }
    setCache(payload)
    return { summary: fallback, fromAI: false, day }
  }
}
