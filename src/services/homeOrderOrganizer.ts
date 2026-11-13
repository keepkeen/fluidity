import { linkGroup } from "../data/data"
import { LinkClickRecord } from "./analytics"
import { AISettingsManager, callDeepSeekAPI } from "./ai"
import { sanitizeAIPromptText } from "./aiPromptPrivacy"
import { frecencyScore } from "./frecency"

const APP_ID_PREFIX = "app:"
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

export interface HomeOrderCandidate {
  token: string
  label: string
  group: string
  hostname: string
  currentPosition: number
  clicks?: number
  recentClicks30d?: number
  frecency?: number
}

export interface BuildHomeOrderCandidatesOptions {
  includeUsage?: boolean
  now?: number
}

export interface OrganizeHomeOrderOptions
  extends BuildHomeOrderCandidatesOptions {
  instruction?: string
  signal?: AbortSignal
}

export interface OrganizedHomeOrder {
  orderedAppIds: string[]
  summary: string
}

interface CandidateBuildResult {
  candidates: HomeOrderCandidate[]
  appIdByToken: Map<string, string>
}

interface AppSource {
  appId: string
  url: string
  label: string
  group: string
}

const getHostname = (url: string): string => {
  try {
    return new URL(url).hostname
  } catch {
    return ""
  }
}

const getAppSources = (groups: linkGroup[]): AppSource[] => {
  const seen = new Set<string>()
  const sources: AppSource[] = []

  for (const group of groups) {
    for (const link of group.links) {
      if (!link.value) continue
      const appId = `${APP_ID_PREFIX}${link.value}`
      if (seen.has(appId)) continue
      seen.add(appId)
      sources.push({
        appId,
        url: link.value,
        label: link.label || getHostname(link.value),
        group: group.title,
      })
    }
  }

  return sources
}

/** Returns each currently valid home app ID once, in link-group order. */
export const getValidHomeAppIds = (groups: linkGroup[]): string[] =>
  getAppSources(groups).map(source => source.appId)

const orderSources = (
  sources: AppSource[],
  mixedOrder: readonly string[]
): AppSource[] => {
  const byId = new Map(sources.map(source => [source.appId, source]))
  const used = new Set<string>()
  const ordered: AppSource[] = []

  for (const id of mixedOrder) {
    const source = byId.get(id)
    if (!source || used.has(id)) continue
    used.add(id)
    ordered.push(source)
  }

  for (const source of sources) {
    if (!used.has(source.appId)) ordered.push(source)
  }

  return ordered
}

const normalizeCount = (value: number | undefined): number =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, value)
    : 0

const buildCandidateData = (
  groups: linkGroup[],
  mixedOrder: readonly string[],
  analytics: Record<string, LinkClickRecord>,
  options: BuildHomeOrderCandidatesOptions = {},
  secrets: readonly string[] = []
): CandidateBuildResult => {
  const now = options.now ?? Date.now()
  const recentThreshold = now - THIRTY_DAYS_MS
  const orderedSources = orderSources(getAppSources(groups), mixedOrder)
  const appIdByToken = new Map<string, string>()

  const candidates = orderedSources.map((source, currentPosition) => {
    const token = `item-${String(currentPosition + 1).padStart(3, "0")}`
    appIdByToken.set(token, source.appId)

    const candidate: HomeOrderCandidate = {
      token,
      label:
        sanitizeAIPromptText(source.label, { secrets }) ||
        getHostname(source.url) ||
        "未命名",
      group:
        sanitizeAIPromptText(source.group, { secrets }) || "未分组",
      hostname: sanitizeAIPromptText(getHostname(source.url), { secrets }),
      currentPosition,
    }

    if (options.includeUsage) {
      const record = analytics[source.url]
      const history = Array.isArray(record?.clickHistory)
        ? record.clickHistory
        : []
      candidate.clicks = normalizeCount(record?.clicks)
      candidate.recentClicks30d = history.filter(
        timestamp =>
          Number.isFinite(timestamp) &&
          timestamp >= recentThreshold &&
          timestamp <= now
      ).length
      candidate.frecency = frecencyScore(history, now)
    }

    return candidate
  })

  return { candidates, appIdByToken }
}

/**
 * Builds the privacy-minimized payload sent to the model. Full URLs, visit
 * timestamps, credentials and cached icons never enter a candidate.
 */
export const buildHomeOrderCandidates = (
  groups: linkGroup[],
  mixedOrder: readonly string[],
  analytics: Record<string, LinkClickRecord>,
  options: BuildHomeOrderCandidatesOptions = {}
): HomeOrderCandidate[] =>
  buildCandidateData(groups, mixedOrder, analytics, options).candidates

const extractJson = (content: string): string => {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)
  return fenced ? fenced[1].trim() : content.trim()
}

const parseOrderedTokens = (
  content: string,
  expectedTokens: readonly string[]
): { orderedIds: string[]; summary: string } => {
  let parsed: unknown
  try {
    parsed = JSON.parse(extractJson(content))
  } catch {
    throw new Error("AI 返回格式错误：无法解析 JSON")
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("AI 返回格式错误：结果必须是 JSON 对象")
  }

  const record = parsed as Record<string, unknown>
  if (
    Object.keys(record).some(
      key => key !== "orderedIds" && key !== "summary"
    ) ||
    !Array.isArray(record.orderedIds) ||
    !record.orderedIds.every(id => typeof id === "string") ||
    typeof record.summary !== "string"
  ) {
    throw new Error("AI 返回格式错误：必须只包含 orderedIds 和 summary")
  }

  const orderedIds = record.orderedIds as string[]
  const expected = new Set(expectedTokens)
  const actual = new Set(orderedIds)
  const isPermutation =
    orderedIds.length === expectedTokens.length &&
    actual.size === orderedIds.length &&
    orderedIds.every(id => expected.has(id))

  if (!isPermutation) {
    throw new Error("AI 返回的图标顺序不是原始候选的完整全排列")
  }

  return { orderedIds, summary: record.summary.trim() }
}

const generatePrompt = (
  candidates: HomeOrderCandidate[],
  instruction: string,
  secrets: readonly string[]
): string => `你是浏览器起始页的图标排序助手。请根据用户要求调整候选图标顺序。

候选数据（token 是一次性不透明标识，必须原样返回）：
${JSON.stringify(candidates)}

用户要求：
${sanitizeAIPromptText(
  instruction.trim() || "按语义和使用便利性整理图标顺序",
  { maxLength: 500, secrets }
)}

严格要求：
1. 仅输出一个 JSON 对象，不得输出解释文字。
2. JSON 必须且只能包含 {"orderedIds":["token"],"summary":"简短说明"}。
3. orderedIds 必须是所有候选 token 的完整全排列：不得遗漏、新增、重复或修改 token。
4. 不要猜测、补充或返回 URL。
5. 如果候选包含 clicks、recentClicks30d、frecency，可按用户要求利用；没有这些字段时不得臆测使用频率。`

/** Uses the configured OpenAI-compatible provider to organize home apps. */
export const organizeHomeOrderWithAI = async (
  groups: linkGroup[],
  mixedOrder: readonly string[],
  analytics: Record<string, LinkClickRecord>,
  options: OrganizeHomeOrderOptions = {}
): Promise<OrganizedHomeOrder> => {
  const settings = AISettingsManager.get()
  if (!settings.enabled) {
    throw new Error("AI 助手已关闭，请先在 AI 设置中开启")
  }
  if (!settings.apiKey.trim()) {
    throw new Error("请先在 AI 设置中配置 API Key")
  }

  const { candidates, appIdByToken } = buildCandidateData(
    groups,
    mixedOrder,
    analytics,
    options,
    [settings.apiKey]
  )
  if (candidates.length === 0) return { orderedAppIds: [], summary: "" }

  const content = await callDeepSeekAPI(
    settings.apiKey,
    generatePrompt(candidates, options.instruction ?? "", [settings.apiKey]),
    settings.model,
    {
      apiBaseUrl: settings.apiBaseUrl,
      maxTokens: Math.min(4000, Math.max(500, candidates.length * 24)),
      temperature: 0.1,
      timeoutMs: 60_000,
      signal: options.signal,
    }
  )
  if (options.signal?.aborted) {
    throw new DOMException("请求已取消", "AbortError")
  }

  const result = parseOrderedTokens(
    content,
    candidates.map(candidate => candidate.token)
  )
  return {
    orderedAppIds: result.orderedIds.map(token => appIdByToken.get(token)!),
    summary: result.summary.slice(0, 180),
  }
}

/** Stable local fallback: frecency first, click count second. */
export const sortAppOrderByUsage = (
  groups: linkGroup[],
  mixedOrder: readonly string[],
  analytics: Record<string, LinkClickRecord>,
  now = Date.now()
): string[] =>
  orderSources(getAppSources(groups), mixedOrder)
    .map((source, index) => ({
      source,
      index,
      frecency: frecencyScore(analytics[source.url]?.clickHistory, now),
      clicks: normalizeCount(analytics[source.url]?.clicks),
    }))
    .sort(
      (a, b) =>
        b.frecency - a.frecency ||
        b.clicks - a.clicks ||
        a.index - b.index
    )
    .map(entry => entry.source.appId)

/**
 * Safely applies a potentially stale requested order. Deleted apps are
 * discarded; current apps absent from the draft are restored in stable
 * layout/group order before app slots are replaced.
 */
export const mergeAppOrderPreservingWidgets = (
  mixedOrder: readonly string[],
  requestedAppIds: readonly string[],
  validAppIds: readonly string[]
): string[] => {
  const uniqueValidApps = validAppIds.filter(
    (id, index) =>
      id.startsWith(APP_ID_PREFIX) && validAppIds.indexOf(id) === index
  )
  const validSet = new Set(uniqueValidApps)
  const completedApps: string[] = []
  const used = new Set<string>()

  const addIfValid = (id: string) => {
    if (!validSet.has(id) || used.has(id)) return
    used.add(id)
    completedApps.push(id)
  }

  requestedAppIds.forEach(addIfValid)
  mixedOrder.forEach(addIfValid)
  uniqueValidApps.forEach(addIfValid)

  let appIndex = 0
  const merged: string[] = []

  for (const id of mixedOrder) {
    if (!id.startsWith(APP_ID_PREFIX)) {
      merged.push(id)
      continue
    }
    if (appIndex < completedApps.length) {
      merged.push(completedApps[appIndex++])
    }
  }

  merged.push(...completedApps.slice(appIndex))
  return merged
}
