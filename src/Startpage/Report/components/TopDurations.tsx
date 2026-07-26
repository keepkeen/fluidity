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

const List = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`

const Item = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: rgba(0, 0, 0, 0.15);
  border-radius: 4px;
  font-size: 0.8rem;
`

const Rank = styled.span`
  font-weight: 600;
  color: var(--accent-color);
  min-width: 16px;
`

const Label = styled.span`
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const Duration = styled.span`
  opacity: 0.6;
  font-size: 0.75rem;
`

const EmptyMessage = styled.div`
  font-size: 0.8rem;
  opacity: 0.5;
  padding: 8px;
`

interface TopDurationItem {
  label: string
  minutes: number
}

interface TopDurationsProps {
  items: TopDurationItem[]
  title?: string
  icon?: string
  maxItems?: number
  unitLabel?: string
}

export const TopDurations: React.FC<TopDurationsProps> = ({
  items,
  title = "浏览 TOP",
  icon = "🧭",
  maxItems = 5,
  unitLabel = "分钟",
}) => {
  const display = items.slice(0, maxItems)

  return (
    <Container>
      <Title>
        <span>{icon}</span>
        <span>{title}</span>
      </Title>
      <List>
        {display.length > 0 ? (
          display.map((item, index) => (
            <Item key={`${item.label}-${item.minutes}`}>
              <Rank>{index + 1}.</Rank>
              <Label title={item.label}>{item.label}</Label>
              <Duration>
                ({item.minutes}
                {unitLabel})
              </Duration>
            </Item>
          ))
        ) : (
          <EmptyMessage>暂无数据</EmptyMessage>
        )}
      </List>
    </Container>
  )
}
