/**
 * 颜色计算工具函数
 * 用于主题颜色的转换和计算
 */

/**
 * 将 HEX 颜色转换为 HSL
 */
export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255

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
 * 计算次要文字色
 * 原理：defaultColor 向 bgColor 方向偏移 30%，饱和度降低 20%
 */
export function calculateSecondaryColor(
  defaultColor: string,
  bgColor: string
): string {
  const defaultHsl = hexToHsl(defaultColor)
  const bgHsl = hexToHsl(bgColor)

  // 向背景色方向偏移 30%
  const newL = defaultHsl.l + (bgHsl.l - defaultHsl.l) * 0.3
  // 降低饱和度 20%
  const newS = defaultHsl.s * 0.8

  return hslToHex(defaultHsl.h, newS, newL)
}

/**
 * 计算边框/分割线色
 * 原理：bgColor 向 defaultColor 方向偏移 20%
 */
export function calculateBorderColor(
  defaultColor: string,
  bgColor: string
): string {
  const defaultHsl = hexToHsl(defaultColor)
  const bgHsl = hexToHsl(bgColor)

  // 从背景色向文字色方向偏移 20%
  const newL = bgHsl.l + (defaultHsl.l - bgHsl.l) * 0.2
  // 保持背景色的色相，略微增加饱和度
  const newS = Math.min(bgHsl.s + 5, 30)

  return hslToHex(bgHsl.h, newS, newL)
}
