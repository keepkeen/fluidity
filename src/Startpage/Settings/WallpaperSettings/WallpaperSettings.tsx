import React, { useRef, useState } from "react"

import styled from "@emotion/styled"

import { RangeSlider } from "../../../components/RangeSlider"
import {
  BingRegion,
  CardAreaSettings,
  CardDisplayMode,
  images,
  WallpaperSettings as WallpaperSettingsType,
  WallpaperSource,
} from "../../../data/data"
import { BingWallpaperService } from "../../../services/bingWallpaper"
import { LocalImageService } from "../../../services/localImage"

// CSS 变量常量
const CSS_ACCENT_COLOR = "var(--accent-color)"
const CSS_BORDER_COLOR = "var(--border-color)"
const CSS_BG_COLOR = "var(--bg-color)"

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
`

const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`

const SectionTitle = styled.h3`
  font-size: 14px;
  font-weight: 600;
  color: var(--accent-color);
  margin: 0;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color);
`

const OptionGroup = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`

const OptionButton = styled.button<{ active: boolean }>`
  padding: 8px 16px;
  border: 2px solid
    ${({ active }) => (active ? CSS_ACCENT_COLOR : CSS_BORDER_COLOR)};
  border-radius: 8px;
  background: ${({ active }) => (active ? CSS_ACCENT_COLOR : "transparent")};
  color: ${({ active }) => (active ? CSS_BG_COLOR : "var(--default-color)")};
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    border-color: ${CSS_ACCENT_COLOR};
    background: ${({ active }) =>
      active ? CSS_ACCENT_COLOR : `${CSS_ACCENT_COLOR}22`};
  }
`

const ImageGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
  gap: 8px;
`

const ImageOption = styled.button<{ active: boolean }>`
  width: 100%;
  aspect-ratio: 1;
  border: 3px solid
    ${({ active }) => (active ? CSS_ACCENT_COLOR : CSS_BORDER_COLOR)};
  border-radius: 8px;
  padding: 0;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    border-color: ${CSS_ACCENT_COLOR};
    transform: scale(1.05);
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`

const Input = styled.input`
  width: 100%;
  padding: 10px 12px;
  border: 2px solid ${CSS_BORDER_COLOR};
  border-radius: 8px;
  background: transparent;
  color: var(--default-color);
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;

  &:focus {
    border-color: ${CSS_ACCENT_COLOR};
  }

  &::placeholder {
    color: var(--secondary-color);
  }
`

const UploadArea = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`

const UploadButton = styled.button`
  padding: 12px 20px;
  border: 2px dashed ${CSS_BORDER_COLOR};
  border-radius: 8px;
  background: transparent;
  color: var(--default-color);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    border-color: ${CSS_ACCENT_COLOR};
    background: ${CSS_ACCENT_COLOR}11;
  }
`

const UploadPreview = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px;
  border: 1px solid ${CSS_BORDER_COLOR};
  border-radius: 8px;

  img {
    width: 60px;
    height: 60px;
    object-fit: cover;
    border-radius: 4px;
  }
`

const UploadInfo = styled.div`
  flex: 1;
  font-size: 12px;
  color: var(--secondary-color);
`

const RemoveButton = styled.button`
  padding: 6px 12px;
  border: 1px solid var(--accent-color2);
  border-radius: 4px;
  background: transparent;
  color: var(--accent-color2);
  font-size: 12px;
  cursor: pointer;

  &:hover {
    background: var(--accent-color2) 22;
  }
`

const BingConfig = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`

const BingInfo = styled.div`
  font-size: 12px;
  color: var(--secondary-color);
  line-height: 1.5;
`

const RefreshButton = styled.button`
  padding: 8px 16px;
  border: 2px solid ${CSS_ACCENT_COLOR};
  border-radius: 8px;
  background: transparent;
  color: ${CSS_ACCENT_COLOR};
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: ${CSS_ACCENT_COLOR};
    color: ${CSS_BG_COLOR};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`

const Toggle = styled.label`
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
`

const ToggleSwitch = styled.div<{ checked: boolean }>`
  width: 44px;
  height: 24px;
  border-radius: 12px;
  background: ${({ checked }) =>
    checked ? CSS_ACCENT_COLOR : CSS_BORDER_COLOR};
  position: relative;
  transition: background 0.2s;

  &::after {
    content: "";
    position: absolute;
    top: 2px;
    left: ${({ checked }) => (checked ? "22px" : "2px")};
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--default-color);
    transition: left 0.2s;
  }
`

const ToggleLabel = styled.span`
  font-size: 14px;
  color: var(--default-color);
`

const HiddenInput = styled.input`
  display: none;
`

interface Props {
  wallpaperSettings: WallpaperSettingsType
  cardAreaSettings: CardAreaSettings
  onWallpaperChange: (settings: WallpaperSettingsType) => void
  onCardAreaChange: (settings: CardAreaSettings) => void
}

const sourceOptions: { value: WallpaperSource; label: string }[] = [
  { value: "preset", label: "预设图片" },
  { value: "custom-url", label: "自定义 URL" },
  { value: "local", label: "本地上传" },
  { value: "bing-daily", label: "Bing 每日" },
]

const cardModeOptions: { value: CardDisplayMode; label: string }[] = [
  { value: "full", label: "完整轮播" },
  { value: "tools-only", label: "仅工具" },
  { value: "hidden", label: "隐藏" },
]

const bingRegionOptions: { value: BingRegion; label: string }[] = [
  { value: "cn", label: "中国" },
  { value: "en-US", label: "美国" },
  { value: "ja-JP", label: "日本" },
  { value: "de-DE", label: "德国" },
]

export const WallpaperSettings: React.FC<Props> = ({
  wallpaperSettings,
  cardAreaSettings,
  onWallpaperChange,
  onCardAreaChange,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const handleSourceChange = (source: WallpaperSource) => {
    onWallpaperChange({ ...wallpaperSettings, source })
  }

  const handlePresetChange = (presetImage: string) => {
    onWallpaperChange({ ...wallpaperSettings, presetImage })
  }

  const handleCustomUrlChange = (customUrl: string) => {
    onWallpaperChange({ ...wallpaperSettings, customUrl })
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    LocalImageService.processImage(file)
      .then(result => {
        onWallpaperChange({
          ...wallpaperSettings,
          localImageData: result.dataUrl,
        })
      })
      .catch((error: unknown) => {
        console.error("图片处理失败:", error)
        alert(error instanceof Error ? error.message : "图片处理失败")
      })
      .finally(() => {
        setUploading(false)
        if (fileInputRef.current) {
          fileInputRef.current.value = ""
        }
      })
  }

  const handleRemoveLocal = () => {
    onWallpaperChange({ ...wallpaperSettings, localImageData: null })
  }

  const handleBingRegionChange = (bingRegion: BingRegion) => {
    onWallpaperChange({ ...wallpaperSettings, bingRegion })
  }

  const handleBingRefresh = () => {
    setRefreshing(true)
    BingWallpaperService.refresh(wallpaperSettings.bingRegion)
      .then(() => {
        // 触发重新渲染
        onWallpaperChange({ ...wallpaperSettings })
      })
      .catch((error: unknown) => {
        console.error("刷新 Bing 壁纸失败:", error)
        alert("刷新失败，请稍后重试")
      })
      .finally(() => {
        setRefreshing(false)
      })
  }

  const handleCardModeChange = (displayMode: CardDisplayMode) => {
    onCardAreaChange({ ...cardAreaSettings, displayMode })
  }

  const handleAutoRotateChange = () => {
    onCardAreaChange({
      ...cardAreaSettings,
      autoRotate: !cardAreaSettings.autoRotate,
    })
  }

  const handleRotateIntervalChange = (rotateInterval: number) => {
    onCardAreaChange({ ...cardAreaSettings, rotateInterval })
  }

  const handleBlurChange = (blur: number) => {
    onWallpaperChange({ ...wallpaperSettings, blur })
  }

  const handleBrightnessChange = (brightness: number) => {
    onWallpaperChange({ ...wallpaperSettings, brightness })
  }

  const handleOverlayChange = () => {
    onWallpaperChange({
      ...wallpaperSettings,
      overlay: !wallpaperSettings.overlay,
    })
  }

  const handleOverlayOpacityChange = (overlayOpacity: number) => {
    onWallpaperChange({ ...wallpaperSettings, overlayOpacity })
  }

  return (
    <Container>
      {/* 壁纸来源 */}
      <Section>
        <SectionTitle>壁纸来源</SectionTitle>
        <OptionGroup>
          {sourceOptions.map(option => (
            <OptionButton
              key={option.value}
              active={wallpaperSettings.source === option.value}
              onClick={() => handleSourceChange(option.value)}
            >
              {option.label}
            </OptionButton>
          ))}
        </OptionGroup>

        {/* 预设图片选择 */}
        {wallpaperSettings.source === "preset" && (
          <ImageGrid>
            {images.map(img => (
              <ImageOption
                key={img.label}
                active={wallpaperSettings.presetImage === img.value}
                onClick={() => handlePresetChange(img.value)}
              >
                <img src={img.value} alt={img.label} />
              </ImageOption>
            ))}
          </ImageGrid>
        )}

        {/* 自定义 URL */}
        {wallpaperSettings.source === "custom-url" && (
          <Input
            type="url"
            placeholder="输入图片 URL..."
            value={wallpaperSettings.customUrl}
            onChange={e => handleCustomUrlChange(e.target.value)}
          />
        )}

        {/* 本地上传 */}
        {wallpaperSettings.source === "local" && (
          <UploadArea>
            <HiddenInput
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
            />
            <UploadButton
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? "处理中..." : "点击选择图片"}
            </UploadButton>
            {wallpaperSettings.localImageData && (
              <UploadPreview>
                <img src={wallpaperSettings.localImageData} alt="预览" />
                <UploadInfo>
                  已上传本地图片
                  <br />
                  大小:{" "}
                  {LocalImageService.formatSize(
                    LocalImageService.getDataUrlSize(
                      wallpaperSettings.localImageData
                    )
                  )}
                </UploadInfo>
                <RemoveButton onClick={handleRemoveLocal}>移除</RemoveButton>
              </UploadPreview>
            )}
          </UploadArea>
        )}

        {/* Bing 每日壁纸 */}
        {wallpaperSettings.source === "bing-daily" && (
          <BingConfig>
            <OptionGroup>
              {bingRegionOptions.map(option => (
                <OptionButton
                  key={option.value}
                  active={wallpaperSettings.bingRegion === option.value}
                  onClick={() => handleBingRegionChange(option.value)}
                >
                  {option.label}
                </OptionButton>
              ))}
            </OptionGroup>
            <BingInfo>
              Bing 每日壁纸会自动更新，每 6 小时刷新一次。
              <br />
              选择不同地区可获取不同的每日精选图片。
            </BingInfo>
            <RefreshButton onClick={handleBingRefresh} disabled={refreshing}>
              {refreshing ? "刷新中..." : "立即刷新"}
            </RefreshButton>
          </BingConfig>
        )}
      </Section>

      {/* 背景效果 */}
      <Section>
        <SectionTitle>背景效果</SectionTitle>
        <RangeSlider
          label="模糊度"
          value={wallpaperSettings.blur}
          min={0}
          max={20}
          step={1}
          onChange={handleBlurChange}
          formatValue={v => `${v}px`}
        />
        <RangeSlider
          label="亮度"
          value={wallpaperSettings.brightness}
          min={0.3}
          max={1.5}
          step={0.1}
          onChange={handleBrightnessChange}
          formatValue={v => `${Math.round(v * 100)}%`}
        />
        <Toggle onClick={handleOverlayChange}>
          <ToggleSwitch checked={wallpaperSettings.overlay} />
          <ToggleLabel>显示遮罩层</ToggleLabel>
        </Toggle>
        {wallpaperSettings.overlay && (
          <RangeSlider
            label="遮罩透明度"
            value={wallpaperSettings.overlayOpacity}
            min={0}
            max={0.8}
            step={0.05}
            onChange={handleOverlayOpacityChange}
            formatValue={v => `${Math.round(v * 100)}%`}
          />
        )}
      </Section>

      {/* 卡片区域设置 */}
      <Section>
        <SectionTitle>左侧卡片</SectionTitle>
        <OptionGroup>
          {cardModeOptions.map(option => (
            <OptionButton
              key={option.value}
              active={cardAreaSettings.displayMode === option.value}
              onClick={() => handleCardModeChange(option.value)}
            >
              {option.label}
            </OptionButton>
          ))}
        </OptionGroup>

        {cardAreaSettings.displayMode !== "hidden" && (
          <>
            <Toggle onClick={handleAutoRotateChange}>
              <ToggleSwitch checked={cardAreaSettings.autoRotate} />
              <ToggleLabel>自动轮播</ToggleLabel>
            </Toggle>
            {cardAreaSettings.autoRotate && (
              <RangeSlider
                label="轮播间隔"
                value={cardAreaSettings.rotateInterval}
                min={2000}
                max={15000}
                step={1000}
                onChange={handleRotateIntervalChange}
                formatValue={v => `${v / 1000}秒`}
              />
            )}
          </>
        )}
      </Section>
    </Container>
  )
}
