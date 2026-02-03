import { useEffect, useMemo, useState } from "react"

import styled from "@emotion/styled"

import {
  getSyncRuntimeStatus,
  subscribeSyncRuntimeStatus,
  SyncRuntimeStatus,
} from "../services/syncRuntime"

const Dot = styled.span<{ color: string }>`
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: ${({ color }) => color};
  box-shadow: 0 0 0 2px var(--bg-color);
  flex: 0 0 auto;
`

const getColor = (state: SyncRuntimeStatus["state"]): string => {
  if (state === "ok") return "#39d353"
  if (state === "syncing") return "#f1e05a"
  return "#ff6464"
}

export const SyncStatusDot = () => {
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

  return <Dot color={getColor(status.state)} title={title} />
}
