/* eslint-disable jsx-a11y/no-autofocus */
import React, { useState, useEffect, useCallback } from "react"

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

import { linkGroup, links as defaultLinks } from "../data/data"

// 存储键 - 与设置页面保持一致
const STORAGE_KEY = "link-groups"
const DESIGN_KEY = "design"

// 默认颜色
const defaultColors: Record<string, string> = {
  "--bg-color": "#24273A",
  "--default-color": "#CAD3F5",
  "--accent-color": "#C6A0F6",
  "--accent-color2": "#8AADF4",
}

// 主题类型
interface Theme {
  name: string
  colors: Record<string, string>
  image: string
}

// 获取存储的链接
const getStoredLinks = (): linkGroup[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    return data ? (JSON.parse(data) as linkGroup[]) : defaultLinks
  } catch {
    return defaultLinks
  }
}

// 保存链接
const saveLinks = (links: linkGroup[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(links))
}

// 获取颜色设置 - 从 design 中读取
const getColors = (): Record<string, string> => {
  try {
    const data = localStorage.getItem(DESIGN_KEY)
    if (data) {
      const design = JSON.parse(data) as Theme
      return { ...defaultColors, ...design.colors }
    }
    return defaultColors
  } catch {
    return defaultColors
  }
}

// 样式组件
const Container = styled.div`
  width: 320px;
  max-height: 480px;
  overflow-y: auto;
  background: var(--bg-color);
  color: var(--default-color);
  font-family: "Fira Code", monospace;
  font-size: 13px;

  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  &::-webkit-scrollbar-thumb {
    background: var(--default-color);
    opacity: 0.3;
  }
`

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--default-color);
  position: sticky;
  top: 0;
  background: var(--bg-color);
  z-index: 10;
`

const Title = styled.h1`
  font-size: 14px;
  font-weight: 600;
  margin: 0;
  color: var(--accent-color);
`

const IconButton = styled.button`
  background: transparent;
  border: none;
  color: var(--default-color);
  cursor: pointer;
  padding: 4px 8px;
  opacity: 0.7;
  transition: 0.2s;

  &:hover {
    opacity: 1;
    color: var(--accent-color);
  }
`

const GroupContainer = styled.div`
  border-bottom: 1px solid var(--default-color);
  opacity: 0.3;

  &:last-child {
    border-bottom: none;
  }
`

const GroupHeader = styled.div`
  display: flex;
  align-items: center;
  padding: 10px 16px;
  cursor: pointer;
  transition: 0.2s;

  &:hover {
    background: rgba(255, 255, 255, 0.05);
  }
`

const GroupTitle = styled.span`
  flex: 1;
  font-weight: 500;
`

const GroupIcon = styled.span`
  margin-right: 8px;
  font-size: 10px;
  opacity: 0.6;
`

const LinkList = styled.div<{ expanded: boolean }>`
  max-height: ${({ expanded }) => (expanded ? "500px" : "0")};
  overflow: hidden;
  transition: max-height 0.3s ease;
`

const LinkItem = styled.div<{ isAdded?: boolean }>`
  display: flex;
  align-items: center;
  padding: 8px 16px 8px 32px;
  cursor: pointer;
  transition: 0.2s;
  background: ${({ isAdded }) =>
    isAdded ? "rgba(255, 255, 255, 0.03)" : "transparent"};

  &:hover {
    background: rgba(255, 255, 255, 0.08);
  }
`

const LinkLabel = styled.span`
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const LinkActions = styled.div`
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: 0.2s;

  ${LinkItem}:hover & {
    opacity: 1;
  }
`

const DANGER_COLOR = "var(--accent-color2)"
const DEFAULT_BTN_COLOR = "var(--default-color)"

const ActionBtn = styled.button<{ danger?: boolean }>`
  background: transparent;
  border: none;
  color: ${({ danger }) => (danger ? DANGER_COLOR : DEFAULT_BTN_COLOR)};
  cursor: pointer;
  padding: 2px 6px;
  font-size: 11px;
  opacity: 0.7;

  &:hover {
    opacity: 1;
    color: ${({ danger }) => (danger ? DANGER_COLOR : "var(--accent-color)")};
  }
`

const AddButton = styled.div`
  display: flex;
  align-items: center;
  padding: 8px 16px 8px 32px;
  cursor: pointer;
  opacity: 0.6;
  transition: 0.2s;
  font-size: 12px;

  &:hover {
    opacity: 1;
    background: rgba(255, 255, 255, 0.05);
  }
`

const AddIcon = styled.span`
  margin-right: 8px;
  color: var(--accent-color);
`

// 弹窗样式
const Modal = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
`

const ModalContent = styled.div`
  background: var(--bg-color);
  border: 2px solid var(--default-color);
  padding: 16px;
  width: 280px;
`

const ModalTitle = styled.h3`
  margin: 0 0 12px 0;
  font-size: 14px;
  color: var(--accent-color);
`

const Input = styled.input`
  width: 100%;
  padding: 8px 10px;
  background: transparent;
  border: 1px solid var(--default-color);
  color: var(--default-color);
  font-size: 12px;
  margin-bottom: 8px;
  box-sizing: border-box;

  &:focus {
    outline: none;
    border-color: var(--accent-color);
  }

  &::placeholder {
    opacity: 0.5;
  }
`

const UrlDisplay = styled.div`
  font-size: 11px;
  opacity: 0.6;
  margin-bottom: 12px;
  word-break: break-all;
`

const ButtonRow = styled.div`
  display: flex;
  gap: 8px;
  justify-content: flex-end;
`

const ACCENT_COLOR = "var(--accent-color)"

const Button = styled.button<{ primary?: boolean }>`
  padding: 6px 12px;
  background: ${({ primary }) => (primary ? ACCENT_COLOR : "transparent")};
  border: 1px solid
    ${({ primary }) => (primary ? ACCENT_COLOR : DEFAULT_BTN_COLOR)};
  color: ${({ primary }) => (primary ? "var(--bg-color)" : DEFAULT_BTN_COLOR)};
  font-size: 12px;
  cursor: pointer;
  transition: 0.2s;

  &:hover {
    opacity: 0.8;
  }
`

const Toast = styled.div<{ visible: boolean }>`
  position: fixed;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--accent-color);
  color: var(--bg-color);
  padding: 8px 16px;
  font-size: 12px;
  opacity: ${({ visible }) => (visible ? 1 : 0)};
  transition: opacity 0.3s;
  z-index: 200;
`

const CheckIcon = styled.span`
  color: var(--accent-color);
  margin-right: 6px;
  font-size: 11px;
`

const globalStyles = css`
  @import url("https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600&display=swap");
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }
  body {
    margin: 0;
    padding: 0;
  }
`

// 主组件
export const Popup = () => {
  const [links, setLinks] = useState<linkGroup[]>([])
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [currentTab, setCurrentTab] = useState<{
    url: string
    title: string
  } | null>(null)
  const [colors, setColors] = useState(defaultColors)

  // 添加弹窗状态
  const [showAddModal, setShowAddModal] = useState(false)
  const [addToGroup, setAddToGroup] = useState("")
  const [newLinkName, setNewLinkName] = useState("")

  // 编辑弹窗状态
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingLink, setEditingLink] = useState<{
    group: string
    index: number
    label: string
  } | null>(null)

  // 新建群组弹窗状态
  const [showNewGroupModal, setShowNewGroupModal] = useState(false)
  const [newGroupName, setNewGroupName] = useState("")

  // Toast 状态
  const [toast, setToast] = useState({ visible: false, message: "" })

  // 初始化
  useEffect(() => {
    setLinks(getStoredLinks())
    setColors(getColors())

    // 获取当前标签页
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (typeof chrome !== "undefined" && chrome?.tabs) {
      void chrome.tabs
        .query({ active: true, currentWindow: true })
        .then(tabs => {
          if (tabs[0]) {
            setCurrentTab({
              url: tabs[0].url ?? "",
              title: tabs[0].title ?? "",
            })
          }
        })
    }
  }, [])

  // 应用颜色
  useEffect(() => {
    Object.entries(colors).forEach(([key, value]) => {
      document.documentElement.style.setProperty(key, value)
    })
  }, [colors])

  // 显示 Toast
  const showToast = useCallback((message: string) => {
    setToast({ visible: true, message })
    setTimeout(() => setToast({ visible: false, message: "" }), 2000)
  }, [])

  // 切换群组展开
  const toggleGroup = (title: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(title)) {
        next.delete(title)
      } else {
        next.add(title)
      }
      return next
    })
  }

  // 打开链接
  const openLink = (url: string) => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (typeof chrome !== "undefined" && chrome?.tabs) {
      void chrome.tabs.create({ url })
    }
  }

  // 检查链接是否已添加
  const isLinkAdded = (
    url: string
  ): { group: string; index: number } | null => {
    for (const group of links) {
      const index = group.links.findIndex(link => link.value === url)
      if (index !== -1) {
        return { group: group.title, index }
      }
    }
    return null
  }

  // 打开添加弹窗
  const openAddModal = (groupTitle: string) => {
    if (!currentTab) return
    setAddToGroup(groupTitle)
    setNewLinkName(currentTab.title)
    setShowAddModal(true)
  }

  // 添加当前页面到群组
  const addCurrentPage = () => {
    if (!currentTab || !addToGroup) return

    const newLinks = links.map(group => {
      if (group.title === addToGroup) {
        return {
          ...group,
          links: [
            ...group.links,
            { label: newLinkName || currentTab.title, value: currentTab.url },
          ],
        }
      }
      return group
    })

    setLinks(newLinks)
    saveLinks(newLinks)
    setShowAddModal(false)
    showToast(`已添加到 ${addToGroup}`)
  }

  // 打开编辑弹窗
  const openEditModal = (group: string, index: number, label: string) => {
    setEditingLink({ group, index, label })
    setShowEditModal(true)
  }

  // 保存编辑
  const saveEdit = () => {
    if (!editingLink) return

    const newLinks = links.map(group => {
      if (group.title === editingLink.group) {
        const newGroupLinks = [...group.links]
        newGroupLinks[editingLink.index] = {
          ...newGroupLinks[editingLink.index],
          label: editingLink.label,
        }
        return { ...group, links: newGroupLinks }
      }
      return group
    })

    setLinks(newLinks)
    saveLinks(newLinks)
    setShowEditModal(false)
    showToast("已保存")
  }

  // 删除链接
  const deleteLink = (groupTitle: string, index: number) => {
    const newLinks = links.map(group => {
      if (group.title === groupTitle) {
        const newGroupLinks = [...group.links]
        newGroupLinks.splice(index, 1)
        return { ...group, links: newGroupLinks }
      }
      return group
    })

    setLinks(newLinks)
    saveLinks(newLinks)
    showToast("已删除")
  }

  // 打开设置页
  const openSettings = () => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (typeof chrome !== "undefined" && chrome?.tabs && chrome?.runtime) {
      void chrome.tabs.create({ url: chrome.runtime.getURL("index.html") })
    }
  }

  // 新建群组并添加当前页面
  const createNewGroup = () => {
    if (!newGroupName.trim() || !currentTab) return

    // 检查群组名是否已存在
    if (links.some(g => g.title === newGroupName.trim())) {
      showToast("群组名称已存在")
      return
    }

    const newGroup: linkGroup = {
      title: newGroupName.trim(),
      links: [{ label: currentTab.title, value: currentTab.url }],
    }

    const newLinks = [...links, newGroup]
    setLinks(newLinks)
    saveLinks(newLinks)
    setShowNewGroupModal(false)
    setNewGroupName("")
    // 自动展开新群组
    setExpandedGroups(prev => new Set([...Array.from(prev), newGroup.title]))
    showToast(`已创建群组 "${newGroup.title}"`)
  }

  // 当前页面是否已添加
  const currentPageAdded = currentTab ? isLinkAdded(currentTab.url) : null

  return (
    <>
      <Global styles={globalStyles} />
      <Container>
        <Header>
          <Title>Fluidity</Title>
          <IconButton onClick={openSettings} title="打开设置">
            <FontAwesomeIcon icon={faCog} />
          </IconButton>
        </Header>

        {links.map(group => (
          <GroupContainer key={group.title}>
            <GroupHeader onClick={() => toggleGroup(group.title)}>
              <GroupIcon>
                <FontAwesomeIcon
                  icon={
                    expandedGroups.has(group.title)
                      ? faChevronDown
                      : faChevronRight
                  }
                />
              </GroupIcon>
              <GroupTitle>{group.title}</GroupTitle>
            </GroupHeader>

            <LinkList expanded={expandedGroups.has(group.title)}>
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
                          openEditModal(group.title, index, link.label)
                        }}
                        title="重命名"
                      >
                        <FontAwesomeIcon icon={faPen} />
                      </ActionBtn>
                      <ActionBtn
                        danger
                        onClick={e => {
                          e.stopPropagation()
                          deleteLink(group.title, index)
                        }}
                        title="删除"
                      >
                        <FontAwesomeIcon icon={faTrash} />
                      </ActionBtn>
                      <ActionBtn
                        onClick={e => {
                          e.stopPropagation()
                          openLink(link.value)
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
                  添加当前页面
                </AddButton>
              )}
            </LinkList>
          </GroupContainer>
        ))}

        {/* 新建群组按钮 */}
        {currentTab && !currentPageAdded && (
          <AddButton
            onClick={() => {
              setNewGroupName("")
              setShowNewGroupModal(true)
            }}
            style={{
              borderTop: "1px solid var(--default-color)",
              opacity: 0.5,
            }}
          >
            <AddIcon>
              <FontAwesomeIcon icon={faPlus} />
            </AddIcon>
            新建群组并添加当前页面
          </AddButton>
        )}

        {/* 添加弹窗 */}
        {showAddModal && currentTab && (
          <Modal onClick={() => setShowAddModal(false)}>
            <ModalContent onClick={e => e.stopPropagation()}>
              <ModalTitle>添加到 {addToGroup}</ModalTitle>
              <Input
                value={newLinkName}
                onChange={e => setNewLinkName(e.target.value)}
                placeholder="链接名称"
                autoFocus
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

        {/* 编辑弹窗 */}
        {showEditModal && editingLink && (
          <Modal onClick={() => setShowEditModal(false)}>
            <ModalContent onClick={e => e.stopPropagation()}>
              <ModalTitle>重命名链接</ModalTitle>
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

        {/* 新建群组弹窗 */}
        {showNewGroupModal && currentTab && (
          <Modal onClick={() => setShowNewGroupModal(false)}>
            <ModalContent onClick={e => e.stopPropagation()}>
              <ModalTitle>新建群组</ModalTitle>
              <Input
                value={newGroupName}
                onChange={e => setNewGroupName(e.target.value)}
                placeholder="群组名称"
                autoFocus
              />
              <UrlDisplay>将添加当前页面: {currentTab.title}</UrlDisplay>
              <ButtonRow>
                <Button onClick={() => setShowNewGroupModal(false)}>
                  取消
                </Button>
                <Button primary onClick={createNewGroup}>
                  创建
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
