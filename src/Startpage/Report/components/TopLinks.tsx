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

const LinkList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`

const LinkItem = styled.div`
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

const LinkName = styled.span`
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const ClickCount = styled.span`
  opacity: 0.6;
  font-size: 0.75rem;
`

const EmptyMessage = styled.div`
  font-size: 0.8rem;
  opacity: 0.5;
  padding: 8px;
`

interface TopLink {
  label: string
  clicks: number
}

interface TopLinksProps {
  links: TopLink[]
  title?: string
  icon?: string
  maxItems?: number
}

export const TopLinks: React.FC<TopLinksProps> = ({
  links,
  title = "本周最爱",
  icon = "🌟",
  maxItems = 3,
}) => {
  const displayLinks = links.slice(0, maxItems)

  return (
    <Container>
      <Title>
        <span>{icon}</span>
        <span>{title}</span>
      </Title>
      <LinkList>
        {displayLinks.length > 0 ? (
          displayLinks.map((link, index) => (
            <LinkItem key={link.label}>
              <Rank>{index + 1}.</Rank>
              <LinkName title={link.label}>{link.label}</LinkName>
              <ClickCount>({link.clicks}次)</ClickCount>
            </LinkItem>
          ))
        ) : (
          <EmptyMessage>暂无访问记录</EmptyMessage>
        )}
      </LinkList>
    </Container>
  )
}
