import { lazy, Suspense, useEffect, useMemo, useState } from "react"

import styled from "@emotion/styled"

import { LinkContainer } from "./LinkContainer/LinkContainer"
import { Onboarding } from "./Onboarding/Onboarding"
import { Searchbar } from "./Searchbar/Searchbar"
import { Settings } from "./Settings/Settings"
import {
  Design as DesignSettings,
  Wallpaper as WallpaperSettings,
  CardArea as CardAreaSettings,
} from "./Settings/settingsHandler"
import { AILoadingIndicator } from "../components/AILoadingIndicator"
import { GlobalNotification } from "../components/GlobalNotification"
import { BingWallpaperService } from "../services/bingWallpaper"
import { settingsLogger } from "../utils/logger"

const AIGreeting = lazy(() =>
  import("./AIGreeting/AIGreeting").then(module => ({
    default: module.AIGreeting,
  }))
)

const DashboardLayout = lazy(() =>
  import("./Layouts/DashboardLayout").then(module => ({
    default: module.DashboardLayout,
  }))
)

const ReportBanner = lazy(() =>
  import("./Report/ReportBanner").then(module => ({
    default: module.ReportBanner,
  }))
)

// 全屏背景层
const FullscreenBackground = styled.div<{
  imageUrl: string
  blur: number
  brightness: number
}>`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: -2;
  background-image: url(${({ imageUrl }) => imageUrl});
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  filter: blur(${({ blur }) => blur}px)
    brightness(${({ brightness }) => brightness});
  transition: filter 0.3s ease;
  transform: scale(1.1); // 防止模糊时边缘出现空白
`

// 背景遮罩层
const BackgroundOverlay = styled.div<{ opacity: number }>`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: -1;
  background: rgba(0, 0, 0, ${({ opacity }) => opacity});
  pointer-events: none;
`

const Wrapper = styled.div`
  width: 100%;
  max-width: 1920px;
  min-height: 100%;
  margin: auto;
  position: relative;
  overflow-x: clip;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
`

const StyledStartpage = styled.div<{ cardHidden: boolean }>`
  padding: 0px var(--page-margin);
  display: flex;
  flex-direction: row;
  /* 空间不足时自动换行堆叠，不依赖固定断点 */
  flex-wrap: wrap;
  justify-content: center;
  align-items: flex-start;
  flex: 1;
  min-height: 0;
  gap: clamp(16px, 2vw, 32px);
  width: 100%; /* Ensure full width for dashboard */
  max-width: 100%;
  box-sizing: border-box;
  overflow-x: clip;

  @media screen and (max-width: 600px) {
    min-height: auto;
    padding-top: 60px;
    padding-bottom: 20px;
  }
`

export const Startpage = () => {
  // 设置状态
  const wallpaperSettings = useMemo(
    () => WallpaperSettings.getWithFallback(),
    []
  )
  const cardAreaSettings = useMemo(() => CardAreaSettings.getWithFallback(), [])
  const designSettings = useMemo(() => DesignSettings.getWithFallback(), [])

  // 壁纸 URL 状态
  const [wallpaperUrl, setWallpaperUrl] = useState("")

  // 加载壁纸
  useEffect(() => {
    const loadWallpaper = async () => {
      const { source, presetImage, customUrl, localImageData, bingRegion } =
        wallpaperSettings

      try {
        switch (source) {
          case "preset":
            setWallpaperUrl(presetImage || designSettings.image)
            break
          case "custom-url":
            setWallpaperUrl(customUrl || designSettings.image)
            break
          case "local":
            setWallpaperUrl(localImageData ?? designSettings.image)
            break
          case "bing-daily":
            try {
              const { url } = await BingWallpaperService.getWallpaper(
                bingRegion
              )
              setWallpaperUrl(url)
            } catch (error) {
              settingsLogger.error("Bing 壁纸加载失败:", error)
              setWallpaperUrl(designSettings.image)
            }
            break
          default:
            setWallpaperUrl(designSettings.image)
        }
      } catch {
        setWallpaperUrl(designSettings.image)
      }
    }

    void loadWallpaper()
  }, [wallpaperSettings, designSettings.image])

  // 是否显示全屏背景
  const showFullscreenBg = wallpaperSettings.displayMode === "fullscreen"
  // 是否隐藏卡片区域
  const cardHidden = cardAreaSettings.displayMode === "hidden"

  return (
    <>
      {/* 全屏背景 */}
      {showFullscreenBg && wallpaperUrl && (
        <>
          <FullscreenBackground
            imageUrl={wallpaperUrl}
            blur={wallpaperSettings.blur}
            brightness={wallpaperSettings.brightness}
          />
          {wallpaperSettings.overlay && (
            <BackgroundOverlay opacity={wallpaperSettings.overlayOpacity} />
          )}
        </>
      )}

      <Wrapper>
        <GlobalNotification />
        <AILoadingIndicator />
        <Onboarding />
        <Suspense fallback={null}>
          <AIGreeting />
        </Suspense>
        <Suspense fallback={null}>
          <ReportBanner />
        </Suspense>
        <StyledStartpage cardHidden={cardHidden}>
          {/* 部件网格 */}
          {!cardHidden && (
            <Suspense fallback={null}>
              <DashboardLayout
                cardDisplayMode={cardAreaSettings.displayMode}
              />
            </Suspense>
          )}

          <LinkContainer />
        </StyledStartpage>
        <Searchbar />
        <Settings />
      </Wrapper>
    </>
  )
}
