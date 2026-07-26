import React from "react"

import { keyframes } from "@emotion/react"
import styled from "@emotion/styled"

const ribbonFloat = keyframes`
  0%, 100% {
    transform: rotate(-8deg) translateY(0);
  }
  50% {
    transform: rotate(-5deg) translateY(-8px);
  }
`

const ribbonFloatRight = keyframes`
  0%, 100% {
    transform: rotate(8deg) translateY(0);
  }
  50% {
    transform: rotate(5deg) translateY(-8px);
  }
`

const RibbonContainer = styled.div<{ position: "left" | "right" }>`
  position: absolute;
  top: -10px;
  ${({ position }) => (position === "left" ? "left: -20px;" : "right: -20px;")}
  width: 50px;
  height: 100px;
  pointer-events: none;
  z-index: 1;

  @media screen and (max-width: 900px) {
    display: none;
  }
`

const RibbonSvg = styled.svg<{ position: "left" | "right" }>`
  width: 100%;
  height: 100%;
  animation: ${({ position }) =>
      position === "left" ? ribbonFloat : ribbonFloatRight}
    3s ease-in-out infinite;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
`

interface RibbonProps {
  position: "left" | "right"
  color1?: string
  color2?: string
}

export const Ribbon: React.FC<RibbonProps> = ({
  position,
  color1 = "var(--accent-color)",
  color2 = "var(--accent-color2)",
}) => {
  const gradientId = `ribbon-gradient-${position}`

  return (
    <RibbonContainer position={position}>
      <RibbonSvg
        position={position}
        viewBox="0 0 50 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={color1} />
            <stop offset="100%" stopColor={color2} />
          </linearGradient>
        </defs>
        {position === "left" ? (
          <>
            {/* 左侧彩带 */}
            <path
              d="M45 0 C40 20, 35 40, 30 60 C25 80, 20 90, 15 100 L25 100 C30 90, 35 80, 40 60 C45 40, 48 20, 50 0 Z"
              fill={`url(#${gradientId})`}
              opacity="0.9"
            />
            <path
              d="M35 0 C30 25, 25 50, 20 75 C18 85, 15 95, 10 100 L18 100 C22 95, 26 85, 28 75 C33 50, 38 25, 42 0 Z"
              fill={`url(#${gradientId})`}
              opacity="0.7"
            />
          </>
        ) : (
          <>
            {/* 右侧彩带 */}
            <path
              d="M5 0 C10 20, 15 40, 20 60 C25 80, 30 90, 35 100 L25 100 C20 90, 15 80, 10 60 C5 40, 2 20, 0 0 Z"
              fill={`url(#${gradientId})`}
              opacity="0.9"
            />
            <path
              d="M15 0 C20 25, 25 50, 30 75 C32 85, 35 95, 40 100 L32 100 C28 95, 24 85, 22 75 C17 50, 12 25, 8 0 Z"
              fill={`url(#${gradientId})`}
              opacity="0.7"
            />
          </>
        )}
      </RibbonSvg>
    </RibbonContainer>
  )
}
