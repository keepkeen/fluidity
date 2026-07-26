import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { chromium } from "playwright"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, "..")
const extensionDir = path.join(rootDir, "build")
const tempProfilePrefix = "fluidity-mv3-e2e-"

const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

const fileExists = async filePath => {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

const getBrowserExecutable = async () => {
  if (process.env.CHROME_PATH) {
    const externalPath = process.env.CHROME_PATH
    assert(
      await fileExists(externalPath),
      `CHROME_PATH does not exist: ${externalPath}`
    )
    return externalPath
  }

  const bundledPath = chromium.executablePath()
  assert(
    await fileExists(bundledPath),
    "Missing Playwright Chromium. Run `npx playwright install chromium` before MV3 E2E."
  )
  return bundledPath
}

const watchPageErrors = (page, label, errors) => {
  page.on("pageerror", error => {
    errors.push(`${label} pageerror: ${error.message}`)
  })
  page.on("console", message => {
    if (message.type() === "error") {
      const location = message.location()
      const source = location.url
        ? ` at ${location.url}:${location.lineNumber}:${location.columnNumber}`
        : ""
      errors.push(`${label} console${source}: ${message.text()}`)
    }
  })
  page.on("requestfailed", request => {
    const failure = request.failure()
    errors.push(
      `${label} requestfailed: ${request.url()} ${failure?.errorText ?? ""}`
    )
  })
}

const waitForExtensionId = async context => {
  let serviceWorker = context.serviceWorkers()[0]
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent("serviceworker", {
      timeout: 15_000,
    })
  }

  const url = serviceWorker.url()
  const extensionId = new URL(url).host
  assert(extensionId, `Unable to resolve extension id from ${url}`)

  const manifest = await serviceWorker.evaluate(() =>
    chrome.runtime.getManifest()
  )
  assert(manifest.manifest_version === 3, "Expected MV3 manifest")
  assert(manifest.background?.service_worker, "Missing MV3 service worker")

  return { extensionId, manifest }
}

const removeTemporaryProfile = async userDataDir => {
  const tempRoot = path.resolve(os.tmpdir())
  const target = path.resolve(userDataDir)
  const basename = path.basename(target)

  assert(
    target.startsWith(`${tempRoot}${path.sep}`) &&
      basename.startsWith(tempProfilePrefix),
    `Refusing to remove unexpected profile directory: ${target}`
  )

  await fs.rm(target, { recursive: true })
}

const expectVisible = async (page, selector, label) => {
  const locator = page.locator(selector)
  await locator.waitFor({ state: "visible", timeout: 10_000 })
  assert((await locator.count()) > 0, `${label} not found`)
}

const expectTextVisible = async (page, text, label) => {
  try {
    await page.getByText(text, { exact: true }).waitFor({
      state: "visible",
      timeout: 10_000,
    })
  } catch (error) {
    throw new Error(`${label} not found: ${text}`, { cause: error })
  }
}

const suppressFirstRunUi = async page => {
  await page.addInitScript(() => {
    const pad = value => String(value).padStart(2, "0")
    const now = new Date()
    const startOfYear = new Date(now.getFullYear(), 0, 1)
    const days = Math.floor(
      (now.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000)
    )
    const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7)
    const reportState = {
      dismissedWeeklyReport: `${now.getFullYear()}-W${pad(weekNumber)}`,
      dismissedMonthlyReport: `${now.getFullYear()}-${pad(
        now.getMonth() + 1
      )}`,
    }

    localStorage.setItem("fluidity-onboarding-completed", "true")
    localStorage.setItem("report-state", JSON.stringify(reportState))
  })
}

const main = async () => {
  const manifestPath = path.join(extensionDir, "manifest.json")
  assert(
    await fileExists(manifestPath),
    "Missing build/manifest.json. Run npm run build before MV3 E2E."
  )

  const browserPath = await getBrowserExecutable()

  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), tempProfilePrefix))
  const errors = []

  let context
  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      executablePath: browserPath,
      headless: process.env.MV3_E2E_HEADLESS === "1",
      ignoreDefaultArgs: ["--disable-extensions"],
      args: [
        `--disable-extensions-except=${extensionDir}`,
        `--load-extension=${extensionDir}`,
        "--no-default-browser-check",
        "--no-first-run",
      ],
    })

    const { extensionId, manifest } = await waitForExtensionId(context)
    assert(manifest.action?.default_popup === "popup.html", "Popup mismatch")
    assert(
      manifest.chrome_url_overrides?.newtab === "index.html",
      "New tab override mismatch"
    )

    const startpage = await context.newPage()
    watchPageErrors(startpage, "startpage", errors)
    await suppressFirstRunUi(startpage)
    await startpage.goto(`chrome-extension://${extensionId}/index.html`)
    await startpage.waitForLoadState("domcontentloaded")
    await startpage
      .getByRole("textbox", { name: "搜索", exact: true })
      .waitFor({ state: "visible", timeout: 10_000 })
    await expectVisible(
      startpage,
      'button[aria-label="打开设置"]',
      "settings button"
    )
    await startpage.getByRole("button", { name: "打开设置" }).click()
    await startpage.getByRole("button", { name: "数据" }).click()
    await expectTextVisible(
      startpage,
      "云同步（GitHub Gist）",
      "Gist sync settings"
    )
    await expectTextVisible(startpage, "未配置 Token", "Gist empty state copy")
    await startpage.getByRole("button", { name: "AI 助手" }).click()
    await expectTextVisible(startpage, "API Key", "AI settings panel")

    const popup = await context.newPage()
    watchPageErrors(popup, "popup", errors)
    await popup.goto(`chrome-extension://${extensionId}/popup.html`)
    await popup.waitForLoadState("domcontentloaded")
    await expectVisible(popup, "input", "popup search input")

    const palette = await context.newPage()
    watchPageErrors(palette, "palette", errors)
    await palette.goto(`chrome-extension://${extensionId}/palette.html`)
    await palette.waitForLoadState("domcontentloaded")
    await expectVisible(palette, "input", "palette search input")

    assert(errors.length === 0, errors.join("\n"))

    console.log(
      JSON.stringify(
        {
          ok: true,
          browser: browserPath,
          extensionId,
          checked: [
            "service_worker",
            "startpage",
            "settings_data",
            "settings_ai",
            "popup",
            "palette",
          ],
        },
        null,
        2
      )
    )
  } finally {
    if (context) await context.close()
    await removeTemporaryProfile(userDataDir)
  }
}

await main()
