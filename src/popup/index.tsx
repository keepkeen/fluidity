import React, { StrictMode } from "react"

import { createRoot } from "react-dom/client"

import { Popup } from "./Popup"
import { hasChromeStorage } from "../services/extensionStore"
import { startGistAutoSync } from "../services/gistSync"

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const root = createRoot(document.getElementById("popup-root")!)

root.render(
  <StrictMode>
    <Popup />
  </StrictMode>
)

if (hasChromeStorage()) {
  startGistAutoSync("popup")
}
