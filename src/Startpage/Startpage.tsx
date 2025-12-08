import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"

import styled from "@emotion/styled"

import { AIGreeting } from "./AIGreeting/AIGreeting"
import { LinkContainer } from "./LinkContainer/LinkContainer"
import { Onboarding } from "./Onboarding/Onboarding"
import { ReportBanner } from "./Report/ReportBanner"
import { Searchbar } from "./Searchbar/Searchbar"
import { Settings } from "./Settings/Settings"
import {
  Design as DesignSettings,
  Wallpaper as WallpaperSettings,
  CardArea as CardAreaSettings,
} from "./Settings/settingsHandler"
import { ContributionChart } from "./Todo/ContributionChart"
import { TodoPanel } from "./Todo/TodoPanel"
import { AILoadingIndicator } from "../components/AILoadingIndicator"
import { GlobalNotification } from "../components/GlobalNotification"
import { images, CardDisplayMode } from "../data/data"
import { BingWallpaperService } from "../services/bingWallpaper"

// 响应式尺寸变量
const CAROUSEL_SIZE_LARGE = 424
const CAROUSEL_SIZE_MEDIUM = 350
const CAROUSEL_SIZE_SMALL = 280
const CAROUSEL_SIZE_MOBILE = "min(85vw, 320px)"

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
  max-width: 1920px;
  min-height: 100%;
  margin: auto;
  position: relative;
  overflow-x: hidden;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
`

const StyledStartpage = styled.div<{ cardHidden: boolean }>`
  padding: 0px 100px;
  display: flex;
  flex-direction: row;
  justify-content: ${({ cardHidden }) =>
    cardHidden ? "center" : "flex-start"};
  align-items: center;
  flex: 1;
  min-height: 0;
  gap: 32px;

  @media screen and (max-width: 1200px) {
    flex-wrap: wrap;
    justify-content: center;
    padding: 0px 60px;
  }

  @media screen and (max-width: 900px) {
    padding: 0px 40px;
    gap: 24px;
  }

  @media screen and (max-width: 600px) {
    padding: 0px 20px;
    gap: 16px;
    min-height: auto;
    padding-top: 60px;
    padding-bottom: 20px;
  }
`

const CarouselContainer = styled.div`
  position: relative;
  width: ${CAROUSEL_SIZE_LARGE}px;
  height: ${CAROUSEL_SIZE_LARGE}px;
  flex-shrink: 0;

  @media screen and (max-width: 1200px) {
    width: ${CAROUSEL_SIZE_MEDIUM}px;
    height: ${CAROUSEL_SIZE_MEDIUM}px;
  }

  @media screen and (max-width: 600px) {
    width: ${CAROUSEL_SIZE_MOBILE};
    height: ${CAROUSEL_SIZE_MOBILE};
  }

  @media screen and (max-width: 400px) {
    width: ${CAROUSEL_SIZE_SMALL}px;
    height: ${CAROUSEL_SIZE_SMALL}px;
  }
`

const CarouselItem = styled.div<{ active: boolean }>`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  opacity: ${({ active }) => (active ? 1 : 0)};
  pointer-events: ${({ active }) => (active ? "auto" : "none")};
  transition: opacity 0.5s ease-in-out;
  display: flex;
  align-items: center;
  justify-content: center;
`

const Image = styled.img`
  height: calc(100% - 24px);
  width: calc(100% - 24px);
  border: 2px solid var(--default-color);
  padding: 10px;
  object-fit: cover;
  animation: circling-shadow 4s ease 0s infinite normal;

  @media screen and (max-width: 600px) {
    padding: 6px;
  }
`

const TodoWrapper = styled.div`
  width: 100%;
  height: 100%;
  animation: circling-shadow 4s ease 0s infinite normal;
`

const CarouselIndicators = styled.div`
  position: absolute;
  bottom: -24px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 8px;
`

const Indicator = styled.button<{ active: boolean }>`
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 2px solid var(--default-color);
  background: ${({ active }) =>
    active ? "var(--accent-color)" : "transparent"};
  cursor: pointer;
  padding: 0;
  transition: background 0.3s, transform 0.2s;
  &:hover {
    transform: scale(1.2);
    background: var(--accent-color2);
  }
`

// 根据卡片显示模式生成轮播项
const getCarouselItems = (cardDisplayMode: CardDisplayMode) => {
  switch (cardDisplayMode) {
    case "full":
      return [
        { type: "image" as const },
        { type: "todo" as const },
        { type: "contribution" as const },
      ]
    case "tools-only":
      return [{ type: "todo" as const }, { type: "contribution" as const }]
    case "hidden":
    default:
      return []
  }
}

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
  const [cardImg, setCardImg] = useState(designSettings.image)

  // 轮播状态
  const [activeIndex, setActiveIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // 根据卡片显示模式生成轮播项
  const carouselItems = useMemo(
    () => getCarouselItems(cardAreaSettings.displayMode),
    [cardAreaSettings.displayMode]
  )

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
            setWallpaperUrl(localImageData || designSettings.image)
            break
          case "bing-daily":
            try {
              const { url } = await BingWallpaperService.getWallpaper(
                bingRegion
              )
              setWallpaperUrl(url)
            } catch (error) {
              console.error("Bing 壁纸加载失败:", error)
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

  const goToSlide = useCallback((index: number) => {
    setActiveIndex(index)
  }, [])

  // 自动轮播
  useEffect(() => {
    if (isPaused || !cardAreaSettings.autoRotate || carouselItems.length <= 1) {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      return
    }

    timerRef.current = setInterval(() => {
      setActiveIndex(prev => (prev + 1) % carouselItems.length)
    }, cardAreaSettings.rotateInterval)

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [
    isPaused,
    cardAreaSettings.autoRotate,
    cardAreaSettings.rotateInterval,
    carouselItems.length,
  ])

  const handleMouseEnter = () => setIsPaused(true)
  const handleMouseLeave = () => setIsPaused(false)

  // 是否显示全屏背景
  const showFullscreenBg = wallpaperSettings.displayMode === "fullscreen"
  // 是否隐藏卡片区域
  const cardHidden = cardAreaSettings.displayMode === "hidden"

  // 渲染轮播项内容
  const renderCarouselItem = (type: "image" | "todo" | "contribution") => {
    switch (type) {
      case "image":
        return (
          <Image src={cardImg} onError={() => setCardImg(images[0].value)} />
        )
      case "todo":
        return (
          <TodoWrapper>
            <TodoPanel />
          </TodoWrapper>
        )
      case "contribution":
        return (
          <TodoWrapper>
            <ContributionChart />
          </TodoWrapper>
        )
    }
  }

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
        <AIGreeting />
        <ReportBanner />
        <StyledStartpage cardHidden={cardHidden}>
          {/* 卡片区域 */}
          {!cardHidden && carouselItems.length > 0 && (
            <CarouselContainer
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
            >
              {carouselItems.map((item, index) => (
                <CarouselItem key={item.type} active={activeIndex === index}>
                  {renderCarouselItem(item.type)}
                </CarouselItem>
              ))}
              {carouselItems.length > 1 && (
                <CarouselIndicators>
                  {carouselItems.map((item, index) => (
                    <Indicator
                      key={item.type}
                      active={activeIndex === index}
                      onClick={() => goToSlide(index)}
                      aria-label={`切换到第 ${index + 1} 项`}
                    />
                  ))}
                </CarouselIndicators>
              )}
            </CarouselContainer>
          )}
          <LinkContainer />
        </StyledStartpage>
        <Searchbar />
        <Settings />
      </Wrapper>
    </>
  )
}
