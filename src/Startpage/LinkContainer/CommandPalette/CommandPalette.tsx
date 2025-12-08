import React, { memo, useState, useRef, useEffect, useCallback } from "react"

import styled from "@emotion/styled"
import { faSearch, faTimes, faTrash } from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"

import { Favicon } from "../../../components/Favicon"
import { linkGroup } from "../../../data/data"
import { LinkAnalytics } from "../../../services/analytics"

const Overlay = styled.div<{ visible: boolean }>`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  opacity: ${({ visible }) => (visible ? 1 : 0)};
  pointer-events: ${({ visible }) => (visible ? "auto" : "none")};
  transition: opacity 0.2s;
  z-index: 200;
`

const PaletteContainer = styled.div<{ visible: boolean }>`
  position: fixed;
  top: 15%;
  left: 50%;
  transform: translateX(-50%)
    ${({ visible }) => (visible ? "translateY(0)" : "translateY(-20px)")};
  width: 90%;
  max-width: 600px;
  max-height: 70vh;
  background: var(--bg-color);
  border: 2px solid var(--default-color);
  box-shadow: 12px 12px 0px var(--accent-color);
  opacity: ${({ visible }) => (visible ? 1 : 0)};
  pointer-events: ${({ visible }) => (visible ? "auto" : "none")};
  transition: opacity 0.2s, transform 0.2s;
  z-index: 201;
  display: flex;
  flex-direction: column;
`

const SearchHeader = styled.div`
  display: flex;
  align-items: center;
  padding: 16px;
  border-bottom: 2px solid var(--default-color);
  gap: 12px;
`

const SearchIcon = styled.div`
  color: var(--accent-color);
  font-size: 1.2rem;
`

const SearchInput = styled.input`
  flex: 1;
  background: transparent;
  border: none;
  color: var(--default-color);
  font-size: 1.1rem;
  outline: none;

  &::placeholder {
    color: var(--default-color);
    opacity: 0.5;
  }
`

const CloseButton = styled.button`
  background: transparent;
  border: none;
  color: var(--default-color);
  cursor: pointer;
  padding: 8px;
  opacity: 0.6;
  transition: 0.2s;

  &:hover {
    opacity: 1;
    color: var(--accent-color);
  }
`

const ShortcutHint = styled.span`
  font-size: 0.75rem;
  padding: 4px 8px;
  border: 1px solid var(--default-color);
  opacity: 0.5;
`

const ResultsContainer = styled.div`
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  max-height: calc(70vh - 70px);

  &::-webkit-scrollbar {
    width: 8px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: var(--default-color);
    opacity: 0.5;
  }
`

const GroupSection = styled.div`
  border-bottom: 1px solid var(--default-color);

  &:last-child {
    border-bottom: none;
  }
`

const GroupHeader = styled.div`
  padding: 10px 16px;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--accent-color);
  background: rgba(255, 255, 255, 0.03);
  display: flex;
  align-items: center;
  gap: 8px;
`

const GroupIcon = styled.span`
  opacity: 0.7;
`

const LinkItemWrapper = styled.div<{ selected: boolean }>`
  display: flex;
  align-items: center;
  transition: 0.1s;
  background: ${({ selected }) =>
    selected ? "var(--accent-color)" : "transparent"};

  &:hover {
    background: var(--accent-color);
  }
`

const LinkItem = styled.a<{ selected: boolean }>`
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px 12px 32px;
  color: var(--default-color);
  text-decoration: none;
  transition: 0.1s;
  color: ${({ selected }) =>
    selected ? "var(--bg-color)" : "var(--default-color)"};

  ${LinkItemWrapper}:hover & {
    color: var(--bg-color);
  }
`

const DeleteBtn = styled.button<{ selected: boolean }>`
  background: transparent;
  border: none;
  color: ${({ selected }) =>
    selected ? "var(--bg-color)" : "var(--default-color)"};
  cursor: pointer;
  padding: 8px 16px;
  opacity: 0;
  transition: 0.2s;

  ${LinkItemWrapper}:hover & {
    opacity: 0.7;
    color: var(--bg-color);
  }

  &:hover {
    opacity: 1 !important;
  }
`

const NoResults = styled.div`
  padding: 40px 16px;
  text-align: center;
  color: var(--default-color);
  opacity: 0.5;
`

const TriggerButton = styled.button`
  position: fixed;
  bottom: 100px;
  right: 20px;
  width: 50px;
  height: 50px;
  border: 2px solid var(--default-color);
  background: var(--bg-color);
  color: var(--default-color);
  cursor: pointer;
  font-size: 1.2rem;
  opacity: 0.4;
  transition: 0.2s;
  z-index: 50;

  &:hover {
    opacity: 1;
    background: var(--accent-color);
    color: var(--bg-color);
  }
`

interface SearchResult {
  type: "group" | "link"
  groupTitle: string
  groupIndex: number
  linkIndex: number
  label: string
  url?: string
}

interface Props {
  linkGroups: linkGroup[]
  onDeleteLink?: (groupIndex: number, linkIndex: number, label: string) => void
}

// 搜索函数
const performSearch = (
  linkGroups: linkGroup[],
  searchQuery: string
): SearchResult[] => {
  const q = searchQuery.toLowerCase().trim()
  const searchResults: SearchResult[] = []

  linkGroups.forEach((group, groupIndex) => {
    const groupMatches = group.title.toLowerCase().includes(q)
    const matchingLinks = group.links
      .map((link, linkIndex) => ({ link, linkIndex }))
      .filter(({ link }) => link.label.toLowerCase().includes(q))

    const shouldIncludeGroup =
      q === "" || groupMatches || matchingLinks.length > 0
    if (!shouldIncludeGroup) return

    searchResults.push({
      type: "group",
      groupTitle: group.title,
      groupIndex,
      linkIndex: -1,
      label: group.title,
    })

    const linksToShow =
      q === "" || groupMatches
        ? group.links.map((link, linkIndex) => ({ link, linkIndex }))
        : matchingLinks

    linksToShow.forEach(({ link, linkIndex }) => {
      searchResults.push({
        type: "link",
        groupTitle: group.title,
        groupIndex,
        linkIndex,
        label: link.label,
        url: link.value,
      })
    })
  })

  return searchResults
}

// 获取链接索引列表
const getLinkIndices = (results: SearchResult[]): number[] =>
  results.map((r, i) => (r.type === "link" ? i : -1)).filter(i => i !== -1)

// 处理链接点击
const handleLinkNavigation = (result: SearchResult): void => {
  if (result.url) {
    LinkAnalytics.trackClick(result.url, result.label, result.groupTitle)
    window.location.href = result.url
  }
}

// 键盘导航处理
const handleArrowDown = (
  linkIndices: number[],
  currentLinkIndex: number,
  setSelectedIndex: (index: number) => void
): void => {
  if (currentLinkIndex < linkIndices.length - 1) {
    setSelectedIndex(linkIndices[currentLinkIndex + 1])
  }
}

const handleArrowUp = (
  linkIndices: number[],
  currentLinkIndex: number,
  setSelectedIndex: (index: number) => void
): void => {
  if (currentLinkIndex > 0) {
    setSelectedIndex(linkIndices[currentLinkIndex - 1])
  }
}

// 全局快捷键 hook
const useGlobalKeyboard = (
  isOpen: boolean,
  setIsOpen: (open: boolean) => void
): void => {
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const isInputFocused = document.activeElement?.tagName === "INPUT"
      if (e.key === "/" && !isOpen && !isInputFocused) {
        e.preventDefault()
        setIsOpen(true)
      }
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false)
      }
    }

    window.addEventListener("keydown", handleGlobalKeyDown)
    return () => window.removeEventListener("keydown", handleGlobalKeyDown)
  }, [isOpen, setIsOpen])
}

// 搜索结果列表组件
const SearchResults = memo(
  ({
    results,
    selectedIndex,
    onDeleteLink,
  }: {
    results: SearchResult[]
    selectedIndex: number
    onDeleteLink?: (
      groupIndex: number,
      linkIndex: number,
      label: string
    ) => void
  }) => {
    if (results.length === 0) {
      return <NoResults>没有找到匹配的链接</NoResults>
    }

    return (
      <>
        {results.map((result, index) =>
          result.type === "group" ? (
            <GroupSection key={`group-${result.groupTitle}`}>
              <GroupHeader>
                <GroupIcon>📁</GroupIcon>
                {result.label}
              </GroupHeader>
            </GroupSection>
          ) : (
            <LinkItemWrapper
              key={`link-${result.groupTitle}-${result.label}`}
              data-index={index}
              selected={index === selectedIndex}
            >
              <LinkItem
                href={result.url}
                selected={index === selectedIndex}
                onClick={e => {
                  e.preventDefault()
                  handleLinkNavigation(result)
                }}
              >
                {result.url && <Favicon url={result.url} size={14} />}
                {result.label}
              </LinkItem>
              {onDeleteLink && (
                <DeleteBtn
                  selected={index === selectedIndex}
                  onClick={e => {
                    e.preventDefault()
                    e.stopPropagation()
                    onDeleteLink(
                      result.groupIndex,
                      result.linkIndex,
                      result.label
                    )
                  }}
                  title="删除链接"
                >
                  <FontAwesomeIcon icon={faTrash} size="sm" />
                </DeleteBtn>
              )}
            </LinkItemWrapper>
          )
        )}
      </>
    )
  }
)

SearchResults.displayName = "SearchResults"

export const CommandPalette = memo(({ linkGroups, onDeleteLink }: Props) => {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [results, setResults] = useState<SearchResult[]>([])
  const [scrolledByMouse, setScrolledByMouse] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const resultsContainerRef = useRef<HTMLDivElement>(null)

  // 当选中项变化时，滚动到可见区域（仅在键盘导航时）
  useEffect(() => {
    if (selectedIndex < 0 || !resultsContainerRef.current || scrolledByMouse)
      return

    const container = resultsContainerRef.current
    const selectedElement = container.querySelector<HTMLElement>(
      `[data-index="${selectedIndex}"]`
    )

    if (selectedElement) {
      selectedElement.scrollIntoView({ block: "nearest", behavior: "smooth" })
    }
  }, [selectedIndex, scrolledByMouse])

  // 监听鼠标滚轮事件，标记为鼠标滚动
  useEffect(() => {
    const container = resultsContainerRef.current
    if (!container || !isOpen) return

    const handleWheel = () => {
      setScrolledByMouse(true)
    }

    container.addEventListener("wheel", handleWheel)
    return () => container.removeEventListener("wheel", handleWheel)
  }, [isOpen])

  // 上一次的查询，用于判断是否需要重置选中
  const prevQueryRef = useRef(query)

  const search = useCallback(
    (searchQuery: string, resetSelection: boolean) => {
      const searchResults = performSearch(linkGroups, searchQuery)
      setResults(searchResults)
      if (resetSelection) {
        setSelectedIndex(searchResults.findIndex(r => r.type === "link"))
      }
    },
    [linkGroups]
  )

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus()
      search("", true)
    } else {
      setQuery("")
      setSelectedIndex(0)
    }
  }, [isOpen, search])

  // 只在 query 真正变化时才重新搜索并重置选中
  useEffect(() => {
    if (prevQueryRef.current !== query) {
      prevQueryRef.current = query
      search(query, true)
    }
  }, [query, search])

  useGlobalKeyboard(isOpen, setIsOpen)

  // 获取当前可见区域内的第一个/最后一个链接索引
  const getVisibleLinkIndex = useCallback(
    (direction: "first" | "last"): number => {
      const container = resultsContainerRef.current
      if (!container) return -1

      const containerRect = container.getBoundingClientRect()
      const linkIndices = getLinkIndices(results)

      for (const idx of direction === "first"
        ? linkIndices
        : [...linkIndices].reverse()) {
        const element = container.querySelector<HTMLElement>(
          `[data-index="${idx}"]`
        )
        if (element) {
          const rect = element.getBoundingClientRect()
          // 检查元素是否在可见区域内
          if (
            rect.top >= containerRect.top &&
            rect.bottom <= containerRect.bottom
          ) {
            return idx
          }
        }
      }
      return (
        linkIndices[direction === "first" ? 0 : linkIndices.length - 1] ?? -1
      )
    },
    [results]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const linkIndices = getLinkIndices(results)

      if (e.key === "ArrowDown") {
        e.preventDefault()
        // 如果之前是鼠标滚动，从可见区域最上面的链接开始
        if (scrolledByMouse) {
          const visibleFirst = getVisibleLinkIndex("first")
          setSelectedIndex(visibleFirst)
          setScrolledByMouse(false)
        } else {
          const currentLinkIndex = linkIndices.indexOf(selectedIndex)
          handleArrowDown(linkIndices, currentLinkIndex, setSelectedIndex)
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        // 如果之前是鼠标滚动，从可见区域最下面的链接开始
        if (scrolledByMouse) {
          const visibleLast = getVisibleLinkIndex("last")
          setSelectedIndex(visibleLast)
          setScrolledByMouse(false)
        } else {
          const currentLinkIndex = linkIndices.indexOf(selectedIndex)
          handleArrowUp(linkIndices, currentLinkIndex, setSelectedIndex)
        }
      } else if (e.key === "Enter") {
        e.preventDefault()
        const selectedResult = results[selectedIndex] as
          | SearchResult
          | undefined
        if (selectedIndex >= 0 && selectedResult?.url) {
          handleLinkNavigation(selectedResult)
        }
      } else if (e.key === "Escape") {
        setIsOpen(false)
      }
    },
    [results, selectedIndex, scrolledByMouse, getVisibleLinkIndex]
  )

  const openPalette = useCallback(() => setIsOpen(true), [])
  const closePalette = useCallback(() => setIsOpen(false), [])

  return (
    <>
      <TriggerButton onClick={openPalette} title="搜索链接 (/)">
        <FontAwesomeIcon icon={faSearch} />
      </TriggerButton>

      <Overlay visible={isOpen} onClick={closePalette} />

      <PaletteContainer visible={isOpen}>
        <SearchHeader>
          <SearchIcon>
            <FontAwesomeIcon icon={faSearch} />
          </SearchIcon>
          <SearchInput
            ref={inputRef}
            type="text"
            placeholder="搜索链接..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <ShortcutHint>Esc</ShortcutHint>
          <CloseButton onClick={closePalette}>
            <FontAwesomeIcon icon={faTimes} />
          </CloseButton>
        </SearchHeader>

        <ResultsContainer ref={resultsContainerRef}>
          <SearchResults
            results={results}
            selectedIndex={selectedIndex}
            onDeleteLink={onDeleteLink}
          />
        </ResultsContainer>
      </PaletteContainer>
    </>
  )
})

CommandPalette.displayName = "CommandPalette"
