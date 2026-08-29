/* eslint-disable jsx-a11y/no-autofocus */
import React, { useEffect, useMemo, useState } from "react"

import { css, Global } from "@emotion/react"
import {
  faCheck,
  faChevronDown,
  faChevronRight,
  faClock,
  faCog,
  faExternalLinkAlt,
  faPen,
  faPlus,
  faTrash,
} from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"

import { GlobalNotification } from "../components/GlobalNotification"
import { SyncStatusDot } from "../components/SyncStatusDot"
import { linkGroup, links as defaultLinks } from "../data/data"
import { FALLBACK_COLORS, applyColors } from "../base/colorUtils"
import { applyThemeMode } from "../base/theme"
import * as Settings from "../Startpage/Settings/settingsHandler"
import { addLaterRead, isLaterReadUrl } from "../services/readLater"
import { matchSearchText } from "../services/smartSearch"
import {
  ActionBtn,
  AddButton,
  AddIcon,
  Button,
  ButtonRow,
  Card,
  CheckIcon,
  Chip,
  Container,
  GroupContainer,
  GroupHeader,
  GroupHeaderButton,
  GroupIcon,
  GroupMeta,
  GroupTitle,
  Header,
  IconButton,
  Input,
  LinkActions,
  LinkItem,
  LinkLabel,
  LinkList,
  Modal,
  ModalContent,
  ModalSubtitle,
  ModalTitle,
  ResultGroup,
  Scroll,
  SearchBar,
  SearchInput,
  Section,
  SectionHeader,
  SectionTitle,
  Title,
  TitleRow,
  UrlDisplay,
} from "./Popup.styles"

// 存储键 - 与设置页面保持一致
const STORAGE_KEY = "link-groups"
const LAST_GROUP_KEY = "fluidity.popup.lastGroup"

// 获取存储的链接
const getStoredLinks = (): linkGroup[] => {
  try {
    return Settings.Links.getWithFallback()
  } catch {
    return defaultLinks
  }
}

// 保存链接
const saveLinks = (links: linkGroup[]) => {
  Settings.Links.set(links)
}

const globalStyles = css`
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }
  body {
    margin: 0;
    padding: 0;
    background: var(--bg-primary);
  }
`

const getHost = (url: string): string => {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

interface CurrentTab {
  id?: number
  url: string
  title: string
}

type CurrentTabState = CurrentTab | null

const computeSearchScore = (options: {
  query: string
  groupTitle: string
  label: string
  value: string
}): number => {
  const { query, groupTitle, label, value } = options
  const groupScore = matchSearchText(groupTitle, query).score
  const labelScore = matchSearchText(label, query).score
  const urlScore = matchSearchText(value, query).score
  if (groupScore === 0 && labelScore === 0 && urlScore === 0) return -1
  return Math.max(labelScore, urlScore * 0.9, groupScore * 0.75)
}

interface SearchResult {
  group: string
  index: number
  label: string
  value: string
  score: number
}

// 主组件
export const Popup = () => {
  const [links, setLinks] = useState<linkGroup[]>([])
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [currentTab, setCurrentTab] = useState<CurrentTabState>(null)
  const [q, setQ] = useState("")
  const [colors, setColors] = useState<Record<string, string>>(FALLBACK_COLORS)
  const [, refreshLaterRead] = useState(0)

  const [showAddModal, setShowAddModal] = useState(false)
  const [groupName, setGroupName] = useState("")
  const [newLinkName, setNewLinkName] = useState("")

  const [showEditModal, setShowEditModal] = useState(false)
  const [editingLink, setEditingLink] = useState<{
    group: string
    index: number
    label: string
  } | null>(null)

  const [confirmDelete, setConfirmDelete] = useState<{
    group: string
    index: number
    label: string
    url: string
  } | null>(null)


  // 初始化
  useEffect(() => {
    const initialLinks = getStoredLinks()
    setLinks(initialLinks)

    const design = Settings.Design.getWithFallback()
    setColors({ ...FALLBACK_COLORS, ...design.colors })

    const lastGroup = localStorage.getItem(LAST_GROUP_KEY)
    if (lastGroup && initialLinks.some(g => g.title === lastGroup)) {
      setGroupName(lastGroup)
    } else if (initialLinks[0]) {
      setGroupName(initialLinks[0].title)
    }

    // 获取当前标签页
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (typeof chrome !== "undefined" && chrome?.tabs) {
      void chrome.tabs
        .query({ active: true, currentWindow: true })
        .then(tabs => {
          if (tabs.length === 0) return
          const tab = tabs[0]
          setCurrentTab({
            id: tab.id,
            url: tab.url ?? "",
            title: tab.title ?? "",
          })
        })
        .catch(() => undefined)
    }
  }, [])

  // 同步外部变更（跨页面）到 Popup
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setLinks(getStoredLinks())
      if (e.key === "design") {
        const design = Settings.Design.getWithFallback()
        setColors({ ...FALLBACK_COLORS, ...design.colors })
      }
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])

  // 应用颜色与设计风格
  useEffect(() => {
    applyColors(colors)
    applyThemeMode()
  }, [colors])

  // 与主页共用同一套通知组件
  const showToast = (message: string) => {
    window.dispatchEvent(
      new CustomEvent("show-notification", {
        detail: { type: "success", title: message, message: "" },
      })
    )
  }

  const toggleGroup = (title: string) => {
    if (q.trim()) return
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(title)) next.delete(title)
      else next.add(title)
      return next
    })
  }

  const openLink = (url: string, options?: { newTab?: boolean }) => {
    const newTab = options?.newTab ?? false
    if (!url) return
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (typeof chrome === "undefined" || !chrome?.tabs) return

    if (!newTab && currentTab?.id != null) {
      void chrome.tabs.update(currentTab.id, { url }).finally(() => {
        window.close()
      })
      return
    }

    void chrome.tabs.create({ url }).finally(() => {
      window.close()
    })
  }

  const findLink = (url: string): { group: string; index: number } | null => {
    for (const group of links) {
      const index = group.links.findIndex(link => link.value === url)
      if (index !== -1) return { group: group.title, index }
    }
    return null
  }

  const openAddModal = (groupTitle?: string) => {
    if (!currentTab) return
    const preferred = groupTitle ?? groupName
    if (preferred.trim()) setGroupName(preferred.trim())
    else if (links[0]) setGroupName(links[0].title)
    else setGroupName("")
    setNewLinkName(currentTab.title)
    setShowAddModal(true)
  }

  const addCurrentPage = () => {
    if (!currentTab) return
    if (!currentTab.url.trim()) {
      showToast("这个页面暂时无法保存")
      return
    }

    const targetName = groupName.trim()
    if (!targetName) {
      showToast("请输入群组名称")
      return
    }

    const existing = findLink(currentTab.url)
    if (existing) {
      setExpandedGroups(prev => new Set([...Array.from(prev), existing.group]))
      showToast(`已在「${existing.group}」里`)
      setShowAddModal(false)
      return
    }

    const finalLabel =
      newLinkName.trim() || currentTab.title.trim() || getHost(currentTab.url)

    const matchedGroup = links.find(
      g => g.title.trim().toLowerCase() === targetName.toLowerCase()
    )
    const resolvedGroupTitle = matchedGroup?.title ?? targetName

    const nextLinks = matchedGroup
      ? links.map(group => {
          if (group.title !== matchedGroup.title) return group
          return {
            ...group,
            links: [
              ...group.links,
              { label: finalLabel, value: currentTab.url },
            ],
          }
        })
      : [
          ...links,
          {
            title: targetName,
            links: [{ label: finalLabel, value: currentTab.url }],
          },
        ]

    setLinks(nextLinks)
    saveLinks(nextLinks)
    localStorage.setItem(LAST_GROUP_KEY, resolvedGroupTitle)
    setGroupName(resolvedGroupTitle)
    setExpandedGroups(
      prev => new Set([...Array.from(prev), resolvedGroupTitle])
    )
    setShowAddModal(false)
    showToast(`已添加到「${resolvedGroupTitle}」`)
  }

  const saveCurrentPageForLater = () => {
    if (!currentTab) return
    const saved = addLaterRead(currentTab.url, currentTab.title)
    if (!saved) {
      showToast("只能将 HTTP 或 HTTPS 页面加入稍后读")
      return
    }
    refreshLaterRead(version => version + 1)
    showToast("已加入稍后读")
  }

  const openEditModal = (group: string, index: number, label: string) => {
    setEditingLink({ group, index, label })
    setShowEditModal(true)
  }

  const saveEdit = () => {
    if (!editingLink) return
    const label = editingLink.label.trim()
    if (!label) {
      showToast("名字不能为空")
      return
    }

    const nextLinks = links.map(group => {
      if (group.title !== editingLink.group) return group
      const groupLinks = [...group.links]
      groupLinks[editingLink.index] = {
        ...groupLinks[editingLink.index],
        label,
      }
      return { ...group, links: groupLinks }
    })

    setLinks(nextLinks)
    saveLinks(nextLinks)
    setShowEditModal(false)
    showToast("已保存")
  }

  const deleteLink = (groupTitle: string, index: number) => {
    const nextLinks = links.map(group => {
      if (group.title !== groupTitle) return group
      const groupLinks = [...group.links]
      groupLinks.splice(index, 1)
      return { ...group, links: groupLinks }
    })
    setLinks(nextLinks)
    saveLinks(nextLinks)
    showToast("已删除")
  }

  const openSettings = (panel?: "data") => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (typeof chrome === "undefined" || !chrome?.tabs || !chrome?.runtime) {
      return
    }
    const target = panel === "data" ? "index.html?settings=data" : "index.html"
    void chrome.tabs.create({ url: chrome.runtime.getURL(target) })
  }

  useEffect(() => {
    const hasModal = showAddModal || showEditModal || Boolean(confirmDelete)
    if (!hasModal) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowAddModal(false)
        setShowEditModal(false)
        setConfirmDelete(null)
        return
      }
      if (e.key !== "Tab") return
      const dialog = document.querySelector<HTMLElement>(
        '[role="dialog"][aria-modal="true"]'
      )
      if (!dialog) return
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
        )
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      } else if (!dialog.contains(document.activeElement)) {
        e.preventDefault()
        ;(e.shiftKey ? last : first).focus()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [confirmDelete, showAddModal, showEditModal])

  const currentPageAdded = currentTab ? findLink(currentTab.url) : null
  const currentPageLaterRead = currentTab
    ? isLaterReadUrl(currentTab.url)
    : false
  const handleLaterReadAction = () => {
    if (currentPageLaterRead) {
      showToast("已经在稍后读中")
      return
    }
    saveCurrentPageForLater()
  }

  const filteredGroups = useMemo(() => {
    const query = q.trim()
    if (!query) return links
    return links
      .map(group => {
        const titleMatches = matchSearchText(group.title, query).score > 0
        const matchingLinks = group.links.filter(
          l =>
            matchSearchText(l.label, query).score > 0 ||
            matchSearchText(l.value, query).score > 0
        )
        if (titleMatches) return group
        if (matchingLinks.length === 0) return null
        return { ...group, links: matchingLinks }
      })
      .filter(Boolean) as linkGroup[]
  }, [links, q])

  const searchResults = useMemo((): SearchResult[] => {
    const query = q.trim()
    if (!query) return []

    const results: SearchResult[] = []

    for (const group of links) {
      const groupTitle = group.title
      for (let index = 0; index < group.links.length; index += 1) {
        const link = group.links[index]
        const score = computeSearchScore({
          query,
          groupTitle,
          label: link.label,
          value: link.value,
        })
        if (score < 0) continue
        results.push({
          group: groupTitle,
          index,
          label: link.label,
          value: link.value,
          score,
        })
      }
    }

    return results
      .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
      .slice(0, 80)
  }, [links, q])

  return (
    <>
      <Global styles={globalStyles} />
      <Container>
        <Header>
          <TitleRow>
            <SyncStatusDot
              onClick={() => openSettings("data")}
              label="打开云同步设置"
            />
            <Title>拾光</Title>
          </TitleRow>
          <IconButton
            type="button"
            onClick={() => openSettings()}
            title="打开设置"
            aria-label="打开设置"
          >
            <FontAwesomeIcon icon={faCog} />
          </IconButton>
        </Header>

        <SearchBar>
          <SearchInput
            value={q}
            onChange={e => setQ(e.target.value)}
            aria-label="搜索链接或群组"
            placeholder="搜索链接或群组"
          />
        </SearchBar>

        <Scroll>
          {currentTab && (
            <Section>
              <Card>
                <GroupHeaderButton
                  type="button"
                  onClick={() => {
                    if (currentPageAdded) {
                      setExpandedGroups(
                        prev =>
                          new Set([...Array.from(prev), currentPageAdded.group])
                      )
                      showToast(`已在「${currentPageAdded.group}」里`)
                      return
                    }
                    openAddModal()
                  }}
                >
                  <GroupIcon>
                    <FontAwesomeIcon
                      icon={currentPageAdded ? faCheck : faPlus}
                    />
                  </GroupIcon>
                  <GroupTitle>{currentTab.title || "保存当前页面"}</GroupTitle>
                  <GroupMeta>{getHost(currentTab.url)}</GroupMeta>
                </GroupHeaderButton>
                <GroupHeaderButton
                  type="button"
                  onClick={handleLaterReadAction}
                >
                  <GroupIcon>
                    <FontAwesomeIcon
                      icon={currentPageLaterRead ? faCheck : faClock}
                    />
                  </GroupIcon>
                  <GroupTitle>
                    {currentPageLaterRead ? "已加入稍后读" : "稍后读"}
                  </GroupTitle>
                  <GroupMeta>不必现在决定收藏到哪里</GroupMeta>
                </GroupHeaderButton>
              </Card>
            </Section>
          )}

          {q.trim() ? (
            <Section>
              <SectionHeader>
                <SectionTitle>搜索结果</SectionTitle>
                <Chip>{searchResults.length}</Chip>
              </SectionHeader>
              <Card>
                {searchResults.length === 0 && (
                  <GroupHeader>
                    <GroupIcon>
                      <FontAwesomeIcon icon={faChevronRight} />
                    </GroupIcon>
                    <GroupTitle>没有匹配的结果</GroupTitle>
                    <GroupMeta>换个关键词试试</GroupMeta>
                  </GroupHeader>
                )}
                {searchResults.map(result => {
                  const isCurrentPage = currentTab?.url === result.value
                  return (
                    <GroupContainer
                      key={`${result.group}:${result.index}:${result.value}`}
                    >
                      <LinkItem isAdded={isCurrentPage}>
                        {isCurrentPage && (
                          <CheckIcon>
                            <FontAwesomeIcon icon={faCheck} />
                          </CheckIcon>
                        )}
                        <LinkLabel
                          type="button"
                          onClick={() => openLink(result.value)}
                        >
                          {result.label}
                        </LinkLabel>
                        <ResultGroup title={result.group}>
                          {result.group}
                        </ResultGroup>
                        <LinkActions>
                          <ActionBtn
                            type="button"
                            aria-label={`重命名 ${result.label}`}
                            onClick={e => {
                              e.stopPropagation()
                              openEditModal(
                                result.group,
                                result.index,
                                result.label
                              )
                            }}
                            title="重命名"
                          >
                            <FontAwesomeIcon icon={faPen} />
                          </ActionBtn>
                          <ActionBtn
                            type="button"
                            aria-label={`删除 ${result.label}`}
                            danger
                            onClick={e => {
                              e.stopPropagation()
                              setConfirmDelete({
                                group: result.group,
                                index: result.index,
                                label: result.label,
                                url: result.value,
                              })
                            }}
                            title="删除"
                          >
                            <FontAwesomeIcon icon={faTrash} />
                          </ActionBtn>
                          <ActionBtn
                            type="button"
                            aria-label={`在新标签页打开 ${result.label}`}
                            onClick={e => {
                              e.stopPropagation()
                              openLink(result.value, { newTab: true })
                            }}
                            title="在新标签页打开"
                          >
                            <FontAwesomeIcon icon={faExternalLinkAlt} />
                          </ActionBtn>
                        </LinkActions>
                      </LinkItem>
                    </GroupContainer>
                  )
                })}
              </Card>
            </Section>
          ) : (
            <Section>
              <SectionHeader>
                <SectionTitle>群组</SectionTitle>
                <Chip>{filteredGroups.length}</Chip>
              </SectionHeader>

              <Card>
                {filteredGroups.length === 0 && (
                  <GroupHeaderButton
                    type="button"
                    onClick={() => openAddModal()}
                  >
                    <GroupIcon>
                      <FontAwesomeIcon icon={faPlus} />
                    </GroupIcon>
                    <GroupTitle>新建一个群组</GroupTitle>
                    <GroupMeta>从这里开始整理</GroupMeta>
                  </GroupHeaderButton>
                )}

                {filteredGroups.map((group, groupIndex) => {
                  const isExpanded = expandedGroups.has(group.title)
                  const listId = `popup-group-${groupIndex}`
                  return (
                    <GroupContainer key={`${group.title}-${groupIndex}`}>
                      <GroupHeaderButton
                        type="button"
                        aria-expanded={isExpanded}
                        aria-controls={listId}
                        onClick={() => toggleGroup(group.title)}
                      >
                        <GroupIcon>
                          <FontAwesomeIcon
                            icon={isExpanded ? faChevronDown : faChevronRight}
                          />
                        </GroupIcon>
                        <GroupTitle>{group.title}</GroupTitle>
                        <GroupMeta>{group.links.length}</GroupMeta>
                      </GroupHeaderButton>

                      <LinkList id={listId} expanded={isExpanded}>
                        {group.links.map((link, index) => {
                          const isCurrentPage = currentTab?.url === link.value
                          return (
                            <LinkItem key={link.value} isAdded={isCurrentPage}>
                              {isCurrentPage && (
                                <CheckIcon>
                                  <FontAwesomeIcon icon={faCheck} />
                                </CheckIcon>
                              )}
                              <LinkLabel
                                type="button"
                                onClick={() => openLink(link.value)}
                              >
                                {link.label}
                              </LinkLabel>
                              <LinkActions>
                                <ActionBtn
                                  type="button"
                                  aria-label={`重命名 ${link.label}`}
                                  onClick={e => {
                                    e.stopPropagation()
                                    openEditModal(
                                      group.title,
                                      index,
                                      link.label
                                    )
                                  }}
                                  title="重命名"
                                >
                                  <FontAwesomeIcon icon={faPen} />
                                </ActionBtn>
                                <ActionBtn
                                  type="button"
                                  aria-label={`删除 ${link.label}`}
                                  danger
                                  onClick={e => {
                                    e.stopPropagation()
                                    setConfirmDelete({
                                      group: group.title,
                                      index,
                                      label: link.label,
                                      url: link.value,
                                    })
                                  }}
                                  title="删除"
                                >
                                  <FontAwesomeIcon icon={faTrash} />
                                </ActionBtn>
                                <ActionBtn
                                  type="button"
                                  aria-label={`在新标签页打开 ${link.label}`}
                                  onClick={e => {
                                    e.stopPropagation()
                                    openLink(link.value, { newTab: true })
                                  }}
                                  title="在新标签页打开"
                                >
                                  <FontAwesomeIcon icon={faExternalLinkAlt} />
                                </ActionBtn>
                              </LinkActions>
                            </LinkItem>
                          )
                        })}

                        {currentTab && !currentPageAdded && (
                          <AddButton
                            type="button"
                            onClick={() => openAddModal(group.title)}
                          >
                            <AddIcon>
                              <FontAwesomeIcon icon={faPlus} />
                            </AddIcon>
                            添加当前页面到这里
                          </AddButton>
                        )}
                      </LinkList>
                    </GroupContainer>
                  )
                })}

                {currentTab && !currentPageAdded && (
                  <GroupContainer key="__new_group">
                    <AddButton type="button" onClick={() => openAddModal()}>
                      <AddIcon>
                        <FontAwesomeIcon icon={faPlus} />
                      </AddIcon>
                      新建群组并保存当前页面
                    </AddButton>
                  </GroupContainer>
                )}
              </Card>
            </Section>
          )}
        </Scroll>

        {showAddModal && currentTab && (
          <Modal onClick={() => setShowAddModal(false)}>
            <ModalContent
              role="dialog"
              aria-modal="true"
              aria-labelledby="popup-add-title"
              onClick={e => e.stopPropagation()}
            >
              <ModalTitle id="popup-add-title">保存当前页面</ModalTitle>
              <ModalSubtitle>
                选择一个群组，并给它一个更好记的名字。
              </ModalSubtitle>
              <Input
                list="popup-group-options"
                value={groupName}
                onChange={e => setGroupName(e.target.value)}
                aria-label="群组名称"
                placeholder="群组名称（可直接输入新群组）"
                autoFocus
              />
              <datalist id="popup-group-options">
                {links.map(group => (
                  <option key={group.title} value={group.title} />
                ))}
              </datalist>
              <Input
                value={newLinkName}
                onChange={e => setNewLinkName(e.target.value)}
                aria-label="链接名称"
                placeholder="链接名称"
              />
              <UrlDisplay>{currentTab.url}</UrlDisplay>
              <ButtonRow>
                <Button onClick={() => setShowAddModal(false)}>取消</Button>
                <Button primary onClick={addCurrentPage}>
                  添加
                </Button>
              </ButtonRow>
            </ModalContent>
          </Modal>
        )}

        {showEditModal && editingLink && (
          <Modal onClick={() => setShowEditModal(false)}>
            <ModalContent
              role="dialog"
              aria-modal="true"
              aria-labelledby="popup-edit-title"
              onClick={e => e.stopPropagation()}
            >
              <ModalTitle id="popup-edit-title">重命名链接</ModalTitle>
              <ModalSubtitle>名字短一点，会更干净。</ModalSubtitle>
              <Input
                value={editingLink.label}
                onChange={e =>
                  setEditingLink({ ...editingLink, label: e.target.value })
                }
                aria-label="链接名称"
                placeholder="链接名称"
                autoFocus
              />
              <ButtonRow>
                <Button onClick={() => setShowEditModal(false)}>取消</Button>
                <Button primary onClick={saveEdit}>
                  保存
                </Button>
              </ButtonRow>
            </ModalContent>
          </Modal>
        )}

        {confirmDelete && (
          <Modal onClick={() => setConfirmDelete(null)}>
            <ModalContent
              role="dialog"
              aria-modal="true"
              aria-labelledby="popup-delete-title"
              onClick={e => e.stopPropagation()}
            >
              <ModalTitle id="popup-delete-title">删除这个链接？</ModalTitle>
              <ModalSubtitle>
                它将从「{confirmDelete.group}」移除。你可以稍后重新添加。
              </ModalSubtitle>
              <UrlDisplay>{confirmDelete.url}</UrlDisplay>
              <ButtonRow>
                <Button autoFocus onClick={() => setConfirmDelete(null)}>
                  取消
                </Button>
                <Button
                  danger
                  onClick={() => {
                    deleteLink(confirmDelete.group, confirmDelete.index)
                    setConfirmDelete(null)
                  }}
                >
                  删除
                </Button>
              </ButtonRow>
            </ModalContent>
          </Modal>
        )}

        <GlobalNotification />
      </Container>
    </>
  )
}
