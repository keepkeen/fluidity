import "./base/variables.css"

import { useEffect, useLayoutEffect, useState } from "react"

import { applyColors } from "./base/colorUtils"
import { applyThemeMode } from "./base/theme"
import { ErrorBoundary } from "./components/ErrorBoundary"
import { onSettingsApplied } from "./services/settingsEvents"
import * as Settings from "./Startpage/Settings/settingsHandler"
import { Startpage } from "./Startpage/Startpage"

const App = () => {
  // 应用设置后 bump key 重挂载 Startpage，各组件挂载时重读 localStorage
  const [settingsVersion, setSettingsVersion] = useState(0)

  useEffect(
    () => onSettingsApplied(() => setSettingsVersion(v => v + 1)),
    []
  )

  // 写 document CSS 变量是副作用，不能在 render 阶段执行
  useLayoutEffect(() => {
    const design = Settings.Design.getWithFallback()
    applyColors(design.colors)
    // Apply theme mode (modern vs retro)
    applyThemeMode()
  }, [settingsVersion])

  return (
    <ErrorBoundary>
      <Startpage key={settingsVersion} />
    </ErrorBoundary>
  )
}

export default App
