import React, { useEffect, useState } from "react"

import styled from "@emotion/styled"

import { AchievementBadge } from "./components/AchievementBadge"
import { HeatMap } from "./components/HeatMap"
import { StatCard } from "./components/StatCard"
import {
  TimeDistribution,
  convertToTimeSlots,
} from "./components/TimeDistribution"
import { TopLinks } from "./components/TopLinks"
import {
  getMonthlyAchievements,
  getMonthWeeklyData,
} from "../../services/achievements"
import { getAnalyticsSummary } from "../../services/analytics"
import {
  generateMonthlyReport,
  getMonthlyStats,
} from "../../services/reportGenerator"

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

const ForecastSection = styled.div`
  padding: 12px 16px;
  border: 2px solid var(--accent-color);
  background: rgba(0, 0, 0, 0.1);
`

const ForecastTitle = styled.div`
  font-size: 0.85rem;
  font-weight: 600;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--accent-color);
`

const ForecastText = styled.div`
  font-size: 0.9rem;
  line-height: 1.5;
  opacity: 0.9;
`

interface MonthlyReportProps {
  onLoaded?: () => void
}

export const MonthlyReport: React.FC<MonthlyReportProps> = ({ onLoaded }) => {
  const [aiSummary, setAiSummary] = useState<string>("")
  const [forecast, setForecast] = useState<string>("")
  const [loading, setLoading] = useState(true)

  const stats = getMonthlyStats()
  const achievements = getMonthlyAchievements()
  const summary = getAnalyticsSummary()

  // 获取上月数据
  const now = new Date()
  const lastMonth = now.getMonth() === 0 ? 12 : now.getMonth()
  const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
  const weeklyData = getMonthWeeklyData(year, lastMonth)
  const timeSlots = convertToTimeSlots(summary.activeHours)

  useEffect(() => {
    const loadAISummary = async () => {
      try {
        const result = await generateMonthlyReport()
        setAiSummary(result.summary)
        setForecast(result.forecast)
      } catch (error) {
        console.error("加载 AI 总结失败:", error)
        setAiSummary(`${stats.monthName}辛苦了，新的一月继续加油！💪`)
        setForecast("期待你在新的一月创造更多可能！🚀")
      } finally {
        setLoading(false)
        onLoaded?.()
      }
    }

    void loadAISummary()
  }, [onLoaded, stats.monthName])

  const todoDiff = stats.todosCompleted - stats.prevMonthTodos

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
        <StatCard
          icon="📋"
          label="待办完成"
          value={stats.todosCompleted}
          trend={{ value: todoDiff, suffix: " vs上月" }}
        />
        <StatCard icon="🔗" label="链接点击" value={stats.linkClicks} />
        <StatCard icon="🔍" label="搜索次数" value={stats.searches} />
        <StatCard
          icon="📅"
          label="活跃天数"
          value={`${stats.activeDays}/${stats.daysInMonth}`}
          trend={{
            value: Math.round((stats.activeDays / stats.daysInMonth) * 100),
            suffix: "% 出勤",
            isPercentage: false,
          }}
        />
      </StatsRow>

      {/* 周度趋势和成就 */}
      <ContentRow>
        <ContentColumn>
          <HeatMap
            type="weekly"
            data={weeklyData}
            title="周度趋势图"
            icon="📊"
          />
        </ContentColumn>
        <ContentColumn>
          <AchievementBadge
            achievements={achievements}
            title="月度成就"
            icon="🏆"
          />
        </ContentColumn>
      </ContentRow>

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

      {/* 新月展望 */}
      <ForecastSection>
        <ForecastTitle>
          <span>🔮</span>
          <span>新月展望</span>
        </ForecastTitle>
        <ForecastText>{loading ? "正在预测..." : forecast}</ForecastText>
      </ForecastSection>
    </Container>
  )
}
