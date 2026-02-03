import React, { useEffect, useState } from "react"

import styled from "@emotion/styled"
import { faPlus, faMinus, faSave } from "@fortawesome/free-solid-svg-icons"

import { AIThemeGenerator } from "./AIThemeGenerator"
import { ColorPicker } from "../../../components/ColorPicker"
import { Dropdown } from "../../../components/Dropdown"
import { OptionSlider } from "../../../components/OptionSlider"
import { OptionTextInput } from "../../../components/OptionTextInput"
import {
  Theme,
  colorsType,
  images,
  LinkDisplaySettings,
  LinkDisplayMode,
} from "../../../data/data"
import {
  StyledSettingsContent,
  SettingElement,
  SettingsButton,
  SettingsLabel,
} from "../SettingsWindow"

const DesignPreview = styled.div<{ name: string; colors: colorsType }>`
  ${({ colors }) => {
    return (
      Object.keys(colors)
        .map((key: string) => key + `:` + colors[key])
        .toString()
        .replaceAll(",", ";") + ";"
    )
  }}

  background-color: var(--bg-color);
  display: flex;
  justify-content: space-evenly;
  align-items: center;
  border: 2px solid var(--accent-color);
  width: calc(100% - 400px);
  height: 100%;
  position: relative;
  ::before {
    content: "${({ name }) => name}";
    color: var(--accent-color);
    position: absolute;
    top: 10px;
    left: 15px;
    font-size: 0.8rem;
  }
  ::after {
    content: "设计预览";
    color: var(--accent-color);
    position: absolute;
    top: 10px;
    right: 15px;
    font-size: 0.8rem;
  }
  @media screen and (max-width: 1400px) {
    > img {
      width: 200px;
      height: 200px;
    }
    > div > div {
      width: 50px;
      height: 200px;
      > h2 {
        font-size: 1rem;
      }
      > .wave {
        width: 50px;
      }
    }
  }
  @media screen and (max-width: 1200px) {
    > img {
      width: 150px;
      height: 150px;
    }
    > div > div {
      width: 1rem;
      margin-left: 0.5rem;
      height: 150px;
      > h2 {
        font-size: 0.8rem;
      }
      > .wave {
        display: none;
      }
    }
  }
`
const ImagePreviewWrapper = styled.div`
  margin: 10px;
  height: 300px;
  width: 300px;
  border: 1px solid var(--default-color);
  padding: 5px;
  position: relative;
  animation: circling-shadow-small 4s ease 0s infinite normal;
`

const ImagePreview = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
`

const ImageFallback = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-color);
  color: var(--default-color);
  font-size: 0.8rem;
  text-align: center;
  opacity: 0.5;
`

// 带错误处理的图片预览组件
const ImagePreviewWithFallback = ({ src }: { src: string }) => {
  const [hasError, setHasError] = useState(false)

  // 当 src 变化时重置错误状态
  useEffect(() => {
    setHasError(false)
  }, [src])

  return (
    <ImagePreviewWrapper>
      {hasError ? (
        <ImageFallback>图片加载失败</ImageFallback>
      ) : (
        <ImagePreview src={src} onError={() => setHasError(true)} />
      )}
    </ImagePreviewWrapper>
  )
}

const StyledAccordionPreview = styled.div<{ colorVar: string }>`
  border: 4px solid ${({ colorVar }) => `var(${colorVar})`};
  height: 300px;
  width: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  ::before {
    content: "";
    position: absolute;
    bottom: 0px;
    width: 100%;
    height: 100%;
    background-color: ${({ colorVar }) => `var(${colorVar})`};
  }

  > .wave {
    width: 80px;
    height: 50px;
    position: absolute;
    top: 0px;
    overflow: hidden;
    ::before {
      content: "";
      width: 180px;
      height: 185px;
      position: absolute;
      top: -25%;
      left: 50%;
      margin-left: -90px;
      margin-top: -140px;
      border-radius: 37%;
      background: var(--bg-color);
      animation: wave 12s infinite cubic-bezier(0.71, 0.33, 0.33, 0.68);
    }
    @keyframes wave {
      from {
        transform: rotate(0deg);
      }
      from {
        transform: rotate(360deg);
      }
    }
  }
`
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
const AccordionPreviewTitle = styled.h2`
  transform: rotate(90deg);
  min-width: max-content;
  color: var(--bg-color);
  transition: 0.5s;
  letter-spacing: 5px;
`
const AccordionPreviewContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  margin: 10px;
  > * {
    margin-left: 30px;
  }
`

export const SettingButtonRow = styled.div`
  display: flex;
  justify-content: space-between;
`

const AccordionPreview = ({
  title,
  colorVar,
}: {
  title: string
  colorVar: string
}) => {
  return (
    <StyledAccordionPreview colorVar={colorVar}>
      <div className={"wave"} />
      <AccordionPreviewTitle>{title}</AccordionPreviewTitle>
    </StyledAccordionPreview>
  )
}

// CSS 变量常量
const CSS_BG_COLOR = "var(--bg-color)"
const CSS_ACCENT_COLOR = "var(--accent-color)"
const CSS_DEFAULT_COLOR = "var(--default-color)"

// 链接展示模式选择按钮
const ModeSelector = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
`

const ModeButton = styled.button<{ active: boolean }>`
  flex: 1;
  min-width: 100px;
  padding: 12px 8px;
  border: 2px solid ${CSS_DEFAULT_COLOR};
  background: ${({ active }) => (active ? CSS_ACCENT_COLOR : "transparent")};
  color: ${({ active }) => (active ? CSS_BG_COLOR : CSS_DEFAULT_COLOR)};
  cursor: pointer;
  transition: 0.2s;
  font-size: 0.85rem;
  font-weight: 500;

  &:hover {
    background: ${({ active }) =>
      active ? CSS_ACCENT_COLOR : CSS_DEFAULT_COLOR};
    color: ${CSS_BG_COLOR};
  }
`

const ModeDescription = styled.p`
  font-size: 0.8rem;
  opacity: 0.6;
  margin-top: 8px;
  line-height: 1.4;
`

// 开关组件
const ToggleRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
`

const ToggleLabel = styled.span`
  font-size: 14px;
  color: var(--default-color);
`

const ToggleSwitch = styled.button<{ checked: boolean }>`
  width: 44px;
  height: 24px;
  border-radius: 12px;
  border: none;
  background: ${({ checked }) =>
    checked ? CSS_ACCENT_COLOR : CSS_DEFAULT_COLOR};
  opacity: ${({ checked }) => (checked ? 1 : 0.3)};
  position: relative;
  cursor: pointer;
  transition: background 0.2s, opacity 0.2s;

  &::after {
    content: "";
    position: absolute;
    top: 2px;
    left: ${({ checked }) => (checked ? "22px" : "2px")};
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: ${CSS_BG_COLOR};
    transition: left 0.2s;
  }
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

const modeOptions: { value: LinkDisplayMode; label: string; desc: string }[] = [
  { value: "accordion", label: "手风琴", desc: "经典水平展开模式" },
  { value: "hover-card", label: "悬浮卡片", desc: "悬停显示链接卡片" },
  { value: "command-palette", label: "命令面板", desc: "按 / 键快速搜索" },
]

export const DesignSettings = ({
  design,
  setDesign,
  themes,
  setThemes,
  linkDisplaySettings,
  setLinkDisplaySettings,
}: props) => {
  const [isNewDesign, setIsNewDesign] = useState(false)

  const handleModeChange = (mode: LinkDisplayMode) => {
    setLinkDisplaySettings({ ...linkDisplaySettings, mode })
  }

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
          <SettingsLabel>链接展示模式</SettingsLabel>
          <SettingElement>
            <ModeSelector>
              {modeOptions.map(option => (
                <ModeButton
                  key={option.value}
                  active={linkDisplaySettings.mode === option.value}
                  onClick={() => handleModeChange(option.value)}
                >
                  {option.label}
                </ModeButton>
              ))}
            </ModeSelector>
            <ModeDescription>
              {
                modeOptions.find(o => o.value === linkDisplaySettings.mode)
                  ?.desc
              }
            </ModeDescription>
          </SettingElement>

          <SettingElement>
            <ToggleRow>
              <ToggleLabel>在新标签页打开链接</ToggleLabel>
              <ToggleSwitch
                checked={linkDisplaySettings.openInNewTab}
                onChange={() =>
                  setLinkDisplaySettings({
                    ...linkDisplaySettings,
                    openInNewTab: !linkDisplaySettings.openInNewTab,
                  })
                }
              />
            </ToggleRow>
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
      <DesignPreview name={design.name} colors={design.colors}>
        <ImagePreviewWithFallback src={design.image} />
        <AccordionPreviewContainer>
          <AccordionPreview title={"链接"} colorVar={"--default-color"} />
          <AccordionPreview title={"链接"} colorVar={"--accent-color"} />
          <AccordionPreview title={"链接"} colorVar={"--accent-color2"} />
        </AccordionPreviewContainer>
      </DesignPreview>
    </>
  )
}
