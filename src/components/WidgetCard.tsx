import React, { ReactNode } from "react"

import styled from "@emotion/styled"

const StyledCard = styled.div`
  background: var(--home-surface);
  border: 1px solid var(--home-stroke);
  border-radius: var(--radius-main);
  box-shadow: var(--home-shadow);
  backdrop-filter: var(--surface-blur);
  -webkit-backdrop-filter: var(--surface-blur);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  transition: transform 0.2s, box-shadow 0.2s;

  &:hover {
    transform: var(--hover-transform);
  }
`

const CardHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--home-stroke);
  background: color-mix(in srgb, var(--home-surface-strong) 72%, transparent);
`

const CardTitle = styled.h3`
  margin: 0;
  font-size: 0.9rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--text-primary);
`

const CardContent = styled.div`
  flex: 1;
  padding: 16px;
  overflow-y: auto;

  &::-webkit-scrollbar {
    width: 4px;
  }
  &::-webkit-scrollbar-thumb {
    background: var(--text-primary);
    border-radius: 4px;
    opacity: 0.5;
  }
`

const CardActions = styled.div`
  display: flex;
  gap: 8px;
`

interface WidgetCardProps {
  title: string
  children: ReactNode
  actions?: ReactNode
  className?: string
  style?: React.CSSProperties
}

export const WidgetCard = ({
  title,
  children,
  actions,
  className,
  style,
}: WidgetCardProps) => {
  return (
    <StyledCard className={className} style={style}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {actions && <CardActions>{actions}</CardActions>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </StyledCard>
  )
}
