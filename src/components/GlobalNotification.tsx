import { useCallback, useEffect, useRef, useState } from "react"

import styled from "@emotion/styled"
import {
  faCheckCircle,
  faChevronDown,
  faExclamationCircle,
  faInfoCircle,
} from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"

/**
 * iOS 风格通知系统：
 * - 新通知从顶部以横幅形式下落，数秒后收回；同一条 30 秒内不重复弹
 * - 点击顶部拉环展开通知中心查看历史（有未读时拉环常显）
 *
 * 不做滚轮/下拉自动展开：主屏通常不满一屏，scrollTop 恒为 0，
 * 触控板回弹会不断误触发，通知中心会"自己弹出来"。
 */

interface NotificationData {
  type: "success" | "error" | "info"
  title: string
  message: string
}

interface StoredNotification extends NotificationData {
  id: string
  at: number
}

const HISTORY_KEY = "fluidity.notifications.v1"
const SEEN_KEY = "fluidity.notifications.seenAt"
const HISTORY_LIMIT = 50
const BANNER_MS = 4500
/** 同一条通知在该窗口内到达时只记历史、不再弹横幅 */
const DUPLICATE_SUPPRESS_MS = 30_000

const readHistory = (): StoredNotification[] => {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed as StoredNotification[]
    }
  } catch {
    // ignore
  }
  return []
}

const writeHistory = (items: StoredNotification[]): void => {
  try {
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify(items.slice(0, HISTORY_LIMIT))
    )
  } catch {
    // ignore
  }
}

const typeIcon = (type: NotificationData["type"]) =>
  type === "success"
    ? faCheckCircle
    : type === "error"
      ? faExclamationCircle
      : faInfoCircle

const typeColor = (type: string): string =>
  type === "success"
    ? "var(--success)"
    : type === "error"
      ? "var(--accent-hover)"
      : "var(--accent)"

const timeAgo = (at: number): string => {
  const diff = Date.now() - at
  const min = Math.floor(diff / 60000)
  if (min < 1) return "刚刚"
  if (min < 60) return `${min} 分钟前`
  const hours = Math.floor(min / 60)
  if (hours < 24) return `${hours} 小时前`
  return `${Math.floor(hours / 24)} 天前`
}

// ============ 样式 ============

const Banner = styled.div<{ leaving: boolean }>`
  position: fixed;
  top: 12px;
  left: 50%;
  z-index: 10000;
  width: min(420px, calc(100vw - 32px));
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 18px;
  box-sizing: border-box;
  background: color-mix(in srgb, var(--bg-primary) 82%, transparent);
  backdrop-filter: var(--surface-blur);
  -webkit-backdrop-filter: var(--surface-blur);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-main);
  box-shadow: var(--shadow-pop);
  cursor: pointer;
  animation: ${({ leaving }) =>
    leaving
      ? "banner-out 0.3s cubic-bezier(0.4, 0, 1, 1) both"
      : "banner-in 0.45s cubic-bezier(0.34, 1.4, 0.64, 1) both"};
`

const BannerIcon = styled.span<{ tone: string }>`
  color: ${({ tone }) => typeColor(tone)};
  font-size: 1.05rem;
  padding-top: 1px;
`

const BannerBody = styled.div`
  flex: 1;
  min-width: 0;
`

const BannerTitle = styled.div`
  font-size: 0.92rem;
  font-weight: 600;
  color: var(--text-primary);
`

const BannerMessage = styled.div`
  font-size: 0.82rem;
  color: var(--text-secondary);
  line-height: 1.45;
  margin-top: 2px;
`

const PullTab = styled.button<{ hasUnread: boolean }>`
  position: fixed;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  z-index: 9998;
  width: 72px;
  height: 18px;
  border: none;
  border-radius: 0 0 10px 10px;
  background: color-mix(in srgb, var(--text-primary) 10%, transparent);
  color: ${({ hasUnread }) =>
    hasUnread ? "var(--accent)" : "var(--text-muted)"};
  font-size: 0.6rem;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  cursor: pointer;
  /* 平时隐形；有未读时常显，作为安静的入口提示 */
  opacity: ${({ hasUnread }) => (hasUnread ? 0.9 : 0)};
  transition: opacity var(--transition-fast);

  :hover,
  :focus-visible {
    opacity: 1;
  }
`

const UnreadDot = styled.span`
  width: 5px;
  height: 5px;
  border-radius: 999px;
  background: var(--accent);
`

const CenterOverlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  animation: overlay-in 0.25s ease both;
`

const CenterSheet = styled.div`
  position: fixed;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10001;
  width: min(460px, calc(100vw - 24px));
  max-height: min(70vh, 560px);
  display: flex;
  flex-direction: column;
  background: color-mix(in srgb, var(--bg-primary) 88%, transparent);
  backdrop-filter: var(--surface-blur);
  -webkit-backdrop-filter: var(--surface-blur);
  border: 1px solid var(--surface-border);
  border-top: none;
  border-radius: 0 0 var(--radius-main) var(--radius-main);
  box-shadow: var(--shadow-pop);
  animation: sheet-down 0.35s cubic-bezier(0.22, 1, 0.36, 1) both;
`

const CenterHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px 10px;
`

const CenterTitle = styled.h2`
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-primary);
`

const ClearButton = styled.button`
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 0.8rem;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 999px;
  transition: color var(--transition-fast);

  :hover {
    color: var(--accent);
  }
`

const CenterList = styled.div`
  overflow-y: auto;
  padding: 0 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`

const CenterItem = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--bg-secondary) 40%, transparent);
`

const ItemBody = styled.div`
  flex: 1;
  min-width: 0;
`

const ItemTitleRow = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
`

const ItemTitle = styled.span`
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-primary);
`

const ItemTime = styled.span`
  font-size: 0.72rem;
  color: var(--text-muted);
  white-space: nowrap;
`

const ItemMessage = styled.div`
  font-size: 0.8rem;
  color: var(--text-secondary);
  line-height: 1.4;
  margin-top: 2px;
`

const EmptyState = styled.div`
  padding: 28px 0 36px;
  text-align: center;
  font-size: 0.85rem;
  color: var(--text-muted);
`

const Grabber = styled.div`
  align-self: center;
  width: 40px;
  height: 4px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--text-primary) 25%, transparent);
  margin: 8px 0 10px;
  flex-shrink: 0;
`

// ============ 组件 ============

export const GlobalNotification: React.FC = () => {
  const [banner, setBanner] = useState<StoredNotification | null>(null)
  const [leaving, setLeaving] = useState(false)
  const [centerOpen, setCenterOpen] = useState(false)
  const [history, setHistory] = useState<StoredNotification[]>(() =>
    readHistory()
  )
  const [seenAt, setSeenAt] = useState<number>(() =>
    Number(localStorage.getItem(SEEN_KEY)) || 0
  )
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastBannerRef = useRef<{ key: string; at: number } | null>(null)

  const dismissBanner = useCallback(() => {
    setLeaving(true)
    if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current)
    leaveTimerRef.current = setTimeout(() => {
      setBanner(null)
      setLeaving(false)
    }, 300)
  }, [])

  // 悬停阅读时暂停自动收回，移开后短暂停留再收
  const pauseAutoDismiss = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }, [])

  const resumeAutoDismiss = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    hideTimerRef.current = setTimeout(() => dismissBanner(), 1600)
  }, [dismissBanner])

  // 接收通知事件：入历史 + 弹横幅
  useEffect(() => {
    const handler = (event: CustomEvent<NotificationData>) => {
      const item: StoredNotification = {
        ...event.detail,
        id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
        at: Date.now(),
      }
      setHistory(prev => {
        const next = [item, ...prev].slice(0, HISTORY_LIMIT)
        writeHistory(next)
        return next
      })

      // 同一条通知短时间内重复到达：只记历史，不再弹横幅
      const key = `${item.type}|${item.title}|${item.message}`
      const last = lastBannerRef.current
      if (last && last.key === key && item.at - last.at < DUPLICATE_SUPPRESS_MS) {
        lastBannerRef.current = { key, at: item.at }
        return
      }
      lastBannerRef.current = { key, at: item.at }

      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
      if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current)
      setLeaving(false)
      setBanner(item)
      hideTimerRef.current = setTimeout(() => dismissBanner(), BANNER_MS)
    }

    window.addEventListener("show-notification", handler as EventListener)
    return () => {
      window.removeEventListener("show-notification", handler as EventListener)
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
      if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current)
    }
  }, [dismissBanner])

  // 打开通知中心即视为已读
  const openCenter = useCallback(() => {
    setCenterOpen(true)
    const now = Date.now()
    setSeenAt(now)
    try {
      localStorage.setItem(SEEN_KEY, String(now))
    } catch {
      // ignore
    }
  }, [])

  // Escape 关闭通知中心
  useEffect(() => {
    if (!centerOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCenterOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [centerOpen])

  const clearHistory = () => {
    setHistory([])
    writeHistory([])
  }

  const hasUnread = history.length > 0 && history[0].at > seenAt

  return (
    <>
      <PullTab
        type="button"
        aria-label={hasUnread ? "打开通知中心（有未读）" : "打开通知中心"}
        title="通知中心"
        hasUnread={hasUnread}
        onClick={openCenter}
      >
        <FontAwesomeIcon icon={faChevronDown} />
        {hasUnread && <UnreadDot aria-hidden />}
      </PullTab>

      {banner && (
        <Banner
          leaving={leaving}
          role="status"
          aria-live="polite"
          onClick={dismissBanner}
          onMouseEnter={pauseAutoDismiss}
          onMouseLeave={resumeAutoDismiss}
        >
          <BannerIcon tone={banner.type} aria-hidden>
            <FontAwesomeIcon icon={typeIcon(banner.type)} />
          </BannerIcon>
          <BannerBody>
            <BannerTitle>{banner.title}</BannerTitle>
            {banner.message && <BannerMessage>{banner.message}</BannerMessage>}
          </BannerBody>
        </Banner>
      )}

      {centerOpen && (
        <>
          <CenterOverlay onClick={() => setCenterOpen(false)} />
          <CenterSheet role="dialog" aria-label="通知中心">
            <CenterHeader>
              <CenterTitle>通知中心</CenterTitle>
              {history.length > 0 && (
                <ClearButton type="button" onClick={clearHistory}>
                  清除全部
                </ClearButton>
              )}
            </CenterHeader>
            <CenterList>
              {history.length === 0 ? (
                <EmptyState>没有新通知</EmptyState>
              ) : (
                history.map(item => (
                  <CenterItem key={item.id}>
                    <BannerIcon tone={item.type} aria-hidden>
                      <FontAwesomeIcon icon={typeIcon(item.type)} />
                    </BannerIcon>
                    <ItemBody>
                      <ItemTitleRow>
                        <ItemTitle>{item.title}</ItemTitle>
                        <ItemTime>{timeAgo(item.at)}</ItemTime>
                      </ItemTitleRow>
                      {item.message && (
                        <ItemMessage>{item.message}</ItemMessage>
                      )}
                    </ItemBody>
                  </CenterItem>
                ))
              )}
            </CenterList>
            <Grabber aria-hidden />
          </CenterSheet>
        </>
      )}
    </>
  )
}
