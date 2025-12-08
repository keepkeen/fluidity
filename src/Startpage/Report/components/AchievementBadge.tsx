import React from "react"

import styled from "@emotion/styled"

import { Achievement } from "../../../services/achievements"

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

const BadgeList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`

const Badge = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: rgba(0, 0, 0, 0.15);
  border-radius: 4px;
  font-size: 0.8rem;
  transition: transform 0.2s;

  &:hover {
    transform: translateX(4px);
  }
`

const BadgeIcon = styled.span`
  font-size: 1rem;
`

const BadgeText = styled.span`
  flex: 1;
`

const EmptyMessage = styled.div`
  font-size: 0.8rem;
  opacity: 0.5;
  padding: 8px;
`

interface AchievementBadgeProps {
  achievements: Achievement[]
  title?: string
  icon?: string
}

export const AchievementBadge: React.FC<AchievementBadgeProps> = ({
  achievements,
  title = "本周成就",
  icon = "🏅",
}) => {
  return (
    <Container>
      <Title>
        <span>{icon}</span>
        <span>{title}</span>
      </Title>
      <BadgeList>
        {achievements.length > 0 ? (
          achievements.map(achievement => (
            <Badge key={achievement.id} title={achievement.description}>
              <BadgeIcon>{achievement.icon}</BadgeIcon>
              <BadgeText>{achievement.description}</BadgeText>
            </Badge>
          ))
        ) : (
          <EmptyMessage>继续努力，解锁更多成就！</EmptyMessage>
        )}
      </BadgeList>
    </Container>
  )
}
