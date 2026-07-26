import { useCallback, useMemo, useState } from "react"

import styled from "@emotion/styled"
import { faThumbtack } from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"

import { Favicon } from "../../../components/Favicon"
import { linkGroup } from "../../../data/data"
import { LinkAnalytics } from "../../../services/analytics"
import {
  getPinnedUrls,
  rankLinkTiers,
  togglePinnedUrl,
} from "../../../services/frecency"
import { navigateToLink } from "../../../services/linkSearch"

/**
 * 智能网格：frecency 两档展示。
 * 常用档（置顶 + 最近高频）用大卡片，其余按分组收纳成小格子；
 * 两档共用同一网格节奏，档位差异引导注意力，网格对齐保证整齐。
 */

const Container = styled.div`
  animation: fade-up 0.55s cubic-bezier(0.22, 1, 0.36, 1) 80ms both;
  flex: 1 1 420px;
  min-width: 0;
  max-width: 900px;
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 8px 0;
`

const TierLabel = styled.div`
  font-size: 0.78rem;
  letter-spacing: 2px;
  color: var(--text-muted);
  margin-bottom: 8px;
`

const FrequentGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
`

const CardBase = styled.button`
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--surface-border);
  background: var(--surface-bg);
  backdrop-filter: var(--surface-blur);
  -webkit-backdrop-filter: var(--surface-blur);
  color: var(--text-primary);
  cursor: pointer;
  transition:
    border-color var(--transition-fast),
    background var(--transition-fast),
    transform var(--transition-fast);
  text-align: left;
  min-width: 0;
  border-radius: var(--radius-sm);

  :hover {
    border-color: color-mix(in srgb, var(--accent) 45%, transparent);
    background: var(--surface-bg-hover);
    transform: var(--hover-transform);
  }

  :active {
    transform: scale(0.985);
  }

  :focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
`

const FrequentCard = styled(CardBase)`
  padding: 16px 14px;
  font-size: 0.95rem;
  font-weight: 600;
`

const CompactCell = styled(CardBase)`
  padding: 7px 10px;
  font-size: 0.82rem;
  background: transparent;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  box-shadow: none;
`

const CardName = styled.span`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const PinButton = styled.button<{ pinned: boolean }>`
  position: absolute;
  top: 4px;
  right: 4px;
  border: none;
  background: transparent;
  color: ${({ pinned }) => (pinned ? "var(--accent)" : "var(--text-muted)")};
  cursor: pointer;
  padding: 4px;
  font-size: 0.7rem;
  opacity: ${({ pinned }) => (pinned ? 1 : 0)};
  transition: 0.2s;

  ${CardBase}:hover &,
  :focus-visible {
    opacity: 1;
  }

  :hover {
    color: var(--accent);
  }
`

const GroupSection = styled.div`
  margin-bottom: 14px;
`

const GroupTitle = styled.div`
  font-size: 0.82rem;
  color: var(--text-secondary);
  margin-bottom: 6px;
`

const CompactGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 8px;
`

interface GridLinksProps {
  linkGroups: linkGroup[]
}

export const GridLinks = ({ linkGroups }: GridLinksProps) => {
  const [pins, setPins] = useState<Set<string>>(() => getPinnedUrls())

  const tiers = useMemo(
    () => rankLinkTiers(linkGroups, LinkAnalytics.get(), pins, Date.now()),
    [linkGroups, pins]
  )

  const handleTogglePin = useCallback((url: string) => {
    setPins(new Set(togglePinnedUrl(url)))
  }, [])

  const open = useCallback(
    (url: string, label: string, groupTitle: string) =>
      navigateToLink(url, label, groupTitle),
    []
  )

  return (
    <Container>
      {tiers.frequent.length > 0 && (
        <div>
          <TierLabel>常用</TierLabel>
          <FrequentGrid>
            {tiers.frequent.map(link => (
              <FrequentCard
                key={link.url}
                type="button"
                title={link.url}
                onClick={() => open(link.url, link.label, link.groupTitle)}
              >
                <Favicon url={link.url} icon={link.icon} size={20} />
                <CardName>{link.label}</CardName>
                <PinButton
                  as="span"
                  role="button"
                  tabIndex={0}
                  pinned={link.pinned}
                  aria-label={link.pinned ? "取消置顶" : "置顶"}
                  title={link.pinned ? "取消置顶" : "置顶"}
                  onClick={e => {
                    e.stopPropagation()
                    handleTogglePin(link.url)
                  }}
                  onKeyDown={e => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      e.stopPropagation()
                      handleTogglePin(link.url)
                    }
                  }}
                >
                  <FontAwesomeIcon icon={faThumbtack} />
                </PinButton>
              </FrequentCard>
            ))}
          </FrequentGrid>
        </div>
      )}

      <div>
        {tiers.frequent.length > 0 && <TierLabel>收藏</TierLabel>}
        {tiers.rest.map(group => (
          <GroupSection key={group.title}>
            <GroupTitle>{group.title}</GroupTitle>
            <CompactGrid>
              {group.links.map(link => (
                <CompactCell
                  key={`${group.title}-${link.value}`}
                  type="button"
                  title={link.value}
                  onClick={() => open(link.value, link.label, group.title)}
                >
                  <Favicon url={link.value} icon={link.icon} size={14} />
                  <CardName>{link.label}</CardName>
                  <PinButton
                    as="span"
                    role="button"
                    tabIndex={0}
                    pinned={false}
                    aria-label="置顶"
                    title="置顶到常用"
                    onClick={e => {
                      e.stopPropagation()
                      handleTogglePin(link.value)
                    }}
                    onKeyDown={e => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        e.stopPropagation()
                        handleTogglePin(link.value)
                      }
                    }}
                  >
                    <FontAwesomeIcon icon={faThumbtack} />
                  </PinButton>
                </CompactCell>
              ))}
            </CompactGrid>
          </GroupSection>
        ))}
      </div>
    </Container>
  )
}
