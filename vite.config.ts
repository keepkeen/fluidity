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
      rollupOptions: {
        input: {
          main: resolve(__dirname, "index.html"),
          popup: resolve(__dirname, "popup.html"),
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
