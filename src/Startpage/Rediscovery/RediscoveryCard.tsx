import { useCallback, useMemo, useState } from "react"

import styled from "@emotion/styled"
import {
  faArrowUpRightFromSquare,
  faClock,
  faTrash,
} from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"

import { WidgetCard } from "../../components/WidgetCard"
import { LinkAnalytics } from "../../services/analytics"
import { linkGroup } from "../../data/data"
import { navigateToLink } from "../../services/linkSearch"
import {
  findForgottenLinks,
  hideRediscovery,
  isRediscoveryHidden,
  pickDailyRediscoveries,
  readRediscoveryState,
  restoreRediscovery,
  snoozeRediscovery,
} from "../../services/rediscovery"
import { WidgetSize } from "../../services/widgetRegistry"

const StyledWidgetCard = styled(WidgetCard)`
  height: 100%;
  border-radius: var(--radius-main);
`

const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`

const Item = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 7px 12px;
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-sm);
  background: rgba(var(--bg-secondary-rgb), 0.25);
  transition: 0.2s;

  &:hover {
    background: rgba(var(--bg-secondary-rgb), 0.5);
    border-color: var(--accent);
  }
`

const ItemTop = styled.div`
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
`

const LinkName = styled.button`
  background: transparent;
  border: none;
  padding: 0;
  color: var(--text-primary);
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;

  :hover {
    color: var(--accent);
    text-decoration: underline;
  }

  :focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
`

const GroupTag = styled.span`
  flex-shrink: 0;
  font-size: 0.72rem;
  color: var(--text-muted);
  border: 1px solid var(--border-default);
  padding: 1px 6px;
  border-radius: 999px;
`

const ItemBottom = styled.div`
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  min-width: 0;
`

const AgeHint = styled.span`
  font-size: 0.78rem;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

const Actions = styled.div`
  width: 100%;
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(72px, 1fr));
  gap: 6px;

  @container (max-width: 280px) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
`

const ActionBtn = styled.button`
  min-width: 0;
  background: transparent;
  white-space: nowrap;
  border-radius: 999px;
  border: 1px solid var(--surface-border);
  color: var(--text-secondary);
  font-size: 0.75rem;
  padding: 3px 8px;
  cursor: pointer;
  transition: 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  overflow: hidden;

  :hover {
    border-color: var(--accent);
    color: var(--accent);
  }

  :focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
`

const ActionLabel = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;

  @container (max-width: 280px) {
    display: none;
  }
`

const Empty = styled.div`
  font-size: 0.85rem;
  opacity: 0.65;
  padding: 12px 0;
  text-align: center;
  line-height: 1.6;
`

const pad2 = (n: number): string => String(n).padStart(2, "0")

const todayString = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

const formatAge = (lastClicked: number | null): string => {
  if (lastClicked === null) return "收藏后从未打开"
  const days = Math.floor((Date.now() - lastClicked) / (24 * 60 * 60 * 1000))
  return `上次打开是 ${days} 天前`
}

interface RediscoveryCardProps {
  linkGroups: linkGroup[]
  onRequestRemove: (url: string, label: string) => void
  size?: WidgetSize
  onUndoableAction?: (message: string, undo: () => void) => void
}

export const RediscoveryCard = ({
  linkGroups,
  onRequestRemove,
  size = "medium",
  onUndoableAction,
}: RediscoveryCardProps) => {
  // 打开/暂缓后重新采样；删除由父级 linkGroups 更新触发。
  const [refreshTick, setRefreshTick] = useState(0)

  const picks = useMemo(() => {
    void refreshTick
    const now = Date.now()
    const state = readRediscoveryState()
    const candidates = findForgottenLinks(
      linkGroups,
      LinkAnalytics.get(),
      now
    ).filter(candidate => !isRediscoveryHidden(state, candidate.url))
    return pickDailyRediscoveries(
      candidates,
      todayString(),
      state.snoozed,
      now
    ).slice(0, size === "large" ? 2 : 1)
  }, [linkGroups, refreshTick, size])

  const refresh = useCallback(() => setRefreshTick(t => t + 1), [])

  const handleOpen = (pick: (typeof picks)[number]) => {
    navigateToLink(pick.url, pick.label, pick.groupTitle, true)
    refresh()
  }

  const handleSnooze = (url: string) => {
    snoozeRediscovery(url, Date.now())
    refresh()
  }

  const handleHide = (url: string) => {
    hideRediscovery(url)
    refresh()
    onUndoableAction?.("这个链接不会再出现在重逢中", () => {
      restoreRediscovery(url)
      refresh()
    })
  }

  return (
    <StyledWidgetCard
      title="重逢"
      symbol="⌁"
      subtitle={picks.length > 0 ? "因为很久没有打开" : "收藏都保持活跃"}
    >
      {picks.length === 0 ? (
        <Empty>
          收藏里没有被遗忘的链接
          <br />
          （所有链接最近 30 天内都打开过）
        </Empty>
      ) : (
        <List>
          {picks.map(pick => (
            <Item key={pick.url}>
              <ItemTop>
                <LinkName
                  type="button"
                  title={pick.url}
                  onClick={() => handleOpen(pick)}
                >
                  {pick.label}
                </LinkName>
                <GroupTag>{pick.groupTitle}</GroupTag>
              </ItemTop>
              <ItemBottom>
                <AgeHint>{formatAge(pick.lastClicked)}</AgeHint>
                <Actions>
                  <ActionBtn
                    type="button"
                    aria-label="打开"
                    title="打开"
                    onClick={() => handleOpen(pick)}
                  >
                    <FontAwesomeIcon icon={faArrowUpRightFromSquare} />
                    <ActionLabel>打开</ActionLabel>
                  </ActionBtn>
                  <ActionBtn
                    type="button"
                    aria-label="下次再说"
                    onClick={() => handleSnooze(pick.url)}
                    title="7 天内不再展示"
                  >
                    <FontAwesomeIcon icon={faClock} />
                    <ActionLabel>下次再说</ActionLabel>
                  </ActionBtn>
                  <ActionBtn
                    type="button"
                    aria-label="不再推荐"
                    onClick={() => handleHide(pick.url)}
                    title="保留收藏，但不再推荐"
                  >
                    <FontAwesomeIcon icon={faTrash} />
                    <ActionLabel>不再推荐</ActionLabel>
                  </ActionBtn>
                  {size === "large" && (
                    <ActionBtn
                      type="button"
                      aria-label="删除收藏"
                      onClick={() => onRequestRemove(pick.url, pick.label)}
                      title="从收藏中彻底删除"
                    >
                      <ActionLabel>删除收藏</ActionLabel>
                    </ActionBtn>
                  )}
                </Actions>
              </ItemBottom>
            </Item>
          ))}
        </List>
      )}
    </StyledWidgetCard>
  )
}
