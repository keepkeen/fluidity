import React, { useState } from "react"

import styled from "@emotion/styled"
import {
  faTimes,
  faTrash,
  faSave,
  faFire,
} from "@fortawesome/free-solid-svg-icons"

import { AISettings } from "./AISettings/AISettings"
import { Changelog } from "./Changelog/Changelog"
import { DataSettings } from "./DataSettings/DataSettings"
import { DesignSettings } from "./DesignSettings/DesignSettings"
import { LinkSettings } from "./LinkSettings/LinkSettings"
import { SearchSettings } from "./SearchSettings/SearchSettings"
import * as Settings from "./settingsHandler"
import { WallpaperSettings } from "./WallpaperSettings/WallpaperSettings"
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
`
const WindowContent = styled.div`
  width: 100%;
  height: calc(100% - 60px);
  display: flex;
  overflow: hidden;
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
`

const WindowFooter = styled.div`
  display: flex;
  justify-content: space-between;
  position: absolute;
  left: 30px;
  right: 30px;
  bottom: 30px;
`

export const StyledSettingsContent = styled.div`
  background-color: var(--bg-color);
  width: 400px;
  height: 100%;
  margin-right: 30px;
  padding-right: 20px;
  overflow-y: auto;
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
}

export const SettingsWindow = ({ hidePopup }: props) => {
  const [currentTab, setCurrentTab] = useState(TabOptions[0])
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
              active={option === currentTab}
              onClick={() => setCurrentTab(option)}
            >
              {option}
            </TabOption>
          ))}
        </Tabbar>
        <CloseButton inverted onClick={() => hidePopup()} icon={faTimes} />
      </WindowHeader>

      <WindowContent>
        {currentTab === "链接" && (
          <LinkSettings linkGroups={linkGroups} setLinkGroups={setLinkGroups} />
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
      </WindowContent>

      <WindowFooter>
        <SettingsButton
          onClick={() => applyValues()}
          text={"应用更改"}
          icon={faSave}
        />
        <SettingsButton
          onClick={() => {
            window.location.reload()
          }}
          text={"放弃更改"}
          icon={faFire}
        />
        <SettingsButton
          onClick={() => {
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
