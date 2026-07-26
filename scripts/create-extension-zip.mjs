import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const buildDir = resolve(rootDir, "build")
const outputDir = resolve(rootDir, "dist")
const pkg = JSON.parse(readFileSync(resolve(rootDir, "package.json"), "utf8"))

const getOutputFile = () => {
  const preferred = resolve(outputDir, `fluidity-${pkg.version}.zip`)
  if (!existsSync(preferred)) return preferred

  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\..+$/, "")
  return resolve(outputDir, `fluidity-${pkg.version}-${stamp}.zip`)
}

if (!existsSync(buildDir)) {
  throw new Error("Missing build directory. Run npm run build first.")
}

mkdirSync(outputDir, { recursive: true })

const outputFile = getOutputFile()

if (existsSync(outputFile)) {
  throw new Error(`Refusing to overwrite existing file: ${outputFile}`)
}

execFileSync("zip", ["-r", outputFile, "."], {
  cwd: buildDir,
  stdio: "inherit",
})

console.log(`Created ${outputFile}`)
