import { LinkClickRecord } from "./analytics"
import { frecencyScore } from "./frecency"
import { linkGroup } from "../data/data"

export interface SmartEntry {
  label: string
  url: string
  icon?: string | null
  groupTitle: string
  score: number
  reason: string
}

interface RankSmartEntriesOptions {
  now?: number
  limit?: number
  excludedUrls?: Iterable<string>
  analyticsEnabled?: boolean
}

const hourDistance = (a: number, b: number): number => {
  const direct = Math.abs(a - b)
  return Math.min(direct, 24 - direct)
}

const contextScores = (
  record: LinkClickRecord | undefined,
  now: number
): { hour: number; weekday: number; recent: number; history: number } => {
  const history = record?.clickHistory ?? []
  if (history.length === 0) {
    return { hour: 0, weekday: 0, recent: 0, history: 0 }
  }
  const date = new Date(now)
  const currentHour = date.getHours()
  const currentDay = date.getDay()
  let hour = 0
  let weekday = 0
  for (const timestamp of history) {
    const clicked = new Date(timestamp)
    const distance = hourDistance(currentHour, clicked.getHours())
    hour += Math.max(0, 1 - distance / 6)
    if (clicked.getDay() === currentDay) weekday += 1
  }
  const count = history.length
  const ageDays = Math.max(0, (now - (record?.lastClicked ?? 0)) / 86_400_000)
  return {
    hour: hour / count,
    weekday: weekday / count,
    recent: Math.exp(-ageDays / 14),
    history: count,
  }
}

const reasonFor = (scores: {
  hour: number
  weekday: number
  recent: number
  history: number
}): string => {
  if (scores.hour >= 0.65 && scores.history >= 2) return "这个时段常用"
  if (scores.weekday >= 0.5 && scores.history >= 2) return "今天常用"
  if (scores.recent >= 0.7) return "最近常用"
  return "使用频率较高"
}

export const rankSmartEntries = (
  groups: linkGroup[],
  analytics: Record<string, LinkClickRecord>,
  options: RankSmartEntriesOptions = {}
): SmartEntry[] => {
  const now = options.now ?? Date.now()
  const limit = Math.max(1, options.limit ?? 4)
  const excluded = new Set(options.excludedUrls ?? [])
  const candidates: SmartEntry[] = []
  const seenUrls = new Set<string>()

  for (const group of groups) {
    for (const link of group.links) {
      if (!link.value || seenUrls.has(link.value) || excluded.has(link.value)) {
        continue
      }
      seenUrls.add(link.value)
      const record = analytics[link.value]
      const context = contextScores(record, now)
      const frecency = frecencyScore(record?.clickHistory, now)
      if (options.analyticsEnabled === false || context.history === 0) continue
      const normalizedFrecency = 1 - Math.exp(-frecency)
      const score =
        normalizedFrecency * 0.45 +
        context.hour * 0.25 +
        context.weekday * 0.15 +
        context.recent * 0.15
      candidates.push({
        label: link.label || link.value,
        url: link.value,
        icon: link.icon,
        groupTitle: group.title,
        score,
        reason: reasonFor(context),
      })
    }
  }

  const groupCounts = new Map<string, number>()
  const domainCounts = new Map<string, number>()
  const result: SmartEntry[] = []
  for (const entry of candidates.sort(
    (a, b) => b.score - a.score || a.url.localeCompare(b.url)
  )) {
    let domain = entry.url
    try {
      domain = new URL(entry.url).hostname
    } catch {
      // use the original value as the diversity key
    }
    if ((groupCounts.get(entry.groupTitle) ?? 0) >= 2) continue
    if ((domainCounts.get(domain) ?? 0) >= 1) continue
    result.push(entry)
    groupCounts.set(entry.groupTitle, (groupCounts.get(entry.groupTitle) ?? 0) + 1)
    domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + 1)
    if (result.length >= limit) break
  }
  return result
}
