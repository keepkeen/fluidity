const STORAGE_KEY = "fluidity.browserUsage.v1"
const USAGE_SETTINGS_KEY = "fluidity.browserUsage.settings.v1"
const TRACKING_SCRIPT_ID = "fluidity-usage-tracker"
const CONTENT_SCRIPT_FILE = "assets/contentScript.js"
const HTTP_MATCHES = ["http://*/*", "https://*/*"]

const HEARTBEAT_INTERVAL_MS = 5000
const MAX_GAP_MS = 15000
const RETENTION_DAYS = 30

interface UsageSettings {
  enabled: boolean
  includePagePath: boolean
  includePageTitle: boolean
}

interface UsageMessage {
  type?: unknown
  ts?: unknown
  url?: unknown
  title?: unknown
}

interface RuntimeLastError {
  message?: string
}

interface RegisteredContentScript {
  id: string
  matches: string[]
  js: string[]
  runAt: "document_idle"
  persistAcrossSessions: boolean
}

interface UsageRegistrationResult {
  registered: boolean
  injectedTabs: number
}

interface ScriptingApi {
  executeScript(
    details: { target: { tabId: number }; files: string[] },
    callback: () => void
  ): void
  getRegisteredContentScripts(
    filter: { ids: string[] },
    callback: (scripts: RegisteredContentScript[]) => void
  ): void
  registerContentScripts(
    scripts: RegisteredContentScript[],
    callback: () => void
  ): void
  unregisterContentScripts(filter: { ids: string[] }, callback: () => void): void
}

const DEFAULT_USAGE_SETTINGS: UsageSettings = {
  enabled: false,
  includePagePath: false,
  includePageTitle: false,
}

const nowMs = () => Date.now()

const pad2 = (n: number) => String(n).padStart(2, "0")

const toDayStringLocal = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

const startOfDayLocalMs = (ms: number) => {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

const runtimeError = (): RuntimeLastError | undefined =>
  chrome.runtime.lastError

const storageGet = (keys: string[]) =>
  new Promise<Record<string, unknown>>(resolve => {
    chrome.storage.local.get(keys, result =>
      resolve(result as Record<string, unknown>)
    )
  })

const storageSet = (obj: Record<string, unknown>) =>
  new Promise<void>(resolve => {
    chrome.storage.local.set(obj, () => resolve())
  })

const initState = () => ({
  version: 1,
  updatedAt: nowMs(),
  retentionDays: RETENTION_DAYS,
  intervalMs: HEARTBEAT_INTERVAL_MS,
  maxGapMs: MAX_GAP_MS,
  current: null as CurrentSegment | null,
  recent: [] as RecentSegment[],
  days: {} as Record<string, UsageDay | undefined>,
})

type UsageState = ReturnType<typeof initState>

interface UsageDay {
  totalSec: number
  byDomain: Record<string, number | undefined>
  byPage: Record<string, PageStat | undefined>
  byHour: number[]
  updatedAt: number
}

interface PageStat {
  sec: number
  domain: string
  title: string
}

interface CurrentSegment {
  key: string
  domain: string
  page: string
  title: string
  startTs: number
  lastTs: number
  countedTs: number
}

interface RecentSegment {
  startTs: number
  endTs: number
  domain: string
  page: string
  title: string
}

let idleState: "active" | "idle" | "locked" = "active"

let state: UsageState | null = null
let stateLoading: Promise<UsageState> | null = null
let writeChain = Promise.resolve()

const enqueueWrite = (nextState: UsageState) => {
  writeChain = writeChain
    .then(() => storageSet({ [STORAGE_KEY]: nextState }))
    .catch(() => undefined)
  return writeChain
}

const pruneOldDays = (st: UsageState) => {
  const cutoffMs = startOfDayLocalMs(nowMs()) - st.retentionDays * 86400000
  const cutoffDay = toDayStringLocal(cutoffMs)
  const days = st.days ?? {}
  Object.keys(days).forEach(day => {
    if (day < cutoffDay) delete days[day]
  })
}

const normalizeUsageSettings = (raw: unknown): UsageSettings => {
  const settings =
    raw && typeof raw === "object" ? (raw as Partial<UsageSettings>) : {}
  return {
    ...DEFAULT_USAGE_SETTINGS,
    enabled: Boolean(settings.enabled),
    includePagePath: Boolean(settings.includePagePath),
    includePageTitle: Boolean(settings.includePageTitle),
  }
}

const getUsageSettings = async (): Promise<UsageSettings> => {
  const result = await storageGet([USAGE_SETTINGS_KEY])
  return normalizeUsageSettings(result[USAGE_SETTINGS_KEY])
}

const normalizeUsageState = (raw: unknown): UsageState => {
  const nextState: UsageState =
    raw && typeof raw === "object"
      ? ({ ...initState(), ...(raw as Partial<UsageState>) } as UsageState)
      : initState()

  if (!nextState.days || typeof nextState.days !== "object") {
    nextState.days = {}
  }
  if (!Array.isArray(nextState.recent)) nextState.recent = []
  if (typeof nextState.retentionDays !== "number") {
    nextState.retentionDays = RETENTION_DAYS
  }
  if (typeof nextState.intervalMs !== "number") {
    nextState.intervalMs = HEARTBEAT_INTERVAL_MS
  }
  if (typeof nextState.maxGapMs !== "number") nextState.maxGapMs = MAX_GAP_MS
  if (!nextState.current || typeof nextState.current !== "object") {
    nextState.current = null
  }

  return nextState
}

const ensureLoaded = async () => {
  if (state) return state
  if (stateLoading) return await stateLoading
  stateLoading = (async () => {
    const result = await storageGet([STORAGE_KEY])
    state = normalizeUsageState(result[STORAGE_KEY])
    state.updatedAt = nowMs()
    pruneOldDays(state)
    await enqueueWrite(state)
    return state
  })()
  return await stateLoading
}

const getOrCreateDay = (st: UsageState, dayStr: string) => {
  if (!st.days[dayStr]) {
    st.days[dayStr] = {
      totalSec: 0,
      byDomain: {},
      byPage: {},
      byHour: new Array<number>(24).fill(0),
      updatedAt: nowMs(),
    }
  }
  return st.days[dayStr]
}

const pruneDayPagesIfNeeded = (day: UsageDay, maxPages = 200) => {
  const entries = Object.entries(day.byPage ?? {})
  if (entries.length <= maxPages * 1.2) return
  entries.sort((a, b) => (b[1]?.sec ?? 0) - (a[1]?.sec ?? 0))
  const keep = new Set(entries.slice(0, maxPages).map(([k]) => k))
  Object.keys(day.byPage).forEach(k => {
    if (!keep.has(k)) delete day.byPage[k]
  })
}

const addSegment = (
  st: UsageState,
  startMs: number,
  endMs: number,
  domain: string,
  page: string,
  title: string
) => {
  if (!domain || !page) return
  if (!(endMs > startMs)) return

  let cursor = startMs
  while (cursor < endMs) {
    const d = new Date(cursor)
    const hour = d.getHours()
    const nextHour = new Date(d)
    nextHour.setMinutes(60, 0, 0)
    const sliceEnd = Math.min(endMs, nextHour.getTime())
    const durSec = (sliceEnd - cursor) / 1000

    const dayStr = toDayStringLocal(cursor)
    const day = getOrCreateDay(st, dayStr)
    if (!day) return

    day.totalSec += durSec
    day.byHour[hour] = (day.byHour[hour] ?? 0) + durSec
    day.byDomain[domain] = (day.byDomain[domain] ?? 0) + durSec

    const existing = day.byPage[page]
    if (existing) {
      existing.sec = (existing.sec ?? 0) + durSec
      if (title && (!existing.title || existing.title.length < title.length)) {
        existing.title = title
      }
    } else {
      day.byPage[page] = { sec: durSec, domain, title }
    }

    day.updatedAt = nowMs()
    pruneDayPagesIfNeeded(day)

    cursor = sliceEnd
  }

  st.updatedAt = nowMs()
}

const addRecentSegment = (st: UsageState, seg: RecentSegment) => {
  if (!Array.isArray(st.recent)) st.recent = []
  st.recent.push({
    startTs: seg.startTs,
    endTs: seg.endTs,
    domain: seg.domain,
    page: seg.page,
    title: seg.title,
  })

  const cutoff = nowMs() - 2 * 60 * 60 * 1000
  st.recent = st.recent.filter(s => (s.endTs ?? 0) >= cutoff)
  if (st.recent.length > 200) st.recent = st.recent.slice(-200)
}

const closeCurrentIfAny = (st: UsageState, endMs: number) => {
  if (!st.current) return
  const cur = st.current
  const intervalMs = st.intervalMs ?? HEARTBEAT_INTERVAL_MS
  const last = cur.lastTs ?? cur.startTs
  const cappedEnd = Math.min(endMs, last + intervalMs)
  const countedStart = cur.countedTs ?? cur.startTs
  addRecentSegment(st, {
    startTs: cur.startTs,
    endTs: cappedEnd,
    domain: cur.domain,
    page: cur.page,
    title: cur.title,
  })
  addSegment(st, countedStart, cappedEnd, cur.domain, cur.page, cur.title)
  st.current = null
}

const openNewCurrent = (
  st: UsageState,
  hb: { ts: number; page: string; domain: string; title: string }
) => {
  st.current = {
    key: `${hb.domain} ${hb.page}`,
    domain: hb.domain,
    page: hb.page,
    title: hb.title,
    startTs: hb.ts,
    lastTs: hb.ts,
    countedTs: hb.ts,
  }
}

const parseDomain = (pageUrl: string) => {
  try {
    const u = new URL(pageUrl)
    return u.hostname || null
  } catch {
    return null
  }
}

const handleHeartbeat = async (hb: UsageMessage) => {
  const settings = await getUsageSettings()
  if (!settings.enabled) return

  const st = await ensureLoaded()
  const t = typeof hb.ts === "number" ? hb.ts : nowMs()

  if (idleState !== "active") {
    closeCurrentIfAny(st, t)
    await enqueueWrite(st)
    return
  }

  const page = typeof hb.url === "string" ? hb.url : null
  const domain = page ? parseDomain(page) : null
  if (!page || !domain) return

  const title =
    settings.includePageTitle && typeof hb.title === "string"
      ? hb.title.slice(0, 200)
      : ""

  if (!st.current) {
    openNewCurrent(st, { ts: t, page, domain, title })
    await enqueueWrite(st)
    return
  }

  const gap = t - (st.current.lastTs ?? st.current.startTs)
  const maxGapMs = st.maxGapMs ?? MAX_GAP_MS

  if (st.current.page === page && gap <= maxGapMs) {
    const prevCounted =
      typeof st.current.countedTs === "number"
        ? st.current.countedTs
        : st.current.startTs
    const nextTitle =
      title && (!st.current.title || st.current.title.length < title.length)
        ? title
        : st.current.title

    addSegment(st, prevCounted, t, st.current.domain, st.current.page, nextTitle)

    st.current.lastTs = t
    st.current.countedTs = t
    st.current.title = nextTitle
    st.updatedAt = nowMs()
    await enqueueWrite(st)
    return
  }

  closeCurrentIfAny(st, t)
  openNewCurrent(st, { ts: t, page, domain, title })
  pruneOldDays(st)
  await enqueueWrite(st)
}

const handleStop = async (msg: UsageMessage) => {
  const st = await ensureLoaded()
  const t = typeof msg.ts === "number" ? msg.ts : nowMs()
  const page = typeof msg.url === "string" ? msg.url : null
  if (!page) return

  if (!st.current) return
  if (st.current.page !== page) return

  closeCurrentIfAny(st, t)
  pruneOldDays(st)
  await enqueueWrite(st)
}

const getScriptingApi = (): ScriptingApi | null => {
  const candidate = (chrome as unknown as { scripting?: ScriptingApi }).scripting
  return candidate ?? null
}

const unregisterUsageContentScript = async (): Promise<void> => {
  const scripting = getScriptingApi()
  if (!scripting?.unregisterContentScripts) return

  await new Promise<void>(resolve => {
    scripting.unregisterContentScripts({ ids: [TRACKING_SCRIPT_ID] }, () => {
      void runtimeError()
      resolve()
    })
  })
}

const hasRegisteredUsageContentScript = async (): Promise<boolean> => {
  const scripting = getScriptingApi()
  if (!scripting?.getRegisteredContentScripts) return false

  return await new Promise<boolean>((resolve, reject) => {
    scripting.getRegisteredContentScripts(
      { ids: [TRACKING_SCRIPT_ID] },
      scripts => {
        const err = runtimeError()
        if (err?.message) {
          reject(new Error(err.message))
          return
        }
        resolve(scripts.some(script => script.id === TRACKING_SCRIPT_ID))
      }
    )
  })
}

const registerUsageContentScript = async (): Promise<void> => {
  const scripting = getScriptingApi()
  if (!scripting?.registerContentScripts) return

  if (await hasRegisteredUsageContentScript()) return
  await new Promise<void>((resolve, reject) => {
    scripting.registerContentScripts(
      [
        {
          id: TRACKING_SCRIPT_ID,
          matches: HTTP_MATCHES,
          js: [CONTENT_SCRIPT_FILE],
          runAt: "document_idle",
          persistAcrossSessions: true,
        },
      ],
      () => {
        const err = runtimeError()
        if (err?.message) {
          reject(new Error(err.message))
          return
        }
        resolve()
      }
    )
  })
}

const injectUsageContentScriptIntoOpenTabs = async (): Promise<number> => {
  const scripting = getScriptingApi()
  if (!scripting?.executeScript || !chrome.tabs?.query) return 0

  const tabs = await new Promise<chrome.tabs.Tab[]>(resolve => {
    chrome.tabs.query({ url: HTTP_MATCHES }, resolve)
  })

  const results = await Promise.all(
    tabs.map(
      tab =>
        new Promise<boolean>(resolve => {
          if (typeof tab.id !== "number") {
            resolve(false)
            return
          }
          scripting.executeScript(
            { target: { tabId: tab.id }, files: [CONTENT_SCRIPT_FILE] },
            () => {
              const error = runtimeError()
              resolve(!error?.message)
            }
          )
        })
    )
  )

  return results.filter(Boolean).length
}

const updateUsageContentScriptRegistration =
  async (): Promise<UsageRegistrationResult> => {
    const settings = await getUsageSettings()
    if (!settings.enabled) {
      await unregisterUsageContentScript()
      return { registered: false, injectedTabs: 0 }
    }

    await registerUsageContentScript()
    const injectedTabs = await injectUsageContentScriptIntoOpenTabs()
    return { registered: true, injectedTabs }
  }

// storage.onChanged、设置页消息和启动事件可能同时到达。动态脚本注册不是
// 原子操作，因此所有更新必须经过同一队列，避免两个 unregister/register
// 交错后出现“设置已开启但脚本没有注册”的状态。
let usageRegistrationQueue = Promise.resolve<UsageRegistrationResult>({
  registered: false,
  injectedTabs: 0,
})

const enqueueUsageContentScriptRegistration =
  (): Promise<UsageRegistrationResult> => {
    const next = usageRegistrationQueue
      .catch(() => ({ registered: false, injectedTabs: 0 }))
      .then(updateUsageContentScriptRegistration)
    usageRegistrationQueue = next
    return next
  }

// 快捷键在新标签页打开命令面板；不再向任意网页注入覆盖层
const openPalettePage = () => {
  try {
    chrome.tabs.create({
      url: chrome.runtime.getURL("index.html?openPalette=1"),
    })
  } catch {
    // ignore
  }
}

chrome.runtime.onInstalled.addListener(() => {
  try {
    chrome.idle.setDetectionInterval(60)
  } catch {
    // ignore
  }
  void enqueueUsageContentScriptRegistration().catch(() => undefined)
})

chrome.runtime.onStartup?.addListener(() => {
  void enqueueUsageContentScriptRegistration().catch(() => undefined)
})

chrome.idle.onStateChanged.addListener(async next => {
  idleState = next
  if (next === "active") return
  const st = await ensureLoaded()
  closeCurrentIfAny(st, nowMs())
  await enqueueWrite(st)
})

chrome.commands?.onCommand?.addListener(command => {
  if (command !== "fluidity-open-command-palette") return
  openPalettePage()
})

chrome.runtime.onMessage.addListener((msg: UsageMessage, _sender, sendResponse) => {
  if (msg?.type === "fluidity:usageHeartbeat") {
    Promise.resolve(handleHeartbeat(msg)).finally(() =>
      sendResponse({ ok: true })
    )
    return true
  }

  if (msg?.type === "fluidity:usageStop") {
    Promise.resolve(handleStop(msg)).finally(() => sendResponse({ ok: true }))
    return true
  }

  if (msg?.type === "fluidity:usageSettingsChanged") {
    void enqueueUsageContentScriptRegistration()
      .then(result => sendResponse({ ok: true, ...result }))
      .catch(() =>
        sendResponse({
          ok: false,
          error: "无法在已授权网站上启动浏览统计，请重新加载扩展后再试",
        })
      )
    return true
  }
})

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return
  if (!changes[USAGE_SETTINGS_KEY]) return
  void enqueueUsageContentScriptRegistration().catch(() => undefined)
})

chrome.runtime.onConnect?.addListener(port => {
  if (!port || port.name !== "fluidity:usage") return
  port.onMessage.addListener((msg: UsageMessage) => {
    if (msg?.type === "fluidity:usageHeartbeat") {
      void handleHeartbeat(msg).catch(() => undefined)
      return
    }
    if (msg?.type === "fluidity:usageStop") {
      void handleStop(msg).catch(() => undefined)
    }
  })
})

void enqueueUsageContentScriptRegistration().catch(() => undefined)
