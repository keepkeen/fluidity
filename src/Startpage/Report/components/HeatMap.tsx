import React from "react"

import styled from "@emotion/styled"

// GitHub 绿色配色
const COLORS = {
  empty: "#161b22",
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

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`

const Title = styled.div`
  font-size: 0.85rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
`

const Grid = styled.div`
  display: flex;
  gap: 6px;
  justify-content: center;

  @media screen and (max-width: 600px) {
    gap: 4px;
  }
`

const DayColumn = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
`

const DayLabel = styled.span`
  font-size: 0.7rem;
  opacity: 0.6;
`

const Cell = styled.div<{ color: string; isHighlight: boolean }>`
  width: 32px;
  height: 32px;
  background: ${({ color }) => color};
  border-radius: 4px;
  border: 2px solid
    ${({ isHighlight }) =>
      isHighlight ? "var(--accent-color)" : "transparent"};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  color: ${({ color }) =>
    color === COLORS.empty ? "var(--default-color)" : "#fff"};
  opacity: ${({ color }) => (color === COLORS.empty ? 0.5 : 1)};
  transition: transform 0.2s;

  &:hover {
    transform: scale(1.1);
  }

  @media screen and (max-width: 600px) {
    width: 26px;
    height: 26px;
    font-size: 0.65rem;
  }
`

const HighlightNote = styled.div`
  font-size: 0.7rem;
  opacity: 0.6;
  text-align: center;
  margin-top: 4px;
`

interface DayData {
  date: string
  weekday: string
  count: number
}

interface WeekData {
  week: number
  count: number
}

interface HeatMapProps {
  type: "daily" | "weekly"
  data: DayData[] | WeekData[]
  title?: string
  icon?: string
}

export const HeatMap: React.FC<HeatMapProps> = ({
  type,
  data,
  title = "完成热力图",
  icon = "📊",
}) => {
  if (type === "daily") {
    const dayData = data as DayData[]
    const maxCount = Math.max(...dayData.map(d => d.count))
    const maxDay = dayData.find(d => d.count === maxCount)

    return (
      <Container>
        <Title>
          <span>{icon}</span>
          <span>{title}</span>
        </Title>
        <Grid>
          {dayData.map(day => (
            <DayColumn key={day.date}>
              <DayLabel>{day.weekday}</DayLabel>
              <Cell
                color={getColor(day.count)}
                isHighlight={day.count === maxCount && maxCount > 0}
                title={`${day.date}: ${day.count} 个待办`}
              >
                {day.count > 0 ? day.count : ""}
              </Cell>
            </DayColumn>
          ))}
        </Grid>
        {maxDay && maxCount > 0 && (
          <HighlightNote>▲ 周{maxDay.weekday}最高产</HighlightNote>
        )}
      </Container>
    )
  }

  // Weekly mode for monthly report
  const weekData = data as WeekData[]
  const maxCount = Math.max(...weekData.map(d => d.count))
  const maxWeek = weekData.find(d => d.count === maxCount)

  return (
    <Container>
      <Title>
        <span>{icon}</span>
        <span>{title}</span>
      </Title>
      <Grid>
        {weekData.map(week => (
          <DayColumn key={week.week}>
            <DayLabel>周{week.week}</DayLabel>
            <Cell
              color={getColor(Math.ceil(week.count / 3))} // 调整阈值适应周数据
              isHighlight={week.count === maxCount && maxCount > 0}
              title={`第${week.week}周: ${week.count} 个待办`}
            >
              {week.count > 0 ? week.count : ""}
            </Cell>
          </DayColumn>
        ))}
      </Grid>
      {maxWeek && maxCount > 0 && (
        <HighlightNote>▲ 第{maxWeek.week}周最高产</HighlightNote>
      )}
    </Container>
  )
}
