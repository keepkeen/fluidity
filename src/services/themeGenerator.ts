/**
 * AI 主题生成服务
 *
 * 模型只负责审美决策：输出 3 组种子色（背景/强调/文字）。
 * 完整 13 色由 deriveThemeColors 推导，文字可读性与对比度
 * 由代码硬性保证，不依赖模型自觉满足。
 */

import { AISettingsManager, callDeepSeekAPI } from "./ai"
import { CACHE, STORAGE_KEYS } from "../config/constants"
import { deriveThemeColors } from "../utils/colorUtils"
import { themeLogger } from "../utils/logger"

// ============ 主题缓存 ============

interface ThemeCacheEntry {
  themes: AIGeneratedTheme[]
  timestamp: number
  description: string
}

interface ThemeCache {
  entries: ThemeCacheEntry[]
}

const MAX_CACHE_ENTRIES = 10

/**
 * 获取主题缓存
 */
const getThemeCache = (): ThemeCache => {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.AI_THEME_CACHE)
    if (data) {
      return JSON.parse(data) as ThemeCache
    }
  } catch {
    // ignore
  }
  return { entries: [] }
}

/**
 * 保存主题缓存
 */
const saveThemeCache = (cache: ThemeCache): void => {
  try {
    localStorage.setItem(STORAGE_KEYS.AI_THEME_CACHE, JSON.stringify(cache))
  } catch {
    // ignore - localStorage 可能已满
  }
}

/**
 * 从缓存获取主题
 */
export const getCachedThemesFor = (
  description: string
): AIGeneratedTheme[] | null => {
  const cache = getThemeCache()
  const normalizedDesc = description.toLowerCase().trim()
  const now = Date.now()

  const entry = cache.entries.find(
    e =>
      e.description.toLowerCase().trim() === normalizedDesc &&
      // 旧版缓存条目是单主题结构，直接视为失效
      Array.isArray(e.themes) &&
      now - e.timestamp < CACHE.AI_THEME_TTL
  )

  return entry?.themes ?? null
}

/**
 * 缓存主题
 */
export const cacheThemes = (
  description: string,
  themes: AIGeneratedTheme[]
): void => {
  const cache = getThemeCache()

  // 移除相同描述的旧缓存
  cache.entries = cache.entries.filter(
    e => e.description.toLowerCase().trim() !== description.toLowerCase().trim()
  )

  // 添加新缓存
  cache.entries.unshift({
    themes,
    timestamp: Date.now(),
    description,
  })

  // 限制缓存数量
  if (cache.entries.length > MAX_CACHE_ENTRIES) {
    cache.entries = cache.entries.slice(0, MAX_CACHE_ENTRIES)
  }

  saveThemeCache(cache)
}

/**
 * 清除主题缓存
 */
export const clearThemeCache = (): void => {
  localStorage.removeItem(STORAGE_KEYS.AI_THEME_CACHE)
}

/**
 * 获取所有缓存的主题（用于历史记录）
 */
export const getCachedThemes = (): ThemeCacheEntry[] => {
  const cache = getThemeCache()
  const now = Date.now()
  // 只返回未过期的
  return cache.entries.filter(e => now - e.timestamp < CACHE.AI_THEME_TTL)
}

/**
 * AI 生成的主题数据结构（13 色系统）
 */
export interface AIGeneratedTheme {
  name: string
  // 背景层
  bgPrimary: string
  bgSecondary: string
  bgHover: string
  // 文字层
  textPrimary: string
  textSecondary: string
  textMuted: string
  // 边框层
  borderDefault: string
  borderActive: string
  // 强调层
  accent: string
  accentHover: string
  accentText: string
  // 功能层
  success: string
  glow: string
}

/**
 * 生成主题种子的 Prompt：模型只出 3 组种子色，可读性由代码保证
 */
const generateThemePrompt = (userDescription: string): string => {
  return `你是一位专业的 UI 配色设计师。根据用户描述，给出 3 套风格取向不同的候选配色种子。

## 用户描述
"${userDescription}"

## 你只需要为每套候选给出 3 个颜色
- bg: 页面主背景色（决定明暗与色温）
- accent: 强调色（按钮/链接/高亮，决定个性）
- text: 主文字色（与 bg 谐调即可，可读性由程序自动校正，不必精确计算对比度）

其余颜色（悬停、边框、弱化文字等）由程序推导，你不用给。

## 输出格式（严格 JSON，一行，无其他文字）
{"candidates":[{"name":"主题名","bg":"#24273A","accent":"#C6A0F6","text":"#CAD3F5"},{"name":"...","bg":"#...","accent":"#...","text":"#..."},{"name":"...","bg":"#...","accent":"#...","text":"#..."}]}

## 要求
1. 颜色一律 6 位十六进制（#RRGGBB）
2. 3 套候选在明暗或色相上拉开差异，给用户真实的选择空间
3. 主题名 2-6 个中文字符，简洁有意境
4. 只输出 JSON`
}

/**
 * 验证颜色格式（严格 6 位 hex）
 */
const isValidHexColor = (color: string): boolean => {
  return /^#[0-9A-Fa-f]{6}$/.test(color)
}

/**
 * 清理名称（防止 XSS，限制长度）
 */
const sanitizeName = (name: string): string => {
  const cleaned = name.replace(/<[^>]*>/g, "").replace(/[<>"'&]/g, "")
  return cleaned.slice(0, 20) || "AI 主题"
}

interface ThemeSeedCandidate {
  name: string
  bg: string
  accent: string
  text?: string
}

const parseSeedCandidates = (response: string): ThemeSeedCandidate[] => {
  const jsonMatch = response.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return []

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonMatch[0])
  } catch {
    return []
  }

  const candidates = (parsed as { candidates?: unknown }).candidates
  if (!Array.isArray(candidates)) return []

  return candidates
    .filter((c): c is Record<string, unknown> => typeof c === "object" && c !== null)
    .filter(
      c =>
        typeof c.name === "string" &&
        typeof c.bg === "string" &&
        isValidHexColor(c.bg) &&
        typeof c.accent === "string" &&
        isValidHexColor(c.accent)
    )
    .map(c => ({
      name: sanitizeName(c.name as string),
      bg: c.bg as string,
      accent: c.accent as string,
      text:
        typeof c.text === "string" && isValidHexColor(c.text)
          ? c.text
          : undefined,
    }))
    .slice(0, 3)
}

/**
 * 种子 → 完整 13 色（对比度在 deriveThemeColors 内硬性保证）
 */
const seedToTheme = (seed: ThemeSeedCandidate): AIGeneratedTheme => {
  const colors = deriveThemeColors({
    bgPrimary: seed.bg,
    accent: seed.accent,
    textPrimary: seed.text,
  })
  return {
    name: seed.name,
    bgPrimary: colors["--bg-primary"],
    bgSecondary: colors["--bg-secondary"],
    bgHover: colors["--bg-hover"],
    textPrimary: colors["--text-primary"],
    textSecondary: colors["--text-secondary"],
    textMuted: colors["--text-muted"],
    borderDefault: colors["--border-default"],
    borderActive: colors["--border-active"],
    accent: colors["--accent"],
    accentHover: colors["--accent-hover"],
    accentText: colors["--accent-text"],
    success: colors["--success"],
    glow: colors["--glow"],
  }
}

/**
 * 获取模型对应的 max_tokens
 * reasoner 模型需要更多 token 来完成推理过程
 */
const getMaxTokensForModel = (model: string): number => {
  // 种子输出很小；推理模型额外预算给思考过程
  return model === "deepseek-reasoner" ? 8000 : 400
}

/**
 * 格式化错误信息
 */
const formatError = (error: unknown): string => {
  return error instanceof Error ? error.message : "AI 服务调用失败，请稍后重试"
}

/**
 * 单次调用：请求种子并派生为完整主题
 */
const tryGenerateThemes = async (
  apiKey: string,
  prompt: string,
  model: string
): Promise<AIGeneratedTheme[]> => {
  const response = await callDeepSeekAPI(apiKey, prompt, model, {
    maxTokens: getMaxTokensForModel(model),
    temperature: 0.8,
  })
  return parseSeedCandidates(response).map(seedToTheme)
}

/**
 * 生成 3 套候选主题（带缓存和重试）
 */
export const generateThemes = async (
  description: string,
  options: { maxRetries?: number; useCache?: boolean } = {}
): Promise<{
  themes: AIGeneratedTheme[]
  error?: string
  fromCache?: boolean
}> => {
  const { maxRetries = 2, useCache = true } = options
  const model = AISettingsManager.get().model
  const trimmedDescription = description.trim().slice(0, 200)

  if (!trimmedDescription) {
    return { themes: [], error: "请输入主题描述" }
  }

  if (useCache) {
    const cached = getCachedThemesFor(trimmedDescription)
    if (cached && cached.length > 0) {
      return { themes: cached, fromCache: true }
    }
  }

  const settings = AISettingsManager.get()

  if (!settings.apiKey) {
    return { themes: [], error: "请先在 AI 助手设置中配置 API Key" }
  }

  const prompt = generateThemePrompt(trimmedDescription)
  let lastError: unknown = null

  for (let i = 0; i <= maxRetries; i++) {
    try {
      const themes = await tryGenerateThemes(settings.apiKey, prompt, model)
      if (themes.length > 0) {
        cacheThemes(trimmedDescription, themes)
        return { themes, fromCache: false }
      }
      themeLogger.warn(`AI 主题解析失败 (尝试 ${i + 1}/${maxRetries + 1})`)
    } catch (error) {
      themeLogger.error(`AI 调用失败 (尝试 ${i + 1}/${maxRetries + 1}):`, error)
      lastError = error
    }
  }

  if (lastError) {
    return { themes: [], error: formatError(lastError) }
  }
  return { themes: [], error: "生成失败，请尝试换一种描述方式" }
}
