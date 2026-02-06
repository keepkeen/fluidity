import { AISettingsManager, callDeepSeekAPI } from "./ai"
import {
  getTodayBrowserUsageSummary,
  getYesterdayBrowserUsageSummary,
  guessAppNameFromDomain,
} from "./browserUsage"
import {
  getRecommendedTagsForToday,
  setRecommendedTagsForToday,
} from "./recommendedTags"

export const RECOMMENDED_QUICK_SEARCHES_KEY =
  "fluidity.ai.recommendedQuickSearches.v1"

export interface RecommendedQuickSearch {
  label: string
  url: string
}

interface RecommendedQuickSearchesV1 {
  version: 1
  day: string
  items: RecommendedQuickSearch[]
  updatedAt: number
}

const pad2 = (n: number): string => String(n).padStart(2, "0")

const getTodayStringLocal = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

const isQuickSearch = (value: unknown): value is RecommendedQuickSearch => {
  if (!value || typeof value !== "object") return false
  const v = value as { label?: unknown; url?: unknown }
  return typeof v.label === "string" && typeof v.url === "string"
}

const parseTags = (value: unknown): string[] => {
  if (!Array.isArray(value)) return []
  return value
    .filter((t): t is string => typeof t === "string")
    .map(t => t.trim())
    .filter(t => t.length > 0)
    .slice(0, 12)
}

const parseQuickSearches = (value: unknown): RecommendedQuickSearch[] => {
  if (!Array.isArray(value)) return []
  return value
    .filter(isQuickSearch)
    .map(item => ({ label: item.label.trim(), url: item.url.trim() }))
    .filter(
      item =>
        item.label.length > 0 &&
        item.url.length > 0 &&
        item.url.startsWith("https://")
    )
    .slice(0, 8)
}

const pickSummaryForRecommendations = async () => {
  const today = await getTodayBrowserUsageSummary()
  if (today.totalSec >= 300) return today
  return await getYesterdayBrowserUsageSummary()
}

const buildFallbackTags = (
  summary: Awaited<ReturnType<typeof pickSummaryForRecommendations>>
): string[] => {
  const tags: string[] = []
  summary.topDomains.forEach(d => {
    const guessed = guessAppNameFromDomain(d.domain)
    const label = guessed || d.domain
    if (!label) return
    if (!tags.includes(label)) tags.push(label)
  })

  return tags.slice(0, 8)
}

const buildFallbackQuickSearches = (
  summary: Awaited<ReturnType<typeof pickSummaryForRecommendations>>
): RecommendedQuickSearch[] => {
  const items: RecommendedQuickSearch[] = []
  summary.topDomains.forEach(d => {
    const label = guessAppNameFromDomain(d.domain) || d.domain
    if (!label) return
    const url = d.domain.startsWith("http") ? d.domain : `https://${d.domain}`
    if (items.some(item => item.label === label)) return
    items.push({ label, url })
  })

  return items.slice(0, 6)
}

const buildAiPrompt = (
  topDomains: { domain: string; minutes: number }[],
  topPages: { title?: string; minutes: number }[]
): string => {
  return `你是一个搜索推荐助手。请根据用户最近的浏览情况生成搜索建议。

输入数据：
- 常逛域名（分钟）：${
    topDomains.map(d => `${d.domain}(${d.minutes}m)`).join(", ") || "暂无"
  }
- 常看页面标题（分钟）：${
    topPages.map(p => `${p.title ?? "无标题"}(${p.minutes}m)`).join(", ") ||
    "暂无"
  }

输出要求：
1) 严格输出 JSON（不要代码块，不要额外说明）
2) tags：6-10 个短语，每个尽量 <=8 个字/<=4 个词，不要包含 URL
3) quickSearches：4-6 个对象，每个包含 label 和 url（必须是 https 开头的首页或常用入口）
4) tags 尽量多样化：学习/工作/资讯/娱乐/效率/健康提醒等方向可混合

JSON 格式：
{ "tags": ["..."], "quickSearches": [{ "label": "...", "url": "https://..." }] }`
}

const parseAiPayload = (
  raw: string
): {
  tags: string[]
  quickSearches: RecommendedQuickSearch[]
} => {
  try {
    const parsed = JSON.parse(raw) as {
      tags?: unknown
      quickSearches?: unknown
    }
    return {
      tags: parseTags(parsed.tags),
      quickSearches: parseQuickSearches(parsed.quickSearches),
    }
  } catch {
    return { tags: [], quickSearches: [] }
  }
}

const tryAIRecommendations = async (
  summary: Awaited<ReturnType<typeof pickSummaryForRecommendations>>
): Promise<{ tags: string[]; quickSearches: RecommendedQuickSearch[] }> => {
  const settings = AISettingsManager.get()
  if (!settings.enabled || !settings.apiKey) {
    return { tags: [], quickSearches: [] }
  }

  const topDomains = summary.topDomains.slice(0, 6).map(d => ({
    domain: d.domain,
    minutes: Math.round(d.sec / 60),
  }))
  const topPages = summary.topPages.slice(0, 6).map(p => ({
    title: p.title,
    minutes: Math.round(p.sec / 60),
  }))

  try {
    const prompt = buildAiPrompt(topDomains, topPages)
    const raw = await callDeepSeekAPI(settings.apiKey, prompt, settings.model, {
      maxTokens: 220,
      temperature: 0.5,
    })
    return parseAiPayload(raw)
  } catch {
    return { tags: [], quickSearches: [] }
  }
}

export const getRecommendedQuickSearchesForToday =
  (): RecommendedQuickSearch[] => {
    try {
      const raw = localStorage.getItem(RECOMMENDED_QUICK_SEARCHES_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw) as Partial<RecommendedQuickSearchesV1>
      if (parsed.version !== 1) return []
      if (parsed.day !== getTodayStringLocal()) return []
      if (!Array.isArray(parsed.items)) return []
      return parsed.items
        .filter(isQuickSearch)
        .map(item => ({ label: item.label.trim(), url: item.url.trim() }))
        .filter(item => item.label.length > 0 && item.url.length > 0)
        .slice(0, 8)
    } catch {
      return []
    }
  }

export const setRecommendedQuickSearchesForToday = (
  items: RecommendedQuickSearch[]
): void => {
  const cleaned = items
    .filter(isQuickSearch)
    .map(item => ({ label: item.label.trim(), url: item.url.trim() }))
    .filter(item => item.label.length > 0 && item.url.length > 0)
    .slice(0, 8)

  const payload: RecommendedQuickSearchesV1 = {
    version: 1,
    day: getTodayStringLocal(),
    items: cleaned,
    updatedAt: Date.now(),
  }
  try {
    localStorage.setItem(
      RECOMMENDED_QUICK_SEARCHES_KEY,
      JSON.stringify(payload)
    )
  } catch {
    // ignore
  }
}

const applyRecommendationFallbacks = (options: {
  summary: Awaited<ReturnType<typeof pickSummaryForRecommendations>>
  hasTags: boolean
  hasQuick: boolean
}): { tags: string[]; quickSearches: RecommendedQuickSearch[] } => {
  const { summary, hasTags, hasQuick } = options
  let tags = getRecommendedTagsForToday()
  let quickSearches = getRecommendedQuickSearchesForToday()

  if (!hasTags) {
    const fallbackTags = buildFallbackTags(summary)
    if (fallbackTags.length > 0) {
      setRecommendedTagsForToday(fallbackTags)
      tags = fallbackTags
    }
  }

  if (!hasQuick) {
    const fallbackQuick = buildFallbackQuickSearches(summary)
    if (fallbackQuick.length > 0) {
      setRecommendedQuickSearchesForToday(fallbackQuick)
      quickSearches = fallbackQuick
    }
  }

  return { tags, quickSearches }
}

export const ensureSearchRecommendationsForToday =
  async (): Promise<boolean> => {
    const hasTags = getRecommendedTagsForToday().length > 0
    const hasQuick = getRecommendedQuickSearchesForToday().length > 0
    if (hasTags && hasQuick) return false

    const summary = await pickSummaryForRecommendations()
    const aiResult = await tryAIRecommendations(summary)

    if (!hasTags && aiResult.tags.length > 0) {
      setRecommendedTagsForToday(aiResult.tags)
    }
    if (!hasQuick && aiResult.quickSearches.length > 0) {
      setRecommendedQuickSearchesForToday(aiResult.quickSearches)
    }

    const fallback = applyRecommendationFallbacks({
      summary,
      hasTags: getRecommendedTagsForToday().length > 0,
      hasQuick: getRecommendedQuickSearchesForToday().length > 0,
    })

    return fallback.tags.length > 0 || fallback.quickSearches.length > 0
  }
