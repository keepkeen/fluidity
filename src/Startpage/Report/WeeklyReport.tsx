import { useEffect, useState } from "react"

import styled from "@emotion/styled"

import { AchievementBadge } from "./components/AchievementBadge"
import { HeatMap } from "./components/HeatMap"
import { StatCard } from "./components/StatCard"
import { TopDurations } from "./components/TopDurations"
import { TopLinks } from "./components/TopLinks"
import { getWeeklyAchievements } from "../../services/achievements"
import { getAnalyticsSummary } from "../../services/analytics"
import { getWeeklyBrowserUsageSummary } from "../../services/browserUsage"
import { TodoContributions } from "../../services/contributions"
import {
  generateWeeklyReport,
  getWeeklyStats,
} from "../../services/reportGenerator"
import { aiLogger } from "../../utils/logger"

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
`

const AISection = styled.div`
  padding: 12px 16px;
  border: 2px solid var(--default-color);
  background: rgba(0, 0, 0, 0.1);
`

const AISectionTitle = styled.div`
  font-size: 0.85rem;
  font-weight: 600;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
`

const AIText = styled.div`
  font-size: 0.9rem;
  line-height: 1.5;
  opacity: 0.9;
`

const StatsRow = styled.div`
  display: flex;
  gap: 12px;
  flex-wrap: wrap;

  @media screen and (max-width: 600px) {
    gap: 8px;
  }
`

const ContentRow = styled.div`
  display: flex;
  gap: 16px;

  @media screen and (max-width: 900px) {
    flex-direction: column;
  }
`

const ContentColumn = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  border: 2px solid var(--default-color);
  background: rgba(0, 0, 0, 0.1);
`

const TopLinksSection = styled.div`
  padding: 12px 16px;
  border: 2px solid var(--default-color);
  background: rgba(0, 0, 0, 0.1);
`

interface WeeklyReportProps {
  onLoaded?: () => void
}

export const WeeklyReport: React.FC<WeeklyReportProps> = ({ onLoaded }) => {
  const [aiSummary, setAiSummary] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [usageMinutes, setUsageMinutes] = useState<number>(0)
  const [topDomains, setTopDomains] = useState<
    { label: string; minutes: number }[]
  >([])
  const [topPages, setTopPages] = useState<
    { label: string; minutes: number }[]
  >([])

  const stats = getWeeklyStats()
  const weekData = TodoContributions.getWeekData(-1)
  const achievements = getWeeklyAchievements()
  const summary = getAnalyticsSummary()

  useEffect(() => {
    const loadAISummary = async () => {
      try {
        const result = await generateWeeklyReport()
        setAiSummary(result.summary)
      } catch (error) {
        aiLogger.error("加载 AI 总结失败:", error)
        setAiSummary("上周辛苦了，新的一周继续加油！💪")
      } finally {
        setLoading(false)
        onLoaded?.()
      }
    }

    void loadAISummary()
  }, [onLoaded])

  useEffect(() => {
    const loadUsage = async () => {
      try {
        const usage = await getWeeklyBrowserUsageSummary(-1)
        setUsageMinutes(Math.round(usage.totalSec / 60))
        setTopDomains(
          usage.topDomains.map(d => ({
            label: d.domain,
            minutes: Math.round(d.sec / 60),
          }))
        )
        setTopPages(
          usage.topPages.map(p => ({
            label: p.title?.trim() ? p.title : p.page,
            minutes: Math.round(p.sec / 60),
          }))
        )
      } catch {
        setUsageMinutes(0)
        setTopDomains([])
        setTopPages([])
      }
    }
    void loadUsage()
  }, [])

  const todoDiff = stats.todosCompleted - stats.prevWeekTodos

  return (
    <Container>
      {/* AI 点评 */}
      <AISection>
        <AISectionTitle>
          <span>💬</span>
          <span>AI 点评</span>
        </AISectionTitle>
        <AIText>{loading ? "正在生成总结..." : aiSummary}</AIText>
      </AISection>

      {/* 数据卡片 */}
      <StatsRow>
        <StatCard
          icon="📋"
          label="待办完成"
          value={stats.todosCompleted}
          trend={{ value: todoDiff, suffix: " vs上周" }}
        />
        <StatCard icon="🔗" label="链接点击" value={stats.linkClicks} />
        <StatCard icon="🔍" label="搜索次数" value={stats.searches} />
        <StatCard icon="🌐" label="浏览时长" value={`${usageMinutes}分钟`} />
        <StatCard icon="⏰" label="活跃天数" value={`${stats.activeDays}/7`} />
      </StatsRow>

      {/* 热力图和成就 */}
      <ContentRow>
        <ContentColumn>
          <HeatMap
            type="daily"
            data={weekData}
            title="每日完成热力图"
            icon="📊"
          />
        </ContentColumn>
        <ContentColumn>
          <AchievementBadge
            achievements={achievements}
            title="本周成就"
            icon="🏅"
          />
        </ContentColumn>
      </ContentRow>

      {/* 本周最爱 */}
      <TopLinksSection>
        <TopLinks
          links={summary.topLinks.map(l => ({
            label: l.label,
            clicks: l.clicks,
          }))}
          title="本周最爱"
          icon="🌟"
          maxItems={3}
        />
      </TopLinksSection>

      <ContentRow>
        <ContentColumn>
          <TopDurations
            items={topDomains}
            title="上周常逛域名"
            icon="🧭"
            maxItems={5}
          />
        </ContentColumn>
        <ContentColumn>
          <TopDurations
            items={topPages}
            title="上周常看页面"
            icon="📄"
            maxItems={5}
          />
        </ContentColumn>
      </ContentRow>
    </Container>
  )
}
