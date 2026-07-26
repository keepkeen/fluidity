import React, { StrictMode } from "react"

import { createRoot } from "react-dom/client"

import App from "./App"
import "./base/index.css"
import { hasChromeStorage } from "./services/extensionStore"
import { startGistAutoSync } from "./services/gistSync"

const supportsServiceWorker =
  "serviceWorker" in navigator &&
  ["http:", "https:"].includes(window.location.protocol)

if (supportsServiceWorker && import.meta.env.DEV) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .getRegistrations()
      .then(registrations =>
        Promise.all(registrations.map(registration => registration.unregister()))
      )
      .catch(err => console.error("Service worker cleanup failed:", err))

    if ("caches" in window) {
      window.caches
        .keys()
        .then(keys =>
          Promise.all(
            keys
              .filter(key => key.startsWith("fluidity-"))
              .map(key => window.caches.delete(key))
          )
        )
        .catch(err => console.error("Cache cleanup failed:", err))
    }
  })
}

// Register a lightweight service worker for production web hosting only.
if (supportsServiceWorker && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .catch(err => console.error("Service worker registration failed:", err))
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
