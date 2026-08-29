/**
 * AI 服务 - 调用 DeepSeek API 生成智能提示
 */

import { generateAIContext } from "./analytics"
import {
  getLastHourBrowserUsageSummary,
  getTodayBrowserUsageSummary,
  guessAppNameFromDomain,
  normalizeDomainKey,
} from "./browserUsage"
import { fetchWithTimeout } from "./http"
import {
  DEFAULT_AI_BASE_URL,
  resolveChatCompletionsUrl,
} from "./aiEndpoint"
import { aiLogger } from "../utils/logger"

export { DEFAULT_AI_BASE_URL, resolveChatCompletionsUrl } from "./aiEndpoint"

// AI 设置接口
export interface AISettings {
  enabled: boolean
  apiKey: string
  /** OpenAI 兼容接口地址（不含 /chat/completions 路径） */
  apiBaseUrl: string
  model: string
  cacheMinutes: number // 缓存时间（分钟）

  // 数据收集控制
  collectLinkClicks: boolean // 是否记录链接点击
  collectSearchHistory: boolean // 是否记录搜索历史

  // 发送给 AI 的数据控制
  shareHabits: boolean // 发送使用习惯（常用链接/最近搜索/点击与搜索统计）
  shareBrowserUsage: boolean // 发送浏览记录（域名/页面时长）
}

// 缓存的 AI 响应
interface CachedResponse {
  message: string
  timestamp: number
}

// DeepSeek API 响应类型
interface DeepSeekResponse {
  choices?: {
    message?: {
      content?: string | null
      reasoning_content?: string // deepseek-reasoner 模型的思考过程
    }
  }[]
}

const STORAGE_KEYS = {
  AI_SETTINGS: "ai-settings",
  AI_CACHE: "ai-cache",
}

const DEFAULT_SETTINGS: AISettings = {
  enabled: false,
  apiKey: "",
  apiBaseUrl: DEFAULT_AI_BASE_URL,
  model: "deepseek-chat",
  cacheMinutes: 60, // 默认缓存1小时

  // 默认开启数据收集
  collectLinkClicks: true,
  collectSearchHistory: true,

  // 默认开启使用习惯共享；浏览记录默认不共享
  shareHabits: true,
  shareBrowserUsage: false,
}

const AI_RESPONSE_CACHE_KEYS = [
  STORAGE_KEYS.AI_CACHE,
  "ai-theme-cache",
  "report-cache",
  "fluidity.ai.dailyReview.v1",
]
const AI_RESPONSE_CACHE_SCOPE_KEY = "ai-response-cache-scope.v1"

/** 清除由当前服务商、模型或数据共享设置派生出的 AI 内容。 */
export const clearAIResponseCaches = (): void => {
  for (const key of AI_RESPONSE_CACHE_KEYS) {
    localStorage.removeItem(key)
  }
}

const getAIResponseCacheScope = (settings: AISettings): string =>
  JSON.stringify({
    version: 1,
    enabled: settings.enabled,
    apiBaseUrl: settings.apiBaseUrl.trim() || DEFAULT_AI_BASE_URL,
    model: settings.model.trim() || DEFAULT_SETTINGS.model,
    shareHabits: settings.shareHabits,
    shareBrowserUsage: settings.shareBrowserUsage,
  })

const syncAIResponseCacheScope = (settings: AISettings): void => {
  const nextScope = getAIResponseCacheScope(settings)
  if (localStorage.getItem(AI_RESPONSE_CACHE_SCOPE_KEY) !== nextScope) {
    clearAIResponseCaches()
    localStorage.setItem(AI_RESPONSE_CACHE_SCOPE_KEY, nextScope)
  }
}

/**
 * 获取默认问候语（不使用 AI 时）
 */
export const getDefaultGreeting = (): string => {
  const hour = new Date().getHours()
  const greetings = {
    morning: [
      "早上好！新的一天，新的开始 ☀️",
      "早安！今天也要元气满满 🌟",
      "早上好！先喝杯咖啡吧 ☕",
    ],
    noon: [
      "中午好！记得休息一下 🍜",
      "午安！吃饭了吗？",
      "中午好！适当放松一下 😊",
    ],
    afternoon: [
      "下午好！继续加油 💪",
      "下午好！来杯下午茶？🍵",
      "下午好！保持专注 ✨",
    ],
    evening: [
      "晚上好！辛苦了一天 🌙",
      "晚上好！放松一下吧 🎵",
      "晚上好！今天过得怎么样？",
    ],
    night: ["夜深了，注意休息 🌙", "该休息了，明天继续 💤", "晚安！好梦 ✨"],
  }

  let timeSlot: keyof typeof greetings = "morning"
  if (hour >= 5 && hour < 11) timeSlot = "morning"
  else if (hour >= 11 && hour < 14) timeSlot = "noon"
  else if (hour >= 14 && hour < 18) timeSlot = "afternoon"
  else if (hour >= 18 && hour < 23) timeSlot = "evening"
  else timeSlot = "night"

  const options = greetings[timeSlot]
  return options[Math.floor(Math.random() * options.length)]
}

/**
 * AI 设置管理
 */
export const AISettingsManager = {
  get(): AISettings {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.AI_SETTINGS)
      if (!data) {
        syncAIResponseCacheScope(DEFAULT_SETTINGS)
        return DEFAULT_SETTINGS
      }
      const stored = JSON.parse(data) as Partial<AISettings> &
        Record<string, unknown>
      const merged = { ...DEFAULT_SETTINGS, ...stored }
      // 迁移：旧版是 5 个独立共享开关；任一被关闭视为不共享，
      // 避免迁移悄悄扩大共享范围
      if (typeof stored.shareHabits !== "boolean") {
        const legacy = [
          stored.shareTopLinks,
          stored.shareRecentSearches,
          stored.shareTodos,
          stored.shareClickStats,
          stored.shareSearchStats,
        ]
        merged.shareHabits = !legacy.some(v => v === false)
      }
      syncAIResponseCacheScope(merged)
      return merged
    } catch {
      return DEFAULT_SETTINGS
    }
  },

  set(settings: Partial<AISettings>): void {
    const current = this.get()
    const next = { ...current, ...settings }
    next.apiKey = next.apiKey.trim()
    next.apiBaseUrl = next.apiBaseUrl.trim() || DEFAULT_AI_BASE_URL
    next.model = next.model.trim() || DEFAULT_SETTINGS.model

    const invalidatesAIResponses =
      current.apiKey.trim() !== next.apiKey ||
      current.apiBaseUrl.trim() !== next.apiBaseUrl ||
      current.model.trim() !== next.model ||
      current.enabled !== next.enabled ||
      current.shareHabits !== next.shareHabits ||
      current.shareBrowserUsage !== next.shareBrowserUsage

    localStorage.setItem(
      STORAGE_KEYS.AI_SETTINGS,
      JSON.stringify(next)
    )
    if (invalidatesAIResponses) {
      clearAIResponseCaches()
    }
    localStorage.setItem(
      AI_RESPONSE_CACHE_SCOPE_KEY,
      getAIResponseCacheScope(next)
    )
  },

  isConfigured(): boolean {
    const settings = this.get()
    return settings.enabled && settings.apiKey.length > 0
  },
}

/**
 * AI 响应缓存管理
 */
const AICache = {
  get(): CachedResponse | null {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.AI_CACHE)
      return data ? (JSON.parse(data) as CachedResponse) : null
    } catch {
      return null
    }
  },

  set(message: string): void {
    const cache: CachedResponse = {
      message,
      timestamp: Date.now(),
    }
    localStorage.setItem(STORAGE_KEYS.AI_CACHE, JSON.stringify(cache))
  },

  isValid(): boolean {
    const cache = this.get()
    if (!cache) return false

    const settings = AISettingsManager.get()
    const maxAge = settings.cacheMinutes * 60 * 1000
    return Date.now() - cache.timestamp < maxAge
  },

  clear(): void {
    localStorage.removeItem(STORAGE_KEYS.AI_CACHE)
  },
}

/**
 * 调用 DeepSeek API
 */
export const callDeepSeekAPI = async (
  apiKey: string,
  prompt: string,
  model = "deepseek-chat",
  options?: {
    maxTokens?: number
    temperature?: number
    apiBaseUrl?: string
    timeoutMs?: number
  }
): Promise<string> => {
  const maxTokens = options?.maxTokens ?? 100
  const temperature = options?.temperature ?? 0.8
  const normalizedModel = model.trim() || "deepseek-chat"

  // DeepSeek Reasoner 模型不支持 temperature 参数
  const isReasonerModel = normalizedModel === "deepseek-reasoner"

  const requestBody: Record<string, unknown> = {
    model: normalizedModel,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
    max_tokens: maxTokens,
  }

  // 只有非 reasoner 模型才添加 temperature
  if (!isReasonerModel) {
    requestBody.temperature = temperature
  }

  // 支持任意 OpenAI 兼容服务（OpenAI/Moonshot/本地 Ollama 等）
  const baseUrl =
    options?.apiBaseUrl ?? AISettingsManager.get().apiBaseUrl
  const endpoint = resolveChatCompletionsUrl(baseUrl)

  const response = await fetchWithTimeout(
    endpoint,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey.trim()}`,
      },
      body: JSON.stringify(requestBody),
    },
    {
      timeoutMs: options?.timeoutMs ?? 30_000,
      retries: 1,
      retryDelayMs: 1000,
    }
  )

  if (!response.ok) {
    const error = (await response.text()).slice(0, 1000)
    throw new Error(`API 请求失败: ${response.status} - ${error}`)
  }

  const data = (await response.json()) as DeepSeekResponse
  const message = data.choices?.[0]?.message

  // 优先使用 content
  let content = message?.content?.trim()

  // deepseek-reasoner 模型特殊处理
  if (isReasonerModel) {
    const reasoningContent = message?.reasoning_content

    // 如果 content 为空，尝试从 reasoning_content 中提取 JSON
    if (!content && reasoningContent) {
      aiLogger.debug(
        "Reasoner content 为空，尝试从 reasoning_content 提取:",
        reasoningContent.slice(-500)
      )
      // 尝试从思考过程末尾提取 JSON
      const jsonMatch = reasoningContent.match(/\{[^{}]*"name"[^{}]*\}/g)
      if (jsonMatch) {
        content = jsonMatch[jsonMatch.length - 1] // 取最后一个匹配的 JSON
        aiLogger.debug("从 reasoning_content 提取到 JSON:", content)
      }
    }
  }

  if (!content) {
    aiLogger.warn("AI 响应 content 为空", {
      model,
      hasReasoningContent: !!message?.reasoning_content,
      contentValue: message?.content,
    })
    throw new Error("AI 响应内容为空，请重试")
  }

  return content
}

const secondsToMinutes = (sec: number): number => Math.round(sec / 60)

const generatePromptV2 = (context: Record<string, unknown>): string => {
  return `你是一个友好的个人助手，负责在用户打开浏览器新标签页时给出一句简短的问候/提醒。

你会收到一份 JSON 格式的用户数据（包含最近一小时与今天的浏览器使用汇总、点击/搜索习惯等）。

请严格输出 JSON（不要输出代码块、不要输出多余解释），结构如下：
{
  "greeting": "一句话（<=50字）"
}

规则：
1) 语气轻松友好，像朋友一样；不要说“根据数据”等措辞；最多 2 个 emoji
2) 如果最近一小时连续使用时间较长（例如 >=45分钟），可以温柔提醒喝水/休息/活动一下；不要吓人/不要医学化

用户数据：
${JSON.stringify(context, null, 2)}
`
}

const tryParseJsonObject = (raw: string): Record<string, unknown> | null => {
  const text = raw.trim()
  const parse = (s: string): Record<string, unknown> | null => {
    const v: unknown = JSON.parse(s)
    if (typeof v !== "object" || v === null || Array.isArray(v)) return null
    return v as Record<string, unknown>
  }
  try {
    return parse(text)
  } catch {
    // try extract last {...}
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      return parse(match[0])
    } catch {
      return null
    }
  }
}

const getGreetingCache = (): {
  message: string
  fromCache: boolean
} | null => {
  if (!AICache.isValid()) return null
  const cache = AICache.get()
  if (!cache) return null

  return { message: cache.message, fromCache: true }
}

const buildGreetingContext = async (
  settings: AISettings
): Promise<Record<string, unknown>> => {
  const baseRaw = generateAIContext()
  let baseContext: Record<string, unknown> = {}
  try {
    baseContext = JSON.parse(baseRaw) as Record<string, unknown>
  } catch {
    baseContext = { baseContext: baseRaw }
  }

  const context: Record<string, unknown> = { ...baseContext }

  if (settings.shareBrowserUsage) {
    const lastHour = await getLastHourBrowserUsageSummary()
    const todayUsage = await getTodayBrowserUsageSummary()
    context.browserUsage = {
      lastHour: {
        totalMinutes: secondsToMinutes(lastHour.totalSec),
        topDomains: lastHour.topDomains.map(d => ({
          domain: d.domain,
          minutes: secondsToMinutes(d.sec),
        })),
        topPages: lastHour.topPages.map(p => ({
          page: p.page,
          title: p.title,
          minutes: secondsToMinutes(p.sec),
        })),
      },
      today: {
        totalMinutes: secondsToMinutes(todayUsage.totalSec),
        topDomains: todayUsage.topDomains.map(d => ({
          domain: d.domain,
          minutes: secondsToMinutes(d.sec),
        })),
        topPages: todayUsage.topPages.map(p => ({
          page: p.page,
          title: p.title,
          minutes: secondsToMinutes(p.sec),
        })),
      },
    }
  }

  return context
}

const parseGreetingPayload = (raw: string): { message: string } => {
  const parsed = tryParseJsonObject(raw)
  const message =
    typeof parsed?.greeting === "string" ? parsed.greeting.trim() : ""
  return { message }
}

const generateDomainAppNamePrompt = (domain: string): string => {
  return `你是一个产品命名助手。

任务：给定一个网站域名，返回一个“应用/产品名称”，用于在 UI 中展示。

要求：
1) 名称尽量短（2-12 个字/字符，越短越好）
2) 不要包含 URL、不要包含域名后缀（如 .com/.cn）、不要包含 "www"
3) 不要加“官网/网站/平台/首页”等无意义后缀
4) 如果是子域名（如 mail.google.com），优先返回更具体的产品名（如 Gmail），但仍要简短
5) 严格输出 JSON（不要输出代码块，不要输出多余解释）：
{ "name": "..." }

域名：${domain.trim()}
`
}

const sanitizeDomainAppName = (nameRaw: string, domain: string): string => {
  let name = nameRaw.trim()
  if (!name) return ""

  // eslint-disable-next-line no-control-regex
  name = name.replace(/[\u0000-\u001f]/g, "").trim()

  // 避免模型返回 URL / 域名
  if (/[/:]/.test(name)) return ""
  if (name.includes(".")) return ""

  const normalizedDomain = normalizeDomainKey(domain)
  if (normalizedDomain && name.toLowerCase() === normalizedDomain) return ""

  // 避免返回非常像域名的结果
  const guess = guessAppNameFromDomain(domain)
  if (guess && name.toLowerCase() === guess.toLowerCase()) return guess

  // 去掉常见无意义后缀
  name = name.replace(/(官网|网站|平台|首页)$/g, "").trim()

  if (name.length > 20) name = name.slice(0, 20).trim()
  return name
}

export const resolveAppNameForDomain = async (
  domain: string
): Promise<string | null> => {
  const settings = AISettingsManager.get()
  if (!settings.enabled || !settings.apiKey || !settings.shareBrowserUsage) {
    return null
  }

  const prompt = generateDomainAppNamePrompt(domain)
  const raw = await callDeepSeekAPI(settings.apiKey, prompt, settings.model, {
    maxTokens: 60,
    temperature: 0.2,
  })

  const parsed = tryParseJsonObject(raw)
  const nameRaw = typeof parsed?.name === "string" ? parsed.name : ""
  const name = sanitizeDomainAppName(nameRaw, domain)
  return name || null
}

/**
 * 获取 AI 智能提示
 */
export const getAIGreeting = async (): Promise<{
  message: string
  fromCache: boolean
  error?: string
}> => {
  const settings = AISettingsManager.get()

  // 检查是否启用
  if (!settings.enabled || !settings.apiKey) {
    return {
      message: getDefaultGreeting(),
      fromCache: false,
    }
  }

  const cached = getGreetingCache()
  if (cached) return cached

  // 调用 API
  try {
    const context = await buildGreetingContext(settings)

    const prompt = generatePromptV2(context)
    const raw = await callDeepSeekAPI(settings.apiKey, prompt, settings.model, {
      maxTokens: 220,
      temperature: 0.7,
    })

    const { message } = parseGreetingPayload(raw)

    if (!message) throw new Error("AI 响应内容为空，请重试")

    AICache.set(message)

    return {
      message,
      fromCache: false,
    }
  } catch (error) {
    aiLogger.error("AI API 调用失败:", error)
    return {
      message: getDefaultGreeting(),
      fromCache: false,
      error: error instanceof Error ? error.message : "未知错误",
    }
  }
}

/**
 * 刷新 AI 提示（清除缓存并重新获取）
 */
export const refreshAIGreeting = async () => {
  AICache.clear()
  return getAIGreeting()
}
