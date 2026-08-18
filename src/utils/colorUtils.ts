/**
 * 颜色计算工具函数
 * 用于主题颜色的转换和计算
 */

/**
 * 将各种颜色格式标准化为 HEX
 */
export function normalizeToHex(color: string): string {
  // 已经是 HEX 格式
  if (color.startsWith("#")) {
    // 处理 3 位 HEX
    if (color.length === 4) {
      return `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
    }
    return color.slice(0, 7) // 去掉可能的 alpha
  }

  // rgba/rgb 格式
  const rgbaMatch = color.match(
    /rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*[\d.]+)?\s*\)/
  )
  if (rgbaMatch) {
    const r = parseInt(rgbaMatch[1]).toString(16).padStart(2, "0")
    const g = parseInt(rgbaMatch[2]).toString(16).padStart(2, "0")
    const b = parseInt(rgbaMatch[3]).toString(16).padStart(2, "0")
    return `#${r}${g}${b}`
  }

  // 默认返回原值
  return color
}

/**
 * 将 HEX 颜色转换为 HSL
 */
export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  // 处理可能的 rgba/rgb 格式
  const cleanHex = normalizeToHex(hex)

  // 防御：如果不是有效的 hex 格式（如 CSS 变量、transparent 等），返回安全默认值
  if (!/^#[0-9A-Fa-f]{6}$/.test(cleanHex)) {
    return { h: 0, s: 0, l: 0 }
  }

  const r = parseInt(cleanHex.slice(1, 3), 16) / 255
  const g = parseInt(cleanHex.slice(3, 5), 16) / 255
  const b = parseInt(cleanHex.slice(5, 7), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6
        break
      case g:
        h = ((b - r) / d + 2) / 6
        break
      case b:
        h = ((r - g) / d + 4) / 6
        break
    }
  }

  return { h: h * 360, s: s * 100, l: l * 100 }
}

/**
 * 将 HSL 颜色转换为 HEX
 */
export function hslToHex(h: number, s: number, l: number): string {
  s /= 100
  l /= 100
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, "0")
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

/**
 * 计算次级背景色
 * 原理：bgColor 稍微变暗
 */
export function calculateBgSecondary(bgColor: string): string {
  const hsl = hexToHsl(bgColor)
  const newL = Math.max(hsl.l - 5, 0)
  return hslToHex(hsl.h, hsl.s, newL)
}

/**
 * 计算次要文字色
 * 原理：textPrimary 向 bgColor 方向偏移 30%，饱和度降低 20%
 */
export function calculateTextSecondary(
  textPrimary: string,
  bgColor: string
): string {
  const textHsl = hexToHsl(textPrimary)
  const bgHsl = hexToHsl(bgColor)

  // 向背景色方向偏移 30%
  const newL = textHsl.l + (bgHsl.l - textHsl.l) * 0.3
  // 降低饱和度 20%
  const newS = textHsl.s * 0.8

  return hslToHex(textHsl.h, newS, newL)
}

/**
 * 计算边框色
 * 原理：bgColor 向 textPrimary 方向偏移 15%
 */
export function calculateBorderColor(
  textPrimary: string,
  bgColor: string
): string {
  const textHsl = hexToHsl(textPrimary)
  const bgHsl = hexToHsl(bgColor)

  // 从背景色向文字色方向偏移 15%
  const newL = bgHsl.l + (textHsl.l - bgHsl.l) * 0.15
  // 保持背景色的色相，略微增加饱和度
  const newS = Math.min(bgHsl.s + 5, 30)

  return hslToHex(bgHsl.h, newS, newL)
}

/**
 * 计算悬停背景色
 * 原理：bgColor 向 textPrimary 方向偏移 10%
 */
export function calculateHoverBg(textPrimary: string, bgColor: string): string {
  const textHsl = hexToHsl(textPrimary)
  const bgHsl = hexToHsl(bgColor)

  const newL = bgHsl.l + (textHsl.l - bgHsl.l) * 0.1
  return hslToHex(bgHsl.h, bgHsl.s, newL)
}

/**
 * 计算强调色上的文字颜色
 * 原理：根据强调色的亮度决定使用深色还是浅色文字
 */
export function calculateTextOnAccent(
  accentColor: string,
  bgColor: string,
  textPrimary: string
): string {
  const accentHsl = hexToHsl(accentColor)
  // 如果强调色较亮，使用深色文字（背景色）；否则使用浅色文字
  return accentHsl.l > 50 ? bgColor : textPrimary
}

/**
 * 计算第三强调色
 * 原理：在主强调色和次强调色之间取一个互补色
 */
export function calculateAccentTertiary(
  accentPrimary: string,
  accentSecondary: string
): string {
  const primaryHsl = hexToHsl(accentPrimary)
  const secondaryHsl = hexToHsl(accentSecondary)

  // 取两个强调色色相的中间值，并偏移 60 度
  const avgH = (primaryHsl.h + secondaryHsl.h) / 2
  const newH = (avgH + 60) % 360
  const avgS = (primaryHsl.s + secondaryHsl.s) / 2
  const avgL = (primaryHsl.l + secondaryHsl.l) / 2

  return hslToHex(newH, avgS, avgL)
}

/**
 * 计算成功色
 * 原理：使用绿色系，亮度与次强调色相近
 */
export function calculateSuccessColor(accentSecondary: string): string {
  const hsl = hexToHsl(accentSecondary)
  // 使用绿色色相 (120)，保持相似的饱和度和亮度
  return hslToHex(120, Math.min(hsl.s, 60), Math.min(Math.max(hsl.l, 50), 70))
}

// 保留旧函数名以兼容
export const calculateSecondaryColor = calculateTextSecondary

/**
 * 计算弱化文字色
 * 原理：textPrimary 向 bgColor 方向偏移 50%，饱和度减半
 */
export function calculateTextMuted(
  textPrimary: string,
  bgColor: string
): string {
  const textHsl = hexToHsl(textPrimary)
  const bgHsl = hexToHsl(bgColor)
  const newL = textHsl.l + (bgHsl.l - textHsl.l) * 0.5
  return hslToHex(textHsl.h, textHsl.s * 0.5, newL)
}

/**
 * 计算强调色悬停态
 * 原理：亮度向远离背景的方向偏移 8（深底上变亮、浅底上变深）
 */
export function calculateAccentHover(accent: string, bgColor: string): string {
  const accentHsl = hexToHsl(accent)
  const bgHsl = hexToHsl(bgColor)
  const delta = bgHsl.l < 50 ? 8 : -8
  const newL = Math.min(Math.max(accentHsl.l + delta, 0), 100)
  return hslToHex(accentHsl.h, accentHsl.s, newL)
}

// ============ WCAG 对比度 ============

/**
 * 相对亮度（WCAG 标准）
 */
export function getLuminance(hex: string): number {
  const clean = normalizeToHex(hex)
  if (!/^#[0-9A-Fa-f]{6}$/.test(clean)) return 0
  const r = parseInt(clean.slice(1, 3), 16) / 255
  const g = parseInt(clean.slice(3, 5), 16) / 255
  const b = parseInt(clean.slice(5, 7), 16) / 255
  const toLinear = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

/**
 * 对比度（WCAG 标准，1-21）
 */
export function getContrastRatio(color1: string, color2: string): number {
  const lum1 = getLuminance(color1)
  const lum2 = getLuminance(color2)
  const lighter = Math.max(lum1, lum2)
  const darker = Math.min(lum1, lum2)
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * 保证前景色对背景色达到最小对比度：
 * 不达标时沿远离背景亮度的方向逐步调整前景亮度，直到达标或到达黑/白极限。
 */
export function ensureContrast(
  fg: string,
  bg: string,
  minRatio: number
): string {
  let current = normalizeToHex(fg)
  if (getContrastRatio(current, bg) >= minRatio) return current

  const { h, s } = hexToHsl(current)
  const bgIsDark = getLuminance(bg) < 0.5
  // 深底提亮前景，浅底压暗前景
  for (let step = 1; step <= 20; step++) {
    const { l } = hexToHsl(current)
    const nextL = bgIsDark ? Math.min(l + 5, 100) : Math.max(l - 5, 0)
    current = hslToHex(h, s, nextL)
    if (getContrastRatio(current, bg) >= minRatio) return current
    if (nextL === 100 || nextL === 0) break
  }
  // 单方向到极限仍不达标（如中灰背景）：黑/白必有一方对比度更高，
  // 对任意背景 max(白, 黑) ≥ 4.58，因此 4.5 目标总能满足
  return getContrastRatio("#ffffff", bg) >= getContrastRatio("#000000", bg)
    ? "#ffffff"
    : "#000000"
}

// ============ 主题派生管线 ============

export interface ThemeSeed {
  /** 页面主背景 */
  bgPrimary: string
  /** 强调色 */
  accent: string
  /** 主文字色（可选，缺省时按背景自动生成并保证对比度） */
  textPrimary?: string
}

/**
 * 由 2-3 个种子色推导完整 13 色主题。
 * 所有可读性关系（文字/背景、强调色上的文字等）由本函数保证，
 * 而不是依赖调用方（尤其是 AI）自觉满足。
 */
export function deriveThemeColors(seed: ThemeSeed): Record<string, string> {
  const bg = normalizeToHex(seed.bgPrimary)
  const accentRaw = normalizeToHex(seed.accent)
  const bgHsl = hexToHsl(bg)
  const bgIsDark = getLuminance(bg) < 0.5

  // 主文字：给定则校正，否则从背景色相派生近白/近黑
  const textSeed =
    seed.textPrimary !== undefined
      ? normalizeToHex(seed.textPrimary)
      : hslToHex(bgHsl.h, Math.min(bgHsl.s, 15), bgIsDark ? 92 : 12)
  const textPrimary = ensureContrast(textSeed, bg, 4.5)

  // 强调色至少要能从背景上分辨出来
  const accent = ensureContrast(accentRaw, bg, 2)

  const textSecondary = ensureContrast(
    calculateTextSecondary(textPrimary, bg),
    bg,
    3
  )
  const textMuted = ensureContrast(calculateTextMuted(textPrimary, bg), bg, 3)

  const accentHsl = hexToHsl(accent)
  const accentText = ensureContrast(
    getContrastRatio(bg, accent) >= 4.5 ? bg : textPrimary,
    accent,
    4.5
  )

  const success = ensureContrast(
    hslToHex(120, Math.min(accentHsl.s, 60), bgIsDark ? 65 : 35),
    bg,
    3
  )

  return {
    "--bg-primary": bg,
    "--bg-secondary": calculateBgSecondary(bg),
    "--bg-hover": calculateHoverBg(textPrimary, bg),
    "--text-primary": textPrimary,
    "--text-secondary": textSecondary,
    "--text-muted": textMuted,
    "--border-default": calculateBorderColor(textPrimary, bg),
    "--border-active": accent,
    "--accent": accent,
    "--accent-hover": calculateAccentHover(accent, bg),
    "--accent-text": accentText,
    "--success": success,
    "--glow": accent,
  }
}
