import {
  getChromeLocal,
  hasChromeStorage,
  setChromeLocal,
} from "./extensionStore"

export const BROWSER_USAGE_STORAGE_KEY = "fluidity.browserUsage.v1"
export const BROWSER_USAGE_DOMAIN_APPS_KEY =
  "fluidity.browserUsage.domainApps.v1"

export interface BrowserUsagePageStat {
  sec: number
  domain: string
  title?: string
}

export interface BrowserUsageDay {
  totalSec: number
  byDomain: Record<string, number>
  byPage: Record<string, BrowserUsagePageStat>
  byHour: number[]
  updatedAt: number
}

export interface BrowserUsageRecentSegment {
  startTs: number
  endTs: number
  domain: string
  page: string
  title?: string
}

export interface BrowserUsageCurrentSegment {
  key: string
  domain: string
  page: string
  title?: string
  startTs: number
  lastTs: number
  countedTs?: number
}

export interface BrowserUsageStoreV1 {
  version: 1
  updatedAt: number
  retentionDays: number
  intervalMs: number
  maxGapMs: number
  current: BrowserUsageCurrentSegment | null
  recent: BrowserUsageRecentSegment[]
  days: Record<string, BrowserUsageDay | undefined>
  domainApps?: Record<string, DomainAppName | undefined>
}

export interface BrowserUsageSummary {
  totalSec: number
  topDomains: { domain: string; sec: number }[]
  topPages: { page: string; domain: string; title?: string; sec: number }[]
  byHour: number[]
}

export interface DomainAppName {
  name: string
  updatedAt: number
  source: "ai" | "manual"
}

const pad2 = (n: number): string => String(n).padStart(2, "0")

const toDayStringLocal = (ms: number): string => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

const addDaysLocal = (date: Date, offset: number): Date => {
  const next = new Date(date)
  next.setDate(next.getDate() + offset)
  return next
}

const safeNumber = (n: unknown, fallback = 0): number =>
  typeof n === "number" && Number.isFinite(n) ? n : fallback

const emptySummary = (): BrowserUsageSummary => ({
  totalSec: 0,
  topDomains: [],
  topPages: [],
  byHour: new Array<number>(24).fill(0),
})

export const normalizeDomainKey = (domain: string): string => {
  const s = domain.trim().toLowerCase()
  const noPort = s.replace(/:\d+$/, "")
  return noPort.startsWith("www.") ? noPort.slice(4) : noPort
}

export const guessAppNameFromDomain = (domain: string): string => {
  const key = normalizeDomainKey(domain)
  if (!key) return ""
  if (!key.includes(".")) return key

  const parts = key.split(".").filter(Boolean)
  if (parts.length <= 1) return key

  const tld = parts[parts.length - 1]
  const sld = parts[parts.length - 2]

  const countryTlds = new Set([
    "cn",
    "jp",
    "uk",
    "au",
    "br",
    "kr",
    "tw",
    "hk",
    "sg",
    "fr",
    "de",
    "it",
    "es",
    "ru",
    "in",
  ])
  const commonSecondLevel = new Set([
    "co",
    "com",
    "net",
    "org",
    "gov",
    "edu",
    "ac",
  ])

  if (countryTlds.has(tld) && commonSecondLevel.has(sld) && parts.length >= 3) {
    return parts[parts.length - 3]
  }

  return sld
}

export const getBrowserUsageStore =
  async (): Promise<BrowserUsageStoreV1 | null> => {
    if (!hasChromeStorage()) return null
    const raw = await getChromeLocal<unknown>(BROWSER_USAGE_STORAGE_KEY)
    if (!raw || typeof raw !== "object") return null
    const st = raw as Partial<BrowserUsageStoreV1>
    if (st.version !== 1) return null
    if (!st.days || typeof st.days !== "object") return null
    if (!Array.isArray(st.recent)) return null
    return st as BrowserUsageStoreV1
  }

export const getDomainApps = async (): Promise<
  Record<string, DomainAppName | undefined>
> => {
  if (hasChromeStorage()) {
    const raw = await getChromeLocal<unknown>(BROWSER_USAGE_DOMAIN_APPS_KEY)
    if (raw && typeof raw === "object") {
      return raw as Record<string, DomainAppName | undefined>
    }
  }

  const st = await getBrowserUsageStore()
  const map = st?.domainApps
  if (!map || typeof map !== "object") return {}

  if (hasChromeStorage()) {
    await setChromeLocal(BROWSER_USAGE_DOMAIN_APPS_KEY, map)
  }

  return map
}

export const getDomainAppName = async (
  domain: string
): Promise<DomainAppName | null> => {
  const map = await getDomainApps()
  const key = normalizeDomainKey(domain)
  const hit = map[key]
  return hit && typeof hit.name === "string" ? hit : null
}

export const upsertDomainAppName = async (options: {
  domain: string
  name: string
  source: DomainAppName["source"]
}): Promise<void> => {
  if (!hasChromeStorage()) return
  const key = normalizeDomainKey(options.domain)
  const name = options.name.trim()
  if (!key || !name) return

  const current = await getChromeLocal<unknown>(BROWSER_USAGE_DOMAIN_APPS_KEY)
  const nextMap: Record<string, DomainAppName | undefined> =
    current && typeof current === "object"
      ? { ...(current as Record<string, DomainAppName | undefined>) }
      : {}

  nextMap[key] = { name, updatedAt: Date.now(), source: options.source }

  const keys = Object.keys(nextMap)
  if (keys.length > 400) {
    const sorted = keys
      .map(k => ({ k, t: nextMap[k]?.updatedAt ?? 0 }))
      .sort((a, b) => b.t - a.t)
      .slice(0, 360)

    const trimmed: Record<string, DomainAppName | undefined> = {}
    sorted.forEach(({ k }) => {
      trimmed[k] = nextMap[k]
    })

    await setChromeLocal(BROWSER_USAGE_DOMAIN_APPS_KEY, trimmed)
    return
  }

  await setChromeLocal(BROWSER_USAGE_DOMAIN_APPS_KEY, nextMap)
}

const summarizeDay = (
  day: Partial<BrowserUsageDay> | undefined,
  limits?: { domains?: number; pages?: number }
): BrowserUsageSummary => {
  if (!day) return emptySummary()

  const domainsLimit = limits?.domains ?? 8
  const pagesLimit = limits?.pages ?? 8

  const totalSec = safeNumber(day.totalSec, 0)
  const byHour = Array.isArray(day.byHour)
    ? day.byHour.map(v => safeNumber(v, 0)).slice(0, 24)
    : new Array<number>(24).fill(0)
  while (byHour.length < 24) byHour.push(0)

  const topDomains = Object.entries(day.byDomain ?? {})
    .map(([domain, sec]) => ({ domain, sec: safeNumber(sec, 0) }))
    .filter(d => d.domain && d.sec > 0)
    .sort((a, b) => b.sec - a.sec)
    .slice(0, domainsLimit)

  const topPages = Object.entries(day.byPage ?? {})
    .map(([page, stat]) => ({
      page,
      domain: typeof stat.domain === "string" ? stat.domain : "",
      title: typeof stat.title === "string" ? stat.title : undefined,
      sec: safeNumber(stat.sec, 0),
    }))
    .filter(p => p.page && p.domain && p.sec > 0)
    .sort((a, b) => b.sec - a.sec)
    .slice(0, pagesLimit)

  return { totalSec, topDomains, topPages, byHour }
}

const accumulateSegmentOverlap = (
  seg: BrowserUsageRecentSegment,
  fromMs: number,
  toMs: number,
  byDomain: Record<string, number | undefined>,
  byPage: Record<
    string,
    { sec: number; domain: string; title?: string } | undefined
  >
): void => {
  const start = safeNumber(seg.startTs, 0)
  const end = safeNumber(seg.endTs, 0)
  if (!(end > start)) return

  const overlapStart = Math.max(start, fromMs)
  const overlapEnd = Math.min(end, toMs)
  if (!(overlapEnd > overlapStart)) return

  const sec = (overlapEnd - overlapStart) / 1000
  if (!seg.domain || !seg.page) return

  byDomain[seg.domain] = (byDomain[seg.domain] ?? 0) + sec
  const existing = byPage[seg.page]
  if (existing) {
    existing.sec += sec
    if (
      seg.title &&
      (!existing.title || existing.title.length < seg.title.length)
    )
      existing.title = seg.title
  } else {
    byPage[seg.page] = { sec, domain: seg.domain, title: seg.title }
  }
}

const getCurrentAsRecentSegment = (
  st: BrowserUsageStoreV1,
  nowMs: number
): BrowserUsageRecentSegment | null => {
  const cur = st.current as unknown
  if (!cur || typeof cur !== "object") return null
  const c = cur as Partial<BrowserUsageCurrentSegment>

  if (typeof c.domain !== "string" || c.domain.length === 0) return null
  if (typeof c.page !== "string" || c.page.length === 0) return null

  const startTs = safeNumber(c.startTs, 0)
  const lastTs = safeNumber(c.lastTs, 0)
  if (!(startTs > 0) || !(lastTs > 0)) return null

  const intervalMs = safeNumber(st.intervalMs, 5000)
  const endTs = Math.min(nowMs, lastTs + intervalMs)
  if (!(endTs > startTs)) return null

  return {
    startTs,
    endTs,
    domain: c.domain,
    page: c.page,
    title: typeof c.title === "string" ? c.title : undefined,
  }
}

export const getTodayBrowserUsageSummary =
  async (): Promise<BrowserUsageSummary> => {
    const st = await getBrowserUsageStore()
    if (!st) return emptySummary()
    const today = toDayStringLocal(Date.now())
    return summarizeDay(st.days[today], { domains: 10, pages: 10 })
  }

export const getBrowserUsageSummaryForDay = async (
  dayString: string,
  limits?: { domains?: number; pages?: number }
): Promise<BrowserUsageSummary> => {
  const st = await getBrowserUsageStore()
  if (!st) return emptySummary()
  if (!dayString) return emptySummary()
  return summarizeDay(st.days[dayString], limits)
}

export const getYesterdayBrowserUsageSummary =
  async (): Promise<BrowserUsageSummary> => {
    const yesterday = addDaysLocal(new Date(), -1)
    const dayString = toDayStringLocal(yesterday.getTime())
    return getBrowserUsageSummaryForDay(dayString, { domains: 10, pages: 10 })
  }

export const getLastHourBrowserUsageSummary =
  async (): Promise<BrowserUsageSummary> => {
    const st = await getBrowserUsageStore()
    if (!st) return emptySummary()
    const now = Date.now()
    const from = now - 60 * 60 * 1000

    const byDomain: Record<string, number | undefined> = {}
    const byPage: Record<
      string,
      { sec: number; domain: string; title?: string } | undefined
    > = {}

    st.recent.forEach(seg =>
      accumulateSegmentOverlap(seg, from, now, byDomain, byPage)
    )
    const curSeg = getCurrentAsRecentSegment(st, now)
    if (curSeg) {
      accumulateSegmentOverlap(curSeg, from, now, byDomain, byPage)
    }

    const topDomains = Object.entries(byDomain)
      .map(([domain, sec]) => ({ domain, sec: safeNumber(sec, 0) }))
      .filter(d => d.domain && d.sec > 0)
      .sort((a, b) => b.sec - a.sec)
      .slice(0, 8)

    const topPages = Object.entries(byPage)
      .map(([page, stat]) => ({
        page,
        domain: typeof stat?.domain === "string" ? stat.domain : "",
        title: typeof stat?.title === "string" ? stat.title : undefined,
        sec: safeNumber(stat?.sec, 0),
      }))
      .filter(p => p.page && p.domain && p.sec > 0)
      .sort((a, b) => b.sec - a.sec)
      .slice(0, 8)

    return {
      totalSec: Object.values(byDomain).reduce<number>(
        (sum, s) => sum + safeNumber(s, 0),
        0
      ),
      topDomains,
      topPages,
      byHour: new Array<number>(24).fill(0),
    }
  }

const addSummaries = (
  a: BrowserUsageSummary,
  b: BrowserUsageSummary
): BrowserUsageSummary => {
  const byHour = new Array<number>(24)
    .fill(0)
    .map((_, i) => safeNumber(a.byHour[i], 0) + safeNumber(b.byHour[i], 0))
  const byDomain: Record<string, number | undefined> = {}
  ;[...a.topDomains, ...b.topDomains].forEach(d => {
    byDomain[d.domain] = (byDomain[d.domain] ?? 0) + d.sec
  })
  const byPage: Record<
    string,
    { sec: number; domain: string; title?: string } | undefined
  > = {}
  ;[...a.topPages, ...b.topPages].forEach(p => {
    const existing = byPage[p.page]
    if (existing) {
      existing.sec += p.sec
      if (
        p.title &&
        (!existing.title || existing.title.length < p.title.length)
      )
        existing.title = p.title
    } else {
      byPage[p.page] = { sec: p.sec, domain: p.domain, title: p.title }
    }
  })

  return {
    totalSec: a.totalSec + b.totalSec,
    topDomains: Object.entries(byDomain)
      .map(([domain, sec]) => ({ domain, sec: safeNumber(sec, 0) }))
      .sort((x, y) => y.sec - x.sec)
      .slice(0, 10),
    topPages: Object.entries(byPage)
      .map(([page, stat]) => ({
        page,
        domain: stat?.domain ?? "",
        title: stat?.title,
        sec: safeNumber(stat?.sec, 0),
      }))
      .filter(p => p.page && p.domain && p.sec > 0)
      .sort((x, y) => y.sec - x.sec)
      .slice(0, 10),
    byHour,
  }
}

const getWeekRangeLocal = (
  weekOffset: number
): { startMs: number; endMs: number } => {
  const now = new Date()
  const dayOfWeek = now.getDay() || 7 // Sun=7
  const monday = new Date(now)
  monday.setHours(0, 0, 0, 0)
  monday.setDate(now.getDate() - dayOfWeek + 1 + weekOffset * 7)

  const nextMonday = new Date(monday)
  nextMonday.setDate(monday.getDate() + 7)

  return { startMs: monday.getTime(), endMs: nextMonday.getTime() }
}

export const getWeeklyBrowserUsageSummary = async (
  weekOffset = -1
): Promise<BrowserUsageSummary> => {
  const st = await getBrowserUsageStore()
  if (!st) return emptySummary()

  const { startMs, endMs } = getWeekRangeLocal(weekOffset)
  const result = emptySummary()

  for (let t = startMs; t < endMs; t += 86400000) {
    const dayStr = toDayStringLocal(t)
    const daySummary = summarizeDay(st.days[dayStr], {
      domains: 50,
      pages: 50,
    })
    const merged = addSummaries(result, daySummary)
    result.totalSec = merged.totalSec
    result.topDomains = merged.topDomains
    result.topPages = merged.topPages
    result.byHour = merged.byHour
  }

  return result
}

export const getMonthlyBrowserUsageSummary = async (
  year: number,
  month: number
): Promise<BrowserUsageSummary> => {
  const st = await getBrowserUsageStore()
  if (!st) return emptySummary()

  const start = new Date(year, month - 1, 1)
  start.setHours(0, 0, 0, 0)
  const end = new Date(year, month, 1)
  end.setHours(0, 0, 0, 0)

  const result = emptySummary()

  for (let t = start.getTime(); t < end.getTime(); t += 86400000) {
    const dayStr = toDayStringLocal(t)
    const daySummary = summarizeDay(st.days[dayStr], {
      domains: 50,
      pages: 50,
    })
    const merged = addSummaries(result, daySummary)
    result.totalSec = merged.totalSec
    result.topDomains = merged.topDomains
    result.topPages = merged.topPages
    result.byHour = merged.byHour
  }

  return result
}
