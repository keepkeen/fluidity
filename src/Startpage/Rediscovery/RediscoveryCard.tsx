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
import { navigateToLink } from "../../services/linkSearch"
import {
  findForgottenLinks,
  pickDailyRediscoveries,
  readRediscoveryState,
  snoozeRediscovery,
} from "../../services/rediscovery"
import { Links } from "../Settings/settingsHandler"

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
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
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
  display: flex;
  gap: 6px;
`

const ActionBtn = styled.button`
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
  gap: 4px;

  :hover {
    border-color: var(--accent);
    color: var(--accent);
  }

  :focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
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

export const RediscoveryCard = () => {
  // refreshTick：操作后重新采样（打开/暂缓/删除都会改变候选集）
  const [refreshTick, setRefreshTick] = useState(0)

  const picks = useMemo(() => {
    void refreshTick
    const now = Date.now()
    const candidates = findForgottenLinks(
      Links.getWithFallback(),
      LinkAnalytics.get(),
      now
    )
    return pickDailyRediscoveries(
      candidates,
      todayString(),
      readRediscoveryState().snoozed,
      now
    )
  }, [refreshTick])

  const refresh = useCallback(() => setRefreshTick(t => t + 1), [])

  const handleOpen = (pick: (typeof picks)[number]) => {
    navigateToLink(pick.url, pick.label, pick.groupTitle, true)
    refresh()
  }

  const handleSnooze = (url: string) => {
    snoozeRediscovery(url, Date.now())
    refresh()
  }

  const handleRemove = (pick: (typeof picks)[number]) => {
    const confirmed = window.confirm(
      `从收藏中删除"${pick.label}"？此操作立即生效。`
    )
    if (!confirmed) return
    const groups = Links.getWithFallback()
      .map(group => ({
        ...group,
        links: group.links.filter(link => link.value !== pick.url),
      }))
      .filter(group => group.links.length > 0)
    Links.set(groups)
    refresh()
  }

  return (
    <StyledWidgetCard title="重逢">
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
                  <ActionBtn type="button" onClick={() => handleOpen(pick)}>
                    <FontAwesomeIcon icon={faArrowUpRightFromSquare} />
                    打开
                  </ActionBtn>
                  <ActionBtn
                    type="button"
                    onClick={() => handleSnooze(pick.url)}
                    title="7 天内不再展示"
                  >
                    <FontAwesomeIcon icon={faClock} />
                    下次再说
                  </ActionBtn>
                  <ActionBtn
                    type="button"
                    onClick={() => handleRemove(pick)}
                    title="从收藏中删除"
                  >
                    <FontAwesomeIcon icon={faTrash} />
                    不需要了
                  </ActionBtn>
                </Actions>
              </ItemBottom>
            </Item>
          ))}
        </List>
      )}
    </StyledWidgetCard>
  )
}
