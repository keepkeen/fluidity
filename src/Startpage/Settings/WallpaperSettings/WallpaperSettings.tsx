import { useEffect, useMemo, useRef, useState } from "react"

import styled from "@emotion/styled"

import { RangeSlider } from "../../../components/RangeSlider"
import {
  BingRegion,
  CardAreaSettings,
  CardDisplayMode,
  CarouselImage,
  images,
  WallpaperSettings as WallpaperSettingsType,
  WallpaperSource,
} from "../../../data/data"
import { BingWallpaperService } from "../../../services/bingWallpaper"
import { LocalImageService } from "../../../services/localImage"
import { settingsLogger } from "../../../utils/logger"
import { StyledSettingsContent } from "../SettingsWindow"

// CSS 变量常量
const CSS_ACCENT_COLOR = "var(--accent-color)"
const CSS_BORDER_COLOR = "var(--border-color)"
const CSS_BG_COLOR = "var(--bg-color)"

const WALLPAPER_SOURCE_PRESET: WallpaperSource = "preset"
const WALLPAPER_SOURCE_CUSTOM_URL: WallpaperSource = "custom-url"
const WALLPAPER_SOURCE_LOCAL: WallpaperSource = "local"
const WALLPAPER_SOURCE_BING_DAILY: WallpaperSource = "bing-daily"
const WALLPAPER_DISPLAY_FULLSCREEN = "fullscreen"

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
`

const WallpaperPreview = styled.div`
  background-color: var(--bg-color);
  display: flex;
  justify-content: center;
  align-items: center;
  border: 2px solid var(--accent-color);
  width: calc(100% - 400px);
  height: 100%;
  position: relative;
  overflow: hidden;
  min-width: 360px;
  ::after {
    content: "主页预览";
    color: var(--accent-color);
    position: absolute;
    top: 10px;
    right: 15px;
    font-size: 0.8rem;
    opacity: 0.9;
  }
`

const PreviewStage = styled.div<{
  imageUrl: string
  fullscreen: boolean
  blur: number
  brightness: number
}>`
  position: absolute;
  inset: 0;
  background: var(--bg-color);

  ::before {
    content: "";
    position: absolute;
    inset: 0;
    background-image: ${({ fullscreen, imageUrl }) =>
      fullscreen && imageUrl ? `url(${imageUrl})` : "none"};
    background-size: cover;
    background-position: center;
    filter: ${({ blur, brightness }) =>
      `blur(${Math.max(0, blur)}px) brightness(${brightness})`};
    transform: ${({ blur }) => (blur > 0 ? "scale(1.08)" : "scale(1.02)")};
    z-index: 0;
  }
`

const PreviewOverlay = styled.div<{ visible: boolean; opacity: number }>`
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, ${({ opacity }) => opacity});
  opacity: ${({ visible }) => (visible ? 1 : 0)};
  transition: opacity 0.2s;
  z-index: 1;
  pointer-events: none;
`

const PreviewContent = styled.div`
  position: relative;
  z-index: 2;
  width: 86%;
  max-width: 720px;
  height: 78%;
  max-height: 520px;
  border-radius: 18px;
  border: 1px solid var(--border-color);
  background: rgba(0, 0, 0, 0.18);
  backdrop-filter: blur(12px);
  overflow: hidden;
  display: grid;
  grid-template-columns: 300px 1fr;
`

const PreviewLeftCard = styled.div<{ hidden: boolean }>`
  display: ${({ hidden }) => (hidden ? "none" : "flex")};
  flex-direction: column;
  padding: 16px;
  gap: 12px;
  border-right: 1px solid var(--border-color);
`

const PreviewCard = styled.div<{ imageUrl: string; visible: boolean }>`
  flex: 1;
  border-radius: 14px;
  border: 1px solid var(--border-color);
  overflow: hidden;
  position: relative;
  background: rgba(0, 0, 0, 0.18);

  ::before {
    content: "";
    position: absolute;
    inset: 0;
    background-image: ${({ imageUrl }) =>
      imageUrl ? `url(${imageUrl})` : "none"};
    background-size: cover;
    background-position: center;
    opacity: ${({ visible }) => (visible ? 1 : 0)};
    transition: opacity 0.2s;
  }
`

const PreviewSearch = styled.div`
  height: 40px;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  background: rgba(255, 255, 255, 0.06);
`

const PreviewMain = styled.div`
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
`

const PreviewHint = styled.div`
  font-size: 12px;
  color: var(--secondary-color);
  line-height: 1.5;
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

// 轮播图片管理样式
const CarouselImageList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 300px;
  overflow-y: auto;
`

const CarouselImageItem = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px;
  border: 1px solid ${CSS_BORDER_COLOR};
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.1);

  img {
    width: 50px;
    height: 50px;
    object-fit: cover;
    border-radius: 4px;
  }
`

const CarouselImageInfo = styled.div`
  flex: 1;
  font-size: 13px;
  color: var(--default-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const CarouselImageActions = styled.div`
  display: flex;
  gap: 4px;
`

const SmallButton = styled.button`
  padding: 4px 8px;
  border: 1px solid ${CSS_BORDER_COLOR};
  border-radius: 4px;
  background: transparent;
  color: var(--default-color);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    border-color: ${CSS_ACCENT_COLOR};
    color: ${CSS_ACCENT_COLOR};
  }

  &.danger:hover {
    border-color: #ff6b6b;
    color: #ff6b6b;
  }
`

const AddImageButtons = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
`

const EmptyState = styled.div`
  padding: 20px;
  text-align: center;
  color: var(--secondary-color);
  font-size: 13px;
  border: 2px dashed ${CSS_BORDER_COLOR};
  border-radius: 8px;
`

interface Props {
  wallpaperSettings: WallpaperSettingsType
  cardAreaSettings: CardAreaSettings
  onWallpaperChange: (settings: WallpaperSettingsType) => void
  onCardAreaChange: (settings: CardAreaSettings) => void
}

const sourceOptions: { value: WallpaperSource; label: string }[] = [
  { value: WALLPAPER_SOURCE_PRESET, label: "预设图片" },
  { value: WALLPAPER_SOURCE_CUSTOM_URL, label: "自定义 URL" },
  { value: WALLPAPER_SOURCE_LOCAL, label: "本地上传" },
  { value: WALLPAPER_SOURCE_BING_DAILY, label: "Bing 每日" },
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
  const carouselFileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [carouselUploading, setCarouselUploading] = useState(false)

  const [previewUrl, setPreviewUrl] = useState("")
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)

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
        settingsLogger.error("图片处理失败:", error)
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
        settingsLogger.error("刷新 Bing 壁纸失败:", error)
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

  // 轮播图片管理
  const handleUseCustomImagesChange = () => {
    onCardAreaChange({
      ...cardAreaSettings,
      useCustomImages: !cardAreaSettings.useCustomImages,
    })
  }

  const handleCarouselFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setCarouselUploading(true)
    LocalImageService.processImage(file)
      .then(result => {
        const newImage: CarouselImage = {
          id: Date.now().toString(),
          src: result.dataUrl,
          name: file.name,
        }
        onCardAreaChange({
          ...cardAreaSettings,
          customImages: [...cardAreaSettings.customImages, newImage],
        })
      })
      .catch((error: unknown) => {
        settingsLogger.error("图片处理失败:", error)
        alert(error instanceof Error ? error.message : "图片处理失败")
      })
      .finally(() => {
        setCarouselUploading(false)
        if (carouselFileInputRef.current) {
          carouselFileInputRef.current.value = ""
        }
      })
  }

  const handleAddPresetToCarousel = (presetSrc: string, name: string) => {
    const newImage: CarouselImage = {
      id: Date.now().toString(),
      src: presetSrc,
      name,
    }
    onCardAreaChange({
      ...cardAreaSettings,
      customImages: [...cardAreaSettings.customImages, newImage],
    })
  }

  const handleRemoveCarouselImage = (id: string) => {
    onCardAreaChange({
      ...cardAreaSettings,
      customImages: cardAreaSettings.customImages.filter(img => img.id !== id),
    })
  }

  const handleMoveCarouselImage = (id: string, direction: "up" | "down") => {
    const imgs = [...cardAreaSettings.customImages]
    const index = imgs.findIndex(img => img.id === id)
    if (index === -1) return

    const newIndex = direction === "up" ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= imgs.length) return
    ;[imgs[index], imgs[newIndex]] = [imgs[newIndex], imgs[index]]
    onCardAreaChange({ ...cardAreaSettings, customImages: imgs })
  }

  const previewImageUrl = useMemo(() => {
    const fallback = images[0].value
    switch (wallpaperSettings.source) {
      case WALLPAPER_SOURCE_PRESET:
        return wallpaperSettings.presetImage || fallback
      case WALLPAPER_SOURCE_CUSTOM_URL:
        return wallpaperSettings.customUrl || fallback
      case WALLPAPER_SOURCE_LOCAL:
        return wallpaperSettings.localImageData ?? fallback
      case WALLPAPER_SOURCE_BING_DAILY:
        return previewUrl || fallback
      default:
        return fallback
    }
  }, [
    previewUrl,
    wallpaperSettings.customUrl,
    wallpaperSettings.localImageData,
    wallpaperSettings.presetImage,
    wallpaperSettings.source,
  ])

  useEffect(() => {
    if (wallpaperSettings.source !== WALLPAPER_SOURCE_BING_DAILY) {
      setPreviewLoading(false)
      setPreviewError(null)
      return
    }

    setPreviewLoading(true)
    setPreviewError(null)
    BingWallpaperService.getWallpaper(wallpaperSettings.bingRegion)
      .then(({ url }) => {
        setPreviewUrl(url)
      })
      .catch((error: unknown) => {
        settingsLogger.error("Bing 壁纸预览加载失败:", error)
        setPreviewError("预览加载失败")
      })
      .finally(() => {
        setPreviewLoading(false)
      })
  }, [wallpaperSettings.bingRegion, wallpaperSettings.source])

  return (
    <>
      <div>
        <StyledSettingsContent>
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
              {wallpaperSettings.source === WALLPAPER_SOURCE_PRESET && (
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
              {wallpaperSettings.source === WALLPAPER_SOURCE_CUSTOM_URL && (
                <Input
                  type="url"
                  placeholder="输入图片 URL..."
                  value={wallpaperSettings.customUrl}
                  onChange={e => handleCustomUrlChange(e.target.value)}
                />
              )}

              {/* 本地上传 */}
              {wallpaperSettings.source === WALLPAPER_SOURCE_LOCAL && (
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
                      <RemoveButton onClick={handleRemoveLocal}>
                        移除
                      </RemoveButton>
                    </UploadPreview>
                  )}
                </UploadArea>
              )}

              {/* Bing 每日壁纸 */}
              {wallpaperSettings.source === WALLPAPER_SOURCE_BING_DAILY && (
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
                    Bing 每日壁纸会每 6 小时更新一批候选图片，
                    并随机展示其中一张。
                    <br />
                    选择不同地区可获取不同的每日精选图片。
                  </BingInfo>
                  <RefreshButton
                    onClick={handleBingRefresh}
                    disabled={refreshing}
                  >
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

            {/* 轮播图片管理 */}
            {cardAreaSettings.displayMode === "full" && (
              <Section>
                <SectionTitle>轮播图片</SectionTitle>
                <Toggle onClick={handleUseCustomImagesChange}>
                  <ToggleSwitch checked={cardAreaSettings.useCustomImages} />
                  <ToggleLabel>使用自定义图片</ToggleLabel>
                </Toggle>

                {cardAreaSettings.useCustomImages && (
                  <>
                    <HiddenInput
                      ref={carouselFileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleCarouselFileSelect}
                    />

                    <AddImageButtons>
                      <UploadButton
                        onClick={() => carouselFileInputRef.current?.click()}
                        disabled={carouselUploading}
                      >
                        {carouselUploading ? "上传中..." : "上传本地图片"}
                      </UploadButton>
                    </AddImageButtons>

                    {/* 预设图片快速添加 */}
                    <BingInfo>从预设图片添加：</BingInfo>
                    <ImageGrid>
                      {images.map(img => (
                        <ImageOption
                          key={img.label}
                          active={false}
                          onClick={() =>
                            handleAddPresetToCarousel(img.value, img.label)
                          }
                          title={`添加 ${img.label}`}
                        >
                          <img src={img.value} alt={img.label} />
                        </ImageOption>
                      ))}
                    </ImageGrid>

                    {/* 已添加的图片列表 */}
                    {cardAreaSettings.customImages.length > 0 ? (
                      <CarouselImageList>
                        {cardAreaSettings.customImages.map((img, index) => (
                          <CarouselImageItem key={img.id}>
                            <img src={img.src} alt={img.name} />
                            <CarouselImageInfo>{img.name}</CarouselImageInfo>
                            <CarouselImageActions>
                              <SmallButton
                                onClick={() =>
                                  handleMoveCarouselImage(img.id, "up")
                                }
                                disabled={index === 0}
                              >
                                ↑
                              </SmallButton>
                              <SmallButton
                                onClick={() =>
                                  handleMoveCarouselImage(img.id, "down")
                                }
                                disabled={
                                  index ===
                                  cardAreaSettings.customImages.length - 1
                                }
                              >
                                ↓
                              </SmallButton>
                              <SmallButton
                                className="danger"
                                onClick={() =>
                                  handleRemoveCarouselImage(img.id)
                                }
                              >
                                删除
                              </SmallButton>
                            </CarouselImageActions>
                          </CarouselImageItem>
                        ))}
                      </CarouselImageList>
                    ) : (
                      <EmptyState>
                        暂无自定义图片
                        <br />
                        点击上方按钮添加图片
                      </EmptyState>
                    )}
                  </>
                )}
              </Section>
            )}
          </Container>
        </StyledSettingsContent>
      </div>

      <WallpaperPreview>
        <PreviewStage
          imageUrl={previewImageUrl}
          fullscreen={
            wallpaperSettings.displayMode === WALLPAPER_DISPLAY_FULLSCREEN
          }
          blur={wallpaperSettings.blur}
          brightness={wallpaperSettings.brightness}
        />
        <PreviewOverlay
          visible={
            wallpaperSettings.displayMode === WALLPAPER_DISPLAY_FULLSCREEN &&
            wallpaperSettings.overlay
          }
          opacity={wallpaperSettings.overlayOpacity}
        />

        <PreviewContent>
          <PreviewLeftCard hidden={cardAreaSettings.displayMode === "hidden"}>
            <PreviewSearch />
            <PreviewCard
              imageUrl={previewImageUrl}
              visible={
                wallpaperSettings.displayMode !== WALLPAPER_DISPLAY_FULLSCREEN
              }
            />
          </PreviewLeftCard>
          <PreviewMain>
            <PreviewHint>
              这里是一个实时预览：左侧的改动会立刻反映在预览里。
              <br />
              点击底部的「应用更改」后，才会真正写入设置并刷新主页。
            </PreviewHint>
            {previewLoading && (
              <PreviewHint>正在加载 Bing 壁纸预览…</PreviewHint>
            )}
            {previewError && <PreviewHint>{previewError}</PreviewHint>}
          </PreviewMain>
        </PreviewContent>
      </WallpaperPreview>
    </>
  )
}
