import React, { useEffect, useState } from "react"

import styled from "@emotion/styled"
import {
  faPlus,
  faMinus,
  faSave,
  faSearch,
} from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"

import { AIThemeGenerator } from "./AIThemeGenerator"
import { ColorPicker } from "../../../components/ColorPicker"
import { Button } from "../../../components/Button"
import { Toggle } from "../../../components/Toggle"
import { Dropdown } from "../../../components/Dropdown"
import { OptionSlider } from "../../../components/OptionSlider"
import { OptionTextInput } from "../../../components/OptionTextInput"
import {
  Theme,
  colorsType,
  images,
  LinkDisplaySettings,
} from "../../../data/data"
import {
  DEFAULT_HOME_PAGE_SHORTCUT_MODIFIER,
  HomePageShortcutModifier,
  readHomeLayout,
  saveHomeLayout,
} from "../../../services/homeLayout"
import {
  StyledSettingsContent,
  SettingElement,
  SettingsButton,
  SettingsLabel,
} from "../SettingsWindow"

/**
 * 设计预览：迷你主屏模拟。
 * 草稿主题的 13 色以行内 CSS 变量注入，仅作用于预览区域，
 * 后代元素直接用 var(--*) 即可拿到未应用的候选颜色。
 */
const DesignPreview = styled.div<{ colors: colorsType }>`
  ${({ colors }) =>
    Object.entries(colors)
      .map(([key, value]) => `${key}:${value}`)
      .join(";") + ";"}

  width: calc(100% - 400px);
  height: 100%;
  position: relative;
  overflow: hidden;
  border-radius: var(--radius-main);
  border: 1px solid var(--border-default);
  background: var(--bg-primary);
  display: flex;
  align-items: center;
  justify-content: center;
`

const WallpaperImg = styled.img`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
`

// 预览壁纸：加载失败时静默隐藏，露出主题底色
const PreviewWallpaper = ({ src }: { src: string }) => {
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    setHasError(false)
  }, [src])

  if (!src || hasError) return null
  return (
    <WallpaperImg src={src} alt="" aria-hidden onError={() => setHasError(true)} />
  )
}

const PreviewScrim = styled.div`
  position: absolute;
  inset: 0;
  background: linear-gradient(rgba(0, 0, 0, 0.14), rgba(0, 0, 0, 0.34));
`

const SettingHint = styled.p`
  margin: 6px 0 0;
  color: var(--text-muted);
  font-size: 0.78rem;
  line-height: 1.45;
`

const PreviewBadge = styled.span<{ side: "left" | "right" }>`
  position: absolute;
  top: 12px;
  ${({ side }) => side}: 16px;
  z-index: 1;
  font-size: 0.72rem;
  color: var(--text-secondary);
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
`

const PreviewStack = styled.div`
  position: relative;
  z-index: 1;
  width: min(340px, 88%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
`

const PreviewGreeting = styled.div`
  font-size: 1.25rem;
  font-weight: 500;
  color: var(--text-primary);
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
`

const PreviewSearchPill = styled.div`
  width: 100%;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--bg-primary) 62%, transparent);
  border: 1px solid var(--border-default);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  color: var(--text-muted);
  font-size: 0.8rem;
`

const PreviewRow = styled.div`
  width: 100%;
  display: flex;
  justify-content: center;
  gap: 16px;
`

const PreviewWidgetCard = styled.div`
  flex: 1;
  max-width: 170px;
  padding: 12px 14px;
  box-sizing: border-box;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--bg-primary) 72%, transparent);
  border: 1px solid var(--border-default);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  display: flex;
  flex-direction: column;
  gap: 8px;
`

const PreviewWidgetTitle = styled.div`
  font-size: 0.68rem;
  color: var(--text-secondary);
`

const PreviewWidgetValue = styled.div`
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-primary);
`

const PreviewBars = styled.div`
  display: flex;
  align-items: flex-end;
  gap: 4px;
  height: 30px;
`

const PreviewBar = styled.span<{ h: number; today?: boolean }>`
  flex: 1;
  height: ${({ h }) => h}%;
  border-radius: 3px;
  background: ${({ today }) =>
    today
      ? "var(--accent)"
      : "color-mix(in srgb, var(--accent) 45%, transparent)"};
`

const PreviewApps = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 56px);
  gap: 10px 14px;
`

const PreviewApp = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
`

const PreviewAppIcon = styled.span`
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--bg-secondary) 82%, transparent);
  border: 1px solid var(--border-default);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.82rem;
  color: var(--text-primary);
`

const PreviewAppLabel = styled.span`
  font-size: 0.6rem;
  color: var(--text-primary);
  opacity: 0.85;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
`

const PreviewActions = styled.div`
  display: flex;
  gap: 10px;
`

const PreviewChip = styled.span<{ filled?: boolean }>`
  padding: 6px 16px;
  border-radius: 999px;
  font-size: 0.75rem;
  background: ${({ filled }) => (filled ? "var(--accent)" : "transparent")};
  color: ${({ filled }) => (filled ? "var(--accent-text)" : "var(--text-secondary)")};
  border: 1px solid
    ${({ filled }) => (filled ? "var(--accent)" : "var(--border-active)")};
`

const PREVIEW_APPS = [
  { glyph: "G", label: "搜索" },
  { glyph: "知", label: "知乎" },
  { glyph: "B", label: "哔哩" },
  { glyph: "邮", label: "邮箱" },
]

const PREVIEW_BAR_HEIGHTS = [45, 70, 30, 85, 55, 40, 100]

const SectionDivider = styled.div`
  width: calc(100% - 80px);
  padding: 20px 40px;
  position: relative;
  :before {
    content: "";
    width: calc(100% - 80px);
    position: absolute;
  }
`

export const SettingButtonRow = styled.div`
  display: flex;
  justify-content: space-between;
`

interface props {
  design: Theme
  setDesign: (design: Theme) => void
  themes: Theme[]
  setThemes: (Themes: Theme[]) => void
  linkDisplaySettings: LinkDisplaySettings
  setLinkDisplaySettings: (settings: LinkDisplaySettings) => void
}

const themeEquals = (theme1: Theme, theme2: Theme) => {
  let isEqual = true
  if (theme1.name !== theme2.name) isEqual = false
  if (theme1.image !== theme2.image) isEqual = false
  Object.keys(theme1.colors).forEach(key => {
    if (theme1.colors[key] !== theme2.colors[key]) isEqual = false
  })
  return isEqual
}

export const DesignSettings = ({
  design,
  setDesign,
  themes,
  setThemes,
  linkDisplaySettings,
  setLinkDisplaySettings,
}: props) => {
  const [isNewDesign, setIsNewDesign] = useState(false)
  const [pageShortcutModifier, setPageShortcutModifier] =
    useState<HomePageShortcutModifier>(
      () => readHomeLayout().pageShortcutModifier
    )

  const setName = (name: string) => setDesign({ ...design, name: name })
  const setColors = (colors: colorsType) =>
    setDesign({ ...design, colors: colors })
  const setImage = (image: string) => setDesign({ ...design, image: image })

  // check if design does exist already
  useEffect(() => {
    const exists = themes.some(theme => themeEquals(theme, design))
    setIsNewDesign(!exists)
  }, [design, themes])

  const themeChange = (themeName: string) => {
    const newTheme = themes.filter(theme => theme.name === themeName)
    if (newTheme.length > 0) {
      setDesign(newTheme[0])
    }
  }

  const addTheme = (newTheme: Theme) => {
    setThemes([
      ...themes.filter(theme => theme.name !== newTheme.name),
      newTheme,
    ])
  }

  const removeTheme = (themeName: string) => {
    setThemes(themes.filter(theme => theme.name !== themeName))
    if (themes.length > 0) themeChange(themes[0].name)
  }

  const themeExists = (themeName: string) =>
    themes.some(theme => theme.name === themeName)

  return (
    <>
      <div>
        <StyledSettingsContent>
          <SettingsLabel>主屏</SettingsLabel>
          <SettingElement>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                localStorage.removeItem("fluidity.homeLayout.v1")
                setPageShortcutModifier(DEFAULT_HOME_PAGE_SHORTCUT_MODIFIER)
                window.dispatchEvent(new Event("fluidity-home-layout-changed"))
                window.dispatchEvent(
                  new CustomEvent("show-notification", {
                    detail: {
                      type: "success",
                      title: "主屏布局已重置",
                      message: "小组件已恢复，应用将按使用频率重新排列",
                    },
                  })
                )
              }}
            >
              重置主屏布局（恢复隐藏的小组件）
            </Button>
          </SettingElement>

          <SettingElement>
            <Toggle
              label="在新标签页打开链接"
              checked={linkDisplaySettings.openInNewTab}
              onChange={checked =>
                setLinkDisplaySettings({
                  ...linkDisplaySettings,
                  openInNewTab: checked,
                })
              }
            />
          </SettingElement>

          <SettingElement>
            <Dropdown
              value={pageShortcutModifier}
              items={[
                { label: "Option / Alt + 1–9", value: "alt" },
                { label: "Control + 1–9", value: "control" },
                { label: "Shift + 1–9", value: "shift" },
                { label: "关闭数字跳页快捷键", value: "disabled" },
              ]}
              onChange={value => {
                const modifier = value as HomePageShortcutModifier
                const next = {
                  ...readHomeLayout(),
                  pageShortcutModifier: modifier,
                }
                setPageShortcutModifier(modifier)
                saveHomeLayout(next)
                window.dispatchEvent(new Event("fluidity-home-layout-changed"))
              }}
            />
            <SettingHint>
              主屏可用左右方向键或横向滑动翻页；数字快捷键会直接跳到对应页。
            </SettingHint>
          </SettingElement>

          <SectionDivider />

          <SettingsLabel>主题</SettingsLabel>

          <SettingElement>
            <Dropdown
              value={design.name}
              items={themes.map(theme => ({
                label: theme.name,
                value: theme.name,
              }))}
              onChange={themeChange}
            />
          </SettingElement>
          <SettingElement>
            <OptionTextInput
              value={design.name}
              onChange={setName}
              placeholder={"主题名称"}
            />
          </SettingElement>

          <SectionDivider />

          <SettingElement>
            <OptionTextInput
              value={design.image}
              onChange={setImage}
              placeholder={"背景图 URL"}
            />
            <OptionSlider
              currentValue={design.image}
              values={images}
              onChange={setImage}
            />
          </SettingElement>

          <SectionDivider />

          <SettingElement>
            <ColorPicker colors={design.colors} setColors={setColors} />
          </SettingElement>

          <AIThemeGenerator
            currentImage={design.image}
            onApply={theme => setDesign(theme)}
            onSave={theme => addTheme(theme)}
          />

          <SectionDivider />
          <SettingElement>
            <SettingButtonRow>
              <SettingsButton
                onClick={() => addTheme(design)}
                text={!themeExists(design.name) ? "添加主题" : "保存主题"}
                icon={!themeExists(design.name) ? faPlus : faSave}
                disabled={!isNewDesign ? true : undefined}
              />
              <SettingsButton
                onClick={() => removeTheme(design.name)}
                text={"删除主题"}
                icon={faMinus}
                disabled={!themeExists(design.name)}
              />
            </SettingButtonRow>
          </SettingElement>
        </StyledSettingsContent>
      </div>
      <DesignPreview colors={design.colors}>
        <PreviewWallpaper src={design.image} />
        <PreviewScrim />
        <PreviewBadge side="left">{design.name}</PreviewBadge>
        <PreviewBadge side="right">设计预览</PreviewBadge>
        <PreviewStack>
          <PreviewGreeting>下午好。</PreviewGreeting>
          <PreviewSearchPill>
            <FontAwesomeIcon icon={faSearch} />
            搜索
          </PreviewSearchPill>
          <PreviewRow>
            <PreviewWidgetCard>
              <PreviewWidgetTitle>屏幕时间</PreviewWidgetTitle>
              <PreviewWidgetValue>1 小时 24 分</PreviewWidgetValue>
              <PreviewBars>
                {PREVIEW_BAR_HEIGHTS.map((h, i) => (
                  <PreviewBar
                    key={i}
                    h={h}
                    today={i === PREVIEW_BAR_HEIGHTS.length - 1}
                  />
                ))}
              </PreviewBars>
            </PreviewWidgetCard>
            <PreviewApps>
              {PREVIEW_APPS.map(app => (
                <PreviewApp key={app.label}>
                  <PreviewAppIcon>{app.glyph}</PreviewAppIcon>
                  <PreviewAppLabel>{app.label}</PreviewAppLabel>
                </PreviewApp>
              ))}
            </PreviewApps>
          </PreviewRow>
          <PreviewActions>
            <PreviewChip filled>应用更改</PreviewChip>
            <PreviewChip>取消</PreviewChip>
          </PreviewActions>
        </PreviewStack>
      </DesignPreview>
    </>
  )
}
