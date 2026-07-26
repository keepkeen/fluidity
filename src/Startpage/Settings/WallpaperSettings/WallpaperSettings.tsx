import { useEffect, useMemo, useRef, useState } from "react"

import { RangeSlider } from "../../../components/RangeSlider"
import { Toggle } from "../../../components/Toggle"
import {
  BingRegion,
  images,
  WallpaperSettings as WallpaperSettingsType,
  WallpaperSource,
} from "../../../data/data"
import { BingWallpaperService } from "../../../services/bingWallpaper"
import { LocalImageService } from "../../../services/localImage"
import { settingsLogger } from "../../../utils/logger"
import { StyledSettingsContent } from "../SettingsWindow"
import {
  BingConfig,
  BingInfo,
  Container,
  HiddenInput,
  ImageGrid,
  ImageOption,
  Input,
  OptionButton,
  OptionGroup,
  PreviewCard,
  PreviewContent,
  PreviewHint,
  PreviewLeftCard,
  PreviewMain,
  PreviewOverlay,
  PreviewSearch,
  PreviewStage,
  RefreshButton,
  RemoveButton,
  Section,
  SectionTitle,
  UploadArea,
  UploadButton,
  UploadInfo,
  UploadPreview,
  WallpaperPreview,
} from "./WallpaperSettings.styles"

const WALLPAPER_SOURCE_PRESET: WallpaperSource = "preset"
const WALLPAPER_SOURCE_CUSTOM_URL: WallpaperSource = "custom-url"
const WALLPAPER_SOURCE_LOCAL: WallpaperSource = "local"
const WALLPAPER_SOURCE_BING_DAILY: WallpaperSource = "bing-daily"
const WALLPAPER_DISPLAY_FULLSCREEN = "fullscreen"

interface Props {
  wallpaperSettings: WallpaperSettingsType
  onWallpaperChange: (settings: WallpaperSettingsType) => void
}

const sourceOptions: { value: WallpaperSource; label: string }[] = [
  { value: WALLPAPER_SOURCE_PRESET, label: "预设图片" },
  { value: WALLPAPER_SOURCE_CUSTOM_URL, label: "自定义 URL" },
  { value: WALLPAPER_SOURCE_LOCAL, label: "本地上传" },
  { value: WALLPAPER_SOURCE_BING_DAILY, label: "Bing 每日" },
]

const bingRegionOptions: { value: BingRegion; label: string }[] = [
  { value: "cn", label: "中国" },
  { value: "en-US", label: "美国" },
  { value: "ja-JP", label: "日本" },
  { value: "de-DE", label: "德国" },
]

export const WallpaperSettings: React.FC<Props> = ({
  wallpaperSettings,
  onWallpaperChange,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

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
              <Toggle
                label="显示遮罩层"
                checked={wallpaperSettings.overlay}
                onChange={() => handleOverlayChange()}
              />
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
          <PreviewLeftCard hidden={false}>
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
