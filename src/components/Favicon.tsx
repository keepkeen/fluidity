/**
 * Favicon 显示组件
 * 显示网站图标，获取失败时不显示任何内容
 */

import React, { memo, useState } from "react"

import styled from "@emotion/styled"

interface FaviconProps {
  url: string
  size?: number
  className?: string
}

const FaviconImage = styled.img<{ size: number }>`
  width: ${({ size }) => size}px;
  height: ${({ size }) => size}px;
  object-fit: contain;
  flex-shrink: 0;
  border-radius: 2px;
`

/**
 * 从 URL 提取域名
 */
const extractDomain = (url: string): string | null => {
  try {
    const urlObj = new URL(url)
    return urlObj.hostname
  } catch {
    return null
  }
}

/**
 * Favicon 组件
 * - 使用 Google Favicon API 获取图标
 * - 获取失败时不显示任何内容
 */
export const Favicon = memo(({ url, size = 16, className }: FaviconProps) => {
  const [hasError, setHasError] = useState(false)

  const domain = extractDomain(url)
  if (!domain || hasError) {
    return null
  }

  const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=${
    size * 2
  }`

  return (
    <FaviconImage
      src={faviconUrl}
      alt=""
      size={size}
      className={className}
      loading="lazy"
      onError={() => setHasError(true)}
    />
  )
})

Favicon.displayName = "Favicon"
