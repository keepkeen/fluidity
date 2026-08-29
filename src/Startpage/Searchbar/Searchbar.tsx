import React, { useState, useRef, useEffect, useCallback, useMemo } from "react"

import styled from "@emotion/styled"
import { faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"

import {
  Search as SearchType,
  linkGroup,
  searchEngines,
  SearchEngine,
  findEngineByShortcut,
} from "../../data/data"
import duckduckgo from "../../data/pictures/duckduckgo.svg"
import ecosia from "../../data/pictures/ecosia.svg"
import google from "../../data/pictures/google.svg"
import qwant from "../../data/pictures/qwant.svg"
import { SearchHistory, LinkAnalytics } from "../../services/analytics"
import { readHomeLayout } from "../../services/homeLayout"
import { searchLinksOnly, navigateToLink } from "../../services/linkSearch"
import {
  matchSearchText,
  rankSearchHistory,
} from "../../services/smartSearch"
import * as Settings from "../Settings/settingsHandler"

export const queryToken = "{{query}}"

// 导出 SearchSettings 类型别名
export type SearchSettings = SearchType

// 建议项类型
type SuggestionType =
  | "history"
  | "link"
  | "fastforward"
  | "quicklink"
  | "engine" // 新增：搜索引擎建议

interface Suggestion {
  text: string
  type: SuggestionType
  url?: string
  icon?: string
  detail?: string
  groupTitle?: string // 用于 quicklink 类型
  engine?: SearchEngine // 用于 engine 类型
}

const StyledSearchbarContainer = styled.div`
  animation: fade-up 0.55s cubic-bezier(0.22, 1, 0.36, 1) 160ms both;
  position: relative;
  margin: 0 var(--page-margin) clamp(12px, 2.5vh, 40px)
    calc(var(--page-margin) - 2.9rem - 10px);
  height: min-content;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-end;
  flex-shrink: 0;

  @media screen and (max-width: 600px) {
    width: calc(100% - 24px);
    margin-left: 12px;
    margin-right: 12px;
    margin-bottom: 20px;
    box-sizing: border-box;
  }
`

const SearchInputWrapper = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 12px 18px;
  background: var(--home-surface);
  backdrop-filter: var(--surface-blur);
  -webkit-backdrop-filter: var(--surface-blur);
  border: 1px solid var(--home-stroke);
  border-radius: var(--radius-main);
  box-shadow: var(--home-shadow);
  transition: border-color var(--transition-fast);

  :focus-within {
    border-color: color-mix(in srgb, var(--accent) 55%, transparent);
  }
  min-width: 0;
  box-sizing: border-box;
`

const StyledSearchbar = styled.input`
  width: 100%;
  min-width: 0;
  /* 字号随视口流式缩放：~15pt @600px → 26pt 封顶，低分辨率不再需要手动缩放 */
  font-size: clamp(15pt, 1.2vw + 7pt, 26pt);

  background-color: transparent;
  color: var(--text-primary);
  transition: 0.3s;
  border: none;

  ::placeholder {
    color: var(--text-primary);
    opacity: 0.6;
  }

  :focus {
    outline: none;
  }
`

/* mask 的 URL 经 CSS 变量注入：emotion 无法序列化 url() 内的函数插值，
   直接插值会导致整条 mask-image 声明被丢弃（图标从不显示的根因） */
const SearchIcon = styled.div`
  height: 2.9rem;
  width: 3.1rem;
  flex-shrink: 0;
  margin: auto 10px auto 0;

  background: var(--text-primary);

  mask-size: contain;
  mask-repeat: no-repeat;
  mask-position: center;
  mask-image: var(--engine-icon);
  -webkit-mask-size: contain;
  -webkit-mask-repeat: no-repeat;
  -webkit-mask-position: center;
  -webkit-mask-image: var(--engine-icon);

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

/* 无专属 logo 的引擎（百度/Bing/知乎/自定义等）回退到通用放大镜 */
const FallbackSearchIcon = styled.div`
  height: 2.9rem;
  width: 3.1rem;
  flex-shrink: 0;
  margin: auto 10px auto 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-primary);
  font-size: 2rem;

  @media screen and (max-width: 900px) {
    height: 2.4rem;
    width: 2.6rem;
    font-size: 1.7rem;
  }

  @media screen and (max-width: 600px) {
    height: 1.8rem;
    width: 2rem;
    margin-right: 8px;
    font-size: 1.3rem;
  }
`

// 当前搜索引擎标签
const EngineTag = styled.button`
  appearance: none;
  display: inline-flex;
  align-items: center;
  align-self: center;
  padding: 4px 12px;
  margin-right: 10px;
  background: color-mix(in srgb, var(--accent) 20%, transparent);
  color: var(--accent);
  border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
  border-radius: 999px;
  font-size: 13px;
  font-weight: 500;
  font-family: inherit;
  line-height: inherit;
  white-space: nowrap;
  flex-shrink: 0;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
`

const SuggestionsContainer = styled.div<{ visible: boolean }>`
  position: absolute;
  bottom: 100%;
  left: calc(2.9rem + 10px);
  right: 0;
  max-height: ${({ visible }) =>
    visible ? "min(420px, calc(100vh - 120px))" : "0"};
  overflow-x: hidden;
  overflow-y: ${({ visible }) => (visible ? "auto" : "hidden")};
  overscroll-behavior: contain;
  transition: max-height 0.2s ease-out, opacity 0.2s ease-out;
  opacity: ${({ visible }) => (visible ? 1 : 0)};
  margin-bottom: 8px;

  @media screen and (max-width: 600px) {
    position: static;
    left: auto;
    right: auto;
    bottom: auto;
    max-height: ${({ visible }) => (visible ? "260px" : "0")};
    overflow-y: ${({ visible }) => (visible ? "auto" : "hidden")};
    margin-bottom: ${({ visible }) => (visible ? "8px" : "0")};
  }
`

const SuggestionsList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  background: color-mix(in srgb, var(--bg-primary) 82%, transparent);
  backdrop-filter: var(--surface-blur);
  -webkit-backdrop-filter: var(--surface-blur);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-pop);
  overflow: hidden;
`

const SuggestionItem = styled.li<{ selected: boolean }>`
  padding: 11px 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 12px;
  transition: background var(--transition-fast), color var(--transition-fast);
  background: ${({ selected }) =>
    selected
      ? "color-mix(in srgb, var(--accent) 20%, transparent)"
      : "transparent"};
  color: ${({ selected }) =>
    selected ? "var(--accent)" : "var(--text-primary)"};

  &:hover {
    background: color-mix(in srgb, var(--accent) 20%, transparent);
    color: var(--accent);
  }
`

const SuggestionText = styled.span`
  flex: 1;
  min-width: 0;
  font-size: 1rem;
`

const SuggestionLabel = styled.span`
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const SuggestionDetail = styled.span`
  display: block;
  margin-top: 2px;
  color: var(--text-muted);
  font-size: 0.75rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const SuggestionType = styled.span<{ selected: boolean }>`
  font-size: 0.72rem;
  padding: 2px 9px;
  border-radius: 999px;
  border: 1px solid
    ${({ selected }) =>
      selected
        ? "color-mix(in srgb, var(--accent) 55%, transparent)"
        : "var(--surface-border)"};
  color: ${({ selected }) => (selected ? "var(--accent)" : "var(--text-muted)")};
`

const typeLabels: Record<Suggestion["type"], string> = {
  history: "历史",
  link: "常用",
  fastforward: "快捷",
  quicklink: "标签",
  engine: "引擎",
}

/**
 * 获取链接搜索建议（/ 前缀）
 */
const getLinkSuggestions = (
  query: string,
  linkGroups: linkGroup[],
  limit = 8
): Suggestion[] => {
  const results = searchLinksOnly(linkGroups, query)
  return results.slice(0, limit).map(link => ({
    text: link.label,
    type: "quicklink" as const,
    url: link.value,
    groupTitle: link.groupTitle,
    detail: link.groupTitle,
  }))
}

/**
 * 获取智能建议
 */
const getSuggestions = (
  query: string,
  searchSettings: SearchType,
  linkGroups: linkGroup[]
): Suggestion[] => {
  const collector = new SuggestionCollector(8)
  const lowerQuery = query.toLowerCase()

  // 标签保留最多 5 席，确保历史搜索不会被大量导入标签完全挤掉。
  getLinkSuggestions(query, linkGroups, 5).forEach(suggestion =>
    collector.add(suggestion)
  )

  rankSearchHistory(SearchHistory.get(), query, 3).forEach(record => {
    collector.add({
      text: record.query,
      type: "history",
      detail: "再次搜索",
    })
  })

  // 快捷词匹配
  Object.entries(searchSettings.fastForward).forEach(([key, url]) => {
    if (matchSearchText(key, lowerQuery).score > 0) {
      collector.add({ text: key, type: "fastforward", url })
    }
  })

  // 分析数据可能包含已被用户删除的旧标签，作为末位常用链接保留。
  const topLinks = LinkAnalytics.getTopLinks(10)
  topLinks.forEach(link => {
    if (matchSearchText(link.label, lowerQuery).score > 0) {
      const analytics = LinkAnalytics.get()
      const linkData = Object.values(analytics).find(
        l => l.label === link.label
      )
      collector.add({
        text: link.label,
        type: "link",
        url: linkData?.url,
        detail: link.group || "常用链接",
      })
    }
  })

  return collector.getAll()
}

// 去重建议收集器
class SuggestionCollector {
  private suggestions: Suggestion[] = []
  private seenTexts = new Set<string>()
  private maxCount: number

  constructor(maxCount: number) {
    this.maxCount = maxCount
  }

  add(suggestion: Suggestion): boolean {
    if (this.suggestions.length >= this.maxCount) return false
    const lowerText = suggestion.text.toLowerCase()
    if (this.seenTexts.has(lowerText)) return false
    this.seenTexts.add(lowerText)
    this.suggestions.push(suggestion)
    return true
  }

  isFull(): boolean {
    return this.suggestions.length >= this.maxCount
  }

  getAll(): Suggestion[] {
    return this.suggestions
  }
}

/**
 * 获取默认建议（无输入时）
 * 历史和推荐去重，总数限制5个
 */
const getDefaultSuggestions = (searchSettings: SearchType): Suggestion[] => {
  const collector = new SuggestionCollector(8)

  // 1. 最近搜索（优先级最高）
  rankSearchHistory(SearchHistory.get(), "", 5).forEach(record => {
    collector.add({
      text: record.query,
      type: "history",
      detail: "最近搜索",
    })
  })

  // 2. 最常访问的链接
  const analytics = LinkAnalytics.get()
  LinkAnalytics.getTopLinks(5).forEach(link => {
    const linkData = Object.values(analytics).find(l => l.label === link.label)
    collector.add({
      text: link.label,
      type: "link",
      url: linkData?.url,
      detail: link.group || "常用链接",
    })
  })

  // 4. 快捷词
  Object.entries(searchSettings.fastForward).forEach(([key, url]) => {
    collector.add({ text: key, type: "fastforward", url })
  })

  return collector.getAll()
}

const SPACE_ACTIVATION_SELECTOR = [
  "button",
  "a[href]",
  "summary",
  '[role="button"]',
  '[role="checkbox"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="tab"]',
].join(", ")

export const isSpaceActivationTarget = (target: EventTarget | null): boolean =>
  target instanceof Element && Boolean(target.closest(SPACE_ACTIVATION_SELECTOR))

export const Searchbar = () => {
  // 使用 useMemo 稳定 searchSettings，避免每次渲染都创建新对象
  const searchSettings = useMemo(() => Settings.Search.getWithFallback(), [])
  const linkGroups = useMemo(() => Settings.Links.getWithFallback(), [])
  const linkDisplaySettings = useMemo(
    () => Settings.LinkDisplay.getWithFallback(),
    []
  )
  const defaultEngine: string = searchSettings.engine
  const legacyPlaceholder = "按 Enter 搜索，@ 切换引擎，/ 搜索链接"
  const placeholder =
    !searchSettings.placeholder || searchSettings.placeholder === legacyPlaceholder
      ? "搜索标签、拼音或网页，@ 切换引擎"
      : searchSettings.placeholder

  const [inputValue, setInputValue] = useState("")
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [isLinkMode, setIsLinkMode] = useState(false) // 是否处于链接搜索模式
  const [tempEngine, setTempEngine] = useState<SearchEngine | null>(null) // 临时选择的引擎
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // 当前使用的引擎
  const currentEngine = tempEngine?.value ?? defaultEngine

  const searchSymbol = useMemo(() => {
    const engineUrl = currentEngine
    if (engineUrl.includes("duckduckgo")) return duckduckgo
    if (engineUrl.includes("google")) return google
    if (engineUrl.includes("qwant")) return qwant
    if (engineUrl.includes("ecosia")) return ecosia
    return undefined
  }, [currentEngine])

  // 获取搜索引擎建议
  const getEngineSuggestions = useCallback(
    (shortcut: string): Suggestion[] => {
      const customEngines = searchSettings.customEngines ?? []
      const matchedEngines = findEngineByShortcut(shortcut, customEngines)
      return matchedEngines.map(engine => ({
        text: `@${engine.shortcut} ${engine.label}`,
        type: "engine" as const,
        engine,
      }))
    },
    [searchSettings.customEngines]
  )

  // 处理引擎模式建议
  const handleEngineModeInput = useCallback(
    (input: string): Suggestion[] | null => {
      const atMatch = input.match(/^@(\w*)(?:\s|$)/)
      if (!atMatch) return null

      const shortcut = atMatch[1]
      if (!shortcut) {
        // 显示所有引擎
        const allEngines = [
          ...searchEngines,
          ...(searchSettings.customEngines ?? []),
        ]
        return allEngines.slice(0, 8).map(engine => ({
          text: `@${engine.shortcut} ${engine.label}`,
          type: "engine" as const,
          engine,
        }))
      }

      const engineSuggestions = getEngineSuggestions(shortcut)
      // 如果只有一个精确匹配且用户按了空格，自动选择
      if (engineSuggestions.length === 1 && input.includes(" ")) {
        const engine = engineSuggestions[0].engine
        if (engine) {
          setTempEngine(engine)
          const searchPart = input.replace(/^@\w+\s*/, "")
          setInputValue(searchPart)
          return null // 返回 null 表示已处理，不需要设置建议
        }
      }
      return engineSuggestions
    },
    [getEngineSuggestions, searchSettings.customEngines]
  )

  // 输入变化时更新建议并重置选中
  useEffect(() => {
    if (!showSuggestions) return

    // 检测引擎选择模式（以 @ 开头）
    const engineSuggestions = handleEngineModeInput(inputValue)
    if (engineSuggestions !== null) {
      setIsLinkMode(false)
      setSuggestions(engineSuggestions)
      setSelectedIndex(-1)
      return
    }
    if (inputValue.startsWith("@")) {
      // 已自动选择引擎，等待下一次渲染
      return
    }

    // 检测链接搜索模式（以 / 开头）
    if (inputValue.startsWith("/")) {
      setIsLinkMode(true)
      const linkQuery = inputValue.slice(1).trim()
      setSuggestions(getLinkSuggestions(linkQuery, linkGroups))
      setSelectedIndex(-1)
      return
    }

    // 普通搜索模式
    setIsLinkMode(false)
    const normalSuggestions = inputValue.trim()
      ? getSuggestions(inputValue, searchSettings, linkGroups)
      : getDefaultSuggestions(searchSettings)
    setSuggestions(normalSuggestions)
    setSelectedIndex(-1)
  }, [
    inputValue,
    showSuggestions,
    searchSettings,
    linkGroups,
    handleEngineModeInput,
  ])

  useEffect(() => {
    const handleGlobalTyping = (event: KeyboardEvent) => {
      const target = event.target
      const isEditable =
        target instanceof HTMLElement &&
        (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
          target.isContentEditable)
      const spaceActivatesFocusedControl =
        event.key === " " && isSpaceActivationTarget(target)
      const interactionBlocked = Boolean(
        document.querySelector('[role="dialog"]') ||
          document.querySelector('[data-home-editing="true"]')
      )
      const isShiftPageShortcut =
        readHomeLayout().pageShortcutModifier === "shift" &&
        event.shiftKey &&
        /^Digit[1-9]$/.test(event.code)
      if (
        isEditable ||
        spaceActivatesFocusedControl ||
        interactionBlocked ||
        isShiftPageShortcut ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      )
        return

      const isImeStart =
        event.isComposing || event.key === "Process" || event.keyCode === 229
      const isPrintable = event.key.length === 1 && event.key !== "/"
      if (!isImeStart && !isPrintable) return

      setShowSuggestions(true)
      inputRef.current?.focus()
      if (isPrintable) {
        event.preventDefault()
        setInputValue(event.key)
      }
    }

    window.addEventListener("keydown", handleGlobalTyping, true)
    return () => window.removeEventListener("keydown", handleGlobalTyping, true)
  }, [])

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

  const redirectToSearch = useCallback(
    (query: string) => {
      const trimmedQuery = query.trim()
      // 记录搜索历史
      if (trimmedQuery) {
        SearchHistory.trackSearch(trimmedQuery, currentEngine)
      }

      let targetUrl: string
      if (searchSettings.fastForward[trimmedQuery]) {
        targetUrl = searchSettings.fastForward[trimmedQuery]
      } else {
        // for compatibility with old engine urls before fluidity 0.5.0
        if (!currentEngine.includes(queryToken)) {
          targetUrl = "https://" + currentEngine + "?q=" + query
        } else {
          targetUrl = currentEngine.replace(
            queryToken,
            encodeURIComponent(query)
          )
        }
      }
      navigateTo(targetUrl)
      // 搜索后清除临时引擎
      setTempEngine(null)
    },
    [currentEngine, searchSettings.fastForward, navigateTo]
  )

  // 处理建议点击 - 使用 useCallback 避免依赖问题
  const handleSuggestionClick = useCallback(
    (suggestion: Suggestion) => {
      // 处理引擎选择
      if (suggestion.type === "engine" && suggestion.engine) {
        setTempEngine(suggestion.engine)
        // 移除 @shortcut 部分，保留搜索内容
        const searchPart = inputValue.replace(/^@\w*\s*/, "")
        setInputValue(searchPart)
        inputRef.current?.focus()
        return
      }

      if (suggestion.url) {
        if (suggestion.type === "quicklink" && suggestion.groupTitle) {
          navigateToLink(
            suggestion.url,
            suggestion.text,
            suggestion.groupTitle,
            linkDisplaySettings.openInNewTab
          )
        } else if (suggestion.type === "link") {
          LinkAnalytics.trackClick(suggestion.url, suggestion.text, "")
          navigateTo(suggestion.url)
        } else {
          navigateTo(suggestion.url)
        }
      } else {
        redirectToSearch(suggestion.text)
      }
    },
    [inputValue, linkDisplaySettings.openInNewTab, navigateTo, redirectToSearch]
  )

  // 键盘导航处理函数
  const handleArrowDown = useCallback(() => {
    setSelectedIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : prev))
  }, [suggestions.length])

  const handleArrowUp = useCallback(() => {
    setSelectedIndex(prev => (prev > 0 ? prev - 1 : -1))
  }, [])

  const handleEscape = useCallback(() => {
    setShowSuggestions(false)
    setSelectedIndex(-1)
  }, [])

  // Tab 键补全处理
  const handleTabComplete = useCallback(() => {
    if (!isLinkMode || suggestions.length === 0) return false
    const target =
      selectedIndex >= 0 ? suggestions[selectedIndex] : suggestions[0]
    if (target.url) {
      handleSuggestionClick(target)
      return true
    }
    return false
  }, [isLinkMode, suggestions, selectedIndex, handleSuggestionClick])

  // Enter 键处理
  const handleEnterKey = useCallback(() => {
    if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
      handleSuggestionClick(suggestions[selectedIndex])
    } else if (isLinkMode && suggestions.length > 0) {
      handleSuggestionClick(suggestions[0])
    } else if (!isLinkMode) {
      redirectToSearch(inputValue)
    }
  }, [
    selectedIndex,
    suggestions,
    isLinkMode,
    handleSuggestionClick,
    inputValue,
    redirectToSearch,
  ])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      // Tab 键补全
      if (e.key === "Tab") {
        if (handleTabComplete()) {
          e.preventDefault()
        }
        return
      }

      // 无建议时的处理
      if (!showSuggestions || suggestions.length === 0) {
        if (e.key === "Enter" && !isLinkMode) {
          redirectToSearch(inputValue)
        }
        return
      }

      // 有建议时的键盘导航
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault()
          handleArrowDown()
          break
        case "ArrowUp":
          e.preventDefault()
          handleArrowUp()
          break
        case "Enter":
          e.preventDefault()
          handleEnterKey()
          break
        case "Escape":
          handleEscape()
          break
      }
    },
    [
      handleTabComplete,
      showSuggestions,
      suggestions.length,
      isLinkMode,
      inputValue,
      redirectToSearch,
      handleArrowDown,
      handleArrowUp,
      handleEnterKey,
      handleEscape,
    ]
  )

  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (blurTimerRef.current) clearTimeout(blurTimerRef.current)
    }
  }, [])

  const handleFocus = useCallback(() => {
    // 小屏上建议列表是静态布局，聚焦即展开会把链接区顶开；输入后再显示
    const isSmallScreen = window.matchMedia("(max-width: 600px)").matches
    if (isSmallScreen && !inputValue.trim()) return
    setShowSuggestions(true)
    // 建议会通过 useEffect 自动更新
  }, [inputValue])

  const handleBlur = (e: React.FocusEvent) => {
    // 延迟关闭，以便点击建议项时能够触发
    if (!containerRef.current?.contains(e.relatedTarget as Node)) {
      if (blurTimerRef.current) clearTimeout(blurTimerRef.current)
      blurTimerRef.current = setTimeout(() => setShowSuggestions(false), 150)
    }
  }

  return (
    <StyledSearchbarContainer ref={containerRef}>
      <SuggestionsContainer visible={showSuggestions && suggestions.length > 0}>
        <SuggestionsList
          id="search-suggestions"
          role="listbox"
          aria-hidden={!showSuggestions || suggestions.length === 0}
        >
          {suggestions.map((suggestion, index) => (
            <SuggestionItem
              id={`search-suggestion-${index}`}
              key={`${suggestion.type}-${suggestion.text}`}
              role="option"
              aria-selected={index === selectedIndex}
              selected={index === selectedIndex}
              onMouseDown={event => {
                event.preventDefault()
                handleSuggestionClick(suggestion)
              }}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <SuggestionText>
                <SuggestionLabel>
                  {suggestion.icon
                    ? `${suggestion.icon} ${suggestion.text}`
                    : suggestion.text}
                </SuggestionLabel>
                {suggestion.detail && (
                  <SuggestionDetail>{suggestion.detail}</SuggestionDetail>
                )}
              </SuggestionText>
              <SuggestionType selected={index === selectedIndex}>
                {typeLabels[suggestion.type]}
              </SuggestionType>
            </SuggestionItem>
          ))}
        </SuggestionsList>
      </SuggestionsContainer>
      <SearchInputWrapper>
        {searchSymbol ? (
          <SearchIcon
            aria-hidden
            style={
              // data: URI 含空格/引号，url() 必须加引号才是合法 CSS 值
              {
                "--engine-icon": `url("${searchSymbol}")`,
              } as React.CSSProperties
            }
          />
        ) : (
          <FallbackSearchIcon aria-hidden>
            <FontAwesomeIcon icon={faMagnifyingGlass} />
          </FallbackSearchIcon>
        )}
        {tempEngine && (
          <EngineTag
            type="button"
            onClick={() => setTempEngine(null)}
            aria-label={`清除临时搜索引擎 ${tempEngine.label}，恢复默认引擎`}
            title="点击清除，恢复默认引擎"
          >
            {tempEngine.label} ✕
          </EngineTag>
        )}
        <StyledSearchbar
          ref={inputRef}
          aria-label="搜索"
          placeholder={
            tempEngine ? `使用 ${tempEngine.label} 搜索...` : placeholder
          }
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-controls="search-suggestions"
          aria-expanded={showSuggestions && suggestions.length > 0}
          aria-activedescendant={
            selectedIndex >= 0 ? `search-suggestion-${selectedIndex}` : undefined
          }
          value={inputValue}
          onChange={e => {
            setInputValue(e.target.value)
            // 输入内容后展开建议（小屏聚焦时不自动展开，靠这里补上）
            if (e.target.value.trim()) setShowSuggestions(true)
          }}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
        />
      </SearchInputWrapper>
    </StyledSearchbarContainer>
  )
}
