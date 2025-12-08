/**
 * AI 服务 - 调用 DeepSeek API 生成智能提示
 */

import { generateAIContext } from "./analytics"

// AI 设置接口
export interface AISettings {
  enabled: boolean
  apiKey: string
  model: string
  cacheMinutes: number // 缓存时间（分钟）

  // 数据收集控制
  collectLinkClicks: boolean // 是否记录链接点击
  collectSearchHistory: boolean // 是否记录搜索历史

  // 发送给 AI 的数据控制
  shareTopLinks: boolean // 发送最常访问链接
  shareRecentSearches: boolean // 发送最近搜索
  shareTodos: boolean // 发送待办事项
  shareClickStats: boolean // 发送点击统计
  shareSearchStats: boolean // 发送搜索统计
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
      content?: string
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
  model: "deepseek-chat",
  cacheMinutes: 60, // 默认缓存1小时

  // 默认开启数据收集
  collectLinkClicks: true,
  collectSearchHistory: true,

  // 默认开启数据共享给 AI
  shareTopLinks: true,
  shareRecentSearches: true,
  shareTodos: true,
  shareClickStats: true,
  shareSearchStats: true,
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
      return data
        ? { ...DEFAULT_SETTINGS, ...(JSON.parse(data) as Partial<AISettings>) }
        : DEFAULT_SETTINGS
    } catch {
      return DEFAULT_SETTINGS
    }
  },

  set(settings: Partial<AISettings>): void {
    const current = this.get()
    localStorage.setItem(
      STORAGE_KEYS.AI_SETTINGS,
      JSON.stringify({ ...current, ...settings })
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
 * 生成 AI 提示的 prompt
 */
const generatePrompt = (context: string): string => {
  return `你是一个友好的个人助手，负责在用户打开浏览器新标签页时给出简短的问候或提醒。

基于以下用户数据，生成一句简短、有趣、个性化的话（不超过50个字）：

${context}

要求：
1. 根据时间段给出合适的问候（早上好/下午好等）
2. 如果有未完成的待办，可以温馨提醒
3. 如果用户经常访问某些网站，可以据此推测兴趣并说些有趣的话
4. 语气要轻松友好，像朋友一样
5. 可以适当使用 emoji，但不要过多
6. 不要说"根据数据显示"之类的话，要自然

只输出这一句话，不要有其他内容。`
}

/**
 * 调用 DeepSeek API
 */
export const callDeepSeekAPI = async (
  apiKey: string,
  prompt: string,
  model = "deepseek-chat",
  options?: { maxTokens?: number; temperature?: number }
): Promise<string> => {
  const maxTokens = options?.maxTokens ?? 100
  const temperature = options?.temperature ?? 0.8

  // DeepSeek Reasoner 模型不支持 temperature 参数
  const isReasonerModel = model === "deepseek-reasoner"

  const requestBody: Record<string, unknown> = {
    model,
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

  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`API 请求失败: ${response.status} - ${error}`)
  }

  const data = (await response.json()) as DeepSeekResponse
  return (
    data.choices?.[0]?.message?.content?.trim() ?? "你好！今天也要加油哦 ✨"
  )
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

  // 检查缓存
  if (AICache.isValid()) {
    const cache = AICache.get()
    if (cache) {
      return {
        message: cache.message,
        fromCache: true,
      }
    }
  }

  // 调用 API
  try {
    const context = generateAIContext()
    const prompt = generatePrompt(context)
    const message = await callDeepSeekAPI(
      settings.apiKey,
      prompt,
      settings.model
    )

    // 缓存结果
    AICache.set(message)

    return {
      message,
      fromCache: false,
    }
  } catch (error) {
    console.error("AI API 调用失败:", error)
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
