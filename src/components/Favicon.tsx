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
 * Favicon 服务列表（按优先级排序）
 * 1. 直接获取网站的 favicon.ico
 * 2. DuckDuckGo Favicon API（国内可访问）
 * 3. Google Favicon API（备用）
 */
const getFaviconUrls = (domain: string, size: number): string[] => [
  `https://${domain}/favicon.ico`,
  `https://icons.duckduckgo.com/ip3/${domain}.ico`,
  `https://www.google.com/s2/favicons?domain=${domain}&sz=${size * 2}`,
]

/**
 * Favicon 组件
 * - 尝试多个来源获取图标
 * - 所有来源都失败时不显示任何内容
 */
export const Favicon = memo(({ url, size = 16, className }: FaviconProps) => {
  const [sourceIndex, setSourceIndex] = useState(0)

  const domain = extractDomain(url)
  if (!domain) {
    return null
  }

  const faviconUrls = getFaviconUrls(domain, size)

  // 所有来源都失败
  if (sourceIndex >= faviconUrls.length) {
    return null
  }

  const handleError = () => {
    // 尝试下一个来源
    setSourceIndex(prev => prev + 1)
  }

  return (
    <FaviconImage
      src={faviconUrls[sourceIndex]}
      alt=""
      size={size}
      className={className}
      loading="lazy"
      onError={handleError}
    />
  )
})

Favicon.displayName = "Favicon"
