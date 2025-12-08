/**
 * AI 主题生成服务
 * 根据用户描述生成主题配色方案
 */

import { AISettingsManager, callDeepSeekAPI } from "./ai"

/**
 * AI 生成的主题数据结构
 */
export interface AIGeneratedTheme {
  name: string
  bgColor: string
  defaultColor: string
  accentColor: string
  accentColor2: string
}

/**
 * 生成主题的 Prompt
 */
const generateThemePrompt = (userDescription: string): string => {
  return `你是一位专业的 UI/UX 设计师，拥有极高的审美品味和色彩理论知识。
你的任务是根据用户的描述，设计一套高级、和谐、专业的网页主题配色方案。

## 用户描述
"${userDescription}"

## 你需要生成的内容

### 1. name（主题名称）
- 2-6个中文字符
- 简洁有意境，能体现主题风格
- 示例：「深空」「暮光」「森语」「霓虹」

### 2. bgColor（背景色）
- 格式：6位十六进制，如 #1a1a2e
- 设计原则：
  - 深色主题：亮度 < 30%，避免纯黑 #000000
  - 浅色主题：亮度 > 85%，避免纯白 #ffffff
  - 要有质感，可以带一点色彩倾向
- 这是用户长时间注视的颜色，必须护眼舒适

### 3. defaultColor（文字和边框色）
- 格式：6位十六进制
- 设计原则：
  - 与背景色对比度 ≥ 4.5:1（WCAG AA 标准）
  - 深色背景用浅色文字，浅色背景用深色文字
  - 避免纯白 #ffffff 或纯黑 #000000，要柔和
- 这是主要阅读色，必须清晰可读

### 4. accentColor（主强调色）
- 格式：6位十六进制
- 设计原则：
  - 用于按钮、链接、高亮等交互元素
  - 要醒目但不刺眼
  - 与背景色形成鲜明对比
  - 体现用户描述的风格特征

### 5. accentColor2（次强调色）
- 格式：6位十六进制
- 设计原则：
  - 用于悬停状态、渐变、次要强调
  - 与 accentColor 形成和谐搭配（可以是：互补色、邻近色、同色系深浅变化）
  - 不能与 accentColor 太接近（色相差 ≥ 30° 或明度差 ≥ 20%）

## 输出格式要求

**严格按照以下 JSON 格式输出，不要有任何其他文字：**

{"name":"主题名","bgColor":"#1a1a2e","defaultColor":"#e8e8e8","accentColor":"#e94560","accentColor2":"#0f3460"}

## 注意事项
1. 所有颜色必须是 6 位十六进制格式（#RRGGBB）
2. 不要输出任何解释、前言、后语
3. 只输出一行 JSON，不要换行
4. 确保 JSON 格式正确，可以被直接解析`
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
 * 验证主题对象结构
 */
const isValidThemeObject = (
  obj: unknown
): obj is {
  name: string
  bgColor: string
  defaultColor: string
  accentColor: string
  accentColor2: string
} => {
  if (typeof obj !== "object" || obj === null) return false

  const theme = obj as Record<string, unknown>

  return (
    typeof theme.name === "string" &&
    typeof theme.bgColor === "string" &&
    typeof theme.defaultColor === "string" &&
    typeof theme.accentColor === "string" &&
    typeof theme.accentColor2 === "string"
  )
}

/**
 * 验证所有颜色格式
 */
const validateColors = (theme: {
  bgColor: string
  defaultColor: string
  accentColor: string
  accentColor2: string
}): boolean => {
  return (
    isValidHexColor(theme.bgColor) &&
    isValidHexColor(theme.defaultColor) &&
    isValidHexColor(theme.accentColor) &&
    isValidHexColor(theme.accentColor2)
  )
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

  // 3. 类型检查
  if (!isValidThemeObject(parsed)) return null

  // 4. 颜色格式验证
  if (!validateColors(parsed)) return null

  // 5. 对比度验证（如果不通过，仍然返回但记录警告）
  if (!validateContrast(parsed.bgColor, parsed.defaultColor)) {
    console.warn(
      "AI 生成的主题对比度不足:",
      getContrastRatio(parsed.bgColor, parsed.defaultColor)
    )
    // 不阻止使用，只是警告
  }

  // 6. 名称清理
  const cleanedName = sanitizeName(parsed.name)

  return {
    name: cleanedName,
    bgColor: parsed.bgColor,
    defaultColor: parsed.defaultColor,
    accentColor: parsed.accentColor,
    accentColor2: parsed.accentColor2,
  }
}

/**
 * 获取模型对应的 max_tokens
 */
const getMaxTokensForModel = (model: string): number => {
  return model === "deepseek-reasoner" ? 2000 : 500
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
 * 生成主题（带重试）
 */
export const generateTheme = async (
  description: string,
  model = "deepseek-chat",
  maxRetries = 2
): Promise<{ theme: AIGeneratedTheme | null; error?: string }> => {
  const settings = AISettingsManager.get()

  if (!settings.apiKey) {
    return { theme: null, error: "请先在 AI 助手设置中配置 API Key" }
  }

  const trimmedDescription = description.trim().slice(0, 200)
  if (!trimmedDescription) {
    return { theme: null, error: "请输入主题描述" }
  }

  const prompt = generateThemePrompt(trimmedDescription)
  let lastError: unknown = null

  for (let i = 0; i <= maxRetries; i++) {
    try {
      const theme = await tryGenerateTheme(settings.apiKey, prompt, model)
      if (theme) {
        return { theme }
      }
      console.warn(`AI 主题解析失败 (尝试 ${i + 1}/${maxRetries + 1})`)
    } catch (error) {
      console.error(`AI 调用失败 (尝试 ${i + 1}/${maxRetries + 1}):`, error)
      lastError = error
    }
  }

  if (lastError) {
    return { theme: null, error: formatError(lastError) }
  }
  return { theme: null, error: "生成失败，请尝试换一种描述方式" }
}
