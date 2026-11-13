import { useMemo, useRef, useState } from "react"

import styled from "@emotion/styled"
import {
  faArrowDown,
  faArrowUp,
  faChevronDown,
  faChevronRight,
  faMagnifyingGlass,
  faPlus,
  faTrash,
} from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"

import { Button } from "../../../components/Button"
import { Modal } from "../../../components/Modal"
import { linkGroup } from "../../../data/data"

/**
 * 结构化链接编辑器：分组卡片 + 链接行，
 * 所有修改通过 onChange 汇入父级草稿，点"应用更改"才落盘。
 */

const EditorContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`

const EditorToolbar = styled.div`
  position: sticky;
  top: 0;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--bg-primary) 94%, transparent);
  backdrop-filter: var(--surface-blur);
`

const FilterField = styled.label`
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-muted);
`

const FilterInput = styled.input`
  width: 100%;
  min-width: 0;
  padding: 8px 10px;
  border: 0;
  background: transparent;
  color: var(--text-primary);
  font: inherit;

  :focus {
    outline: none;
  }
`

const ResultCount = styled.span`
  flex: 0 0 auto;
  color: var(--text-muted);
  font-size: 0.75rem;
`

const GroupCard = styled.div`
  border: 1px solid var(--surface-border);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-radius: var(--radius-sm);
  content-visibility: auto;
  contain-intrinsic-size: auto 180px;
`

const GroupHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`

const CollapseButton = styled.button`
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;

  :hover,
  :focus-visible {
    color: var(--accent);
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

  @media (pointer: coarse) {
    width: 40px;
    height: 40px;
  }
`

const GroupCount = styled.span`
  flex: 0 0 auto;
  color: var(--text-muted);
  font-size: 0.72rem;
`

const TitleInput = styled.input`
  flex: 1;
  min-width: 0;
  padding: 8px 10px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-default);
  color: var(--text-primary);
  font-size: 0.95rem;
  font-weight: 600;

  :focus {
    outline: none;
    border-color: var(--accent);
  }

  @media (pointer: coarse) {
    min-height: 40px;
  }
`

const LinkRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  content-visibility: auto;
  contain-intrinsic-size: auto 38px;

  @media (max-width: 720px) {
    display: grid;
    grid-template-columns: 1fr 1fr auto auto auto;
  }
`

const LinkInput = styled.input<{ grow?: number }>`
  flex: ${({ grow }) => grow ?? 1};
  min-width: 0;
  padding: 6px 10px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-default);
  color: var(--text-primary);
  font-size: 0.85rem;

  :focus {
    outline: none;
    border-color: var(--accent);
  }

  ::placeholder {
    color: var(--text-muted);
  }

  @media (pointer: coarse) {
    min-height: 40px;
  }
`

const IconBtn = styled.button`
  flex: 0 0 auto;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid var(--border-default);
  color: var(--text-primary);
  cursor: pointer;
  transition: 0.2s;

  :hover:not(:disabled) {
    border-color: var(--accent);
    color: var(--accent);
  }

  :disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  :focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  @media (pointer: coarse) {
    width: 40px;
    height: 40px;
  }
`

const EmptyHint = styled.p`
  font-size: 0.85rem;
  color: var(--text-muted);
  margin: 0;
`

const ConfirmPanel = styled.div`
  position: fixed;
  top: 50%;
  left: 50%;
  width: min(420px, calc(100vw - 32px));
  transform: translate(-50%, -50%);
  padding: 22px;
  border: 1px solid var(--surface-border-strong);
  border-radius: var(--radius-main);
  background: var(--bg-primary);
  box-shadow: var(--shadow-pop);
  color: var(--text-primary);

  h3,
  p {
    margin: 0;
  }

  p {
    margin-top: 10px;
    color: var(--text-secondary);
    line-height: 1.6;
  }
`

const ConfirmActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
`

const moveItem = <T,>(list: T[], from: number, to: number): T[] => {
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

const useStableEditorKeys = () => {
  const keysRef = useRef(new WeakMap<object, string>())
  const nextKeyRef = useRef(1)

  const getKey = (value: object, prefix: "group" | "link"): string => {
    const existing = keysRef.current.get(value)
    if (existing) return existing
    const key = `${prefix}-${nextKeyRef.current++}`
    keysRef.current.set(value, key)
    return key
  }

  const transferKey = (previous: object, next: object): void => {
    const key = keysRef.current.get(previous)
    if (key) keysRef.current.set(next, key)
  }

  return { getKey, transferKey }
}

interface LinkGroupEditorProps {
  linkGroups: linkGroup[]
  onChange: (groups: linkGroup[]) => void
}

export const LinkGroupEditor = ({
  linkGroups,
  onChange,
}: LinkGroupEditorProps) => {
  const [query, setQuery] = useState("")
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set()
  )
  const [pendingDeleteGroup, setPendingDeleteGroup] = useState<string | null>(
    null
  )
  const { getKey, transferKey } = useStableEditorKeys()
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const isFiltering = Boolean(normalizedQuery)
  const visibleGroups = useMemo(
    () =>
      linkGroups.flatMap((group, groupIndex) => {
        const groupMatches = group.title
          .toLocaleLowerCase()
          .includes(normalizedQuery)
        const links = group.links.flatMap((link, linkIndex) =>
          !normalizedQuery ||
          groupMatches ||
          `${link.label}\n${link.value}`
            .toLocaleLowerCase()
            .includes(normalizedQuery)
            ? [{ link, linkIndex }]
            : []
        )
        return !normalizedQuery || groupMatches || links.length > 0
          ? [{ group, groupIndex, links }]
          : []
      }),
    [linkGroups, normalizedQuery]
  )
  const visibleLinkCount = visibleGroups.reduce(
    (total, group) => total + group.links.length,
    0
  )

  const updateGroup = (index: number, patch: Partial<linkGroup>) => {
    const previous = linkGroups[index]
    const next = { ...previous, ...patch }
    transferKey(previous, next)
    onChange(linkGroups.map((group, i) => (i === index ? next : group)))
  }

  const updateLink = (
    groupIndex: number,
    linkIndex: number,
    patch: Partial<{ label: string; value: string }>
  ) => {
    const group = linkGroups[groupIndex]
    const previous = group.links[linkIndex]
    const next = { ...previous, ...patch }
    transferKey(previous, next)
    updateGroup(groupIndex, {
      links: group.links.map((link, i) =>
        i === linkIndex ? next : link
      ),
    })
  }

  const pendingDeleteGroupIndex =
    pendingDeleteGroup === null
      ? -1
      : linkGroups.findIndex(
          group => getKey(group, "group") === pendingDeleteGroup
        )

  return (
    <EditorContainer>
      {linkGroups.length > 0 && (
        <EditorToolbar>
          <FilterField>
            <FontAwesomeIcon icon={faMagnifyingGlass} aria-hidden />
            <FilterInput
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="筛选分组、名称或网址"
              aria-label="筛选链接"
            />
          </FilterField>
          <ResultCount aria-live="polite">
            {normalizedQuery
              ? `${visibleGroups.length} 组 · ${visibleLinkCount} 条`
              : `${linkGroups.length} 组 · ${linkGroups.reduce((sum, group) => sum + group.links.length, 0)} 条`}
          </ResultCount>
        </EditorToolbar>
      )}
      {linkGroups.length === 0 && (
        <EmptyHint>还没有分组，点击下方&quot;添加分组&quot;开始。</EmptyHint>
      )}

      {linkGroups.length > 0 && visibleGroups.length === 0 && (
        <EmptyHint>没有匹配的分组或链接。</EmptyHint>
      )}

      {visibleGroups.map(({ group, groupIndex, links }) => {
        const groupKey = getKey(group, "group")
        return (
        <GroupCard key={groupKey}>
          <GroupHeader>
            <CollapseButton
              type="button"
              aria-label={`${!isFiltering && collapsedGroups.has(groupKey) ? "展开" : "收起"}分组 ${group.title}`}
              aria-expanded={
                isFiltering ? true : !collapsedGroups.has(groupKey)
              }
              disabled={isFiltering}
              onClick={() =>
                setCollapsedGroups(current => {
                  const next = new Set(current)
                  if (next.has(groupKey)) next.delete(groupKey)
                  else next.add(groupKey)
                  return next
                })
              }
            >
              <FontAwesomeIcon
                icon={
                  isFiltering || !collapsedGroups.has(groupKey)
                    ? faChevronDown
                    : faChevronRight
                }
              />
            </CollapseButton>
            <TitleInput
              value={group.title}
              onChange={e => updateGroup(groupIndex, { title: e.target.value })}
              placeholder="分组名称"
              aria-label="分组名称"
            />
            <GroupCount>{group.links.length} 条</GroupCount>
            <IconBtn
              type="button"
              aria-label={`上移分组 ${group.title}`}
              title="上移分组"
              disabled={isFiltering || groupIndex === 0}
              onClick={() =>
                onChange(moveItem(linkGroups, groupIndex, groupIndex - 1))
              }
            >
              <FontAwesomeIcon icon={faArrowUp} />
            </IconBtn>
            <IconBtn
              type="button"
              aria-label={`下移分组 ${group.title}`}
              title="下移分组"
              disabled={isFiltering || groupIndex === linkGroups.length - 1}
              onClick={() =>
                onChange(moveItem(linkGroups, groupIndex, groupIndex + 1))
              }
            >
              <FontAwesomeIcon icon={faArrowDown} />
            </IconBtn>
            <IconBtn
              type="button"
              aria-label={`删除分组 ${group.title}`}
              title="删除分组"
              onClick={() => {
                if (group.links.length === 0) {
                  onChange(linkGroups.filter((_, i) => i !== groupIndex))
                  return
                }
                setPendingDeleteGroup(groupKey)
              }}
            >
              <FontAwesomeIcon icon={faTrash} />
            </IconBtn>
          </GroupHeader>

          {(isFiltering || !collapsedGroups.has(groupKey)) &&
            links.map(({ link, linkIndex }) => (
            <LinkRow key={getKey(link, "link")}>
              <LinkInput
                value={link.label}
                onChange={e =>
                  updateLink(groupIndex, linkIndex, { label: e.target.value })
                }
                placeholder="名称"
                aria-label="链接名称"
              />
              <LinkInput
                grow={2}
                value={link.value}
                onChange={e =>
                  updateLink(groupIndex, linkIndex, { value: e.target.value })
                }
                placeholder="https://..."
                aria-label="链接地址"
              />
              <IconBtn
                type="button"
                aria-label={`上移链接 ${link.label}`}
                title="上移"
                disabled={isFiltering || linkIndex === 0}
                onClick={() =>
                  updateGroup(groupIndex, {
                    links: moveItem(group.links, linkIndex, linkIndex - 1),
                  })
                }
              >
                <FontAwesomeIcon icon={faArrowUp} />
              </IconBtn>
              <IconBtn
                type="button"
                aria-label={`下移链接 ${link.label}`}
                title="下移"
                disabled={isFiltering || linkIndex === group.links.length - 1}
                onClick={() =>
                  updateGroup(groupIndex, {
                    links: moveItem(group.links, linkIndex, linkIndex + 1),
                  })
                }
              >
                <FontAwesomeIcon icon={faArrowDown} />
              </IconBtn>
              <IconBtn
                type="button"
                aria-label={`删除链接 ${link.label}`}
                title="删除链接"
                onClick={() =>
                  updateGroup(groupIndex, {
                    links: group.links.filter((_, i) => i !== linkIndex),
                  })
                }
              >
                <FontAwesomeIcon icon={faTrash} />
              </IconBtn>
            </LinkRow>
            ))}

          {(isFiltering || !collapsedGroups.has(groupKey)) && (
            <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setQuery("")
              setCollapsedGroups(current => {
                const next = new Set(current)
                next.delete(groupKey)
                return next
              })
              updateGroup(groupIndex, {
                links: [...group.links, { label: "", value: "" }],
              })
            }}
          >
            <FontAwesomeIcon icon={faPlus} />
            添加链接
            </Button>
          )}
        </GroupCard>
        )
      })}

      <Button
        type="button"
        variant="secondary"
        onClick={() => {
          setQuery("")
          onChange([...linkGroups, { title: "新分组", links: [] }])
        }}
      >
        <FontAwesomeIcon icon={faPlus} />
        添加分组
      </Button>

      {pendingDeleteGroupIndex >= 0 && (
        <Modal
          label="确认删除分组"
          overlay="dark"
          onClose={() => setPendingDeleteGroup(null)}
        >
          <ConfirmPanel>
            <h3>删除“{linkGroups[pendingDeleteGroupIndex].title}”？</h3>
            <p>
              该分组中的 {linkGroups[pendingDeleteGroupIndex].links.length} 条链接会从当前草稿移除。应用更改前仍可放弃本次修改。
            </p>
            <ConfirmActions>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setPendingDeleteGroup(null)}
              >
                取消
              </Button>
              <Button
                type="button"
                size="sm"
                variant="danger"
                onClick={() => {
                  onChange(
                    linkGroups.filter((_, index) => index !== pendingDeleteGroupIndex)
                  )
                  setPendingDeleteGroup(null)
                  setCollapsedGroups(new Set())
                }}
              >
                删除分组
              </Button>
            </ConfirmActions>
          </ConfirmPanel>
        </Modal>
      )}
    </EditorContainer>
  )
}
