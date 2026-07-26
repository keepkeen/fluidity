import React from "react"

import styled from "@emotion/styled"

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

const BarList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`

const BarRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`

const TimeLabel = styled.span`
  font-size: 0.75rem;
  min-width: 36px;
  opacity: 0.8;
`

const BarContainer = styled.div`
  flex: 1;
  height: 16px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 2px;
  overflow: hidden;
  position: relative;
`

const Bar = styled.div<{ width: number; isMax: boolean }>`
  height: 100%;
  width: ${({ width }) => width}%;
  background: ${({ isMax }) =>
    isMax
      ? "linear-gradient(90deg, var(--accent-color), var(--accent-color2))"
      : "var(--accent-color)"};
  border-radius: 2px;
  transition: width 0.3s ease;
`

const Percentage = styled.span`
  font-size: 0.7rem;
  min-width: 32px;
  text-align: right;
  opacity: 0.7;
`

const MaxIndicator = styled.span`
  font-size: 0.65rem;
  color: var(--accent-color);
  margin-left: 4px;
`

interface TimeSlot {
  label: string
  percentage: number
}

interface TimeDistributionProps {
  data: TimeSlot[]
  title?: string
  icon?: string
}

export const TimeDistribution: React.FC<TimeDistributionProps> = ({
  data,
  title = "活跃时段分布",
  icon = "⏰",
}) => {
  const maxPercentage = Math.max(...data.map(d => d.percentage))

  return (
    <Container>
      <Title>
        <span>{icon}</span>
        <span>{title}</span>
      </Title>
      <BarList>
        {data.map(slot => (
          <BarRow key={slot.label}>
            <TimeLabel>{slot.label}</TimeLabel>
            <BarContainer>
              <Bar
                width={slot.percentage}
                isMax={slot.percentage === maxPercentage && maxPercentage > 0}
              />
            </BarContainer>
            <Percentage>
              {slot.percentage}%
              {slot.percentage === maxPercentage && maxPercentage > 0 && (
                <MaxIndicator>← 最活跃</MaxIndicator>
              )}
            </Percentage>
          </BarRow>
        ))}
      </BarList>
    </Container>
  )
}

/**
 * 将24小时活跃数据转换为时段分布
 */
export const convertToTimeSlots = (
  activeHours: number[] | undefined
): TimeSlot[] => {
  if (!activeHours || activeHours.length === 0) {
    return [
      { label: "早晨", percentage: 0 },
      { label: "上午", percentage: 0 },
      { label: "下午", percentage: 0 },
      { label: "晚上", percentage: 0 },
      { label: "深夜", percentage: 0 },
    ]
  }

  const total = activeHours.reduce((a, b) => a + b, 0)
  if (total === 0) {
    return [
      { label: "早晨", percentage: 0 },
      { label: "上午", percentage: 0 },
      { label: "下午", percentage: 0 },
      { label: "晚上", percentage: 0 },
      { label: "深夜", percentage: 0 },
    ]
  }

  // 早晨 5-9, 上午 9-12, 下午 12-18, 晚上 18-22, 深夜 22-5
  const morning = activeHours.slice(5, 9).reduce((a, b) => a + b, 0)
  const forenoon = activeHours.slice(9, 12).reduce((a, b) => a + b, 0)
  const afternoon = activeHours.slice(12, 18).reduce((a, b) => a + b, 0)
  const evening = activeHours.slice(18, 22).reduce((a, b) => a + b, 0)
  const night =
    activeHours.slice(22).reduce((a, b) => a + b, 0) +
    activeHours.slice(0, 5).reduce((a, b) => a + b, 0)

  return [
    { label: "早晨", percentage: Math.round((morning / total) * 100) },
    { label: "上午", percentage: Math.round((forenoon / total) * 100) },
    { label: "下午", percentage: Math.round((afternoon / total) * 100) },
    { label: "晚上", percentage: Math.round((evening / total) * 100) },
    { label: "深夜", percentage: Math.round((night / total) * 100) },
  ]
}
