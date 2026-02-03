/* eslint-disable jsx-a11y/no-autofocus */
import React, { useEffect, useMemo, useRef, useState } from "react"

import { css, Global } from "@emotion/react"
import styled from "@emotion/styled"
import {
  faCheck,
  faChevronDown,
  faChevronRight,
  faCog,
  faExternalLinkAlt,
  faPen,
  faPlus,
  faTrash,
} from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"

import { SyncStatusDot } from "../components/SyncStatusDot"
import { linkGroup, links as defaultLinks } from "../data/data"
import * as Settings from "../Startpage/Settings/settingsHandler"

// 存储键 - 与设置页面保持一致
const STORAGE_KEY = "link-groups"
const LAST_GROUP_KEY = "fluidity.popup.lastGroup"

// 颜色变量别名映射（新变量名 -> 旧变量名）
const COLOR_ALIASES: Record<string, string> = {
  "--bg-primary": "--bg-color",
  "--text-primary": "--default-color",
  "--text-secondary": "--secondary-color",
  "--border-default": "--border-color",
  "--accent": "--accent-color",
  "--accent-hover": "--accent-color2",
}

// Apple-ish base palette fallback (used when theme isn't configured)
const FALLBACK_COLORS: Record<string, string> = {
  "--bg-primary": "#121215",
  "--bg-secondary": "#1a1a20",
  "--bg-hover": "#23232b",
  "--text-primary": "#f3f4f6",
  "--text-secondary": "#cbd5e1",
  "--border-default": "rgba(255,255,255,0.10)",
  "--accent": "#8ab4ff",
  "--accent-hover": "#a7c4ff",
}

const applyColors = (colors: Record<string, string>): void => {
  const root = document.documentElement
  Object.entries(colors).forEach(([key, value]) => {
    root.style.setProperty(key, value)
    const alias = COLOR_ALIASES[key]
    if (alias) root.style.setProperty(alias, value)
  })
}

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

// 样式组件
const Container = styled.div`
  width: 380px;
  max-height: 600px;
  overflow: hidden;
  background: var(--bg-primary, var(--bg-color));
  color: var(--text-primary, var(--default-color));
  font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "SF Pro Text",
    "SF Pro Display", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  font-size: 13px;
  letter-spacing: 0.2px;
`

const Scroll = styled.div`
  max-height: 600px;
  overflow-y: auto;
  padding: 10px 12px 12px 12px;

  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  &::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.18);
    border-radius: 999px;
  }
`

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-default, rgba(255, 255, 255, 0.1));
  position: sticky;
  top: 0;
  background: rgba(0, 0, 0, 0.18);
  backdrop-filter: blur(14px);
  z-index: 10;
`

const TitleRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`

const Title = styled.h1`
  font-size: 13px;
  font-weight: 650;
  margin: 0;
  color: var(--text-primary, var(--default-color));
`

const IconButton = styled.button`
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: transparent;
  border: none;
  color: var(--text-secondary, var(--default-color));
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: 0.2s;

  &:hover {
    background: rgba(255, 255, 255, 0.06);
    color: var(--text-primary, var(--default-color));
  }

  &:active {
    transform: translateY(0.5px);
  }
`

const SearchBar = styled.div`
  padding: 8px 12px 0 12px;
`

const SearchInput = styled.input`
  width: 100%;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--border-default, rgba(255, 255, 255, 0.12));
  color: var(--text-primary, var(--default-color));
  font-size: 13px;

  &::placeholder {
    color: var(--text-secondary, rgba(255, 255, 255, 0.6));
  }

  &:focus {
    outline: none;
    border-color: rgba(138, 180, 255, 0.55);
    box-shadow: 0 0 0 3px rgba(138, 180, 255, 0.18);
  }
`

const Section = styled.div`
  margin-top: 10px;
`

const SectionHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 4px 8px 4px;
  color: var(--text-secondary, rgba(255, 255, 255, 0.65));
  font-size: 12px;
`

const SectionTitle = styled.span`
  font-weight: 600;
`

const Chip = styled.span`
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--border-default, rgba(255, 255, 255, 0.12));
  font-size: 11px;
`

const Card = styled.div`
  border-radius: 14px;
  border: 1px solid var(--border-default, rgba(255, 255, 255, 0.12));
  background: rgba(255, 255, 255, 0.04);
  overflow: hidden;
`

const GroupContainer = styled.div`
  border-top: 1px solid var(--border-default, rgba(255, 255, 255, 0.08));

  &:first-of-type {
    border-top: none;
  }
`

const GroupHeader = styled.div`
  display: flex;
  align-items: center;
  padding: 12px 12px;
  cursor: pointer;
  transition: 0.2s;

  &:hover {
    background: rgba(255, 255, 255, 0.06);
  }
`

const GroupTitle = styled.span`
  flex: 1;
  font-weight: 650;
  color: var(--text-primary, var(--default-color));
`

const GroupIcon = styled.span`
  margin-right: 8px;
  font-size: 11px;
  opacity: 0.75;
  color: var(--text-secondary, var(--default-color));
`

const GroupMeta = styled.span`
  font-size: 11px;
  color: var(--text-secondary, rgba(255, 255, 255, 0.65));
`

const ResultGroup = styled.span`
  font-size: 11px;
  color: var(--text-secondary, rgba(255, 255, 255, 0.65));
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--border-default, rgba(255, 255, 255, 0.12));
  background: rgba(255, 255, 255, 0.04);
  white-space: nowrap;
`

const LinkList = styled.div<{ expanded: boolean }>`
  max-height: ${({ expanded }) => (expanded ? "520px" : "0")};
  overflow: hidden;
  transition: max-height 0.28s ease;
`

const LinkItem = styled.div<{ isAdded?: boolean }>`
  display: flex;
  align-items: center;
  padding: 10px 12px 10px 32px;
  cursor: pointer;
  transition: 0.2s;
  background: ${({ isAdded }) =>
    isAdded ? "rgba(138, 180, 255, 0.10)" : "transparent"};

  &:hover {
    background: ${({ isAdded }) =>
      isAdded ? "rgba(138, 180, 255, 0.14)" : "rgba(255, 255, 255, 0.06)"};
  }
`

const LinkLabel = styled.span`
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-primary, var(--default-color));
`

const LinkActions = styled.div`
  display: flex;
  gap: 4px;
`

const DANGER_COLOR = "rgba(255, 100, 100, 0.95)"
const DEFAULT_BTN_COLOR = "var(--text-secondary, rgba(255, 255, 255, 0.7))"

const ActionBtn = styled.button<{ danger?: boolean }>`
  width: 28px;
  height: 28px;
  border-radius: 10px;
  background: transparent;
  border: none;
  color: ${({ danger }) => (danger ? DANGER_COLOR : DEFAULT_BTN_COLOR)};
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: 0.2s;

  &:hover {
    background: rgba(255, 255, 255, 0.06);
    color: ${({ danger }) =>
      danger ? DANGER_COLOR : "var(--text-primary, var(--default-color))"};
  }

  &:active {
    transform: translateY(0.5px);
  }
`

const AddButton = styled.div`
  display: flex;
  align-items: center;
  padding: 10px 12px 10px 32px;
  cursor: pointer;
  transition: 0.2s;
  font-size: 12px;
  color: var(--text-secondary, rgba(255, 255, 255, 0.7));

  &:hover {
    background: rgba(255, 255, 255, 0.06);
    color: var(--text-primary, var(--default-color));
  }
`

const AddIcon = styled.span`
  margin-right: 8px;
  color: var(--accent, var(--accent-color));
`

// 弹窗样式
const Modal = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(14px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
`

const ModalContent = styled.div`
  background: rgba(18, 18, 21, 0.86);
  border: 1px solid var(--border-default, rgba(255, 255, 255, 0.12));
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.6);
  padding: 14px;
  width: 304px;
  border-radius: 16px;
`

const ModalTitle = styled.h3`
  margin: 0 0 12px 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary, var(--default-color));
`

const ModalSubtitle = styled.p`
  margin: -6px 0 12px 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--text-secondary, rgba(255, 255, 255, 0.65));
`

const Input = styled.input`
  width: 100%;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--border-default, rgba(255, 255, 255, 0.12));
  color: var(--text-primary, var(--default-color));
  font-size: 13px;
  margin-bottom: 8px;
  box-sizing: border-box;

  &:focus {
    outline: none;
    border-color: rgba(138, 180, 255, 0.55);
    box-shadow: 0 0 0 3px rgba(138, 180, 255, 0.18);
  }

  &::placeholder {
    color: var(--text-secondary, rgba(255, 255, 255, 0.6));
  }
`

const UrlDisplay = styled.div`
  font-size: 11px;
  color: var(--text-secondary, rgba(255, 255, 255, 0.65));
  margin-bottom: 12px;
  word-break: break-all;
`

const ButtonRow = styled.div`
  display: flex;
  gap: 8px;
  justify-content: flex-end;
`

const ACCENT_COLOR = "var(--accent, var(--accent-color))"

const Button = styled.button<{ primary?: boolean; danger?: boolean }>`
  padding: 8px 12px;
  border-radius: 12px;
  background: ${({ primary, danger }) => {
    if (danger) return "rgba(255, 100, 100, 0.12)"
    if (primary) return ACCENT_COLOR
    return "rgba(255, 255, 255, 0.06)"
  }};
  border: 1px solid
    ${({ primary, danger }) => {
      if (danger) return "rgba(255, 100, 100, 0.25)"
      if (primary) return "transparent"
      return "rgba(255, 255, 255, 0.12)"
    }};
  color: ${({ primary, danger }) => {
    if (danger) return "rgba(255, 100, 100, 0.95)"
    if (primary) return "rgba(18,18,21,0.95)"
    return "var(--text-primary, var(--default-color))"
  }};
  font-size: 13px;
  font-weight: 650;
  cursor: pointer;
  transition: 0.2s;

  &:hover {
    transform: translateY(-0.5px);
  }

  &:active {
    transform: translateY(0.5px);
  }
`

const Toast = styled.div<{ visible: boolean }>`
  position: fixed;
  bottom: 16px;
  left: 50%;
  background: rgba(18, 18, 21, 0.92);
  color: var(--text-primary, var(--default-color));
  padding: 10px 14px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.55);
  font-size: 12px;
  opacity: ${({ visible }) => (visible ? 1 : 0)};
  transition: opacity 0.25s, transform 0.25s;
  transform: ${({ visible }) =>
    visible
      ? "translateX(-50%) translateY(0)"
      : "translateX(-50%) translateY(6px)"};
  z-index: 200;
  pointer-events: none;
`

const CheckIcon = styled.span`
  color: var(--accent, var(--accent-color));
  margin-right: 6px;
  font-size: 11px;
`

const globalStyles = css`
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }
  body {
    margin: 0;
    padding: 0;
    background: var(--bg-primary, var(--bg-color));
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
  const groupLower = groupTitle.toLowerCase()
  const labelLower = label.toLowerCase()
  const valueLower = value.toLowerCase()

  const groupHit = groupLower.includes(query)
  const labelHit = labelLower.includes(query)
  const urlHit = valueLower.includes(query)

  if (!groupHit && !labelHit && !urlHit) return -1

  const labelScore = labelLower.startsWith(query) ? 4 : labelHit ? 3 : 0

  let urlScore = 0
  if (valueLower.includes(`://${query}`) || valueLower.includes(`.${query}`)) {
    urlScore = 2
  } else if (urlHit) {
    urlScore = 1
  }

  return labelScore + urlScore + (groupHit ? 0.5 : 0)
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

  const [toast, setToast] = useState({ visible: false, message: "" })
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  // 应用颜色
  useEffect(() => {
    applyColors(colors)
  }, [colors])

  // 清理 Toast 定时器
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }
  }, [])

  const showToast = (message: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast({ visible: true, message })
    toastTimerRef.current = setTimeout(() => {
      setToast({ visible: false, message: "" })
    }, 1900)
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

  const openSettings = () => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (typeof chrome === "undefined" || !chrome?.tabs || !chrome?.runtime) {
      return
    }
    void chrome.tabs.create({ url: chrome.runtime.getURL("index.html") })
  }

  useEffect(() => {
    const hasModal = showAddModal || showEditModal || Boolean(confirmDelete)
    if (!hasModal) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      setShowAddModal(false)
      setShowEditModal(false)
      setConfirmDelete(null)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [confirmDelete, showAddModal, showEditModal])

  const currentPageAdded = currentTab ? findLink(currentTab.url) : null

  const filteredGroups = useMemo(() => {
    const query = q.trim().toLowerCase()
    if (!query) return links
    return links
      .map(group => {
        const titleMatches = group.title.toLowerCase().includes(query)
        const matchingLinks = group.links.filter(
          l =>
            l.label.toLowerCase().includes(query) ||
            l.value.toLowerCase().includes(query)
        )
        if (titleMatches) return group
        if (matchingLinks.length === 0) return null
        return { ...group, links: matchingLinks }
      })
      .filter(Boolean) as linkGroup[]
  }, [links, q])

  const searchResults = useMemo((): SearchResult[] => {
    const query = q.trim().toLowerCase()
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
            <SyncStatusDot />
            <Title>Fluidity</Title>
          </TitleRow>
          <IconButton onClick={openSettings} title="打开设置">
            <FontAwesomeIcon icon={faCog} />
          </IconButton>
        </Header>

        <SearchBar>
          <SearchInput
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="搜索链接或群组"
          />
        </SearchBar>

        <Scroll>
          {currentTab && (
            <Section>
              <Card>
                <GroupHeader
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
                </GroupHeader>
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
                        <LinkLabel onClick={() => openLink(result.value)}>
                          {result.label}
                        </LinkLabel>
                        <ResultGroup title={result.group}>
                          {result.group}
                        </ResultGroup>
                        <LinkActions>
                          <ActionBtn
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
                  <GroupHeader onClick={() => openAddModal()}>
                    <GroupIcon>
                      <FontAwesomeIcon icon={faPlus} />
                    </GroupIcon>
                    <GroupTitle>新建一个群组</GroupTitle>
                    <GroupMeta>从这里开始整理</GroupMeta>
                  </GroupHeader>
                )}

                {filteredGroups.map(group => {
                  const isExpanded = expandedGroups.has(group.title)
                  return (
                    <GroupContainer key={group.title}>
                      <GroupHeader onClick={() => toggleGroup(group.title)}>
                        <GroupIcon>
                          <FontAwesomeIcon
                            icon={isExpanded ? faChevronDown : faChevronRight}
                          />
                        </GroupIcon>
                        <GroupTitle>{group.title}</GroupTitle>
                        <GroupMeta>{group.links.length}</GroupMeta>
                      </GroupHeader>

                      <LinkList expanded={isExpanded}>
                        {group.links.map((link, index) => {
                          const isCurrentPage = currentTab?.url === link.value
                          return (
                            <LinkItem key={link.value} isAdded={isCurrentPage}>
                              {isCurrentPage && (
                                <CheckIcon>
                                  <FontAwesomeIcon icon={faCheck} />
                                </CheckIcon>
                              )}
                              <LinkLabel onClick={() => openLink(link.value)}>
                                {link.label}
                              </LinkLabel>
                              <LinkActions>
                                <ActionBtn
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
                          <AddButton onClick={() => openAddModal(group.title)}>
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
                    <AddButton onClick={() => openAddModal()}>
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
            <ModalContent onClick={e => e.stopPropagation()}>
              <ModalTitle>保存当前页面</ModalTitle>
              <ModalSubtitle>
                选择一个群组，并给它一个更好记的名字。
              </ModalSubtitle>
              <Input
                list="popup-group-options"
                value={groupName}
                onChange={e => setGroupName(e.target.value)}
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
            <ModalContent onClick={e => e.stopPropagation()}>
              <ModalTitle>重命名链接</ModalTitle>
              <ModalSubtitle>名字短一点，会更干净。</ModalSubtitle>
              <Input
                value={editingLink.label}
                onChange={e =>
                  setEditingLink({ ...editingLink, label: e.target.value })
                }
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
            <ModalContent onClick={e => e.stopPropagation()}>
              <ModalTitle>删除这个链接？</ModalTitle>
              <ModalSubtitle>
                它将从「{confirmDelete.group}」移除。你可以稍后重新添加。
              </ModalSubtitle>
              <UrlDisplay>{confirmDelete.url}</UrlDisplay>
              <ButtonRow>
                <Button onClick={() => setConfirmDelete(null)}>取消</Button>
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

        <Toast visible={toast.visible}>{toast.message}</Toast>
      </Container>
    </>
  )
}
