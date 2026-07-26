import "./base/variables.css"

import { applyColors } from "./base/colorUtils"
import { applyThemeMode } from "./base/theme"
import { ErrorBoundary } from "./components/ErrorBoundary"
import * as Settings from "./Startpage/Settings/settingsHandler"
import { Startpage } from "./Startpage/Startpage"

const App = () => {
  const design = Settings.Design.getWithFallback()
  const colors = design.colors
  applyColors(colors)
  // Apply theme mode (modern vs retro)
  applyThemeMode(design.mode || "retro")

  return (
    <ErrorBoundary>
      <Startpage />
    </ErrorBoundary>
  )
}

export default App
