import styled from "@emotion/styled"
import {
  faArrowDown,
  faArrowUp,
  faPlus,
  faTrash,
} from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"

import { Button } from "../../../components/Button"
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

const GroupCard = styled.div`
  border: 2px solid var(--border-default);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
`

const GroupHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
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
`

const LinkRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
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
`

const EmptyHint = styled.p`
  font-size: 0.85rem;
  color: var(--text-muted);
  margin: 0;
`

const moveItem = <T,>(list: T[], from: number, to: number): T[] => {
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

interface LinkGroupEditorProps {
  linkGroups: linkGroup[]
  onChange: (groups: linkGroup[]) => void
}

export const LinkGroupEditor = ({
  linkGroups,
  onChange,
}: LinkGroupEditorProps) => {
  const updateGroup = (index: number, patch: Partial<linkGroup>) => {
    onChange(
      linkGroups.map((group, i) =>
        i === index ? { ...group, ...patch } : group
      )
    )
  }

  const updateLink = (
    groupIndex: number,
    linkIndex: number,
    patch: Partial<{ label: string; value: string }>
  ) => {
    const group = linkGroups[groupIndex]
    updateGroup(groupIndex, {
      links: group.links.map((link, i) =>
        i === linkIndex ? { ...link, ...patch } : link
      ),
    })
  }

  return (
    <EditorContainer>
      {linkGroups.length === 0 && (
        <EmptyHint>还没有分组，点击下方&quot;添加分组&quot;开始。</EmptyHint>
      )}

      {linkGroups.map((group, groupIndex) => (
        <GroupCard key={groupIndex}>
          <GroupHeader>
            <TitleInput
              value={group.title}
              onChange={e => updateGroup(groupIndex, { title: e.target.value })}
              placeholder="分组名称"
              aria-label="分组名称"
            />
            <IconBtn
              type="button"
              aria-label={`上移分组 ${group.title}`}
              title="上移分组"
              disabled={groupIndex === 0}
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
              disabled={groupIndex === linkGroups.length - 1}
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
                if (
                  group.links.length === 0 ||
                  window.confirm(
                    `删除分组"${group.title}"及其 ${group.links.length} 条链接？`
                  )
                ) {
                  onChange(linkGroups.filter((_, i) => i !== groupIndex))
                }
              }}
            >
              <FontAwesomeIcon icon={faTrash} />
            </IconBtn>
          </GroupHeader>

          {group.links.map((link, linkIndex) => (
            <LinkRow key={linkIndex}>
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
                disabled={linkIndex === 0}
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
                disabled={linkIndex === group.links.length - 1}
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

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() =>
              updateGroup(groupIndex, {
                links: [...group.links, { label: "", value: "" }],
              })
            }
          >
            <FontAwesomeIcon icon={faPlus} />
            添加链接
          </Button>
        </GroupCard>
      ))}

      <Button
        type="button"
        variant="secondary"
        onClick={() =>
          onChange([...linkGroups, { title: "新分组", links: [] }])
        }
      >
        <FontAwesomeIcon icon={faPlus} />
        添加分组
      </Button>
    </EditorContainer>
  )
}
