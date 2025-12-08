import React, { StrictMode } from "react"

import { createRoot } from "react-dom/client"

import App from "./App"
import "./base/index.css"

// Register a lightweight service worker to enable offline use when served locally.
// Skip in extension context to avoid chrome-extension:// caching issues.
if (
  "serviceWorker" in navigator &&
  ["http:", "https:", "file:"].includes(window.location.protocol)
) {
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
