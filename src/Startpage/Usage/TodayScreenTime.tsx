import { useEffect, useRef, useState } from "react"

import styled from "@emotion/styled"

import { resolveAppNameForDomain } from "../../services/ai"
import {
  BROWSER_USAGE_STORAGE_KEY,
  getBrowserUsageStore,
  getDomainApps,
  getTodayBrowserUsageSummary,
  guessAppNameFromDomain,
  normalizeDomainKey,
  upsertDomainAppName,
} from "../../services/browserUsage"

const Panel = styled.div`
  width: 100%;
  height: 100%;
  border: 2px solid var(--default-color);
  background: var(--bg-color);
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  padding: 10px;

  @media screen and (max-width: 600px) {
    padding: 6px;
  }
`

const PanelInner = styled.div`
  display: flex;
  flex-direction: column;
  gap: 14px;
  height: 100%;
  padding: 16px;
  border: 1px solid var(--default-color);
  opacity: 0.9;
  overflow: hidden;

  @media screen and (max-width: 600px) {
    padding: 12px;
  }
`

const PanelHeader = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  color: var(--default-color);
  font-weight: 600;
  letter-spacing: 1px;
`

const HeaderLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`

const HeaderHint = styled.div`
  display: flex;
  flex-direction: column;
  font-size: 0.85rem;
  opacity: 0.6;
`

const HintTop = styled.span`
  line-height: 1.1;
`

const Total = styled.div`
  font-size: 0.85rem;
  opacity: 0.8;
`

const UpdatedHint = styled.div`
  font-size: 0.72rem;
  opacity: 0.55;
  margin-top: 2px;
`

const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
  overflow-y: auto;
  padding-right: 4px;
`

const Item = styled.div`
  position: relative;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 2px solid var(--default-color);
  color: var(--default-color);
  background: rgba(0, 0, 0, 0);
  overflow: hidden;
`

const Fill = styled.div<{ width: number }>`
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  width: ${({ width }) => width}%;
  background: linear-gradient(90deg, var(--accent-color), var(--accent-color2));
  opacity: 0.18;
  pointer-events: none;
`

const Rank = styled.div`
  font-weight: 700;
  color: var(--accent-color);
`

const Domain = styled.div`
  min-width: 0;
  font-size: 0.9rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const Minutes = styled.div`
  font-size: 0.85rem;
  opacity: 0.75;
  min-width: 54px;
  text-align: right;
`

const Empty = styled.div`
  font-size: 0.9rem;
  opacity: 0.65;
  padding: 10px 0;
`

const secToMin = (sec: number): number => Math.round((sec / 60) * 10) / 10

const formatMinutes = (minutes: number): string => {
  if (!Number.isFinite(minutes) || minutes <= 0) return "0"
  if (minutes < 1) return "<1"
  return String(Math.round(minutes))
}

const resolveMissingDomainLabels = (
  domains: string[],
  resolving: Set<string>
): void => {
  const unique: Record<string, string> = {}
  domains.forEach(domain => {
    const key = normalizeDomainKey(domain)
    if (!key || key in unique) return
    unique[key] = domain
  })

  for (const key of Object.keys(unique)) {
    if (resolving.has(key)) continue
    resolving.add(key)

    const domain = unique[key]
    void resolveAppNameForDomain(domain)
      .then(name => {
        if (!name) return
        return upsertDomainAppName({ domain, name, source: "ai" })
      })
      .catch(() => undefined)
      .finally(() => {
        resolving.delete(key)
      })
  }
}

const getTodayScreenTimeViewModel = async (): Promise<{
  totalMinutes: number
  items: { domain: string; label: string; minutes: number }[]
  missingDomains: string[]
  lastUpdatedAt: number | null
} | null> => {
  try {
    const [summary, domainApps, store] = await Promise.all([
      getTodayBrowserUsageSummary(),
      getDomainApps(),
      getBrowserUsageStore(),
    ])
    const lastUpdatedAt =
      typeof store?.updatedAt === "number" ? store.updatedAt : null

    const top = summary.topDomains.slice(0, 5)
    const missingDomains = top
      .filter(d => !domainApps[normalizeDomainKey(d.domain)]?.name)
      .map(d => d.domain)

    return {
      totalMinutes: secToMin(summary.totalSec),
      items: top.map(d => {
        const key = normalizeDomainKey(d.domain)
        const cached = domainApps[key]?.name
        const cachedLabel = cached?.trim()
        const guessed = guessAppNameFromDomain(d.domain)
        let label = d.domain
        if (cachedLabel && cachedLabel.length > 0) label = cachedLabel
        else if (guessed && guessed.length > 0) label = guessed
        return { domain: d.domain, label, minutes: secToMin(d.sec) }
      }),
      missingDomains,
      lastUpdatedAt,
    }
  } catch {
    return null
  }
}

const subscribeToUsageUpdates = (onUpdate: () => void): (() => void) => {
  const handler = (
    changes: Partial<Record<string, chrome.storage.StorageChange>>,
    areaName: string
  ) => {
    if (areaName !== "local") return
    if (!changes[BROWSER_USAGE_STORAGE_KEY]) return
    onUpdate()
  }

  try {
    if (typeof chrome === "undefined") return () => undefined
    chrome.storage.onChanged.addListener(handler)
    return () => chrome.storage.onChanged.removeListener(handler)
  } catch {
    return () => undefined
  }
}

export const TodayScreenTime = () => {
  const [totalMinutes, setTotalMinutes] = useState<number>(0)
  const [items, setItems] = useState<
    { domain: string; label: string; minutes: number }[]
  >([])
  const [loading, setLoading] = useState(true)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null)
  const resolvingRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    let mounted = true
    let raf = 0
    let pending = false

    const load = async () => {
      const vm = await getTodayScreenTimeViewModel()
      if (!mounted) return
      if (vm) {
        setItems(vm.items)
        setTotalMinutes(vm.totalMinutes)
        setLastUpdatedAt(vm.lastUpdatedAt)
        resolveMissingDomainLabels(vm.missingDomains, resolvingRef.current)
      } else {
        setItems([])
        setTotalMinutes(0)
        setLastUpdatedAt(null)
      }
      setLoading(false)
    }

    const scheduleLoad = () => {
      if (!mounted) return
      if (pending) return
      pending = true
      raf = requestAnimationFrame(() => {
        pending = false
        void load()
      })
    }

    void load()
    const timer = setInterval(() => void load(), 15000)
    const unsubscribe = subscribeToUsageUpdates(scheduleLoad)
    const onVisible = () => {
      if (document.visibilityState !== "visible") return
      scheduleLoad()
    }
    const onFocus = () => scheduleLoad()
    document.addEventListener("visibilitychange", onVisible, { passive: true })
    window.addEventListener("focus", onFocus, { passive: true })
    window.addEventListener("pageshow", onFocus, { passive: true })

    return () => {
      mounted = false
      if (raf) cancelAnimationFrame(raf)
      clearInterval(timer)
      unsubscribe()
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("focus", onFocus)
      window.removeEventListener("pageshow", onFocus)
    }
  }, [])

  const maxMinutes = Math.max(...items.map(i => i.minutes), 0)

  return (
    <Panel>
      <PanelInner>
        <PanelHeader>
          <HeaderLeft>
            <span>今日屏幕时间</span>
            <HeaderHint>
              <HintTop>TOP 5 应用</HintTop>
              {lastUpdatedAt ? (
                <UpdatedHint>
                  更新于{" "}
                  {new Date(lastUpdatedAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </UpdatedHint>
              ) : null}
            </HeaderHint>
          </HeaderLeft>
          <Total>{loading ? "…" : `${formatMinutes(totalMinutes)} 分钟`}</Total>
        </PanelHeader>

        {items.length === 0 ? (
          <Empty>
            {loading ? "正在统计…" : "暂无数据（打开网页后会开始统计）"}
          </Empty>
        ) : (
          <List>
            {items.map((item, idx) => (
              <Item key={item.domain}>
                <Fill
                  width={
                    maxMinutes > 0
                      ? Math.round((item.minutes / maxMinutes) * 100)
                      : 0
                  }
                />
                <Rank>{idx + 1}.</Rank>
                <Domain title={item.domain}>{item.label}</Domain>
                <Minutes>
                  {item.minutes < 1 ? "<1m" : `${item.minutes}m`}
                </Minutes>
              </Item>
            ))}
          </List>
        )}
      </PanelInner>
    </Panel>
  )
}
