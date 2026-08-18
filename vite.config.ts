/* eslint-disable import/no-extraneous-dependencies */
import { resolve } from "path"
import { defineConfig, type PluginOption } from "vite"

export default defineConfig(async ({ command }) => {
  const enableReactPlugin =
    command === "serve" && process.env.VITE_DISABLE_REACT_PLUGIN !== "1"
  const enableChecker =
    command === "serve" &&
    process.env.VITE_ENABLE_CHECKER === "1" &&
    !process.env.CI &&
    process.env.CODEX_CI !== "1"

  const plugins: PluginOption[] = []

  if (enableReactPlugin) {
    const { default: react } = await import("@vitejs/plugin-react")
    plugins.push(
      react({
        babel: {
          plugins: ["@emotion/babel-plugin"],
        },
      }),
    )
  }

  if (enableChecker) {
    const { checker } = await import("vite-plugin-checker")
    plugins.push(
      checker({
        typescript: true,
        eslint: {
          lintCommand: "eslint ./src --ext .ts,.tsx",
          dev: {
            logLevel: ["error"],
          },
        },
      }),
    )
  }

  return {
    base: "./",
    build: {
      outDir: "build",
      emptyOutDir: true,
      // Chrome may warn about unused `link rel="modulepreload"` in extension pages.
      // Disabling modulepreload avoids noisy Performance warnings and is fine for local extension assets.
      modulePreload: false,
      rollupOptions: {
        input: {
          main: resolve(__dirname, "index.html"),
          popup: resolve(__dirname, "popup.html"),
          background: resolve(__dirname, "src/extension/background.ts"),
          contentScript: resolve(__dirname, "src/extension/contentScript.ts"),
        },
        output: {
          entryFileNames: "assets/[name].js",
          chunkFileNames: "assets/[name]-[hash].js",
          assetFileNames: "assets/[name]-[hash][extname]",
        },
      },
    },
    plugins,
  }
})
