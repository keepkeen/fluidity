import React, { Suspense, useEffect, useRef, useState } from "react"

import styled from "@emotion/styled"
import {
  faTimes,
  faTrash,
  faSave,
  faFire,
} from "@fortawesome/free-solid-svg-icons"

import * as Settings from "./settingsHandler"
import { applyColors } from "../../base/colorUtils"
import { applyThemeMode } from "../../base/theme"
import { IconButton } from "../../components/IconButton"
import { emitSettingsApplied } from "../../services/settingsEvents"
import {
  CardAreaSettings,
  LinkDisplaySettings,
  WallpaperSettings as WallpaperSettingsType,
} from "../../data/data"
import {
  AISettingsManager,
  AISettings as AISettingsType,
} from "../../services/ai"

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
  background-color: var(--bg-color);
  position: fixed;

  top: var(--settings-window-gap);
  right: var(--settings-window-gap);
  bottom: var(--settings-window-gap);
  left: var(--settings-window-gap);

  border: 2px solid var(--default-color);
  padding: 60px 30px 30px 30px;
  box-shadow: 10px 10px 0px var(--accent-color);
  z-index: 101;

  /* 中等屏幕优化 */
  @media screen and (max-width: 1440px) {
    top: 30px;
    right: 30px;
    bottom: 30px;
    left: 30px;
    padding: 50px 20px 20px 20px;
  }

  /* 小屏幕优化 */
  @media screen and (max-width: 1024px) {
    top: 20px;
    right: 20px;
    bottom: 20px;
    left: 20px;
    padding: 45px 15px 15px 15px;
  }

  @media screen and (max-width: 600px) {
    top: 10px;
    right: 10px;
    bottom: 10px;
    left: 10px;
    padding: 46px 12px 12px 12px;
    box-shadow: 5px 5px 0px var(--accent-color);
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
    height: calc(100% - 128px);
  }
`

const WindowHeader = styled.div`
  ::before {
    content: "设置";
    margin: 5px 20px 0 10px;
    white-space: nowrap;
  }
  color: var(--bg-color);
  background-color: var(--default-color);
  width: 100%;
  height: 32px;
  position: absolute;
  left: 0;
  top: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  box-sizing: border-box;
  padding: 0 8px;

  ::before {
    margin: 0 8px 0 0;
  }
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

    > button:last-child {
      grid-column: 1 / -1;
    }
  }
`

export const StyledSettingsContent = styled.div`
  background-color: var(--bg-color);
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
  background-color: var(--bg-color);
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
`

export const SettingsButton = styled(IconButton)`
  background-color: var(--default-color);
  color: var(--bg-color);
  font-size: 1rem;
  padding: 10px 20px;
  :enabled:hover {
    animation: circling-shadow-small 2s ease 0s infinite normal;
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
  font-size: 1rem;
  font-weight: 500;
  transition: 0.3s;
  height: 100%;
  min-width: 150px;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: transparent;
  outline: none;
  border: none;
  cursor: ${({ active }) => (active ? "default" : "pointer")};
  ${({ active }) => active && "text-shadow: var(--text-shadow-downwards)"};
  :hover {
    text-shadow: var(--text-shadow-downwards);
  }

  @media screen and (max-width: 1200px) {
    min-width: auto;
    flex: 0 0 auto;
    padding: 0 16px;
    white-space: nowrap;
  }
`

const MobileTabSelect = styled.select`
  display: none;

  @media screen and (max-width: 600px) {
    display: block;
    flex: 1;
    min-width: 0;
    height: 24px;
    border: 1px solid var(--bg-color);
    background: var(--default-color);
    color: var(--bg-color);
    font-size: 0.95rem;
    font-weight: 600;
  }
`

const PanelFallback = styled.div`
  width: 100%;
  padding: 20px 0;
  opacity: 0.75;
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

export const SettingsWindow = ({
  hidePopup,
  initialTab,
  registerCloseGuard,
}: props) => {
  const [currentTab, setCurrentTab] = useState<SettingsTabId>(
    isTabId(initialTab) ? initialTab : TAB_OPTIONS[0].id
  )
  const [design, setDesign] = useState(Settings.Design.getWithFallback())
  const [themes, setThemes] = useState(Settings.Themes.getWithFallback())
  const [linkGroups, setLinkGroups] = useState(Settings.Links.getWithFallback())
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
  const [cardAreaSettings, setCardAreaSettings] = useState<CardAreaSettings>(
    Settings.CardArea.getWithFallback()
  )

  useEffect(() => {
    if (isTabId(initialTab)) {
      setCurrentTab(initialTab)
    }
  }, [initialTab])

  const snapshot = () =>
    JSON.stringify({
      design,
      themes,
      linkGroups,
      searchSettings,
      aiSettings,
      linkDisplaySettings,
      wallpaperSettings,
      cardAreaSettings,
    })

  // 挂载时的快照，用于关闭时检测未应用的更改
  const initialSnapshotRef = useRef<string | null>(null)
  if (initialSnapshotRef.current === null) {
    initialSnapshotRef.current = snapshot()
  }

  const snapshotRef = useRef("")
  snapshotRef.current = snapshot()

  useEffect(() => {
    registerCloseGuard?.(() => {
      if (snapshotRef.current === initialSnapshotRef.current) return true
      return window.confirm("有未应用的更改，确定放弃并关闭吗？")
    })
  }, [registerCloseGuard])

  // 颜色/主题模式即时预览；未应用就关闭时回滚到已保存的设计
  const appliedRef = useRef(false)
  useEffect(() => {
    applyColors(design.colors)
    applyThemeMode(design.mode || "retro")
  }, [design])

  useEffect(
    () => () => {
      if (appliedRef.current) return
      const persisted = Settings.Design.getWithFallback()
      applyColors(persisted.colors)
      applyThemeMode(persisted.mode || "retro")
    },
    []
  )

  const applyValues = () => {
    appliedRef.current = true
    Settings.Design.set(design)
    Settings.Themes.set(themes)
    Settings.Search.set(searchSettings)
    Settings.Links.set(linkGroups)
    Settings.LinkDisplay.set(linkDisplaySettings)
    Settings.Wallpaper.set(wallpaperSettings)
    Settings.CardArea.set(cardAreaSettings)
    AISettingsManager.set(aiSettings)
    emitSettingsApplied()
  }

  return (
    <StyledSettingsWindow>
      <WindowHeader>
        <Tabbar>
          {TAB_OPTIONS.map(option => (
            <TabOption
              key={option.id}
              type="button"
              active={option.id === currentTab}
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
          inverted
          aria-label="关闭设置"
          title="关闭设置"
          onClick={() => hidePopup()}
          icon={faTimes}
        />
      </WindowHeader>

      <WindowContent>
        <Suspense fallback={<PanelFallback>正在加载设置...</PanelFallback>}>
          {currentTab === "links" && (
            <LinkSettings
              linkGroups={linkGroups}
              setLinkGroups={setLinkGroups}
            />
          )}

          {currentTab === "design" && (
            <DesignSettings
              design={design}
              setDesign={setDesign}
              themes={themes}
              setThemes={setThemes}
              linkDisplaySettings={linkDisplaySettings}
              setLinkDisplaySettings={setLinkDisplaySettings}
            />
          )}

          {currentTab === "wallpaper" && (
            <WallpaperSettings
              wallpaperSettings={wallpaperSettings}
              cardAreaSettings={cardAreaSettings}
              onWallpaperChange={setWallpaperSettings}
              onCardAreaChange={setCardAreaSettings}
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

          {currentTab === "data" && <DataSettings />}
        </Suspense>
      </WindowContent>

      <WindowFooter>
        <SettingsButton
          type="button"
          onClick={() => applyValues()}
          text={"应用更改"}
          icon={faSave}
        />
        <SettingsButton
          type="button"
          onClick={() => {
            emitSettingsApplied()
          }}
          text={"放弃更改"}
          icon={faFire}
        />
        <SettingsButton
          type="button"
          onClick={() => {
            const confirmed = window.confirm(
              "确定要清除全部设置吗？链接、主题、待办和统计数据都会被删除，且无法恢复。"
            )
            if (!confirmed) return
            localStorage.clear()
            window.location.reload()
          }}
          text={"清除全部设置"}
          icon={faTrash}
        />
      </WindowFooter>
    </StyledSettingsWindow>
  )
}
