/**
 * frecency：频率 × 时间衰减的链接重要度模型。
 *
 * 重要度被计算而非配置：最近点得多 → 权重高，
 * 停止使用 → 自然衰减回落到收纳档。置顶是唯一的手动例外通道。
 */

import { LinkClickRecord } from "./analytics"
import { linkGroup } from "../data/data"

/** 衰减时间常数：一次点击的权重每 10 天衰减到 1/e */
const DECAY_TAU_DAYS = 10

/** 进入常用档的最低分（约等于一次 7 天内的点击） */
const FREQUENT_THRESHOLD = 0.5

/** 常用档最多展示的数量（含置顶） */
export const MAX_FREQUENT = 6

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * 按点击历史计算 frecency 分数：每次点击贡献 e^(-age/τ)
 */
export const frecencyScore = (
  clickHistory: number[] | undefined,
  now: number
): number => {
  if (!clickHistory || clickHistory.length === 0) return 0
  let score = 0
  for (const ts of clickHistory) {
    const ageDays = Math.max(0, (now - ts) / DAY_MS)
    score += Math.exp(-ageDays / DECAY_TAU_DAYS)
  }
  return score
}

export interface RankedLink {
  label: string
  url: string
  icon?: string | null
  groupTitle: string
  score: number
  pinned: boolean
}

export interface LinkTiers {
  /** 常用档：置顶优先，其后按 frecency 降序 */
  frequent: RankedLink[]
  /** 收纳档：保留原分组结构，剔除已进入常用档的链接 */
  rest: linkGroup[]
}

/**
 * 把链接分为常用档与收纳档。
 */
export const rankLinkTiers = (
  groups: linkGroup[],
  analytics: Record<string, LinkClickRecord>,
  pinnedUrls: Set<string>,
  now: number
): LinkTiers => {
  const all: RankedLink[] = []
  for (const group of groups) {
    for (const link of group.links) {
      if (!link.value) continue
      all.push({
        label: link.label || link.value,
        url: link.value,
        icon: link.icon,
        groupTitle: group.title,
        score: frecencyScore(analytics[link.value]?.clickHistory, now),
        pinned: pinnedUrls.has(link.value),
      })
    }
  }

  // 同一 URL 收藏多次时只进一次常用档
  const seen = new Set<string>()
  const pinnedLinks: RankedLink[] = []
  const scored: RankedLink[] = []
  for (const link of all) {
    if (seen.has(link.url)) continue
    seen.add(link.url)
    if (link.pinned) pinnedLinks.push(link)
    else if (link.score >= FREQUENT_THRESHOLD) scored.push(link)
  }
  scored.sort((a, b) => b.score - a.score)

  const frequent = [
    ...pinnedLinks,
    ...scored.slice(0, Math.max(0, MAX_FREQUENT - pinnedLinks.length)),
  ]
  const frequentUrls = new Set(frequent.map(link => link.url))

  const rest = groups
    .map(group => ({
      ...group,
      links: group.links.filter(link => !frequentUrls.has(link.value)),
    }))
    .filter(group => group.links.length > 0)

  return { frequent, rest }
}

// ============ 置顶存储 ============

export const LINK_PINS_KEY = "fluidity.linkPins.v1"

export const getPinnedUrls = (): Set<string> => {
  try {
    const raw = localStorage.getItem(LINK_PINS_KEY)
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        return new Set(parsed.filter((v): v is string => typeof v === "string"))
      }
    }
  } catch {
    // ignore
  }
  return new Set()
}

export const togglePinnedUrl = (url: string): Set<string> => {
  const pins = getPinnedUrls()
  if (pins.has(url)) pins.delete(url)
  else pins.add(url)
  try {
    localStorage.setItem(LINK_PINS_KEY, JSON.stringify([...pins]))
  } catch {
    // ignore
  }
  return pins
}
