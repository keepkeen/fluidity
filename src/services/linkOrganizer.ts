/**
 * AI 链接整理服务 - 使用当前配置的 OpenAI 兼容模型智能整理链接
 */

import { AISettingsManager, callDeepSeekAPI } from "./ai"
import { dataElem, linkGroup } from "../data/data"
import { isSafeLinkUrl } from "../utils/urlSafety"

// 整理状态
export type OrganizeStatus = "idle" | "loading" | "success" | "error"

// 整理结果
export interface OrganizeResult {
  status: OrganizeStatus
  data?: linkGroup[]
  error?: string
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

/**
 * 获取当前状态
 */
export const getOrganizeStatus = (): OrganizeStatus => currentStatus

/**
 * 生成链接整理的 prompt
 */
const generateOrganizePrompt = (
  linkGroups: linkGroup[],
  customInstruction: string
): string => {
  // Keep prompt small + stable: only send label/value (exclude cached favicon/icon).
  const minimalLinks = linkGroups.map(g => ({
    title: g.title,
    links: g.links.map(l => ({ label: l.label, value: l.value })),
  }))
  const linksJson = JSON.stringify(minimalLinks, null, 2)

  const exampleOutput = JSON.stringify(
    [
      {
        title: "社交媒体",
        links: [
          { label: "Twitter", value: "https://twitter.com" },
          { label: "Reddit", value: "https://reddit.com" },
        ],
      },
      {
        title: "开发工具",
        links: [
          { label: "GitHub", value: "https://github.com" },
          { label: "VS Code", value: "https://code.visualstudio.com" },
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
${customInstruction || "无特殊要求"}

## 输出格式要求：
必须严格按照以下 JSON 格式输出，不允许输出任何其他内容：

${exampleOutput}

## 注意事项：
- 只输出 JSON 数组，不要有任何解释或说明
- 确保 JSON 格式正确，可以被直接解析
- 保留所有原始链接，不要遗漏
- 不要新增、删除、重复或修改任何链接地址
- 群组名称使用中文`
}

const restoreOriginalLinks = (
  sourceGroups: linkGroup[],
  organizedGroups: unknown
): linkGroup[] => {
  if (!Array.isArray(organizedGroups)) {
    throw new Error("AI 返回格式错误：不是数组")
  }

  const originalsByUrl = new Map<string, dataElem[]>()
  for (const group of sourceGroups) {
    for (const link of group.links) {
      const matches = originalsByUrl.get(link.value) ?? []
      matches.push(link)
      originalsByUrl.set(link.value, matches)
    }
  }

  const restored = organizedGroups.map(groupValue => {
    if (!groupValue || typeof groupValue !== "object") {
      throw new Error("AI 返回格式错误：群组结构不正确")
    }
    const group = groupValue as { title?: unknown; links?: unknown }
    if (typeof group.title !== "string" || !group.title.trim()) {
      throw new Error("AI 返回格式错误：群组名称不正确")
    }
    if (!Array.isArray(group.links)) {
      throw new Error("AI 返回格式错误：群组结构不正确")
    }

    const links = group.links.map(linkValue => {
      if (!linkValue || typeof linkValue !== "object") {
        throw new Error("AI 返回格式错误：链接结构不正确")
      }
      const link = linkValue as { label?: unknown; value?: unknown }
      if (
        typeof link.label !== "string" ||
        !link.label.trim() ||
        typeof link.value !== "string" ||
        !isSafeLinkUrl(link.value)
      ) {
        throw new Error("AI 返回格式错误：链接不合法")
      }

      const originals = originalsByUrl.get(link.value)
      const original = originals?.shift()
      if (!original) {
        throw new Error("AI 返回的链接与原始数据不一致，已取消整理")
      }
      return {
        ...original,
        label: link.label.trim(),
      }
    })

    return { title: group.title.trim(), links }
  })

  if ([...originalsByUrl.values()].some(matches => matches.length > 0)) {
    throw new Error("AI 返回的链接与原始数据不一致，已取消整理")
  }

  return restored
}

/**
 * 调用当前 AI 设置中的服务商与模型整理链接
 */
export const organizeLinksWithAI = async (
  linkGroups: linkGroup[],
  customInstruction: string
): Promise<linkGroup[]> => {
  const settings = AISettingsManager.get()

  if (!settings.apiKey) {
    throw new Error("请先在 AI 设置中配置 API Key")
  }

  // 通知开始加载
  notifyListeners({ status: "loading" })

  try {
    const prompt = generateOrganizePrompt(linkGroups, customInstruction)

    const content = await callDeepSeekAPI(
      settings.apiKey,
      prompt,
      settings.model,
      {
        apiBaseUrl: settings.apiBaseUrl,
        maxTokens: 4000,
        temperature: 0.3,
        timeoutMs: 60_000,
      }
    )

    // 尝试解析 JSON
    // 可能返回的内容包含 markdown 代码块，需要提取
    let jsonStr = content
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim()
    }

    const result = restoreOriginalLinks(linkGroups, JSON.parse(jsonStr))

    // 通知成功
    notifyListeners({ status: "success", data: result })

    return result
  } catch (error) {
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
