/**
 * 同步合并策略
 *
 * 多浏览器同步不再"整包覆盖、最后写入者赢"：
 * - 普通设置键：按每键修改时间取较新一方（LWW）
 * - 集合类数据（链接/待办/置顶/统计）：深度并集合并，
 *   两台设备各自的新增都保留，且合并函数幂等（反复合并不膨胀）
 */

import { LinkClickRecord } from "./analytics"
import { linkGroup } from "../data/data"

export type KeyTimestamps = Record<string, number>

/** 需要深度合并（而非 LWW）的键 */
export const DEEP_MERGE_KEYS = new Set([
  "link-groups",
  "todos",
  "fluidity.linkPins.v1",
  "todo-contributions",
  "link-analytics",
  "search-history",
])

// ============ 各键的深度合并 ============

/** 链接分组：组按 title 并集，组内链接按 value 并集；较新一侧的顺序优先 */
const mergeLinkGroups = (newer: unknown, older: unknown): linkGroup[] => {
  const a = Array.isArray(newer) ? (newer as linkGroup[]) : []
  const b = Array.isArray(older) ? (older as linkGroup[]) : []

  const result: linkGroup[] = a.map(group => ({
    ...group,
    links: [...group.links],
  }))
  const byTitle = new Map(result.map(group => [group.title, group]))

  for (const group of b) {
    const existing = byTitle.get(group.title)
    if (!existing) {
      const copy = { ...group, links: [...group.links] }
      result.push(copy)
      byTitle.set(copy.title, copy)
      continue
    }
    const seen = new Set(existing.links.map(link => link.value))
    for (const link of group.links) {
      if (!seen.has(link.value)) {
        existing.links.push(link)
        seen.add(link.value)
      }
    }
  }
  return result
}

interface TodoItem {
  id: string
  [key: string]: unknown
}

/** 待办：按 id 并集，同 id 取较新一侧的版本 */
const mergeTodos = (newer: unknown, older: unknown): TodoItem[] => {
  const a = Array.isArray(newer) ? (newer as TodoItem[]) : []
  const b = Array.isArray(older) ? (older as TodoItem[]) : []
  const ids = new Set(a.map(t => t?.id).filter(Boolean))
  return [...a, ...b.filter(t => t?.id && !ids.has(t.id))]
}

/** 置顶：并集 */
const mergePins = (newer: unknown, older: unknown): string[] => {
  const a = Array.isArray(newer) ? newer : []
  const b = Array.isArray(older) ? older : []
  return [
    ...new Set(
      [...a, ...b].filter((v): v is string => typeof v === "string")
    ),
  ]
}

/** 贡献图：逐日取 max（幂等，反复合并不会把计数翻倍） */
const mergeContributions = (
  newer: unknown,
  older: unknown
): Record<string, number> => {
  const a = (newer ?? {}) as Record<string, unknown>
  const b = (older ?? {}) as Record<string, unknown>
  const result: Record<string, number> = {}
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const va = typeof a[key] === "number" ? (a[key] as number) : 0
    const vb = typeof b[key] === "number" ? (b[key] as number) : 0
    result[key] = Math.max(va, vb)
  }
  return result
}

/** 点击统计：逐 url 合并；clickHistory 并集去重，各字段取幂等的 max */
const mergeAnalytics = (
  newer: unknown,
  older: unknown
): Record<string, LinkClickRecord> => {
  const a = (newer ?? {}) as Record<string, LinkClickRecord>
  const b = (older ?? {}) as Record<string, LinkClickRecord>
  const result: Record<string, LinkClickRecord> = {}
  for (const url of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const ra = a[url]
    const rb = b[url]
    if (!ra || !rb) {
      result[url] = ra ?? rb
      continue
    }
    const history = [
      ...new Set([...(ra.clickHistory ?? []), ...(rb.clickHistory ?? [])]),
    ].sort((x, y) => x - y)
    result[url] = {
      ...rb,
      ...ra,
      clicks: Math.max(ra.clicks ?? 0, rb.clicks ?? 0, history.length),
      lastClicked: Math.max(ra.lastClicked ?? 0, rb.lastClicked ?? 0),
      clickHistory: history,
    }
  }
  return result
}

const SEARCH_HISTORY_LIMIT = 20

/** 搜索历史：较新一侧优先，补另一侧缺失，去重截断 */
const mergeSearchHistory = (newer: unknown, older: unknown): string[] => {
  const a = Array.isArray(newer) ? newer : []
  const b = Array.isArray(older) ? older : []
  return [
    ...new Set(
      [...a, ...b].filter((v): v is string => typeof v === "string")
    ),
  ].slice(0, SEARCH_HISTORY_LIMIT)
}

/**
 * 深度合并入口：newer/older 按该键的修改时间确定
 */
export const deepMergeKey = (
  key: string,
  newer: unknown,
  older: unknown
): unknown => {
  switch (key) {
    case "link-groups":
      return mergeLinkGroups(newer, older)
    case "todos":
      return mergeTodos(newer, older)
    case "fluidity.linkPins.v1":
      return mergePins(newer, older)
    case "todo-contributions":
      return mergeContributions(newer, older)
    case "link-analytics":
      return mergeAnalytics(newer, older)
    case "search-history":
      return mergeSearchHistory(newer, older)
    default:
      return newer
  }
}

export interface MergePlanEntry {
  key: string
  /** 要写入本地的值；undefined 表示本地已是最新，无需写 */
  value?: unknown
  /** 合并后该键的时间戳 */
  timestamp: number
  /** 本地比远端新（或深度合并产生新内容）→ 需要回推 */
  needsPush: boolean
}

/**
 * 计算远端快照与本地快照的合并计划（纯函数，可测）。
 */
export const planMerge = (options: {
  localData: Record<string, unknown>
  localTimestamps: KeyTimestamps
  remoteData: Record<string, unknown>
  remoteTimestamps: KeyTimestamps
  /** 远端信封缺少逐键时间戳时的回退值（旧版信封） */
  remoteFallbackTs: number
}): MergePlanEntry[] => {
  const {
    localData,
    localTimestamps,
    remoteData,
    remoteTimestamps,
    remoteFallbackTs,
  } = options

  const keys = new Set([...Object.keys(localData), ...Object.keys(remoteData)])
  const plan: MergePlanEntry[] = []

  for (const key of keys) {
    const localHas = key in localData
    const remoteHas = key in remoteData
    const localTs = localTimestamps[key] ?? 0
    const remoteTs = remoteTimestamps[key] ?? remoteFallbackTs

    if (DEEP_MERGE_KEYS.has(key)) {
      const newerFirst = localTs >= remoteTs
      const merged = deepMergeKey(
        key,
        newerFirst ? localData[key] : remoteData[key],
        newerFirst ? remoteData[key] : localData[key]
      )
      const changedLocally =
        JSON.stringify(merged) !== JSON.stringify(localData[key])
      const changedRemotely =
        JSON.stringify(merged) !== JSON.stringify(remoteData[key])
      plan.push({
        key,
        value: changedLocally ? merged : undefined,
        timestamp: Math.max(localTs, remoteTs),
        needsPush: changedRemotely,
      })
      continue
    }

    if (remoteHas && (!localHas || remoteTs > localTs)) {
      plan.push({ key, value: remoteData[key], timestamp: remoteTs, needsPush: false })
    } else if (localHas && (!remoteHas || localTs > remoteTs)) {
      plan.push({ key, timestamp: localTs, needsPush: true })
    } else {
      // 相同时间戳：视为一致，保留本地
      plan.push({ key, timestamp: localTs, needsPush: false })
    }
  }

  return plan
}
