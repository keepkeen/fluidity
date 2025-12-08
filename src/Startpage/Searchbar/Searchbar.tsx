import React, { useState, useRef, useEffect, useCallback, useMemo } from "react"

import styled from "@emotion/styled"

import { Search as SearchType } from "../../data/data"
import duckduckgo from "../../data/pictures/duckduckgo.svg"
import ecosia from "../../data/pictures/ecosia.svg"
import google from "../../data/pictures/google.svg"
import qwant from "../../data/pictures/qwant.svg"
import { SearchHistory, LinkAnalytics } from "../../services/analytics"
import * as Settings from "../Settings/settingsHandler"

export const queryToken = "{{query}}"

// 导出 SearchSettings 类型别名
export type SearchSettings = SearchType

// 建议项类型
interface Suggestion {
  text: string
  type: "history" | "link" | "todo" | "fastforward"
  url?: string
  icon?: string
}

const StyledSearchbarContainer = styled.div`
  position: relative;
  margin: 0 100px 40px calc(100px - 2.9rem - 10px);
  height: min-content;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-end;
  flex-shrink: 0;

  @media screen and (max-width: 1200px) {
    margin-left: calc(60px - 2.9rem - 10px);
    margin-right: 60px;
  }

  @media screen and (max-width: 900px) {
    margin-left: calc(40px - 2.9rem - 10px);
    margin-right: 40px;
  }

  @media screen and (max-width: 600px) {
    margin-left: 20px;
    margin-right: 20px;
    margin-bottom: 20px;
  }
`

const SearchInputWrapper = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: center;
`

const StyledSearchbar = styled.input`
  width: 100%;
  font-size: 30pt;

  background-color: rgba(0, 0, 0, 0);
  color: var(--default-color);
  transition: 0.3s;
  border: none;
  border-bottom: 2px solid var(--default-color);
  opacity: 0.3;

  ::placeholder {
    color: var(--default-color);
  }

  :hover,
  :focus {
    opacity: 1;
    outline: none;
  }

  @media screen and (max-width: 900px) {
    font-size: 24pt;
  }

  @media screen and (max-width: 600px) {
    font-size: 18pt;
  }
`

const SearchIcon = styled.div<{ src: string }>`
  height: 2.9rem;
  width: 3.1rem;
  margin: auto 10px auto 0;

  background: var(--default-color);

  mask-size: cover;
  mask-image: url(${({ src }) => src});

  @media screen and (max-width: 900px) {
    height: 2.4rem;
    width: 2.6rem;
  }

  @media screen and (max-width: 600px) {
    height: 1.8rem;
    width: 2rem;
    margin-right: 8px;
  }
`

const SuggestionsContainer = styled.div<{ visible: boolean }>`
  position: absolute;
  bottom: 100%;
  left: calc(2.9rem + 10px);
  right: 0;
  max-height: ${({ visible }) => (visible ? "300px" : "0")};
  overflow: hidden;
  transition: max-height 0.2s ease-out, opacity 0.2s ease-out;
  opacity: ${({ visible }) => (visible ? 1 : 0)};
  margin-bottom: 8px;
`

const SuggestionsList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  background: var(--bg-color);
  border: 2px solid var(--default-color);
`

const SuggestionItem = styled.li<{ selected: boolean }>`
  padding: 12px 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 12px;
  transition: 0.15s;
  background: ${({ selected }) =>
    selected ? "var(--accent-color)" : "transparent"};
  color: ${({ selected }) =>
    selected ? "var(--bg-color)" : "var(--default-color)"};

  &:hover {
    background: var(--accent-color);
    color: var(--bg-color);
  }
`

const SuggestionText = styled.span`
  flex: 1;
  font-size: 1rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const SuggestionType = styled.span<{ selected: boolean }>`
  font-size: 0.75rem;
  padding: 2px 8px;
  border: 1px solid
    ${({ selected }) => (selected ? "var(--bg-color)" : "var(--default-color)")};
  opacity: 0.7;
`

const typeLabels: Record<Suggestion["type"], string> = {
  history: "历史",
  link: "链接",
  todo: "待办",
  fastforward: "快捷",
}

/**
 * 获取智能建议
 */
const getSuggestions = (
  query: string,
  searchSettings: SearchType
): Suggestion[] => {
  const suggestions: Suggestion[] = []
  const lowerQuery = query.toLowerCase()

  // 1. 快捷词匹配（优先级最高）
  Object.entries(searchSettings.fastForward).forEach(([key, url]) => {
    if (key.toLowerCase().includes(lowerQuery)) {
      suggestions.push({
        text: key,
        type: "fastforward",
        url,
      })
    }
  })

  // 2. 搜索历史匹配
  const recentSearches = SearchHistory.getRecent(20)
  recentSearches.forEach(search => {
    if (
      search.toLowerCase().includes(lowerQuery) &&
      !suggestions.some(s => s.text === search)
    ) {
      suggestions.push({
        text: search,
        type: "history",
      })
    }
  })

  // 3. 常用链接匹配
  const topLinks = LinkAnalytics.getTopLinks(10)
  topLinks.forEach(link => {
    if (
      link.label.toLowerCase().includes(lowerQuery) &&
      !suggestions.some(s => s.text === link.label)
    ) {
      const analytics = LinkAnalytics.get()
      const linkData = Object.values(analytics).find(
        l => l.label === link.label
      )
      suggestions.push({
        text: link.label,
        type: "link",
        url: linkData?.url,
      })
    }
  })

  // 4. 待办事项匹配
  try {
    const todosRaw = localStorage.getItem("todos")
    if (todosRaw) {
      const todos = JSON.parse(todosRaw) as {
        text: string
        done: boolean
      }[]
      todos
        .filter(t => !t.done && t.text.toLowerCase().includes(lowerQuery))
        .slice(0, 3)
        .forEach(todo => {
          if (!suggestions.some(s => s.text === todo.text)) {
            suggestions.push({
              text: todo.text,
              type: "todo",
            })
          }
        })
    }
  } catch {
    // ignore
  }

  // 限制建议数量为5个
  return suggestions.slice(0, 5)
}

/**
 * 获取默认建议（无输入时）
 */
const getDefaultSuggestions = (searchSettings: SearchType): Suggestion[] => {
  const suggestions: Suggestion[] = []

  // 1. 最近搜索
  const recentSearches = SearchHistory.getRecent(3)
  recentSearches.forEach(search => {
    suggestions.push({
      text: search,
      type: "history",
    })
  })

  // 2. 最常访问的链接
  const topLinks = LinkAnalytics.getTopLinks(3)
  const analytics = LinkAnalytics.get()
  topLinks.forEach(link => {
    const linkData = Object.values(analytics).find(l => l.label === link.label)
    suggestions.push({
      text: link.label,
      type: "link",
      url: linkData?.url,
    })
  })

  // 3. 未完成的待办
  try {
    const todosRaw = localStorage.getItem("todos")
    if (todosRaw) {
      const todos = JSON.parse(todosRaw) as {
        text: string
        done: boolean
      }[]
      todos
        .filter(t => !t.done)
        .slice(0, 2)
        .forEach(todo => {
          suggestions.push({
            text: todo.text,
            type: "todo",
          })
        })
    }
  } catch {
    // ignore
  }

  // 4. 快捷词
  Object.entries(searchSettings.fastForward)
    .slice(0, 2)
    .forEach(([key, url]) => {
      suggestions.push({
        text: key,
        type: "fastforward",
        url,
      })
    })

  // 限制建议数量为5个
  return suggestions.slice(0, 5)
}

export const Searchbar = () => {
  // 使用 useMemo 稳定 searchSettings，避免每次渲染都创建新对象
  const searchSettings = useMemo(() => Settings.Search.getWithFallback(), [])
  const engine: string = searchSettings.engine
  const placeholder =
    searchSettings.placeholder ?? "按 Enter 搜索，或直接输入快捷词"

  const [inputValue, setInputValue] = useState("")
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const searchSymbol = useMemo(() => {
    if (engine.includes("duckduckgo")) return duckduckgo
    if (engine.includes("google")) return google
    if (engine.includes("qwant")) return qwant
    if (engine.includes("ecosia")) return ecosia
    return undefined
  }, [engine])

  // 输入变化时更新建议并重置选中
  useEffect(() => {
    if (!showSuggestions) return

    if (inputValue.trim()) {
      setSuggestions(getSuggestions(inputValue, searchSettings))
    } else {
      setSuggestions(getDefaultSuggestions(searchSettings))
    }
    setSelectedIndex(-1)
  }, [inputValue, showSuggestions, searchSettings])

  // 根据设置决定跳转方式
  const navigateTo = useCallback(
    (url: string) => {
      if (searchSettings.openInNewTab) {
        window.open(url, "_blank")
      } else {
        window.location.href = url
      }
    },
    [searchSettings.openInNewTab]
  )

  const redirectToSearch = (query: string) => {
    // 记录搜索历史
    if (query.trim()) {
      SearchHistory.trackSearch(query, engine)
    }

    let targetUrl: string
    if (searchSettings.fastForward[query]) {
      targetUrl = searchSettings.fastForward[query]
    } else {
      // for compatibility with old engine urls before fluidity 0.5.0
      if (!engine.includes(queryToken)) {
        targetUrl = "https://" + engine + "?q=" + query
      } else {
        targetUrl = engine.replace(queryToken, query)
      }
    }
    navigateTo(targetUrl)
  }

  const handleSuggestionClick = (suggestion: Suggestion) => {
    if (suggestion.url) {
      // 直接跳转到链接
      if (suggestion.type === "link") {
        LinkAnalytics.trackClick(suggestion.url, suggestion.text, "")
      }
      navigateTo(suggestion.url)
    } else {
      // 使用建议文本进行搜索
      redirectToSearch(suggestion.text)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) {
      if (e.key === "Enter") {
        redirectToSearch(inputValue)
      }
      return
    }

    switch (e.key) {
      case "ArrowDown":
      case "ArrowRight":
        e.preventDefault()
        setSelectedIndex(prev =>
          prev < suggestions.length - 1 ? prev + 1 : prev
        )
        break
      case "ArrowUp":
      case "ArrowLeft":
        e.preventDefault()
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : -1))
        break
      case "Enter":
        e.preventDefault()
        if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
          handleSuggestionClick(suggestions[selectedIndex])
        } else {
          redirectToSearch(inputValue)
        }
        break
      case "Escape":
        setShowSuggestions(false)
        setSelectedIndex(-1)
        break
    }
  }

  const handleFocus = useCallback(() => {
    setShowSuggestions(true)
    // 建议会通过 useEffect 自动更新
  }, [])

  const handleBlur = (e: React.FocusEvent) => {
    // 延迟关闭，以便点击建议项时能够触发
    if (!containerRef.current?.contains(e.relatedTarget as Node)) {
      setTimeout(() => setShowSuggestions(false), 150)
    }
  }

  return (
    <StyledSearchbarContainer ref={containerRef}>
      <SuggestionsContainer visible={showSuggestions && suggestions.length > 0}>
        <SuggestionsList>
          {suggestions.map((suggestion, index) => (
            <SuggestionItem
              key={`${suggestion.type}-${suggestion.text}`}
              selected={index === selectedIndex}
              onMouseDown={() => handleSuggestionClick(suggestion)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <SuggestionText>{suggestion.text}</SuggestionText>
              <SuggestionType selected={index === selectedIndex}>
                {typeLabels[suggestion.type]}
              </SuggestionType>
            </SuggestionItem>
          ))}
        </SuggestionsList>
      </SuggestionsContainer>
      <SearchInputWrapper>
        {searchSymbol && <SearchIcon src={searchSymbol} />}
        <StyledSearchbar
          ref={inputRef}
          placeholder={placeholder}
          type="text"
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
        />
      </SearchInputWrapper>
    </StyledSearchbarContainer>
  )
}
