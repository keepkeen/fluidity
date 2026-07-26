import React, { Suspense, useEffect, useState } from "react"

import styled from "@emotion/styled"
import {
  faTimes,
  faTrash,
  faSave,
  faFire,
} from "@fortawesome/free-solid-svg-icons"

import * as Settings from "./settingsHandler"
import { IconButton } from "../../components/IconButton"
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

const Changelog = React.lazy(() =>
  import("./Changelog/Changelog").then(module => ({
    default: module.Changelog,
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

const TabOptions = [
  "链接",
  "外观",
  "壁纸",
  "搜索栏",
  "AI 助手",
  "数据",
  "更新日志",
]

interface props {
  hidePopup: () => void
  initialTab?: string
}

export const SettingsWindow = ({ hidePopup, initialTab }: props) => {
  const [currentTab, setCurrentTab] = useState(
    initialTab && TabOptions.includes(initialTab) ? initialTab : TabOptions[0]
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
    if (initialTab && TabOptions.includes(initialTab)) {
      setCurrentTab(initialTab)
    }
  }, [initialTab])

  const applyValues = () => {
    Settings.Design.set(design)
    Settings.Themes.set(themes)
    Settings.Search.set(searchSettings)
    Settings.Links.set(linkGroups)
    Settings.LinkDisplay.set(linkDisplaySettings)
    Settings.Wallpaper.set(wallpaperSettings)
    Settings.CardArea.set(cardAreaSettings)
    AISettingsManager.set(aiSettings)
    window.location.reload()
  }

  return (
    <StyledSettingsWindow>
      <WindowHeader>
        <Tabbar>
          {TabOptions.map(option => (
            <TabOption
              key={option}
              type="button"
              active={option === currentTab}
              aria-pressed={option === currentTab}
              onClick={() => setCurrentTab(option)}
            >
              {option}
            </TabOption>
          ))}
        </Tabbar>
        <MobileTabSelect
          value={currentTab}
          aria-label="设置分类"
          onChange={e => setCurrentTab(e.target.value)}
        >
          {TabOptions.map(option => (
            <option key={option} value={option}>
              {option}
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
          {currentTab === "链接" && (
            <LinkSettings
              linkGroups={linkGroups}
              setLinkGroups={setLinkGroups}
            />
          )}

          {currentTab === "外观" && (
            <DesignSettings
              design={design}
              setDesign={setDesign}
              themes={themes}
              setThemes={setThemes}
              linkDisplaySettings={linkDisplaySettings}
              setLinkDisplaySettings={setLinkDisplaySettings}
            />
          )}

          {currentTab === "壁纸" && (
            <WallpaperSettings
              wallpaperSettings={wallpaperSettings}
              cardAreaSettings={cardAreaSettings}
              onWallpaperChange={setWallpaperSettings}
              onCardAreaChange={setCardAreaSettings}
            />
          )}

          {currentTab === "搜索栏" && (
            <SearchSettings
              searchSettings={searchSettings}
              setSearchSettings={setSearchSettings}
            />
          )}

          {currentTab === "AI 助手" && (
            <AISettings aiSettings={aiSettings} setAISettings={setAISettings} />
          )}

          {currentTab === "数据" && <DataSettings />}

          {currentTab === "更新日志" && <Changelog />}
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
            window.location.reload()
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
