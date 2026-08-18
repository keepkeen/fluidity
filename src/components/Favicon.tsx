/**
 * Favicon 显示组件
 * 显示网站图标，获取失败时不显示任何内容
 */

import React, { memo } from "react"

import styled from "@emotion/styled"

import { useFavicon } from "../hooks/useFavicon"

interface FaviconProps {
  url: string
  size?: number
  sourceSize?: number
  className?: string
  icon?: string | null
  fallbackLabel?: string
  eager?: boolean
}

const FaviconImage = styled.img<{ size: number }>`
  width: ${({ size }) => size}px;
  height: ${({ size }) => size}px;
  object-fit: contain;
  flex-shrink: 0;
  border-radius: 2px;
  image-rendering: auto;
`

const FaviconFallback = styled.span<{ size: number }>`
  width: ${({ size }) => size}px;
  height: ${({ size }) => size}px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--accent);
  font-size: ${({ size }) => Math.max(13, Math.round(size * 0.52))}px;
  font-weight: 700;
  line-height: 1;
`

/**
 * Favicon 组件
 * - 使用带缓存的异步获取（并把最终 favicon 保存到 `link-groups` 数据中）
 */
export const Favicon = memo(
  ({
    url,
    icon,
    size = 16,
    sourceSize = size,
    fallbackLabel,
    eager = false,
    className,
  }: FaviconProps) => {
    const { favicon } = useFavicon(url, size, icon, sourceSize)
    if (!favicon) {
      let hostname = url
      try {
        hostname = new URL(url).hostname
      } catch {
        // Keep the provided value as a deterministic fallback label.
      }
      const fallback = (fallbackLabel || hostname)
        .trim()
        .charAt(0)
        .toLocaleUpperCase()
      return (
        <FaviconFallback size={size} className={className} aria-hidden>
          {fallback || "·"}
        </FaviconFallback>
      )
    }

    return (
      <FaviconImage
        src={favicon}
        alt=""
        size={size}
        className={className}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
      />
    )
  }
)

Favicon.displayName = "Favicon"
