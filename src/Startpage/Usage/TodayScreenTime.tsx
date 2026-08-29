import { useEffect, useRef, useState } from "react"

import styled from "@emotion/styled"

import { Modal } from "../../components/Modal"
import { WidgetCard } from "../../components/WidgetCard"
import { resolveAppNameForDomain } from "../../services/ai"
import {
  BROWSER_USAGE_STORAGE_KEY,
  getBrowserUsageStore,
  getBrowserUsageSummaryForDay,
  getDomainApps,
  getTodayBrowserUsageSummary,
  guessAppNameFromDomain,
  normalizeDomainKey,
  upsertDomainAppName,
} from "../../services/browserUsage"
import {
  getBrowserUsageSettings,
  hasBrowserUsagePermissions,
} from "../../services/browserUsageSettings"
import { WidgetSize } from "../../services/widgetRegistry"
import {
  DrawerBody,
  DrawerCard,
  DrawerClose,
  DrawerHeader,
  DrawerTitle,
  WidgetRowMeta,
} from "../Widgets/shared"

const StyledWidgetCard = styled(WidgetCard)`
  height: 100%;
  border-radius: var(--radius-main);
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
  overflow: hidden;
  padding-right: 4px;
`

const Item = styled.div`
  position: relative;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 8px 6px;
  border: 0;
  border-bottom: 1px solid var(--home-stroke);
  border-radius: 0;
  color: var(--text-primary);
  background: transparent;
  overflow: hidden;
  transition: 0.2s;

  &:hover {
    background: color-mix(in srgb, var(--accent) 8%, transparent);
  }

  &:last-child {
    border-bottom: 0;
  }
`

const Fill = styled.div<{ width: number }>`
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  width: ${({ width }) => width}%;
  background: linear-gradient(90deg, var(--accent), var(--accent-hover));
  opacity: 0.18;
  pointer-events: none;
`

const Rank = styled.div`
  font-weight: 700;
  color: var(--accent);
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

const TrendRow = styled.div`
  display: flex;
  align-items: flex-end;
  gap: 6px;
  height: 42px;
  padding: 0 4px;
`

const TrendBar = styled.div<{ heightPct: number; today: boolean }>`
  flex: 1;
  min-width: 0;
  height: ${({ heightPct }) => Math.max(heightPct, 4)}%;
  background: ${({ today }) =>
    today ? "var(--accent)" : "rgba(var(--bg-secondary-rgb), 0.9)"};
  border: 1px solid
    ${({ today }) => (today ? "var(--accent)" : "var(--border-default)")};
  border-radius: 2px 2px 0 0;
  transition: height 0.3s;
`

const CompareHint = styled.div<{ over: boolean }>`
  font-size: 0.78rem;
  padding: 0 4px;
  color: ${({ over }) => (over ? "var(--accent-hover)" : "var(--success)")};
  opacity: 0.9;
`

const Empty = styled.div`
  font-size: 0.9rem;
  opacity: 0.65;
  padding: 10px 0;
  text-align: center;
`

const EmptyAction = styled.button`
  margin: 10px auto 0;
  padding: 7px 13px;
  border: 1px solid var(--home-stroke);
  border-radius: 999px;
  background: var(--home-surface-strong);
  color: var(--text-primary);
  font: inherit;
  font-size: 0.78rem;
  cursor: pointer;

  :hover,
  :focus-visible {
    border-color: var(--accent);
    color: var(--accent);
    outline: none;
  }
`

type TrackingState = "disabled" | "permission-missing" | "waiting" | "active"
const DOMAIN_LABEL_RETRY_MS = 30 * 60 * 1000

const secToMin = (sec: number): number => Math.round((sec / 60) * 10) / 10

const pad2 = (n: number): string => String(n).padStart(2, "0")

const dayStringDaysAgo = (daysAgo: number): string => {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

const formatMinutes = (minutes: number): string => {
  if (!Number.isFinite(minutes) || minutes <= 0) return "0"
  if (minutes < 1) return "<1"
  return String(Math.round(minutes))
}

const resolveMissingDomainLabels = (
  domains: string[],
  resolving: Set<string>,
  retryAfter: Map<string, number>
): void => {
  const unique: Record<string, string> = {}
  domains.forEach(domain => {
    const key = normalizeDomainKey(domain)
    if (!key || key in unique) return
    unique[key] = domain
  })

  for (const key of Object.keys(unique)) {
    if (resolving.has(key)) continue
    if ((retryAfter.get(key) ?? 0) > Date.now()) continue
    resolving.add(key)

    const domain = unique[key]
    void resolveAppNameForDomain(domain)
      .then(name => {
        if (!name) {
          retryAfter.set(key, Date.now() + DOMAIN_LABEL_RETRY_MS)
          return
        }
        retryAfter.delete(key)
        return upsertDomainAppName({ domain, name, source: "ai" })
      })
      .catch(() => {
        retryAfter.set(key, Date.now() + DOMAIN_LABEL_RETRY_MS)
      })
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
  trackingState: TrackingState
} | null> => {
  try {
    const [summary, domainApps, store, settings, hasPermissions] =
      await Promise.all([
        getTodayBrowserUsageSummary(),
        getDomainApps(),
        getBrowserUsageStore(),
        getBrowserUsageSettings(),
        hasBrowserUsagePermissions(),
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
      trackingState: !settings.enabled
        ? "disabled"
        : !hasPermissions
          ? "permission-missing"
          : summary.totalSec > 0
            ? "active"
            : "waiting",
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

interface TodayScreenTimeProps {
  active?: boolean
  size?: WidgetSize
  config?: Record<string, unknown>
  onConfigChange?: (config: Record<string, unknown>) => void
}

export const hasScreenTimeTrendData = (
  history: readonly { minutes: number }[],
  totalMinutes: number
): boolean =>
  totalMinutes > 0 || history.some(day => day.minutes > 0)

export const TodayScreenTime = ({
  active: uiActive = true,
  size = "medium",
  config = {},
}: TodayScreenTimeProps) => {
  const [totalMinutes, setTotalMinutes] = useState<number>(0)
  const [items, setItems] = useState<
    { domain: string; label: string; minutes: number }[]
  >([])
  const [loading, setLoading] = useState(true)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null)
  const [trackingState, setTrackingState] =
    useState<TrackingState>("disabled")
  // 前 6 天的每日总时长（分钟），今天的柱子由 totalMinutes 实时驱动
  const [history, setHistory] = useState<{ day: string; minutes: number }[]>([])
  const [avgMinutes, setAvgMinutes] = useState<number | null>(null)
  const [showDetails, setShowDetails] = useState(false)
  const resolvingRef = useRef<Set<string>>(new Set())
  const domainLabelRetryAfterRef = useRef<Map<string, number>>(new Map())

  // 这里只控制组件的读取与重绘。实际浏览时长由内容脚本/后台持续采集，
  // 无论这个组件位于哪一页，都不能在这里启动或停止计时。
  // 历史数据一次加载即可（过去的天数不会再变）
  useEffect(() => {
    if (!uiActive) return
    let mounted = true
    const loadHistory = async () => {
      const days: { day: string; minutes: number }[] = []
      for (let i = 7; i >= 1; i--) {
        const day = dayStringDaysAgo(i)
        try {
          const summary = await getBrowserUsageSummaryForDay(day, {
            domains: 0,
            pages: 0,
          })
          days.push({ day, minutes: secToMin(summary.totalSec) })
        } catch {
          days.push({ day, minutes: 0 })
        }
      }
      if (!mounted) return
      setAvgMinutes(days.reduce((sum, d) => sum + d.minutes, 0) / days.length)
      setHistory(days.slice(1))
    }
    void loadHistory()
    return () => {
      mounted = false
    }
  }, [uiActive])

  useEffect(() => {
    if (!uiActive) return
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
        setTrackingState(vm.trackingState)
        resolveMissingDomainLabels(
          vm.missingDomains,
          resolvingRef.current,
          domainLabelRetryAfterRef.current
        )
      } else {
        setItems([])
        setTotalMinutes(0)
        setLastUpdatedAt(null)
        setTrackingState("disabled")
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
  }, [uiActive])

  const maxMinutes = Math.max(...items.map(i => i.minutes), 0)
  const goalMinutes = Math.max(1, Number(config.dailyGoalMinutes ?? 180))
  const displayItems = items.slice(0, size === "large" ? 2 : 1)
  const showTrend = hasScreenTimeTrendData(history, totalMinutes)
  const emptyMessage =
    trackingState === "disabled"
      ? "浏览时长统计尚未启用"
      : trackingState === "permission-missing"
        ? "网站访问权限已失效，请重新授权"
        : "已启用：请在普通网页停留几秒；新标签页本身不计时"

  return (
    <>
      <StyledWidgetCard
        title="屏幕时间"
        symbol="◷"
        subtitle={
          trackingState === "active"
            ? `今日预算 ${goalMinutes} 分钟`
            : "统计由后台持续采集"
        }
        actions={
          <Total>{loading ? "…" : `${formatMinutes(totalMinutes)} 分钟`}</Total>
        }
        onOpen={() => setShowDetails(true)}
      >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          height: "100%",
        }}
      >
        {size !== "small" && displayItems.length > 0 && <HeaderLeft style={{ padding: "0 4px" }}>
          <HeaderHint>
            <HintTop>{size === "large" ? "TOP 2" : "TOP 1"}</HintTop>
            {lastUpdatedAt ? (
              <UpdatedHint>
                更新于{" "}
                {new Date(lastUpdatedAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </UpdatedHint>
            ) : null}
          </HeaderHint>
        </HeaderLeft>}

        {size !== "small" && showTrend && (
          <TrendRow aria-hidden data-screen-time-trend="true">
            {[...history, { day: "今天", minutes: totalMinutes }].map(bar => {
              const trendMax = Math.max(
                ...history.map(h => h.minutes),
                totalMinutes,
                1
              )
              return (
                <TrendBar
                  key={bar.day}
                  heightPct={Math.round((bar.minutes / trendMax) * 100)}
                  today={bar.day === "今天"}
                  title={`${bar.day}：${formatMinutes(bar.minutes)} 分钟`}
                />
              )
            })}
          </TrendRow>
        )}

        {size !== "small" && avgMinutes !== null && avgMinutes > 0 && !loading && (
          <CompareHint over={totalMinutes > avgMinutes}>
            比过去 7 天平均{totalMinutes >= avgMinutes ? "多" : "少"}{" "}
            {formatMinutes(Math.abs(totalMinutes - avgMinutes))} 分钟
          </CompareHint>
        )}

        {size === "small" && trackingState === "active" ? (
          <Empty>
            已使用今日预算的 {Math.round((totalMinutes / goalMinutes) * 100)}%
          </Empty>
        ) : items.length === 0 ? (
          <Empty>
            {loading ? "正在检查统计状态…" : emptyMessage}
            {!loading && trackingState !== "active" && (
              <EmptyAction
                type="button"
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent("fluidity:open-settings", {
                      detail: { tab: "data" },
                    })
                  )
                }
              >
                {trackingState === "disabled" ? "开启统计" : "检查设置"}
              </EmptyAction>
            )}
          </Empty>
        ) : (
          <List>
            {displayItems.map((item, idx) => (
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
        </div>
      </StyledWidgetCard>

      {showDetails && (
        <Modal
          onClose={() => setShowDetails(false)}
          label="屏幕时间详情"
          overlay="dark"
        >
          <DrawerCard>
            <DrawerHeader>
              <div>
                <DrawerTitle>今日屏幕时间</DrawerTitle>
                <WidgetRowMeta>
                  {formatMinutes(totalMinutes)} 分钟 · 注意力预算 {goalMinutes} 分钟
                </WidgetRowMeta>
              </div>
              <DrawerClose
                type="button"
                aria-label="关闭"
                onClick={() => setShowDetails(false)}
              >
                ×
              </DrawerClose>
            </DrawerHeader>
            <DrawerBody>
              {avgMinutes !== null && avgMinutes > 0 && (
                <CompareHint over={totalMinutes > avgMinutes}>
                  比过去 7 天平均{totalMinutes >= avgMinutes ? "多" : "少"}{" "}
                  {formatMinutes(Math.abs(totalMinutes - avgMinutes))} 分钟
                </CompareHint>
              )}
              {items.length === 0 ? (
                <Empty>{loading ? "正在读取统计…" : emptyMessage}</Empty>
              ) : (
                <List style={{ overflow: "visible", marginTop: 14 }}>
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
                      <Minutes>{formatMinutes(item.minutes)}m</Minutes>
                    </Item>
                  ))}
                </List>
              )}
            </DrawerBody>
          </DrawerCard>
        </Modal>
      )}
    </>
  )
}
