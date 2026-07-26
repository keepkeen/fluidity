import React, { useMemo } from "react"

import styled from "@emotion/styled"

import { WidgetCard } from "../../components/WidgetCard"
import { TodoContributions } from "../../services/contributions"

// GitHub 绿色配色
const COLORS = {
  empty: "rgba(var(--bg-secondary-rgb), 0.3)",
  level1: "#0e4429",
  level2: "#006d32",
  level3: "#26a641",
  level4: "#39d353",
}

const getColor = (count: number): string => {
  if (count === 0) return COLORS.empty
  if (count <= 2) return COLORS.level1
  if (count <= 4) return COLORS.level2
  if (count <= 6) return COLORS.level3
  return COLORS.level4
}

const StyledWidgetCard = styled(WidgetCard)`
  height: 100%;
  border-radius: var(--radius-main);
`

const ChartContainer = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 20px;
  height: 100%;
`

const WeekGrid = styled.div`
  display: flex;
  gap: 8px;
  justify-content: center;
`

const DayColumn = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
`

const DayLabel = styled.span`
  font-size: 0.75rem;
  color: var(--text-primary);
  opacity: 0.7;
`

const DayCell = styled.div<{ color: string; isToday: boolean }>`
  width: 36px;
  height: 36px;
  background: ${({ color }) => color};
  border-radius: var(--radius-sm);
  border: 2px solid
    ${({ isToday }) => (isToday ? "var(--accent)" : "transparent")};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.85rem;
  color: ${({ color }) =>
    color === COLORS.empty ? "var(--text-primary)" : "#fff"};
  opacity: ${({ color }) => (color === COLORS.empty ? 0.5 : 1)};
  transition: transform 0.2s, box-shadow 0.2s;

  &:hover {
    transform: scale(1.1);
    box-shadow: 0 0 8px ${({ color }) => color};
  }

  @media screen and (max-width: 400px) {
    width: 28px;
    height: 28px;
    font-size: 0.75rem;
  }
`

const TotalSection = styled.div`
  text-align: center;
  color: var(--text-primary);
`

const TotalNumber = styled.span`
  font-size: 2rem;
  font-weight: 600;
  color: ${COLORS.level4};
`

const TotalLabel = styled.span`
  font-size: 0.9rem;
  opacity: 0.7;
  margin-left: 8px;
`

const Legend = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font-size: 0.75rem;
  color: var(--text-primary);
  opacity: 0.7;
`

const LegendCell = styled.div<{ color: string }>`
  width: 12px;
  height: 12px;
  background: ${({ color }) => color};
  border-radius: 2px;
`

const EmptyMessage = styled.div`
  text-align: center;
  color: var(--text-primary);
  opacity: 0.6;
  font-size: 0.9rem;
  line-height: 1.6;
`

export const ContributionChart: React.FC = () => {
  const data = useMemo(() => TodoContributions.getLast7Days(), [])
  const total = useMemo(() => TodoContributions.getTotal(), [])

  const today = useMemo(() => {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, "0")
    const day = String(now.getDate()).padStart(2, "0")
    return `${year}-${month}-${day}`
  }, [])

  return (
    <StyledWidgetCard
      title="本周完成"
      actions={
        <span
          style={{
            opacity: 0.6,
            fontSize: "0.85rem",
            color: "var(--text-primary)",
          }}
        >
          最近 7 天
        </span>
      }
    >
      <ChartContainer>
        <WeekGrid>
          {data.map(day => (
            <DayColumn key={day.date}>
              <DayLabel>{day.weekday}</DayLabel>
              <DayCell
                color={getColor(day.count)}
                isToday={day.date === today}
                title={`${day.date}: ${day.count} 个待办`}
              >
                {day.count > 0 ? day.count : ""}
              </DayCell>
            </DayColumn>
          ))}
        </WeekGrid>

        <TotalSection>
          {total > 0 ? (
            <>
              <TotalNumber>{total}</TotalNumber>
              <TotalLabel>个待办已完成</TotalLabel>
            </>
          ) : (
            <EmptyMessage>
              还没有完成任何待办
              <br />
              勾选待办事项来记录你的进度
            </EmptyMessage>
          )}
        </TotalSection>

        <Legend>
          <span>少</span>
          <LegendCell color={COLORS.empty} />
          <LegendCell color={COLORS.level1} />
          <LegendCell color={COLORS.level2} />
          <LegendCell color={COLORS.level3} />
          <LegendCell color={COLORS.level4} />
          <span>多</span>
        </Legend>
      </ChartContainer>
    </StyledWidgetCard>
  )
}
