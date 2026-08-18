/**
 * 设计 token 应用（单一清雅体系；复古模式已移除）
 */

const FONT_UI =
  '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol"'

export const applyThemeMode = (): void => {
  const root = document.documentElement
  root.style.setProperty("--radius-main", "16px")
  root.style.setProperty("--radius-sm", "10px")
  root.style.setProperty("--font-main", FONT_UI)
  root.style.setProperty("--shadow-card", "var(--shadow-soft)")
  root.style.setProperty("--border-width", "1px")
  root.style.setProperty("--glass-opacity", "0.7")
  root.style.setProperty("--hover-transform", "translateY(-1px)")
}
