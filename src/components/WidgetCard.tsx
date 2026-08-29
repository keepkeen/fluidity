import React, { ReactNode } from "react"

import styled from "@emotion/styled"

const StyledCard = styled.div<{ interactive: boolean }>`
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  box-sizing: border-box;
  background: var(--home-surface);
  border: 1px solid var(--home-stroke);
  border-radius: var(--radius-main);
  box-shadow: var(--home-shadow);
  backdrop-filter: var(--surface-blur);
  -webkit-backdrop-filter: var(--surface-blur);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  container-type: size;
  transition: transform 0.2s, box-shadow 0.2s;
  cursor: ${({ interactive }) => (interactive ? "pointer" : "default")};

  &:hover {
    transform: var(--hover-transform);
  }
`

const CardHeader = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 13px;
  border-bottom: 1px solid var(--home-stroke);
  background: color-mix(in srgb, var(--home-surface-strong) 72%, transparent);

  @container (max-height: 110px) {
    padding: 5px 9px;
  }
`

const CardTitle = styled.h3`
  min-width: 0;
  margin: 0;
  font-size: 0.9rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  @container (max-height: 110px) {
    font-size: 0.78rem;
  }
`

const CardTitleRow = styled.div`
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 7px;

  @container (max-height: 110px) {
    gap: 5px;
  }
`

const CardOpenButton = styled.button`
  position: absolute;
  inset: 0;
  z-index: 1;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  /* 键盘仍可聚焦；鼠标则落到卡片/拖拽层，避免标题区阻断长按拖动。 */
  pointer-events: none;

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -3px;
    border-radius: var(--radius-main) var(--radius-main) 0 0;
  }
`

const CardSymbol = styled.span`
  color: var(--accent);
  font-size: 0.85rem;
`

const CardSubtitle = styled.div`
  min-width: 0;
  color: var(--text-muted);
  font-size: 0.68rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  @container (max-height: 110px) {
    display: none;
  }
`

const CardHeading = styled.div`
  min-width: 0;
`

const CardContent = styled.div`
  flex: 1;
  min-height: 0;
  padding: 12px 13px;
  overflow: hidden;

  @container (max-height: 110px) {
    padding: 5px 9px;
  }
`

const CardFooter = styled.div`
  min-height: 30px;
  padding: 6px 13px 8px;
  border-top: 1px solid var(--home-stroke);
  color: var(--text-muted);
  font-size: 0.72rem;
`

const CardActions = styled.div`
  position: relative;
  z-index: 2;
  display: flex;
  gap: 8px;
`

interface WidgetCardProps {
  title: string
  children: ReactNode
  actions?: ReactNode
  symbol?: ReactNode
  subtitle?: ReactNode
  footer?: ReactNode
  onOpen?: () => void
  className?: string
  style?: React.CSSProperties
}

export const WidgetCard = ({
  title,
  children,
  actions,
  symbol,
  subtitle,
  footer,
  onOpen,
  className,
  style,
}: WidgetCardProps) => {
  const heading = (
    <>
      {symbol && <CardSymbol aria-hidden>{symbol}</CardSymbol>}
      <CardHeading>
        <CardTitle>{title}</CardTitle>
        {subtitle && <CardSubtitle>{subtitle}</CardSubtitle>}
      </CardHeading>
    </>
  )

  return (
    <StyledCard
      data-widget-card="true"
      className={className}
      style={style}
      interactive={Boolean(onOpen)}
      onClick={event => {
        if (!onOpen) return
        const target = event.target as HTMLElement
        if (target.closest("button, a, input, select, textarea, [data-widget-interactive]")) {
          return
        }
        onOpen()
      }}
    >
      <CardHeader data-widget-card-header="true">
        <CardTitleRow>{heading}</CardTitleRow>
        {onOpen && (
          <CardOpenButton
            type="button"
            aria-label={`打开${title}`}
            onClick={event => {
              event.stopPropagation()
              onOpen()
            }}
          />
        )}
        {actions && <CardActions>{actions}</CardActions>}
      </CardHeader>
      <CardContent data-widget-card-content="true">{children}</CardContent>
      {footer && <CardFooter>{footer}</CardFooter>}
    </StyledCard>
  )
}
