const STORAGE_KEY = "fluidity.browserUsage.v1"

const HEARTBEAT_INTERVAL_MS = 5000
const MAX_GAP_MS = 15000
const RETENTION_DAYS = 30

const nowMs = () => Date.now()

const pad2 = n => String(n).padStart(2, "0")

const toDayStringLocal = ms => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

const startOfDayLocalMs = ms => {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

const storageGet = keys =>
  new Promise(resolve => {
    chrome.storage.local.get(keys, result => resolve(result))
  })

const storageSet = obj =>
  new Promise(resolve => {
    chrome.storage.local.set(obj, () => resolve())
  })

const initState = () => ({
  version: 1,
  updatedAt: nowMs(),
  retentionDays: RETENTION_DAYS,
  intervalMs: HEARTBEAT_INTERVAL_MS,
  maxGapMs: MAX_GAP_MS,
  current: null,
  recent: [],
  days: {},
})

let idleState = "active" // "active" | "idle" | "locked"

let state = null
let stateLoading = null
let writeChain = Promise.resolve()

const enqueueWrite = nextState => {
  writeChain = writeChain
    .then(() => storageSet({ [STORAGE_KEY]: nextState }))
    .catch(() => {})
  return writeChain
}

const ensureLoaded = async () => {
  if (state) return state
  if (stateLoading) return await stateLoading
  stateLoading = (async () => {
    const result = await storageGet([STORAGE_KEY])
    state = result[STORAGE_KEY] ?? initState()
    if (!state || typeof state !== "object") state = initState()
    if (!state.days || typeof state.days !== "object") state.days = {}
    if (!Array.isArray(state.recent)) state.recent = []
    if (!("retentionDays" in state)) state.retentionDays = RETENTION_DAYS
    if (!("intervalMs" in state)) state.intervalMs = HEARTBEAT_INTERVAL_MS
    if (!("maxGapMs" in state)) state.maxGapMs = MAX_GAP_MS
    if (!("current" in state)) state.current = null
    state.updatedAt = nowMs()
    pruneOldDays(state)
    await enqueueWrite(state)
    return state
  })()
  return await stateLoading
}

const pruneOldDays = st => {
  const cutoffMs = startOfDayLocalMs(nowMs()) - st.retentionDays * 86400000
  const cutoffDay = toDayStringLocal(cutoffMs)
  const days = st.days ?? {}
  Object.keys(days).forEach(day => {
    if (day < cutoffDay) delete days[day]
  })
}

const getOrCreateDay = (st, dayStr) => {
  if (!st.days[dayStr]) {
    st.days[dayStr] = {
      totalSec: 0,
      byDomain: {},
      byPage: {},
      byHour: new Array(24).fill(0),
      updatedAt: nowMs(),
    }
  }
  return st.days[dayStr]
}

const pruneDayPagesIfNeeded = (day, maxPages = 200) => {
  const entries = Object.entries(day.byPage ?? {})
  if (entries.length <= maxPages * 1.2) return
  entries.sort((a, b) => (b[1]?.sec ?? 0) - (a[1]?.sec ?? 0))
  const keep = new Set(entries.slice(0, maxPages).map(([k]) => k))
  Object.keys(day.byPage).forEach(k => {
    if (!keep.has(k)) delete day.byPage[k]
  })
}

const addSegment = (st, startMs, endMs, domain, page, title) => {
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
      day.byPage[page] = { sec: durSec, domain, title: title ?? "" }
    }

    day.updatedAt = nowMs()
    pruneDayPagesIfNeeded(day)

    cursor = sliceEnd
  }

  st.updatedAt = nowMs()
}

const addRecentSegment = (st, seg) => {
  if (!Array.isArray(st.recent)) st.recent = []
  st.recent.push({
    startTs: seg.startTs,
    endTs: seg.endTs,
    domain: seg.domain,
    page: seg.page,
    title: seg.title ?? "",
  })

  const windowMs = 2 * 60 * 60 * 1000
  const cutoff = nowMs() - windowMs
  st.recent = st.recent.filter(s => (s.endTs ?? 0) >= cutoff)
  if (st.recent.length > 200) st.recent = st.recent.slice(-200)
}

const closeCurrentIfAny = (st, endMs) => {
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
  // Daily aggregates are updated incrementally on every heartbeat; only add the
  // remaining tail here to avoid double-counting.
  addSegment(st, countedStart, cappedEnd, cur.domain, cur.page, cur.title)
  st.current = null
}

const openNewCurrent = (st, hb) => {
  st.current = {
    key: `${hb.domain} ${hb.page}`,
    domain: hb.domain,
    page: hb.page,
    title: hb.title ?? "",
    startTs: hb.ts,
    lastTs: hb.ts,
    countedTs: hb.ts,
  }
}

const parseDomain = pageUrl => {
  try {
    const u = new URL(pageUrl)
    return u.hostname || null
  } catch {
    return null
  }
}

const handleHeartbeat = async hb => {
  const st = await ensureLoaded()
  const t = typeof hb.ts === "number" ? hb.ts : nowMs()

  // If user is AFK, close the current segment and ignore heartbeats until active.
  if (idleState !== "active") {
    closeCurrentIfAny(st, t)
    await enqueueWrite(st)
    return
  }

  const page = typeof hb.url === "string" ? hb.url : null
  const domain = page ? parseDomain(page) : null
  if (!page || !domain) return

  const title = typeof hb.title === "string" ? hb.title.slice(0, 200) : ""

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

    // ActivityWatch-style: treat each heartbeat as a time "pulse" and aggregate
    // continuously so UI can update without waiting for a segment to close.
    addSegment(st, prevCounted, t, st.current.domain, st.current.page, nextTitle)

    st.current.lastTs = t
    st.current.countedTs = t
    st.current.title = nextTitle
    st.updatedAt = nowMs()
    await enqueueWrite(st)
    return
  }

  // Close previous segment (cap at last heartbeat + interval), then open new.
  closeCurrentIfAny(st, t)
  openNewCurrent(st, { ts: t, page, domain, title })
  pruneOldDays(st)
  await enqueueWrite(st)
}

const handleStop = async msg => {
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

chrome.runtime.onInstalled.addListener(() => {
  try {
    chrome.idle.setDetectionInterval(60)
  } catch {
    // ignore
  }
})

chrome.idle.onStateChanged.addListener(async next => {
  idleState = next
  if (next === "active") return
  const st = await ensureLoaded()
  closeCurrentIfAny(st, nowMs())
  await enqueueWrite(st)
})

chrome.commands?.onCommand?.addListener((command, tab) => {
  if (command !== "fluidity-open-command-palette") return
  const fallback = () => {
    try {
      chrome.tabs.create({
        url: chrome.runtime.getURL("index.html?openPalette=1"),
      })
    } catch {
      // ignore
    }
  }

  // Prefer in-page overlay when possible (content script + Shadow DOM + iframe).
  try {
    const targetTabId = tab?.id
    if (targetTabId) {
      chrome.tabs.sendMessage(
        targetTabId,
        { type: "fluidity:togglePaletteOverlay" },
        () => {
          if (chrome.runtime.lastError) fallback()
        }
      )
      return
    }

    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      const tabId = tabs?.[0]?.id
      if (!tabId) return fallback()
      chrome.tabs.sendMessage(
        tabId,
        { type: "fluidity:togglePaletteOverlay" },
        () => {
          if (chrome.runtime.lastError) fallback()
        }
      )
    })
  } catch {
    fallback()
  }
})

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
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
})

// Long-lived port channel for usage tracking (more reliable wakeups on MV3).
chrome.runtime.onConnect?.addListener(port => {
  if (!port || port.name !== "fluidity:usage") return
  port.onMessage.addListener(msg => {
    if (msg?.type === "fluidity:usageHeartbeat") {
      void handleHeartbeat(msg).catch(() => undefined)
      return
    }
    if (msg?.type === "fluidity:usageStop") {
      void handleStop(msg).catch(() => undefined)
    }
  })
})
