import React, { useEffect, useState } from "react"

import styled from "@emotion/styled"
import { faSync } from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"

import {
  AISettingsManager,
  getAIGreeting,
  getDefaultGreeting,
  refreshAIGreeting,
} from "../../services/ai"
import { getDailyReview } from "../../services/dailyReview"

const GreetingContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 20px 100px 0;
  flex-shrink: 0;

  @media screen and (max-width: 1200px) {
    padding: 20px 60px 0;
  }

  @media screen and (max-width: 900px) {
    padding: 15px 40px 0;
    gap: 8px;
  }

  @media screen and (max-width: 600px) {
    padding: 10px 20px 0;
  }
`

const GreetingText = styled.div<{ loading?: boolean }>`
  font-size: 1.1rem;
  color: var(--default-color);
  text-align: center;
  padding: 12px 24px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  opacity: ${({ loading }) => (loading ? 0.6 : 1)};
  transition: opacity 0.3s, transform 0.3s;
  max-width: 600px;
  line-height: 1.5;
  animation: ${({ loading }) =>
    loading ? "none" : "greeting-fade-in 0.5s ease-out"};

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
  color: var(--default-color);
  opacity: 0.7;
  text-align: center;
  max-width: 620px;
  line-height: 1.4;
`

const RefreshButton = styled.button<{ spinning?: boolean }>`
  width: 36px;
  height: 36px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  color: var(--default-color);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: 0.2s;

  &:hover {
    background: rgba(0, 0, 0, 0.5);
    color: var(--accent-color);
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
  background: var(--accent-color);
  color: var(--bg-color);
  margin-left: 8px;
  vertical-align: middle;
  opacity: 0.8;
`

export const AIGreeting = () => {
  const [greeting, setGreeting] = useState("")
  const [loading, setLoading] = useState(true)
  const [isAI, setIsAI] = useState(false)
  const [dailyReview, setDailyReview] = useState("")

  const fetchGreeting = async (refresh = false) => {
    setLoading(true)
    const settings = AISettingsManager.get()

    if (!settings.enabled || !settings.apiKey) {
      // 未启用 AI，使用默认问候
      setGreeting(getDefaultGreeting())
      setIsAI(false)
      setLoading(false)
      return
    }

    try {
      const result = refresh ? await refreshAIGreeting() : await getAIGreeting()
      setGreeting(result.message)
      setIsAI(!result.error)
    } catch {
      setGreeting(getDefaultGreeting())
      setIsAI(false)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchGreeting()
  }, [])

  useEffect(() => {
    let mounted = true
    void getDailyReview().then(result => {
      if (!mounted || !result?.summary) return
      setDailyReview(result.summary)
    })
    return () => {
      mounted = false
    }
  }, [])

  const handleRefresh = () => {
    if (!loading) {
      void fetchGreeting(true)
    }
  }

  return (
    <GreetingContainer>
      <GreetingContent>
        <GreetingText loading={loading}>
          {loading ? "正在思考..." : greeting}
          {isAI && !loading && <AIBadge>AI</AIBadge>}
        </GreetingText>
        {dailyReview && (
          <DailyReviewText>昨日回顾：{dailyReview}</DailyReviewText>
        )}
      </GreetingContent>
      {AISettingsManager.isConfigured() && (
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
