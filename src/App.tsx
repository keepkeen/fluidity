import "./base/variables.css"

import { useLayoutEffect } from "react"

import { applyColors } from "./base/colorUtils"
import { applyThemeMode } from "./base/theme"
import { ErrorBoundary } from "./components/ErrorBoundary"
import * as Settings from "./Startpage/Settings/settingsHandler"
import { Startpage } from "./Startpage/Startpage"

const App = () => {
  // 写 document CSS 变量是副作用，不能在 render 阶段执行
  useLayoutEffect(() => {
    const design = Settings.Design.getWithFallback()
    applyColors(design.colors)
    // Apply theme mode (modern vs retro)
    applyThemeMode(design.mode || "retro")
  }, [])

  return (
    <ErrorBoundary>
      <Startpage />
    </ErrorBoundary>
  )
}

export default App
