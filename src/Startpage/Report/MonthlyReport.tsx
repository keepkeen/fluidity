import { useEffect, useState } from "react"

import styled from "@emotion/styled"

import { StatCard } from "./components/StatCard"
import {
  TimeDistribution,
  convertToTimeSlots,
} from "./components/TimeDistribution"
import { TopDurations } from "./components/TopDurations"
import { TopLinks } from "./components/TopLinks"
import { getAnalyticsSummary } from "../../services/analytics"
import { getMonthlyBrowserUsageSummary } from "../../services/browserUsage"
import {
  generateMonthlyReport,
  getMonthlyStats,
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
  border: 1px solid var(--surface-border-strong);
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
  border: 1px solid var(--surface-border-strong);
  background: rgba(0, 0, 0, 0.1);
`

interface MonthlyReportProps {
  onLoaded?: () => void
}

export const MonthlyReport: React.FC<MonthlyReportProps> = ({ onLoaded }) => {
  const [aiSummary, setAiSummary] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [usageMinutes, setUsageMinutes] = useState<number>(0)
  const [topDomains, setTopDomains] = useState<
    { label: string; minutes: number }[]
  >([])
  const [topPages, setTopPages] = useState<
    { label: string; minutes: number }[]
  >([])
  const [usageTimeSlots, setUsageTimeSlots] = useState<
    { label: string; percentage: number }[]
  >(convertToTimeSlots(undefined))

  const stats = getMonthlyStats()
  const summary = getAnalyticsSummary()
  const timeSlots = usageTimeSlots

  // 上月的年/月（用于时长汇总查询）
  const now = new Date()
  const lastMonth = now.getMonth() === 0 ? 12 : now.getMonth()
  const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()

  useEffect(() => {
    const loadAISummary = async () => {
      try {
        const result = await generateMonthlyReport()
        setAiSummary(result.summary)
      } catch (error) {
        aiLogger.error("加载 AI 总结失败:", error)
        setAiSummary(`${stats.monthName}辛苦了，新的一月继续加油！💪`)
      } finally {
        setLoading(false)
        onLoaded?.()
      }
    }

    void loadAISummary()
  }, [onLoaded, stats.monthName])

  useEffect(() => {
    const loadUsage = async () => {
      try {
        const usage = await getMonthlyBrowserUsageSummary(year, lastMonth)
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
        setUsageTimeSlots(convertToTimeSlots(usage.byHour))
      } catch {
        setUsageMinutes(0)
        setTopDomains([])
        setTopPages([])
        setUsageTimeSlots(convertToTimeSlots(summary.activeHours))
      }
    }
    void loadUsage()
  }, [lastMonth, summary.activeHours, year])

  return (
    <Container>
      {/* AI 月度点评 */}
      <AISection>
        <AISectionTitle>
          <span>💬</span>
          <span>AI 月度点评</span>
        </AISectionTitle>
        <AIText>{loading ? "正在生成总结..." : aiSummary}</AIText>
      </AISection>

      {/* 数据卡片 */}
      <StatsRow>
        <StatCard icon="🌐" label="浏览时长" value={`${usageMinutes}分钟`} />
        <StatCard icon="🔗" label="链接点击" value={stats.linkClicks} />
        <StatCard icon="🔍" label="搜索次数" value={stats.searches} />
      </StatsRow>

      {/* 活跃时段和最爱链接 */}
      <ContentRow>
        <ContentColumn>
          <TimeDistribution data={timeSlots} title="活跃时段分布" icon="⏰" />
        </ContentColumn>
        <ContentColumn>
          <TopLinks
            links={summary.topLinks.map(l => ({
              label: l.label,
              clicks: l.clicks,
            }))}
            title="月度最爱 TOP 5"
            icon="🌟"
            maxItems={5}
          />
        </ContentColumn>
      </ContentRow>

      <ContentRow>
        <ContentColumn>
          <TopDurations
            items={topDomains}
            title="上月常逛域名"
            icon="🧭"
            maxItems={6}
          />
        </ContentColumn>
        <ContentColumn>
          <TopDurations
            items={topPages}
            title="上月常看页面"
            icon="📄"
            maxItems={6}
          />
        </ContentColumn>
      </ContentRow>

    </Container>
  )
}
