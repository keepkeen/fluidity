import React, { StrictMode } from "react"

import { createRoot } from "react-dom/client"

import { PaletteApp } from "./paletteApp"
import "../base/index.css"

const root = document.getElementById("root")

if (!root) throw new Error("Missing root node")

createRoot(root).render(
  <StrictMode>
    <PaletteApp />
  </StrictMode>
)
