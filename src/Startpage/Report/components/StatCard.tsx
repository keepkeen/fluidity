import React from "react"

import styled from "@emotion/styled"

const Card = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 16px;
  border: 2px solid var(--default-color);
  background: rgba(0, 0, 0, 0.1);
  min-width: 100px;
  flex: 1;

  @media screen and (max-width: 600px) {
    padding: 8px 12px;
    min-width: 70px;
  }
`

const Icon = styled.span`
  font-size: 1.2rem;
  margin-bottom: 4px;
`

const Label = styled.span`
  font-size: 0.75rem;
  opacity: 0.7;
  margin-bottom: 4px;
`

const Value = styled.span`
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--accent-color);

  @media screen and (max-width: 600px) {
    font-size: 1.2rem;
  }
`

const Trend = styled.span<{ positive: boolean; neutral: boolean }>`
  font-size: 0.75rem;
  margin-top: 4px;
  color: ${({ positive, neutral }) =>
    neutral
      ? "var(--default-color)"
      : positive
      ? "#39d353"
      : "var(--accent-color2)"};
`

interface StatCardProps {
  icon: string
  label: string
  value: number | string
  trend?: {
    value: number
    suffix?: string
    isPercentage?: boolean
  }
}

export const StatCard: React.FC<StatCardProps> = ({
  icon,
  label,
  value,
  trend,
}) => {
  const getTrendText = () => {
    if (!trend) return null

    const { value: trendValue, suffix = "", isPercentage } = trend

    if (trendValue === 0) {
      return "持平"
    }

    const prefix = trendValue > 0 ? "↑" : "↓"
    const absValue = Math.abs(trendValue)

    if (isPercentage) {
      return `${prefix}${absValue}%${suffix}`
    }

    return `${prefix}${absValue}${suffix}`
  }

  return (
    <Card>
      <Icon>{icon}</Icon>
      <Label>{label}</Label>
      <Value>{value}</Value>
      {trend && (
        <Trend positive={trend.value > 0} neutral={trend.value === 0}>
          {getTrendText()}
        </Trend>
      )}
    </Card>
  )
}
