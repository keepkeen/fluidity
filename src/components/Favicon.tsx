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
  className?: string
  icon?: string | null
}

const FaviconImage = styled.img<{ size: number }>`
  width: ${({ size }) => size}px;
  height: ${({ size }) => size}px;
  object-fit: contain;
  flex-shrink: 0;
  border-radius: 2px;
`

/**
 * Favicon 组件
 * - 使用带缓存的异步获取（并把最终 favicon 保存到 `link-groups` 数据中）
 */
export const Favicon = memo(
  ({ url, icon, size = 16, className }: FaviconProps) => {
    const { favicon } = useFavicon(url, size, icon)
    if (!favicon) return null

    return (
      <FaviconImage
        src={favicon}
        alt=""
        size={size}
        className={className}
        loading="lazy"
      />
    )
  }
)

Favicon.displayName = "Favicon"
