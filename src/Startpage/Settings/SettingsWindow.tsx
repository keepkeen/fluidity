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
    height: calc(100% - 128px);
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
`

export const SettingsButton = styled(IconButton)`
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  color: var(--text-primary);
  border: 1px solid var(--surface-border-strong);
  border-radius: var(--radius-sm);
  font-size: 0.92rem;
  padding: 9px 20px;
  opacity: 1;

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

  @media screen and (max-width: 1200px) {
    flex: 0 0 auto;
    padding: 0 14px;
  }
`

const MobileTabSelect = styled.select`
  display: none;

  @media screen and (max-width: 600px) {
    display: block;
    flex: 1;
    min-width: 0;
    height: 30px;
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
    })

  // 挂载时的快照，用于关闭时检测未应用的更改
  const initialSnapshotRef = useRef<string | null>(null)
  if (initialSnapshotRef.current === null) {
    initialSnapshotRef.current = snapshot()
  }

  const snapshotRef = useRef("")
  snapshotRef.current = snapshot()
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
  const appliedRef = useRef(false)
  useEffect(() => {
    applyColors(design.colors)
    applyThemeMode()
  }, [design])

  useEffect(
    () => () => {
      if (appliedRef.current) return
      const persisted = Settings.Design.getWithFallback()
      applyColors(persisted.colors)
      applyThemeMode()
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
    AISettingsManager.set(aiSettings)
    emitSettingsApplied()
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
              onWallpaperChange={setWallpaperSettings}
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
          disabled={!isDirty}
          text={"应用更改"}
          icon={faSave}
        />
        <UnsavedHint visible={isDirty} role="status">
          ● 有未应用的更改
        </UnsavedHint>
        <SettingsButton
          type="button"
          onClick={() => {
            emitSettingsApplied()
          }}
          disabled={!isDirty}
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
