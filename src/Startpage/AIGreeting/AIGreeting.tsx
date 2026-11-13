import React, { useEffect, useRef, useState } from "react"

import styled from "@emotion/styled"
import { faSync } from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"

import {
  AISettingsManager,
  getAIGreeting,
  getDefaultGreeting,
  refreshAIGreeting,
} from "../../services/ai"
import type { AISettings } from "../../services/ai"
import {
  DAILY_REVIEW_KEY,
  getDailyReview,
} from "../../services/dailyReview"
import { SETTINGS_APPLIED_EVENT } from "../../services/settingsEvents"

const AI_SETTINGS_KEY = "ai-settings"
const AI_CACHE_KEY = "ai-cache"

const canUseAIGreeting = (settings: AISettings): boolean =>
  settings.enabled && settings.greetingEnabled && settings.apiKey.length > 0

const getGreetingSettingsSignature = (settings: AISettings): string =>
  JSON.stringify({
    enabled: settings.enabled,
    greetingEnabled: settings.greetingEnabled,
    apiKey: settings.apiKey,
    apiBaseUrl: settings.apiBaseUrl,
    model: settings.model,
    shareHabits: settings.shareHabits,
    shareBrowserUsage: settings.shareBrowserUsage,
  })

const GreetingContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: clamp(8px, 1.5vh, 20px) var(--page-margin) 0;
  flex-shrink: 0;

  @media screen and (max-width: 900px) {
    gap: 8px;
  }
`

const GreetingText = styled.div<{ $loading?: boolean }>`
  font-size: 1.1rem;
  color: var(--text-primary);
  text-align: center;
  padding: 12px 26px;
  border: 1px solid var(--home-stroke);
  border-radius: var(--radius-main);
  background: var(--home-surface);
  backdrop-filter: var(--surface-blur);
  -webkit-backdrop-filter: var(--surface-blur);
  box-shadow: var(--home-shadow);
  opacity: ${({ $loading }) => ($loading ? 0.6 : 1)};
  transition: opacity 0.3s, transform 0.3s;
  max-width: 600px;
  line-height: 1.5;
  animation: ${({ $loading }) =>
    $loading ? "none" : "greeting-fade-in 0.5s ease-out"};

  @keyframes greeting-fade-in {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media screen and (max-width: 900px) {
    font-size: 1rem;
    padding: 10px 16px;
    max-width: 500px;
  }

  @media screen and (max-width: 600px) {
    font-size: 0.9rem;
    padding: 8px 12px;
    max-width: 100%;
  }
`

const GreetingContent = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
`

const DailyReviewText = styled.div`
  font-size: 0.85rem;
  color: var(--text-primary);
  opacity: 0.7;
  text-align: center;
  max-width: 620px;
  line-height: 1.4;
`

const RefreshButton = styled.button<{ spinning?: boolean }>`
  width: 36px;
  height: 36px;
  border: 1px solid var(--home-stroke);
  border-radius: 12px;
  background: var(--home-surface);
  backdrop-filter: var(--surface-blur);
  -webkit-backdrop-filter: var(--surface-blur);
  color: var(--text-primary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: 0.2s;

  &:hover {
    background: var(--home-surface-strong);
    color: var(--accent);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.3;
  }

  svg {
    animation: ${({ spinning }) =>
      spinning ? "spin 1s linear infinite" : "none"};
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
`

const AIBadge = styled.span`
  font-size: 0.7rem;
  padding: 2px 6px;
  background: var(--accent);
  color: var(--bg-primary);
  margin-left: 8px;
  vertical-align: middle;
  opacity: 0.8;
  border-radius: 999px;
`

export const AIGreeting = () => {
  const [greeting, setGreeting] = useState("")
  const [loading, setLoading] = useState(true)
  const [greetingSource, setGreetingSource] = useState<"default" | "ai">(
    "default"
  )
  const [canRefresh, setCanRefresh] = useState(false)
  const [dailyReview, setDailyReview] = useState("")

  const mountedRef = useRef(false)
  const greetingRequestRef = useRef(0)
  const dailyReviewRequestRef = useRef(0)
  const scheduledRefreshRef = useRef<{
    greeting: boolean
    dailyReview: boolean
  } | null>(null)
  const scheduleQueuedRef = useRef(false)

  const fetchGreeting = async (refresh = false) => {
    const request = ++greetingRequestRef.current
    const settings = AISettingsManager.get()
    const settingsSignature = getGreetingSettingsSignature(settings)
    const useAI = canUseAIGreeting(settings)

    if (!mountedRef.current) return
    setCanRefresh(useAI)

    if (!useAI) {
      setGreeting(getDefaultGreeting())
      setGreetingSource("default")
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const result = refresh ? await refreshAIGreeting() : await getAIGreeting()
      if (!mountedRef.current || request !== greetingRequestRef.current) return

      const latestSettings = AISettingsManager.get()
      if (
        getGreetingSettingsSignature(latestSettings) !== settingsSignature ||
        !canUseAIGreeting(latestSettings)
      ) {
        void fetchGreeting()
        return
      }

      setGreeting(result.message)
      setGreetingSource(result.error ? "default" : "ai")
    } catch {
      if (!mountedRef.current || request !== greetingRequestRef.current) return
      setGreeting(getDefaultGreeting())
      setGreetingSource("default")
    } finally {
      if (mountedRef.current && request === greetingRequestRef.current) {
        setLoading(false)
      }
    }
  }

  const fetchDailyReview = async () => {
    const request = ++dailyReviewRequestRef.current
    try {
      const result = await getDailyReview()
      if (!mountedRef.current || request !== dailyReviewRequestRef.current) return
      setDailyReview(result?.summary ?? "")
    } catch {
      if (!mountedRef.current || request !== dailyReviewRequestRef.current) return
      setDailyReview("")
    }
  }

  const scheduleRefresh = (greeting: boolean, dailyReview: boolean) => {
    const scheduled = scheduledRefreshRef.current ?? {
      greeting: false,
      dailyReview: false,
    }
    scheduled.greeting ||= greeting
    scheduled.dailyReview ||= dailyReview
    scheduledRefreshRef.current = scheduled
    if (scheduleQueuedRef.current) return

    scheduleQueuedRef.current = true
    queueMicrotask(() => {
      scheduleQueuedRef.current = false
      const next = scheduledRefreshRef.current
      scheduledRefreshRef.current = null
      if (!mountedRef.current || !next) return
      if (next.greeting) void fetchGreeting()
      if (next.dailyReview) void fetchDailyReview()
    })
  }

  useEffect(() => {
    mountedRef.current = true
    // 延迟到微任务执行可避开 StrictMode 首轮 effect 清理，避免重复付费请求。
    scheduleRefresh(true, true)

    const handleSettingsApplied = () => scheduleRefresh(true, true)
    const handleStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === AI_SETTINGS_KEY) {
        scheduleRefresh(true, true)
        return
      }
      if (event.key === AI_CACHE_KEY) scheduleRefresh(true, false)
      if (event.key === DAILY_REVIEW_KEY) scheduleRefresh(false, true)
    }

    window.addEventListener(SETTINGS_APPLIED_EVENT, handleSettingsApplied)
    window.addEventListener("storage", handleStorage)
    return () => {
      mountedRef.current = false
      greetingRequestRef.current += 1
      dailyReviewRequestRef.current += 1
      window.removeEventListener(SETTINGS_APPLIED_EVENT, handleSettingsApplied)
      window.removeEventListener("storage", handleStorage)
    }
    // The subscription is intentionally installed once. Its handlers read
    // current settings from the managers and mutable request refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleRefresh = () => {
    if (!loading) {
      void fetchGreeting(true)
    }
  }

  return (
    <GreetingContainer>
      <GreetingContent>
        <GreetingText $loading={loading}>
          {loading ? "正在思考..." : greeting}
          {greetingSource === "ai" && !loading && <AIBadge>AI</AIBadge>}
        </GreetingText>
        {dailyReview && (
          <DailyReviewText>昨日回顾：{dailyReview}</DailyReviewText>
        )}
      </GreetingContent>
      {canRefresh && (
        <RefreshButton
          onClick={handleRefresh}
          disabled={loading}
          spinning={loading}
          title="刷新提示"
        >
          <FontAwesomeIcon icon={faSync} />
        </RefreshButton>
      )}
    </GreetingContainer>
  )
}
