import { readFileSync, readdirSync, statSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const buildDir = resolve(rootDir, "build")
const pkg = JSON.parse(readFileSync(resolve(rootDir, "package.json"), "utf8"))

const errors = []

const walk = dir =>
  readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })

const files = walk(buildDir)

// macOS Finder 复制副本（"xxx 2.js"）和 .DS_Store 一旦混入 build/
// 会被原样打进商店 zip，manifest 副本还会触发审核告警。
for (const file of files) {
  const name = file.slice(buildDir.length + 1)
  if (/ \d+\.[^/]+$/.test(name) || name.endsWith(".DS_Store")) {
    errors.push(`Unexpected junk file in build/: ${name}`)
  }
}

// MV3 的 content script 与 service worker 必须是自包含脚本；
// 一旦 rollup 拆出共享 chunk 产生顶层 import，加载会直接失败。
for (const entry of ["assets/contentScript.js", "assets/background.js"]) {
  const path = join(buildDir, entry)
  let source
  try {
    source = readFileSync(path, "utf8")
  } catch {
    errors.push(`Missing expected entry: ${entry}`)
    continue
  }
  if (/^\s*(import|export)[\s{("']/m.test(source)) {
    errors.push(
      `${entry} contains ESM import/export statements. ` +
        "It must stay self-contained (no shared chunks) to load under MV3.",
    )
  }
}

try {
  const manifest = JSON.parse(
    readFileSync(join(buildDir, "manifest.json"), "utf8"),
  )
  if (manifest.version !== pkg.version) {
    errors.push(
      `manifest.json version (${manifest.version}) != package.json version (${pkg.version})`,
    )
  }
} catch (error) {
  errors.push(`build/manifest.json unreadable: ${error.message}`)
}

if (errors.length > 0) {
  console.error("Build verification failed:")
  for (const error of errors) console.error(`  - ${error}`)
  process.exit(1)
}

console.log(`Build verification passed (${files.length} files).`)
