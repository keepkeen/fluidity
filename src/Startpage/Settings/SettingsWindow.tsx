import React, { Suspense, useEffect, useRef, useState } from "react"

import styled from "@emotion/styled"
import {
  faTimes,
  faSave,
  faFire,
} from "@fortawesome/free-solid-svg-icons"

import * as Settings from "./settingsHandler"
import { applyColors } from "../../base/colorUtils"
import { applyThemeMode } from "../../base/theme"
import { IconButton } from "../../components/IconButton"
import { Modal } from "../../components/Modal"
import { emitSettingsApplied } from "../../services/settingsEvents"
import {
  LinkDisplaySettings,
  WallpaperSettings as WallpaperSettingsType,
} from "../../data/data"
import {
  AISettingsManager,
  AISettings as AISettingsType,
  DEFAULT_AI_BASE_URL,
  resolveChatCompletionsUrl,
} from "../../services/ai"
import {
  HOME_LAYOUT_KEY,
  readHomeLayout,
  saveHomeLayout,
  withHomeLayoutLock,
} from "../../services/homeLayout"
import {
  getValidHomeAppIds,
  mergeAppOrderPreservingWidgets,
} from "../../services/homeOrderOrganizer"
import {
  LocalStorageTransactionError,
  runLocalStorageTransaction,
} from "../../services/localStorageTransaction"
import { ensureAIPermissionsFor } from "../../services/optionalPermissions"
import {
  getConflictingSettingsDomains,
  getDirtySettingsDomains,
  mergeLatestLinkIcons,
  PersistedSettingsSnapshot,
  SettingsDomain,
} from "../../services/settingsDraftConflict"

const SETTINGS_TRANSACTION_KEYS: Record<SettingsDomain, readonly string[]> = {
  design: ["design"],
  themes: ["themes"],
  search: ["search-settings"],
  links: ["link-groups", "fluidity.linkSync.v1"],
  homeLayout: [HOME_LAYOUT_KEY],
  linkDisplay: ["link-display-settings"],
  wallpaper: ["wallpaper-settings"],
  ai: [
    "ai-settings",
    "ai-cache",
    "ai-theme-cache",
    "report-cache",
    "fluidity.ai.dailyReview.v1",
    "ai-response-cache-scope.v1",
  ],
}

const SETTINGS_DOMAIN_LABELS: Record<SettingsDomain, string> = {
  design: "当前主题",
  themes: "主题列表",
  links: "链接",
  homeLayout: "主页布局",
  search: "搜索设置",
  ai: "AI 设置",
  linkDisplay: "链接展示",
  wallpaper: "壁纸",
}

const readPersistedSettings = (): PersistedSettingsSnapshot => ({
  design: Settings.Design.getWithFallback(),
  themes: Settings.Themes.getWithFallback(),
  linkGroups: Settings.Links.getWithFallback(),
  homeLayout: readHomeLayout(),
  searchSettings: Settings.Search.getWithFallback(),
  aiSettings: AISettingsManager.get(),
  linkDisplaySettings: Settings.LinkDisplay.getWithFallback(),
  wallpaperSettings: Settings.Wallpaper.getWithFallback(),
})

const serializeSettingsDraft = (
  settings: PersistedSettingsSnapshot,
  homeAppOrder: string[] | null
): string =>
  JSON.stringify({
    design: settings.design,
    themes: settings.themes,
    linkGroups: settings.linkGroups,
    homeAppOrder,
    homeLayout: settings.homeLayout,
    searchSettings: settings.searchSettings,
    aiSettings: settings.aiSettings,
    linkDisplaySettings: settings.linkDisplaySettings,
    wallpaperSettings: settings.wallpaperSettings,
  })

const AISettings = React.lazy(() =>
  import("./AISettings/AISettings").then(module => ({
    default: module.AISettings,
  }))
)

const DataSettings = React.lazy(() =>
  import("./DataSettings/DataSettings").then(module => ({
    default: module.DataSettings,
  }))
)

const DesignSettings = React.lazy(() =>
  import("./DesignSettings/DesignSettings").then(module => ({
    default: module.DesignSettings,
  }))
)

const LinkSettings = React.lazy(() =>
  import("./LinkSettings/LinkSettings").then(module => ({
    default: module.LinkSettings,
  }))
)

const SearchSettings = React.lazy(() =>
  import("./SearchSettings/SearchSettings").then(module => ({
    default: module.SearchSettings,
  }))
)

const WallpaperSettings = React.lazy(() =>
  import("./WallpaperSettings/WallpaperSettings").then(module => ({
    default: module.WallpaperSettings,
  }))
)

const StyledSettingsWindow = styled.div`
  animation: pop-in 0.28s cubic-bezier(0.22, 1, 0.36, 1) both;
  background: color-mix(in srgb, var(--bg-primary) 88%, transparent);
  backdrop-filter: var(--surface-blur);
  -webkit-backdrop-filter: var(--surface-blur);
  position: fixed;

  /* 居中定宽窗口：大屏上不再铺满全屏，宽 ≤1080px、高 ≤780px */
  top: max(44px, calc(50vh - 390px));
  bottom: max(44px, calc(50vh - 390px));
  left: 0;
  right: 0;
  margin-inline: auto;
  width: min(1080px, calc(100vw - 88px));

  border: 1px solid var(--surface-border);
  border-radius: var(--radius-main);
  padding: 64px 30px 30px 30px;
  box-shadow: var(--shadow-pop);
  overflow: hidden;
  z-index: 101;

  /* 中等屏幕优化 */
  @media screen and (max-width: 1440px) {
    top: max(30px, calc(50vh - 390px));
    bottom: max(30px, calc(50vh - 390px));
    width: min(1080px, calc(100vw - 60px));
    padding: 50px 20px 20px 20px;
  }

  /* 小屏幕优化 */
  @media screen and (max-width: 1024px) {
    top: 20px;
    bottom: 20px;
    width: calc(100vw - 40px);
    padding: 45px 15px 15px 15px;
  }

  @media screen and (max-width: 600px) {
    top: 10px;
    bottom: 10px;
    width: calc(100vw - 20px);
    padding: 50px 12px 12px 12px;
  }
`
const WindowContent = styled.div`
  width: 100%;
  height: calc(100% - 86px);
  display: flex;
  overflow: hidden;
  min-width: 0;
  box-sizing: border-box;

  /* 小屏幕垂直布局 */
  @media screen and (max-width: 1024px) {
    flex-direction: column;
    height: calc(100% - 118px);
  }

  @media screen and (max-width: 600px) {
    height: calc(100% - 150px);
  }
`

const WindowHeader = styled.div`
  color: var(--text-primary);
  /* 透明头部必须建立自己的层级，否则内容区的 positioned 元素会盖住 tab */
  z-index: 5;
  background: color-mix(in srgb, var(--bg-primary) 65%, transparent);
  backdrop-filter: var(--surface-blur);
  -webkit-backdrop-filter: var(--surface-blur);
  border-bottom: 1px solid var(--surface-border);
  width: 100%;
  height: 44px;
  position: absolute;
  left: 0;
  top: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  box-sizing: border-box;
  padding: 0 16px;
`

const WindowTitle = styled.h2`
  margin: 0 12px 0 0;
  font-size: 0.95rem;
  font-weight: 600;
  letter-spacing: 1px;
  opacity: 0.85;
  white-space: nowrap;
`

const WindowFooter = styled.div`
  display: flex;
  justify-content: space-between;
  position: absolute;
  left: 30px;
  right: 30px;
  bottom: 30px;

  @media screen and (max-width: 1440px) {
    left: 20px;
    right: 20px;
    bottom: 20px;
  }

  @media screen and (max-width: 1024px) {
    left: 15px;
    right: 15px;
    bottom: 15px;
    flex-wrap: wrap;
    gap: 10px;
  }

  @media screen and (max-width: 600px) {
    left: 12px;
    right: 12px;
    bottom: 12px;
    display: grid;
    grid-template-columns: 1fr 1fr;
  }
`

export const StyledSettingsContent = styled.div`
  background-color: var(--bg-primary);
  width: 400px;
  height: 100%;
  margin-right: 30px;
  padding-right: 20px;
  overflow-y: auto;

  /* 中等屏幕调整 */
  @media screen and (max-width: 1440px) {
    width: 350px;
    margin-right: 20px;
  }

  /* 小屏幕全宽 */
  @media screen and (max-width: 1024px) {
    width: 100%;
    max-height: 50%;
    margin-right: 0;
    margin-bottom: 15px;
    padding-right: 10px;
  }
`
export const SettingsLabel = styled.p`
  font-size: 1rem;
  padding: 10px 0;
`

export const SettingElement = styled.div`
  background-color: var(--bg-primary);
  position: relative;
  padding: 10px 0px;
  + {
    margin-top: 15px;
  }
`

const CloseButton = styled(IconButton)`
  z-index: 15;
  height: 30px;
  opacity: 1;
  padding: 0;

  @media (pointer: coarse) {
    width: 40px;
    height: 40px;
  }
`

export const SettingsButton = styled(IconButton)`
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  color: var(--text-primary);
  border: 1px solid var(--surface-border-strong);
  border-radius: var(--radius-sm);
  font-size: 0.92rem;
  padding: 9px 20px;
  opacity: 1;

  @media (pointer: coarse) {
    min-height: 40px;
  }

  :enabled:hover {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 28%, transparent);
    color: var(--text-primary);
  }
  :disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`

const Tabbar = styled.div`
  width: 100%;
  display: flex;
  justify-content: center;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: thin;

  /* 7 个 tab 总宽超过视口时必须可滚动，且不能用 center（首个 tab 会被裁掉） */
  @media screen and (max-width: 1200px) {
    justify-content: flex-start;
  }

  @media screen and (max-width: 600px) {
    display: none;
  }
`

const TabOption = styled.button<{ active: boolean }>`
  font-size: 0.9rem;
  font-weight: 500;
  height: 30px;
  margin: 0 2px;
  padding: 0 18px;
  display: flex;
  justify-content: center;
  align-items: center;
  background: ${({ active }) =>
    active
      ? "color-mix(in srgb, var(--accent) 18%, transparent)"
      : "transparent"};
  color: ${({ active }) =>
    active ? "var(--accent)" : "var(--text-secondary)"};
  outline: none;
  border: none;
  border-radius: 999px;
  cursor: ${({ active }) => (active ? "default" : "pointer")};
  transition:
    background var(--transition-fast),
    color var(--transition-fast);
  white-space: nowrap;

  :hover {
    color: ${({ active }) => (active ? "var(--accent)" : "var(--text-primary)")};
    background: ${({ active }) =>
      active
        ? "color-mix(in srgb, var(--accent) 18%, transparent)"
        : "color-mix(in srgb, var(--text-primary) 8%, transparent)"};
  }

  :focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  :disabled {
    cursor: wait;
    opacity: 0.55;
  }

  @media screen and (max-width: 1200px) {
    flex: 0 0 auto;
    padding: 0 14px;
  }

  @media (pointer: coarse) {
    min-height: 40px;
  }
`

const MobileTabSelect = styled.select`
  display: none;

  @media screen and (max-width: 600px) {
    display: block;
    flex: 1;
    min-width: 0;
    height: 40px;
    border: 1px solid var(--surface-border-strong);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-primary);
    font-size: 0.9rem;
  }
`

const PanelFallback = styled.div`
  width: 100%;
  padding: 20px 0;
  opacity: 0.75;
`

const PersistentPanel = styled.div<{ $active: boolean }>`
  display: ${({ $active }) => ($active ? "block" : "none")};
  width: 100%;
  height: 100%;
  min-width: 0;
`

const UnsavedHint = styled.span<{ visible: boolean }>`
  align-self: center;
  color: var(--accent);
  font-size: 0.85rem;
  opacity: ${({ visible }) => (visible ? 1 : 0)};
  transition: opacity 0.2s;

  @media screen and (max-width: 600px) {
    display: none;
  }
`

const ApplyError = styled.span`
  align-self: center;
  color: var(--accent-hover);
  font-size: 0.85rem;
  text-align: center;

  @media screen and (max-width: 600px) {
    grid-column: 1 / -1;
    grid-row: 2;
    max-height: 58px;
    overflow-y: auto;
  }
`

// tab 用稳定 id 做路由标识，label 仅用于显示——文案改动不能破坏跳转逻辑
const TAB_OPTIONS = [
  { id: "links", label: "链接" },
  { id: "design", label: "外观" },
  { id: "wallpaper", label: "壁纸" },
  { id: "search", label: "搜索栏" },
  { id: "ai", label: "AI 助手" },
  { id: "data", label: "数据" },
] as const

export type SettingsTabId = (typeof TAB_OPTIONS)[number]["id"]

const isTabId = (value: string | undefined): value is SettingsTabId =>
  TAB_OPTIONS.some(option => option.id === value)

interface props {
  hidePopup: () => void
  initialTab?: string
  /** 注册关闭守卫：返回 false 可阻止关闭（用于未应用更改提示） */
  registerCloseGuard?: (guard: () => boolean) => void
}

const CloseConfirmCard = styled.div`
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 1001;
  width: min(340px, calc(100vw - 48px));
  padding: 22px;
  background: color-mix(in srgb, var(--bg-primary) 92%, transparent);
  backdrop-filter: var(--surface-blur);
  -webkit-backdrop-filter: var(--surface-blur);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-main);
  box-shadow: var(--shadow-pop);
  text-align: center;
  animation: pop-in 0.25s cubic-bezier(0.22, 1, 0.36, 1) both;

  > h3 {
    margin: 0 0 8px;
    font-size: 1rem;
    color: var(--text-primary);
  }

  > p {
    margin: 0 0 18px;
    font-size: 0.85rem;
    color: var(--text-secondary);
    line-height: 1.5;
  }
`

const CloseConfirmButtons = styled.div`
  display: flex;
  gap: 10px;
  justify-content: center;
`

const CloseConfirmButton = styled.button<{ danger?: boolean }>`
  padding: 8px 22px;
  border-radius: 999px;
  border: 1px solid
    ${({ danger }) =>
      danger ? "var(--accent-hover)" : "var(--surface-border-strong)"};
  background: ${({ danger }) =>
    danger
      ? "color-mix(in srgb, var(--accent-hover) 18%, transparent)"
      : "transparent"};
  color: ${({ danger }) =>
    danger ? "var(--accent-hover)" : "var(--text-primary)"};
  font-size: 0.88rem;
  cursor: pointer;
  transition: background var(--transition-fast);

  :hover {
    background: ${({ danger }) =>
      danger
        ? "color-mix(in srgb, var(--accent-hover) 30%, transparent)"
        : "color-mix(in srgb, var(--text-primary) 8%, transparent)"};
  }
`

export const SettingsWindow = ({
  hidePopup,
  initialTab,
  registerCloseGuard,
}: props) => {
  const [currentTab, setCurrentTab] = useState<SettingsTabId>(
    isTabId(initialTab) ? initialTab : TAB_OPTIONS[0].id
  )
  const [hasOpenedLinks, setHasOpenedLinks] = useState(
    currentTab === "links"
  )
  const [design, setDesign] = useState(Settings.Design.getWithFallback())
  const [themes, setThemes] = useState(Settings.Themes.getWithFallback())
  const [linkGroups, setLinkGroups] = useState(Settings.Links.getWithFallback())
  const [homeLayout, setHomeLayout] = useState(readHomeLayout)
  const [homeAppOrder, setHomeAppOrder] = useState<string[] | null>(null)
  const [searchSettings, setSearchSettings] = useState(
    Settings.Search.getWithFallback()
  )
  const [aiSettings, setAISettings] = useState<AISettingsType>(
    AISettingsManager.get()
  )
  const [linkDisplaySettings, setLinkDisplaySettings] =
    useState<LinkDisplaySettings>(Settings.LinkDisplay.getWithFallback())
  const [wallpaperSettings, setWallpaperSettings] =
    useState<WallpaperSettingsType>(Settings.Wallpaper.getWithFallback())
  const [isApplying, setIsApplying] = useState(false)
  const [isOrganizing, setIsOrganizing] = useState(false)
  const [isDataReplacing, setIsDataReplacing] = useState(false)
  const [appliedRevision, setAppliedRevision] = useState(0)
  const [applyError, setApplyError] = useState<string | null>(null)
  const settingsInteractionLocked =
    isApplying || isOrganizing || isDataReplacing

  useEffect(() => {
    if (isTabId(initialTab)) {
      setCurrentTab(initialTab)
    }
  }, [initialTab])

  useEffect(() => {
    if (currentTab === "links") setHasOpenedLinks(true)
  }, [currentTab])

  const currentPersistedDraft: PersistedSettingsSnapshot = {
    design,
    themes,
    linkGroups,
    homeLayout,
    searchSettings,
    aiSettings,
    linkDisplaySettings,
    wallpaperSettings,
  }

  const persistedBaselineRef = useRef<PersistedSettingsSnapshot | null>(null)
  if (persistedBaselineRef.current === null) {
    persistedBaselineRef.current = currentPersistedDraft
  }

  // 挂载时的快照，用于关闭时检测未应用的更改
  const initialSnapshotRef = useRef<string | null>(null)
  if (initialSnapshotRef.current === null) {
    initialSnapshotRef.current = serializeSettingsDraft(
      currentPersistedDraft,
      homeAppOrder
    )
  }

  const snapshotRef = useRef("")
  snapshotRef.current = serializeSettingsDraft(
    currentPersistedDraft,
    homeAppOrder
  )
  const isDirty = snapshotRef.current !== initialSnapshotRef.current

  // 未应用更改时的关闭确认：用设计系统 Modal 代替原生 confirm（原生对话框阻塞且突兀）
  const [showCloseConfirm, setShowCloseConfirm] = useState(false)
  const skipGuardRef = useRef(false)

  useEffect(() => {
    registerCloseGuard?.(() => {
      if (skipGuardRef.current) return true
      if (snapshotRef.current === initialSnapshotRef.current) return true
      setShowCloseConfirm(true)
      return false
    })
  }, [registerCloseGuard])

  const discardAndClose = () => {
    skipGuardRef.current = true
    setShowCloseConfirm(false)
    hidePopup()
  }

  // 颜色/主题模式即时预览；未应用就关闭时回滚到已保存的设计
  useEffect(() => {
    applyColors(design.colors)
    applyThemeMode()
  }, [design])

  useEffect(
    () => () => {
      const persisted = Settings.Design.getWithFallback()
      applyColors(persisted.colors)
      applyThemeMode()
    },
    []
  )

  const discardChanges = () => {
    const persisted = readPersistedSettings()

    setDesign(persisted.design)
    setThemes(persisted.themes)
    setLinkGroups(persisted.linkGroups)
    setHomeLayout(persisted.homeLayout)
    setHomeAppOrder(null)
    setSearchSettings(persisted.searchSettings)
    setAISettings(persisted.aiSettings)
    setLinkDisplaySettings(persisted.linkDisplaySettings)
    setWallpaperSettings(persisted.wallpaperSettings)
    setApplyError(null)
    setAppliedRevision(revision => revision + 1)
    persistedBaselineRef.current = persisted
    initialSnapshotRef.current = serializeSettingsDraft(persisted, null)
    applyColors(persisted.design.colors)
    applyThemeMode()
  }

  const applyValues = async () => {
    if (isOrganizing) return
    setApplyError(null)
    const baseline = persistedBaselineRef.current ?? currentPersistedDraft
    const normalizedAISettings = {
      ...aiSettings,
      apiKey: aiSettings.apiKey.trim(),
      apiBaseUrl: aiSettings.apiBaseUrl.trim() || DEFAULT_AI_BASE_URL,
      model: aiSettings.model.trim() || "deepseek-chat",
    }
    const preliminaryHomeLayout = homeAppOrder
      ? {
          ...homeLayout,
          order: mergeAppOrderPreservingWidgets(
            homeLayout.order,
            homeAppOrder,
            getValidHomeAppIds(linkGroups)
          ),
        }
      : homeLayout
    const draft: PersistedSettingsSnapshot = {
      ...currentPersistedDraft,
      homeLayout: preliminaryHomeLayout,
      aiSettings: normalizedAISettings,
    }
    const dirtyDomains = getDirtySettingsDomains(baseline, draft)
    const dirty = new Set(dirtyDomains)

    if (dirty.has("ai")) {
      try {
        resolveChatCompletionsUrl(normalizedAISettings.apiBaseUrl)
      } catch (error) {
        setCurrentTab("ai")
        setApplyError(
          error instanceof Error ? error.message : "AI 接口地址格式无效"
        )
        return
      }
    }

    if (dirtyDomains.length === 0) {
      setHomeLayout(preliminaryHomeLayout)
      setHomeAppOrder(null)
      setAISettings(normalizedAISettings)
      persistedBaselineRef.current = draft
      initialSnapshotRef.current = serializeSettingsDraft(draft, null)
      return
    }

    setIsApplying(true)
    try {
      if (dirty.has("ai") && normalizedAISettings.enabled) {
        const granted = await ensureAIPermissionsFor(
          normalizedAISettings.apiBaseUrl
        )
        if (!granted) {
          setCurrentTab("ai")
          setApplyError("未授予新 AI 接口的访问权限，设置尚未保存")
          return
        }
      }

      const commitSettings = (): boolean => {
        // 权限请求可能让出事件循环；在真正写入前重新读取并检查冲突。
        // HomeLayout 的读取、校验与事务写入必须处于同一把跨标签页锁内。
        const latest = readPersistedSettings()
        const conflicts = getConflictingSettingsDomains(
          baseline,
          latest,
          dirtyDomains
        )
        if (conflicts.length > 0) {
          setApplyError(
            `其他标签页已修改${conflicts
              .map(domain => SETTINGS_DOMAIN_LABELS[domain])
              .join("、")}。为避免覆盖，已停止保存；请放弃更改并重新编辑。`
          )
          return false
        }

      const committedLinks = dirty.has("links")
        ? mergeLatestLinkIcons(
            linkGroups,
            baseline.linkGroups,
            latest.linkGroups
          )
        : latest.linkGroups
      const committedHomeLayout = homeAppOrder
        ? {
            ...homeLayout,
            order: mergeAppOrderPreservingWidgets(
              homeLayout.order,
              homeAppOrder,
              getValidHomeAppIds(committedLinks)
            ),
          }
        : homeLayout
      const committedDraft: PersistedSettingsSnapshot = {
        ...draft,
        linkGroups: committedLinks,
        homeLayout: committedHomeLayout,
      }
      const nextPersisted: PersistedSettingsSnapshot = {
        design: dirty.has("design") ? committedDraft.design : latest.design,
        themes: dirty.has("themes") ? committedDraft.themes : latest.themes,
        linkGroups: dirty.has("links")
          ? committedDraft.linkGroups
          : latest.linkGroups,
        homeLayout: dirty.has("homeLayout")
          ? committedDraft.homeLayout
          : latest.homeLayout,
        searchSettings: dirty.has("search")
          ? committedDraft.searchSettings
          : latest.searchSettings,
        aiSettings: dirty.has("ai")
          ? committedDraft.aiSettings
          : latest.aiSettings,
        linkDisplaySettings: dirty.has("linkDisplay")
          ? committedDraft.linkDisplaySettings
          : latest.linkDisplaySettings,
        wallpaperSettings: dirty.has("wallpaper")
          ? committedDraft.wallpaperSettings
          : latest.wallpaperSettings,
      }
      const transactionKeys = dirtyDomains.flatMap(
        domain => SETTINGS_TRANSACTION_KEYS[domain]
      )

      runLocalStorageTransaction(transactionKeys, () => {
        if (dirty.has("design")) Settings.Design.set(nextPersisted.design)
        if (dirty.has("themes")) Settings.Themes.set(nextPersisted.themes)
        if (dirty.has("search")) Settings.Search.set(nextPersisted.searchSettings)
        if (dirty.has("links")) Settings.Links.set(nextPersisted.linkGroups)
        if (dirty.has("homeLayout")) saveHomeLayout(nextPersisted.homeLayout)
        if (dirty.has("linkDisplay")) {
          Settings.LinkDisplay.set(nextPersisted.linkDisplaySettings)
        }
        if (dirty.has("wallpaper")) {
          Settings.Wallpaper.set(nextPersisted.wallpaperSettings)
        }
        if (dirty.has("ai")) AISettingsManager.set(nextPersisted.aiSettings)
      })

      setDesign(nextPersisted.design)
      setThemes(nextPersisted.themes)
      setLinkGroups(nextPersisted.linkGroups)
      setHomeLayout(nextPersisted.homeLayout)
      setHomeAppOrder(null)
      setSearchSettings(nextPersisted.searchSettings)
      setAISettings(nextPersisted.aiSettings)
      setLinkDisplaySettings(nextPersisted.linkDisplaySettings)
      setWallpaperSettings(nextPersisted.wallpaperSettings)
      setAppliedRevision(revision => revision + 1)
      persistedBaselineRef.current = nextPersisted
      initialSnapshotRef.current = serializeSettingsDraft(nextPersisted, null)
        emitSettingsApplied()
        return true
      }

      const committed = dirty.has("homeLayout") || dirty.has("links")
        ? await withHomeLayoutLock(commitSettings)
        : commitSettings()
      if (!committed) return
    } catch (error) {
      if (
        error instanceof LocalStorageTransactionError &&
        !error.rollbackComplete
      ) {
        setApplyError(
          `保存失败且原设置未完整恢复（${error.failedKeys.join(
            "、"
          )}），请先导出数据并重新加载扩展。`
        )
      } else {
        setApplyError(
          error instanceof Error
            ? `保存失败，原设置已恢复：${error.message}`
            : "保存失败，未写入更改"
        )
      }
    } finally {
      setIsApplying(false)
    }
  }

  return (
    <StyledSettingsWindow>
      <WindowHeader>
        <WindowTitle>设置</WindowTitle>
        <Tabbar>
          {TAB_OPTIONS.map(option => (
            <TabOption
              key={option.id}
              type="button"
              active={option.id === currentTab}
              disabled={settingsInteractionLocked}
              aria-pressed={option.id === currentTab}
              onClick={() => setCurrentTab(option.id)}
            >
              {option.label}
            </TabOption>
          ))}
        </Tabbar>
        <MobileTabSelect
          value={currentTab}
          aria-label="设置分类"
          disabled={settingsInteractionLocked}
          onChange={e => {
            if (isTabId(e.target.value)) setCurrentTab(e.target.value)
          }}
        >
          {TAB_OPTIONS.map(option => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </MobileTabSelect>
        <CloseButton
          aria-label="关闭设置"
          title="关闭设置"
          onClick={() => hidePopup()}
          icon={faTimes}
          disabled={settingsInteractionLocked}
        />
      </WindowHeader>

      <WindowContent
        aria-busy={settingsInteractionLocked || undefined}
        {...(settingsInteractionLocked ? { inert: "" } : {})}
      >
        <Suspense fallback={<PanelFallback>正在加载设置...</PanelFallback>}>
          {hasOpenedLinks && (
            <PersistentPanel $active={currentTab === "links"}>
              <LinkSettings
                linkGroups={linkGroups}
                setLinkGroups={setLinkGroups}
                homeAppOrder={homeAppOrder}
                setHomeAppOrder={setHomeAppOrder}
                homeLayoutOrder={homeLayout.order}
                aiSettings={aiSettings}
                appliedRevision={appliedRevision}
                onOrganizeBusyChange={setIsOrganizing}
              />
            </PersistentPanel>
          )}

          {currentTab === "design" && (
            <DesignSettings
              design={design}
              setDesign={setDesign}
              themes={themes}
              setThemes={setThemes}
              linkDisplaySettings={linkDisplaySettings}
              setLinkDisplaySettings={setLinkDisplaySettings}
              homeLayout={homeLayout}
              setHomeLayout={setHomeLayout}
            />
          )}

          {currentTab === "wallpaper" && (
            <WallpaperSettings
              wallpaperSettings={wallpaperSettings}
              onWallpaperChange={setWallpaperSettings}
              themeImage={design.image}
            />
          )}

          {currentTab === "search" && (
            <SearchSettings
              searchSettings={searchSettings}
              setSearchSettings={setSearchSettings}
            />
          )}

          {currentTab === "ai" && (
            <AISettings aiSettings={aiSettings} setAISettings={setAISettings} />
          )}

          {currentTab === "data" && (
            <DataSettings
              hasUnsavedChanges={isDirty}
              onReplacementBusyChange={setIsDataReplacing}
            />
          )}
        </Suspense>
      </WindowContent>

      <WindowFooter>
        <SettingsButton
          type="button"
          onClick={() => void applyValues()}
          disabled={
            !isDirty || isApplying || isOrganizing || isDataReplacing
          }
          text={
            isDataReplacing
              ? "数据处理中..."
              : isOrganizing
              ? "AI 整理中..."
              : isApplying
                ? "正在保存..."
                : "应用更改"
          }
          icon={faSave}
        />
        {applyError ? (
          <ApplyError role="alert">{applyError}</ApplyError>
        ) : (
          <UnsavedHint visible={isDirty} role="status">
            ● 有未应用的更改
          </UnsavedHint>
        )}
        <SettingsButton
          type="button"
          onClick={discardChanges}
          disabled={!isDirty || settingsInteractionLocked}
          text={"放弃更改"}
          icon={faFire}
        />
      </WindowFooter>

      {showCloseConfirm && (
        <Modal
          onClose={() => setShowCloseConfirm(false)}
          label="确认关闭设置"
          overlay="dark"
        >
          <CloseConfirmCard>
            <h3>有未应用的更改</h3>
            <p>关闭后这些更改将被丢弃。</p>
            <CloseConfirmButtons>
              <CloseConfirmButton
                type="button"
                onClick={() => setShowCloseConfirm(false)}
              >
                继续编辑
              </CloseConfirmButton>
              <CloseConfirmButton type="button" danger onClick={discardAndClose}>
                放弃并关闭
              </CloseConfirmButton>
            </CloseConfirmButtons>
          </CloseConfirmCard>
        </Modal>
      )}
    </StyledSettingsWindow>
  )
}
