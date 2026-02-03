/**
 * AI 主题生成服务
 * 根据用户描述生成主题配色方案（13 色系统）
 * 所有颜色均由 AI 生成，不使用算法计算
 * 支持缓存以避免重复生成
 */

import { AISettingsManager, callDeepSeekAPI } from "./ai"
import { CACHE, STORAGE_KEYS } from "../config/constants"
import { themeLogger } from "../utils/logger"

// ============ 主题缓存 ============

interface ThemeCacheEntry {
  theme: AIGeneratedTheme
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
export const getCachedTheme = (
  description: string
): AIGeneratedTheme | null => {
  const cache = getThemeCache()
  const normalizedDesc = description.toLowerCase().trim()
  const now = Date.now()

  const entry = cache.entries.find(
    e =>
      e.description.toLowerCase().trim() === normalizedDesc &&
      now - e.timestamp < CACHE.AI_THEME_TTL
  )

  return entry?.theme ?? null
}

/**
 * 缓存主题
 */
export const cacheTheme = (
  description: string,
  theme: AIGeneratedTheme
): void => {
  const cache = getThemeCache()

  // 移除相同描述的旧缓存
  cache.entries = cache.entries.filter(
    e => e.description.toLowerCase().trim() !== description.toLowerCase().trim()
  )

  // 添加新缓存
  cache.entries.unshift({
    theme,
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
 * 生成主题的 Prompt - 让 AI 生成全部 13 个颜色
 */
const generateThemePrompt = (userDescription: string): string => {
  return `你是一位专业的 UI/UX 设计师，拥有极高的审美品味和色彩理论知识。
你的任务是根据用户的描述，设计一套高级、和谐、专业的网页主题配色方案。

## 用户描述
"${userDescription}"

## 颜色系统说明（13 色，按用途严格分类）

这是一个语义化的颜色系统，每个颜色都有明确的用途，不能混用：

### 背景层（3色）- 页面层级背景
- bgPrimary: 页面主背景，用户长时间注视
- bgSecondary: 卡片/面板/输入框背景，比主背景稍深或稍浅
- bgHover: 悬停状态背景，比主背景稍亮

### 文字层（3色）- 文字颜色
- textPrimary: 主要文字（标题、正文），与背景对比度 >= 4.5:1
- textSecondary: 次要文字（说明、标签），比主文字弱 20-30%
- textMuted: 弱化文字（占位符、禁用），比次要文字更弱

### 边框层（2色）- 边框颜色
- borderDefault: 普通边框（输入框、卡片边框）
- borderActive: 激活边框（焦点、选中状态），通常与强调色相同

### 强调层（3色）- 强调/交互颜色
- accent: 主强调色（按钮、链接、选中项背景）
- accentHover: 强调色悬停状态，比主强调色稍深
- accentText: 强调色背景上的文字，根据强调色亮度选择深色或浅色

### 功能层（2色）- 特殊功能颜色
- success: 成功/完成状态，通常是绿色系
- glow: 阴影/发光效果，通常与强调色相同

## 输出格式要求

**严格按照以下 JSON 格式输出，不要有任何其他文字：**

{"name":"主题名","bgPrimary":"#24273A","bgSecondary":"#1E2030","bgHover":"#363A4F","textPrimary":"#CAD3F5","textSecondary":"#A5ADCE","textMuted":"#6E738D","borderDefault":"#3A3E54","borderActive":"#C6A0F6","accent":"#C6A0F6","accentHover":"#B48EE0","accentText":"#24273A","success":"#A6DA95","glow":"#C6A0F6"}

## 注意事项
1. 所有颜色必须是 6 位十六进制格式（#RRGGBB）
2. 不要输出任何解释、前言、后语
3. 只输出一行 JSON，不要换行
4. 确保 JSON 格式正确，可以被直接解析
5. 13 个颜色要形成和谐统一的视觉体系
6. 主题名称用 2-6 个中文字符，简洁有意境`
}

/**
 * 验证颜色格式（严格 6 位 hex）
 */
const isValidHexColor = (color: string): boolean => {
  return /^#[0-9A-Fa-f]{6}$/.test(color)
}

/**
 * 计算颜色亮度（WCAG 标准）
 */
const getLuminance = (hex: string): number => {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255

  const toLinear = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)

  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

/**
 * 计算对比度（WCAG 标准）
 */
export const getContrastRatio = (color1: string, color2: string): number => {
  const lum1 = getLuminance(color1)
  const lum2 = getLuminance(color2)
  const lighter = Math.max(lum1, lum2)
  const darker = Math.min(lum1, lum2)
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * 验证对比度（至少 4.5:1）
 */
const validateContrast = (bgColor: string, textColor: string): boolean => {
  return getContrastRatio(bgColor, textColor) >= 4.5
}

/**
 * 清理名称（防止 XSS，限制长度）
 */
const sanitizeName = (name: string): string => {
  const cleaned = name.replace(/<[^>]*>/g, "").replace(/[<>"'&]/g, "")
  return cleaned.slice(0, 20) || "AI 主题"
}

/**
 * 验证完整 13 色主题对象结构
 */
const isValidFullTheme = (obj: unknown): obj is AIGeneratedTheme => {
  if (typeof obj !== "object" || obj === null) return false

  const theme = obj as Record<string, unknown>

  const requiredFields = [
    "name",
    "bgPrimary",
    "bgSecondary",
    "bgHover",
    "textPrimary",
    "textSecondary",
    "textMuted",
    "borderDefault",
    "borderActive",
    "accent",
    "accentHover",
    "accentText",
    "success",
    "glow",
  ]

  return requiredFields.every(field => typeof theme[field] === "string")
}

/**
 * 验证所有颜色格式
 */
const validateAllColors = (theme: AIGeneratedTheme): boolean => {
  const colorFields = [
    "bgPrimary",
    "bgSecondary",
    "bgHover",
    "textPrimary",
    "textSecondary",
    "textMuted",
    "borderDefault",
    "borderActive",
    "accent",
    "accentHover",
    "accentText",
    "success",
    "glow",
  ] as const

  return colorFields.every(field => isValidHexColor(theme[field]))
}

/**
 * 解析 AI 响应
 */
export const parseAIThemeResponse = (
  response: string
): AIGeneratedTheme | null => {
  // 1. 提取 JSON（处理 AI 可能添加的前后文字）
  const jsonMatch = response.match(/\{[^{}]*\}/)
  if (!jsonMatch) return null

  // 2. 解析 JSON
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonMatch[0])
  } catch {
    return null
  }

  // 3. 类型检查（完整 13 色）
  if (!isValidFullTheme(parsed)) return null

  // 4. 颜色格式验证
  if (!validateAllColors(parsed)) return null

  // 5. 对比度验证（如果不通过，仍然返回但记录警告）
  if (!validateContrast(parsed.bgPrimary, parsed.textPrimary)) {
    themeLogger.warn(
      "AI 生成的主题对比度不足:",
      getContrastRatio(parsed.bgPrimary, parsed.textPrimary)
    )
  }

  // 6. 名称清理并返回
  return {
    ...parsed,
    name: sanitizeName(parsed.name),
  }
}

/**
 * 获取模型对应的 max_tokens
 * reasoner 模型需要更多 token 来完成推理过程
 */
const getMaxTokensForModel = (model: string): number => {
  return model === "deepseek-reasoner" ? 8000 : 800
}

/**
 * 格式化错误信息
 */
const formatError = (error: unknown): string => {
  return error instanceof Error ? error.message : "AI 服务调用失败，请稍后重试"
}

/**
 * 尝试生成主题（单次调用）
 */
const tryGenerateTheme = async (
  apiKey: string,
  prompt: string,
  model: string
): Promise<AIGeneratedTheme | null> => {
  const response = await callDeepSeekAPI(apiKey, prompt, model, {
    maxTokens: getMaxTokensForModel(model),
    temperature: 0.7,
  })
  return parseAIThemeResponse(response)
}

/**
 * 生成主题（带缓存和重试）
 */
export const generateTheme = async (
  description: string,
  model = "deepseek-chat",
  options: { maxRetries?: number; useCache?: boolean } = {}
): Promise<{
  theme: AIGeneratedTheme | null
  error?: string
  fromCache?: boolean
}> => {
  const { maxRetries = 2, useCache = true } = options
  const trimmedDescription = description.trim().slice(0, 200)

  if (!trimmedDescription) {
    return { theme: null, error: "请输入主题描述" }
  }

  // 检查缓存
  if (useCache) {
    const cachedTheme = getCachedTheme(trimmedDescription)
    if (cachedTheme) {
      return { theme: cachedTheme, fromCache: true }
    }
  }

  const settings = AISettingsManager.get()

  if (!settings.apiKey) {
    return { theme: null, error: "请先在 AI 助手设置中配置 API Key" }
  }

  const prompt = generateThemePrompt(trimmedDescription)
  let lastError: unknown = null

  for (let i = 0; i <= maxRetries; i++) {
    try {
      const theme = await tryGenerateTheme(settings.apiKey, prompt, model)
      if (theme) {
        // 缓存成功生成的主题
        cacheTheme(trimmedDescription, theme)
        return { theme, fromCache: false }
      }
      themeLogger.warn(`AI 主题解析失败 (尝试 ${i + 1}/${maxRetries + 1})`)
    } catch (error) {
      themeLogger.error(`AI 调用失败 (尝试 ${i + 1}/${maxRetries + 1}):`, error)
      lastError = error
    }
  }

  if (lastError) {
    return { theme: null, error: formatError(lastError) }
  }
  return { theme: null, error: "生成失败，请尝试换一种描述方式" }
}
