/* eslint-disable import/no-extraneous-dependencies */
import { resolve } from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { checker } from "vite-plugin-checker"

export default defineConfig(() => {
  return {
    base: "./",
    build: {
      outDir: "build",
      // Chrome may warn about unused `link rel="modulepreload"` in extension pages.
      // Disabling modulepreload avoids noisy Performance warnings and is fine for local extension assets.
      modulePreload: false,
      rollupOptions: {
        input: {
          main: resolve(__dirname, "index.html"),
          popup: resolve(__dirname, "popup.html"),
          palette: resolve(__dirname, "palette.html"),
        },
      },
    },
    plugins: [
      react(),
      checker({
        typescript: true,
        eslint: {
          lintCommand: "eslint ./src",
          dev: {
            logLevel: ["error"],
          },
        },
      }),
    ],
  }
})
