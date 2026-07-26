import { useEffect, useMemo, useState } from "react"

import styled from "@emotion/styled"

import {
  getSyncRuntimeStatus,
  subscribeSyncRuntimeStatus,
  SyncRuntimeStatus,
} from "../services/syncRuntime"

const StatusButton = styled.button<{ interactive: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: inherit;
  cursor: ${({ interactive }) => (interactive ? "pointer" : "default")};

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 3px;
  }
`

const Dot = styled.span<{ color: string }>`
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: ${({ color }) => color};
  box-shadow: 0 0 0 2px var(--bg-primary);
  flex: 0 0 auto;
`

const getColor = (state: SyncRuntimeStatus["state"]): string => {
  if (state === "ok") return "#39d353"
  if (state === "syncing") return "#f1e05a"
  if (state === "disabled") return "#8b949e"
  return "#ff6464"
}

interface SyncStatusDotProps {
  onClick?: () => void
  label?: string
}

export const SyncStatusDot = ({ onClick, label }: SyncStatusDotProps) => {
  const [status, setStatus] = useState<SyncRuntimeStatus>(() =>
    getSyncRuntimeStatus()
  )

  useEffect(() => {
    setStatus(getSyncRuntimeStatus())
    return subscribeSyncRuntimeStatus(setStatus)
  }, [])

  const title = useMemo(() => {
    if (status.message) return `云同步：${status.message}`
    return "云同步"
  }, [status.message])

  return (
    <StatusButton
      type="button"
      interactive={Boolean(onClick)}
      onClick={onClick}
      aria-label={label ?? title}
      title={label ? `${label}：${title}` : title}
    >
      <Dot color={getColor(status.state)} aria-hidden />
    </StatusButton>
  )
}
