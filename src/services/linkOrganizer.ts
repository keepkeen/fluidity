/**
 * AI 链接整理服务 - 使用当前配置的 OpenAI 兼容模型智能整理链接
 */

import { AISettingsManager, callDeepSeekAPI } from "./ai"
import { sanitizeAIPromptText } from "./aiPromptPrivacy"
import { dataElem, linkGroup } from "../data/data"

// 整理状态
export type OrganizeStatus = "idle" | "loading" | "success" | "error"

// 整理结果
export interface OrganizeResult {
  status: OrganizeStatus
  data?: linkGroup[]
  error?: string
}

export interface OrganizeLinksOptions {
  signal?: AbortSignal
}

// 事件监听器类型
type OrganizeListener = (result: OrganizeResult) => void

// 全局状态管理
let currentStatus: OrganizeStatus = "idle"
let listeners: OrganizeListener[] = []

/**
 * 订阅整理状态变化
 */
export const subscribeOrganizeStatus = (
  listener: OrganizeListener
): (() => void) => {
  listeners.push(listener)
  return () => {
    listeners = listeners.filter(l => l !== listener)
  }
}

/**
 * 通知所有监听器
 */
const notifyListeners = (result: OrganizeResult) => {
  currentStatus = result.status
  listeners.forEach(listener => listener(result))
}

const isAbortError = (error: unknown): boolean =>
  error instanceof DOMException && error.name === "AbortError"

/**
 * 获取当前状态
 */
export const getOrganizeStatus = (): OrganizeStatus => currentStatus

/**
 * 生成链接整理的 prompt
 */
const generateOrganizePrompt = (
  linkGroups: linkGroup[],
  customInstruction: string,
  secrets: readonly string[]
): string => {
  let nextToken = 1
  const minimalLinks = linkGroups.map(group => ({
    title: sanitizeAIPromptText(group.title, { secrets }),
    links: group.links.map(link => ({
      token: `item-${String(nextToken++).padStart(3, "0")}`,
      label: sanitizeAIPromptText(link.label, { secrets }),
      hostname: (() => {
        try {
          return sanitizeAIPromptText(new URL(link.value).hostname, {
            secrets,
          })
        } catch {
          return ""
        }
      })(),
    })),
  }))
  const linksJson = JSON.stringify(minimalLinks, null, 2)

  const exampleOutput = JSON.stringify(
    [
      {
        title: "社交媒体",
        links: [
          { token: "item-001", label: "Twitter" },
          { token: "item-002", label: "Reddit" },
        ],
      },
      {
        title: "开发工具",
        links: [
          { token: "item-003", label: "GitHub" },
          { token: "item-004", label: "VS Code" },
        ],
      },
    ],
    null,
    2
  )

  return `你是一个链接整理助手。请分析以下链接数据，根据每个链接的用途和特点进行智能分类整理。

## 当前链接数据：
${linksJson}

## 任务要求：
1. 分析每个链接的作用和用途
2. 如果遇到不熟悉的链接，根据域名和标签名推测其用途
3. 将相似用途的链接归类到同一个群组
4. 为每个群组取一个简洁明了的中文名称

## 用户自定义要求：
${sanitizeAIPromptText(customInstruction || "无特殊要求", {
  maxLength: 500,
  secrets,
})}

## 输出格式要求：
必须严格按照以下 JSON 格式输出，不允许输出任何其他内容：

${exampleOutput}

## 注意事项：
- 只输出 JSON 数组，不要有任何解释或说明
- 确保 JSON 格式正确，可以被直接解析
- 每个链接只使用给定的一次性 token 标识；不要猜测或返回 URL
- 所有 token 必须恰好出现一次，不得遗漏、新增、重复或修改
- 群组名称使用中文`
}

const restoreOriginalLinks = (
  sourceGroups: linkGroup[],
  organizedGroups: unknown
): linkGroup[] => {
  if (!Array.isArray(organizedGroups)) {
    throw new Error("AI 返回格式错误：不是数组")
  }

  const originalsByToken = new Map<string, dataElem>()
  let nextToken = 1
  for (const group of sourceGroups) {
    for (const link of group.links) {
      originalsByToken.set(
        `item-${String(nextToken++).padStart(3, "0")}`,
        link
      )
    }
  }
  const seenTokens = new Set<string>()

  const restored = organizedGroups.map(groupValue => {
    if (!groupValue || typeof groupValue !== "object") {
      throw new Error("AI 返回格式错误：群组结构不正确")
    }
    const group = groupValue as Record<string, unknown>
    if (
      Object.keys(group).some(key => key !== "title" && key !== "links") ||
      typeof group.title !== "string" ||
      !group.title.trim() ||
      group.title.trim().length > 80
    ) {
      throw new Error("AI 返回格式错误：群组名称不正确")
    }
    if (!Array.isArray(group.links)) {
      throw new Error("AI 返回格式错误：群组结构不正确")
    }

    const links = group.links.map(linkValue => {
      if (!linkValue || typeof linkValue !== "object") {
        throw new Error("AI 返回格式错误：链接结构不正确")
      }
      const link = linkValue as Record<string, unknown>
      if (
        Object.keys(link).some(key => key !== "token" && key !== "label") ||
        typeof link.token !== "string" ||
        typeof link.label !== "string" ||
        !link.label.trim() ||
        link.label.trim().length > 160
      ) {
        throw new Error("AI 返回格式错误：链接不合法")
      }

      const original = originalsByToken.get(link.token)
      if (!original || seenTokens.has(link.token)) {
        throw new Error("AI 返回的 token 不是原始链接的完整全排列")
      }
      seenTokens.add(link.token)
      return {
        ...original,
        label: link.label.trim(),
      }
    })

    return { title: group.title.trim(), links }
  })

  if (seenTokens.size !== originalsByToken.size) {
    throw new Error("AI 返回的 token 不是原始链接的完整全排列")
  }

  return restored
}

/**
 * 调用当前 AI 设置中的服务商与模型整理链接
 */
export const organizeLinksWithAI = async (
  linkGroups: linkGroup[],
  customInstruction: string,
  options: OrganizeLinksOptions = {}
): Promise<linkGroup[]> => {
  const settings = AISettingsManager.get()

  if (!settings.enabled) {
    throw new Error("AI 助手已关闭，请先在 AI 设置中开启")
  }
  if (!settings.apiKey.trim()) {
    throw new Error("请先在 AI 设置中配置 API Key")
  }

  // 通知开始加载
  notifyListeners({ status: "loading" })

  try {
    const prompt = generateOrganizePrompt(linkGroups, customInstruction, [
      settings.apiKey,
    ])

    const content = await callDeepSeekAPI(
      settings.apiKey,
      prompt,
      settings.model,
      {
        apiBaseUrl: settings.apiBaseUrl,
        maxTokens: 4000,
        temperature: 0.3,
        timeoutMs: 60_000,
        signal: options.signal,
      }
    )
    if (options.signal?.aborted) {
      throw new DOMException("请求已取消", "AbortError")
    }

    // 尝试解析 JSON
    // 可能返回的内容包含 markdown 代码块，需要提取
    let jsonStr = content
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim()
    }

    const result = restoreOriginalLinks(linkGroups, JSON.parse(jsonStr))
    if (options.signal?.aborted) {
      throw new DOMException("请求已取消", "AbortError")
    }

    // 通知成功
    notifyListeners({ status: "success", data: result })

    return result
  } catch (error) {
    if (isAbortError(error)) {
      notifyListeners({ status: "idle" })
      throw error
    }
    const errorMessage = error instanceof Error ? error.message : "未知错误"
    notifyListeners({ status: "error", error: errorMessage })
    throw error
  }
}

/**
 * 重置状态
 */
export const resetOrganizeStatus = () => {
  notifyListeners({ status: "idle" })
}
