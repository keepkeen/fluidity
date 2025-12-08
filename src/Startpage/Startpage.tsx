import React, { useCallback, useEffect, useRef, useState } from "react"

import styled from "@emotion/styled"

import { AIGreeting } from "./AIGreeting/AIGreeting"
import { LinkContainer } from "./LinkContainer/LinkContainer"
import { Onboarding } from "./Onboarding/Onboarding"
import { ReportBanner } from "./Report/ReportBanner"
import { Searchbar } from "./Searchbar/Searchbar"
import { Settings } from "./Settings/Settings"
import { Design as DesignSettings } from "./Settings/settingsHandler"
import { ContributionChart } from "./Todo/ContributionChart"
import { TodoPanel } from "./Todo/TodoPanel"
import { AILoadingIndicator } from "../components/AILoadingIndicator"
import { GlobalNotification } from "../components/GlobalNotification"
import { images } from "../data/data"

const CAROUSEL_INTERVAL = 5000 // 5秒自动切换

// 响应式尺寸变量
const CAROUSEL_SIZE_LARGE = 424
const CAROUSEL_SIZE_MEDIUM = 350
const CAROUSEL_SIZE_SMALL = 280
const CAROUSEL_SIZE_MOBILE = "min(85vw, 320px)"

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

const StyledStartpage = styled.div`
  padding: 0px 100px;
  display: flex;
  flex-direction: row;
  justify-content: flex-start;
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

export const Startpage = () => {
  const [img, setImg] = useState(DesignSettings.getWithFallback().image)
  const [activeIndex, setActiveIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const carouselItems = [
    { type: "image" as const },
    { type: "todo" as const },
    { type: "contribution" as const },
  ]

  const goToSlide = useCallback((index: number) => {
    setActiveIndex(index)
  }, [])

  // 自动轮播
  useEffect(() => {
    if (isPaused) {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      return
    }

    timerRef.current = setInterval(() => {
      setActiveIndex(prev => (prev + 1) % carouselItems.length)
    }, CAROUSEL_INTERVAL)

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [isPaused, carouselItems.length])

  const handleMouseEnter = () => setIsPaused(true)
  const handleMouseLeave = () => setIsPaused(false)

  return (
    <Wrapper>
      <GlobalNotification />
      <AILoadingIndicator />
      <Onboarding />
      <AIGreeting />
      <ReportBanner />
      <StyledStartpage>
        <CarouselContainer
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <CarouselItem active={activeIndex === 0}>
            <Image src={img} onError={() => setImg(images[0].value)} />
          </CarouselItem>
          <CarouselItem active={activeIndex === 1}>
            <TodoWrapper>
              <TodoPanel />
            </TodoWrapper>
          </CarouselItem>
          <CarouselItem active={activeIndex === 2}>
            <TodoWrapper>
              <ContributionChart />
            </TodoWrapper>
          </CarouselItem>
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
        </CarouselContainer>
        <LinkContainer />
      </StyledStartpage>
      <Searchbar />
      <Settings />
    </Wrapper>
  )
}
