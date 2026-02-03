import React, { useState, useRef, useEffect } from "react"

import styled from "@emotion/styled"
import { ChromePicker, ColorResult } from "react-color"

import { colorsType } from "../data/data"

// 颜色名称映射（CSS 变量名 -> 友好名称）
const colorLabels: Record<string, string> = {
  // 背景层
  "--bg-primary": "页面背景",
  "--bg-secondary": "卡片背景",
  "--bg-hover": "悬停背景",
  // 文字层
  "--text-primary": "主文字",
  "--text-secondary": "次文字",
  "--text-muted": "弱化文字",
  // 边框层
  "--border-default": "普通边框",
  "--border-active": "激活边框",
  // 强调层
  "--accent": "强调色",
  "--accent-hover": "强调悬停",
  "--accent-text": "强调上文字",
  // 功能层
  "--success": "成功色",
  "--glow": "发光色",
}

const ColorPickerContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
`

const ColorRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 8px;
  border-radius: 4px;
  transition: background 0.2s;

  &:hover {
    background: var(--hover-bg);
  }
`

const ColorLabel = styled.span`
  flex: 1;
  font-size: 0.85rem;
  color: var(--text-primary);
  min-width: 80px;
`

const ColorSwatch = styled.button<{ color: string; active: boolean }>`
  width: 32px;
  height: 32px;
  border: 2px solid
    ${({ active }) =>
      active ? "var(--accent-primary)" : "var(--border-color)"};
  background: ${({ color }) => color};
  cursor: pointer;
  transition: 0.2s;
  padding: 0;

  &:hover {
    border-color: var(--accent-primary);
    transform: scale(1.1);
  }
`

const ColorValue = styled.input`
  width: 80px;
  padding: 4px 8px;
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 0.8rem;
  font-family: monospace;

  &:focus {
    outline: none;
    border-color: var(--accent-primary);
  }
`

const PickerPopover = styled.div`
  position: absolute;
  z-index: 100;
  top: 100%;
  left: 0;
  margin-top: 8px;
`

const PickerCover = styled.div`
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
`

const ColorRowWrapper = styled.div`
  position: relative;
`

const StyledChromePicker = styled.div`
  .chrome-picker {
    background: var(--bg-secondary) !important;
    box-shadow: 0 4px 20px var(--shadow-color) !important;
  }
`

interface ColorRowItemProps {
  colorKey: string
  colorValue: string
  isActive: boolean
  onSwatchClick: () => void
  onColorChange: (color: string) => void
  onClose: () => void
}

const ColorRowItem = ({
  colorKey,
  colorValue,
  isActive,
  onSwatchClick,
  onColorChange,
  onClose,
}: ColorRowItemProps) => {
  const [inputValue, setInputValue] = useState(colorValue)
  const inputRef = useRef<HTMLInputElement>(null)

  // 同步外部颜色值变化
  useEffect(() => {
    setInputValue(colorValue)
  }, [colorValue])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setInputValue(value)
    // 验证是否是有效的 hex 颜色
    if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
      onColorChange(value)
    }
  }

  const handleInputBlur = () => {
    // 如果输入无效，恢复原值
    if (!/^#[0-9A-Fa-f]{6}$/.test(inputValue)) {
      setInputValue(colorValue)
    }
  }

  const handlePickerChange = (result: ColorResult) => {
    onColorChange(result.hex)
    setInputValue(result.hex)
  }

  const label = colorLabels[colorKey] || colorKey.replace(/^--/, "")

  return (
    <ColorRowWrapper>
      <ColorRow>
        <ColorLabel>{label}</ColorLabel>
        <ColorSwatch
          color={colorValue}
          active={isActive}
          onClick={onSwatchClick}
          title="点击选择颜色"
        />
        <ColorValue
          ref={inputRef}
          value={inputValue}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          placeholder="#000000"
        />
      </ColorRow>
      {isActive && (
        <PickerPopover>
          <PickerCover onClick={onClose} />
          <StyledChromePicker>
            <ChromePicker
              color={colorValue}
              onChange={handlePickerChange}
              disableAlpha
            />
          </StyledChromePicker>
        </PickerPopover>
      )}
    </ColorRowWrapper>
  )
}

interface props {
  colors: colorsType
  setColors: (value: colorsType) => void
}

export const ColorPicker = ({ colors, setColors }: props) => {
  const [activeColor, setActiveColor] = useState<string | null>(null)

  const handleColorChange = (key: string, color: string) => {
    setColors({ ...colors, [key]: color })
  }

  const handleSwatchClick = (key: string) => {
    setActiveColor(activeColor === key ? null : key)
  }

  const handleClose = () => {
    setActiveColor(null)
  }

  return (
    <ColorPickerContainer>
      {Object.keys(colors).map(key => (
        <ColorRowItem
          key={key}
          colorKey={key}
          colorValue={colors[key]}
          isActive={activeColor === key}
          onSwatchClick={() => handleSwatchClick(key)}
          onColorChange={color => handleColorChange(key, color)}
          onClose={handleClose}
        />
      ))}
    </ColorPickerContainer>
  )
}
