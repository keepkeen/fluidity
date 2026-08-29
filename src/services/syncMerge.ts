/**
 * 同步合并策略
 *
 * 多浏览器同步不再"整包覆盖、最后写入者赢"：
 * - 普通设置键：按每键修改时间取较新一方（LWW）
 * - 集合类数据（链接/置顶/统计）：深度并集合并，
 *   两台设备各自的新增都保留，且合并函数幂等（反复合并不膨胀）
 */

import {
  LinkClickRecord,
  normalizeSearchRecords,
  SearchRecord,
} from "./analytics"
import { linkGroup } from "../data/data"

export type KeyTimestamps = Record<string, number>

/** 需要深度合并（而非 LWW）的键 */
export const DEEP_MERGE_KEYS = new Set([
  "link-groups",
  "fluidity.linkPins.v1",
  "link-analytics",
  "search-history",
  "fluidity.rediscovery.v1",
  "fluidity.laterRead.v1",
  "fluidity.rss.subscriptions.v1",
  "fluidity.rss.readState.v1",
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

const SEARCH_HISTORY_LIMIT = 100

const searchRecordKey = (record: SearchRecord): string =>
  JSON.stringify([record.timestamp, record.engine, record.query])

const compareText = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0

/** 搜索历史：按真实 SearchRecord 模型合并，精确事件去重后稳定排序。 */
const mergeSearchHistory = (newer: unknown, older: unknown): SearchRecord[] => {
  const records = [
    ...normalizeSearchRecords(newer),
    ...normalizeSearchRecords(older),
  ]
  const unique = new Map<string, SearchRecord>()
  for (const record of records) unique.set(searchRecordKey(record), record)

  return [...unique.values()]
    .sort(
      (a, b) =>
        b.timestamp - a.timestamp ||
        compareText(a.engine, b.engine) ||
        compareText(a.query, b.query)
    )
    .slice(0, SEARCH_HISTORY_LIMIT)
}

const stableSerialize = (value: unknown): string => {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? String(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`
  }
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .map(key => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
    .join(",")}}`
}

interface UpdatedRecord {
  updatedAt?: number
}

const mergeUpdatedRecords = (
  newer: Record<string, UpdatedRecord>,
  older: Record<string, UpdatedRecord>
): Record<string, UpdatedRecord> => {
  const result: Record<string, UpdatedRecord> = {}
  for (const id of new Set([...Object.keys(older), ...Object.keys(newer)])) {
    const a = newer[id]
    const b = older[id]
    if (!a || !b) {
      result[id] = a ?? b
      continue
    }
    const aTimestamp = a.updatedAt ?? 0
    const bTimestamp = b.updatedAt ?? 0
    if (aTimestamp !== bTimestamp) {
      result[id] = aTimestamp > bTimestamp ? a : b
      continue
    }

    // 同一毫秒内的逐记录并发更新也必须与参数方向无关，否则两端会各自
    // 保留自己的记录。稳定序列化可让所有设备选择同一个内容赢家。
    result[id] = stableSerialize(a) >= stableSerialize(b) ? a : b
  }
  return result
}

const mergeLaterRead = (newer: unknown, older: unknown): unknown => {
  const a = (newer ?? {}) as {
    version?: number
    items?: Record<string, UpdatedRecord>
  }
  const b = (older ?? {}) as {
    version?: number
    items?: Record<string, UpdatedRecord>
  }
  return {
    version: 1,
    items: mergeUpdatedRecords(a.items ?? {}, b.items ?? {}),
  }
}

const mergeRssSubscriptions = (newer: unknown, older: unknown): unknown => {
  const a = (newer ?? {}) as {
    subscriptions?: Record<string, UpdatedRecord>
  }
  const b = (older ?? {}) as {
    subscriptions?: Record<string, UpdatedRecord>
  }
  return {
    version: 1,
    subscriptions: mergeUpdatedRecords(
      a.subscriptions ?? {},
      b.subscriptions ?? {}
    ),
  }
}

const mergeRssReadState = (newer: unknown, older: unknown): unknown =>
  mergeUpdatedRecords(
    (newer ?? {}) as Record<string, UpdatedRecord>,
    (older ?? {}) as Record<string, UpdatedRecord>
  )

const mergeTimestampMaps = (
  newer: unknown,
  older: unknown
): Record<string, number> => {
  const a = (newer ?? {}) as Record<string, number>
  const b = (older ?? {}) as Record<string, number>
  const result: Record<string, number> = {}
  for (const key of new Set([...Object.keys(b), ...Object.keys(a)])) {
    result[key] = Math.max(Number(a[key] ?? 0), Number(b[key] ?? 0))
  }
  return result
}

const mergeRediscovery = (newer: unknown, older: unknown): unknown => {
  const a = (newer ?? {}) as Record<string, unknown>
  const b = (older ?? {}) as Record<string, unknown>
  return {
    snoozed: mergeTimestampMaps(a.snoozed, b.snoozed),
    hidden: mergeTimestampMaps(a.hidden, b.hidden),
    restored: mergeTimestampMaps(a.restored, b.restored),
  }
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
    case "fluidity.linkPins.v1":
      return mergePins(newer, older)
    case "link-analytics":
      return mergeAnalytics(newer, older)
    case "search-history":
      return mergeSearchHistory(newer, older)
    case "fluidity.rediscovery.v1":
      return mergeRediscovery(newer, older)
    case "fluidity.laterRead.v1":
      return mergeLaterRead(newer, older)
    case "fluidity.rss.subscriptions.v1":
      return mergeRssSubscriptions(newer, older)
    case "fluidity.rss.readState.v1":
      return mergeRssReadState(newer, older)
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

    if (remoteHas && !localHas) {
      plan.push({ key, value: remoteData[key], timestamp: remoteTs, needsPush: false })
    } else if (localHas && !remoteHas) {
      plan.push({ key, timestamp: localTs, needsPush: true })
    } else if (remoteTs > localTs) {
      plan.push({ key, value: remoteData[key], timestamp: remoteTs, needsPush: false })
    } else if (localTs > remoteTs) {
      plan.push({ key, timestamp: localTs, needsPush: true })
    } else {
      const localSerialized = stableSerialize(localData[key])
      const remoteSerialized = stableSerialize(remoteData[key])
      if (localSerialized === remoteSerialized) {
        plan.push({ key, timestamp: localTs, needsPush: false })
        continue
      }

      // 同一毫秒内的并发更新无法再靠时间仲裁；用内容的稳定序列化结果
      // 确定赢家，保证两台设备无论站在哪一侧都收敛到同一个值。
      const localWins = localSerialized > remoteSerialized
      plan.push({
        key,
        value: localWins ? undefined : remoteData[key],
        timestamp: localTs,
        needsPush: localWins,
      })
    }
  }

  return plan
}
