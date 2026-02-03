import "./base/variables.css"

import { ErrorBoundary } from "./components/ErrorBoundary"
import * as Settings from "./Startpage/Settings/settingsHandler"
import { Startpage } from "./Startpage/Startpage"

// 颜色变量别名映射（新变量名 -> 旧变量名）
const COLOR_ALIASES: Record<string, string> = {
  "--bg-primary": "--bg-color",
  "--text-primary": "--default-color",
  "--text-secondary": "--secondary-color",
  "--border-default": "--border-color",
  "--accent": "--accent-color",
  "--accent-hover": "--accent-color2",
}

/**
 * 应用颜色变量到 CSS
 */
const applyColors = (colors: Record<string, string>): void => {
  const root = document.documentElement

  // 设置所有颜色变量
  Object.entries(colors).forEach(([key, value]) => {
    root.style.setProperty(key, value)
    // 设置兼容性别名
    const alias = COLOR_ALIASES[key]
    if (alias) {
      root.style.setProperty(alias, value)
    }
  })
}

const App = () => {
  const colors = Settings.Design.getWithFallback().colors
  applyColors(colors)

  return (
    <ErrorBoundary>
      <Startpage />
    </ErrorBoundary>
  )
}

export default App
