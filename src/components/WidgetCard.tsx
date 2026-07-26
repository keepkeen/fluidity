import React, { ReactNode } from "react"

import styled from "@emotion/styled"

const StyledCard = styled.div`
  background: rgba(var(--bg-primary-rgb), var(--glass-opacity));
  /* Fallback color mix */
  background: color-mix(
    in srgb,
    var(--bg-primary),
    transparent calc(100% * (1 - var(--glass-opacity, 0.9)))
  );

  border: var(--border-width) solid var(--text-primary);
  border-radius: var(--radius-main);
  box-shadow: var(--shadow-card);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
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
  border-bottom: var(--border-width) solid var(--text-primary);
  background: rgba(var(--bg-secondary-rgb), 0.5);
  /* Fallback */
  background: color-mix(in srgb, var(--bg-secondary), transparent 0.5);
`

const CardTitle = styled.h3`
  margin: 0;
  font-size: 0.9rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--accent);
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
