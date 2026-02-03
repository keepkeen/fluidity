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
