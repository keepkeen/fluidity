import React, { StrictMode } from "react"

import { createRoot } from "react-dom/client"

import { Popup } from "./Popup"

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const root = createRoot(document.getElementById("popup-root")!)

root.render(
  <StrictMode>
    <Popup />
  </StrictMode>
)
