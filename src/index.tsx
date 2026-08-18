import React, { StrictMode } from "react"

import { createRoot } from "react-dom/client"

import App from "./App"
import "./base/index.css"
import { hasChromeStorage } from "./services/extensionStore"
import { startGistAutoSync } from "./services/gistSync"

// 清理历史版本注册的开发用 service worker（扩展形态不再使用 SW）
if ("serviceWorker" in navigator && import.meta.env.DEV) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .getRegistrations()
      .then(registrations =>
        Promise.all(registrations.map(registration => registration.unregister()))
      )
      .catch(err => console.error("Service worker cleanup failed:", err))
  })
}

const root = document.getElementById("root")

if (!root) throw new Error("Missing root node")

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
)

if (hasChromeStorage()) {
  startGistAutoSync("startpage")
}
