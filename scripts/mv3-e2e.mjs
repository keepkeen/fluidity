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
    try {
      await startpage
        .getByRole("combobox", { name: "搜索", exact: true })
        .waitFor({ state: "visible", timeout: 10_000 })
    } catch (error) {
      const pageState = {
        body: (await startpage.locator("body").textContent())?.slice(0, 500),
        title: await startpage.title(),
        url: startpage.url(),
      }
      throw new Error(
        `Startpage did not become ready: ${JSON.stringify(pageState)}${
          errors.length ? `\n${errors.join("\n")}` : ""
        }`,
        { cause: error }
      )
    }
    await expectVisible(
      startpage,
      'button[aria-label="打开设置"]',
      "settings button"
    )

    const pageDots = startpage.getByRole("button", { name: /转到第 \d+ 页/ })
    assert((await pageDots.count()) >= 2, "Expected paginated home pages")
    await startpage.locator("body").click({ position: { x: 8, y: 320 } })
    await startpage.keyboard.type("blend")
    const homeSearch = startpage.getByRole("combobox", {
      name: "搜索",
      exact: true,
    })
    assert((await homeSearch.inputValue()) === "blend", "Direct typing did not focus search")
    await startpage
      .locator("ul")
      .getByText("Blender", { exact: true })
      .waitFor({ state: "visible", timeout: 10_000 })
    await homeSearch.press("Escape")
    await pageDots.first().focus()
    await startpage.keyboard.press("/")
    await expectVisible(
      startpage,
      'input[aria-label="搜索链接"]',
      "slash link search shortcut"
    )
    await startpage.keyboard.press("Escape")
    await pageDots.first().focus()
    await startpage.keyboard.press("Alt+2")
    await expectVisible(
      startpage,
      'button[aria-current="page"][aria-label="转到第 2 页"]',
      "Alt+2 page shortcut"
    )
    await startpage.waitForTimeout(280)
    const pageRegion = startpage.getByRole("region", {
      name: "主页分页区域",
    })
    const pageBox = await pageRegion.boundingBox()
    assert(pageBox, "Home page drag region has no bounding box")
    const secondPageGrid = startpage
      .locator('[data-home-page-grid="true"]')
      .nth(1)
    const dragTile = secondPageGrid
      .locator('[data-home-app-tile="true"]')
      .first()
    await dragTile.waitFor({ state: "visible", timeout: 10_000 })
    const tileBox = await dragTile.boundingBox()
    const cellBox = await dragTile.locator("xpath=../../..").boundingBox()
    assert(tileBox && cellBox, "App tile or grid cell has no bounding box")
    assert(
      tileBox.width < cellBox.width * 0.85 &&
        tileBox.height < cellBox.height * 0.85,
      "App click target still fills too much of its grid cell"
    )
    const pageTrack = startpage.locator('[data-home-page-track="true"]')
    const readTrackX = () =>
      pageTrack.evaluate(track =>
        new DOMMatrixReadOnly(getComputedStyle(track).transform).m41
      )
    const dragX = tileBox.x + tileBox.width / 2
    const dragY = tileBox.y + tileBox.height / 2
    const beforeSmallDragX = await readTrackX()
    await startpage.mouse.move(dragX, dragY)
    await startpage.mouse.down()
    await startpage.mouse.move(dragX + 18, dragY, { steps: 3 })
    const duringSmallDragX = await readTrackX()
    assert(
      duringSmallDragX - beforeSmallDragX >= 12,
      `Home page track did not follow a small pointer drag (${beforeSmallDragX} -> ${duringSmallDragX})`
    )
    await startpage.waitForTimeout(120)
    await startpage.mouse.up()
    await startpage.waitForTimeout(280)
    assert(
      startpage.url() === `chrome-extension://${extensionId}/index.html`,
      "Small drag on an app icon accidentally opened the link"
    )
    await expectVisible(
      startpage,
      'button[aria-current="page"][aria-label="转到第 2 页"]',
      "small icon drag snap-back"
    )

    const beforeFullDragX = await readTrackX()
    await startpage.mouse.move(dragX, dragY)
    await startpage.mouse.down()
    await startpage.mouse.move(dragX + Math.max(180, pageBox.width * 0.2), dragY, {
      steps: 6,
    })
    const duringFullDragX = await readTrackX()
    assert(
      duringFullDragX - beforeFullDragX >= 150,
      `Home page track lagged behind a full pointer drag (${beforeFullDragX} -> ${duringFullDragX})`
    )
    await startpage.mouse.up()
    await expectVisible(
      startpage,
      'button[aria-current="page"][aria-label="转到第 1 页"]',
      "app-icon drag page navigation"
    )

    const rediscoveryRemove = startpage
      .getByRole("button", { name: "不需要了", exact: true })
      .first()
    await rediscoveryRemove.waitFor({ state: "visible", timeout: 10_000 })
    const rediscoveryLabel = await rediscoveryRemove.evaluate(button =>
      button.parentElement?.parentElement?.parentElement
        ?.querySelector("button")
        ?.textContent?.trim()
    )
    assert(rediscoveryLabel, "Unable to resolve rediscovery target label")
    await rediscoveryRemove.click()
    const rediscoveryDeleteTitle = startpage.getByText("移除应用", {
      exact: true,
    })
    await rediscoveryDeleteTitle.waitFor({ state: "visible", timeout: 10_000 })
    await startpage
      .getByRole("button", { name: "删除", exact: true })
      .click()
    await rediscoveryDeleteTitle.waitFor({ state: "hidden", timeout: 10_000 })
    await startpage
      .getByRole("button", { name: rediscoveryLabel, exact: true })
      .waitFor({ state: "detached", timeout: 10_000 })
    const removedFromStorage = await startpage.evaluate(label => {
      const groups = JSON.parse(localStorage.getItem("link-groups") ?? "[]")
      return groups.every(group =>
        group.links.every(link => link.label !== label)
      )
    }, rediscoveryLabel)
    assert(
      removedFromStorage,
      "Rediscovery deletion did not update persisted links"
    )

    await startpage.getByRole("button", { name: "打开设置" }).click()
    const settingsDialog = startpage.getByRole("dialog", { name: "设置" })
    await settingsDialog
      .getByRole("button", { name: "外观", exact: true })
      .click()
    await settingsDialog
      .getByRole("button", { name: /Option \/ Alt \+ 1/ })
      .first()
      .waitFor({ state: "visible", timeout: 10_000 })
    await settingsDialog
      .getByRole("button", { name: "数据", exact: true })
      .click()
    await expectTextVisible(startpage, "浏览时长统计", "Usage tracking settings")
    await expectTextVisible(
      startpage,
      "云同步（GitHub Gist）",
      "Gist sync settings"
    )
    await expectTextVisible(startpage, "未配置 Token", "Gist empty state copy")
    await settingsDialog
      .getByRole("button", { name: "AI 助手", exact: true })
      .click()
    await expectTextVisible(startpage, "API Key", "AI settings panel")

    const popup = await context.newPage()
    watchPageErrors(popup, "popup", errors)
    await popup.goto(`chrome-extension://${extensionId}/popup.html`)
    await popup.waitForLoadState("domcontentloaded")
    await expectVisible(popup, "input", "popup search input")

    const smartSearchPage = await context.newPage()
    watchPageErrors(smartSearchPage, "smart-search", errors)
    await suppressFirstRunUi(smartSearchPage)
    await smartSearchPage.addInitScript(() => {
      const now = Date.now()
      localStorage.setItem(
        "link-groups",
        JSON.stringify([
          {
            title: "常用中文站点",
            links: [
              { label: "知乎", value: "https://www.zhihu.com" },
              { label: "哔哩哔哩", value: "https://www.bilibili.com" },
              { label: "Blender", value: "https://www.blender.org" },
            ],
          },
        ])
      )
      localStorage.setItem(
        "search-history",
        JSON.stringify([
          {
            query: "北京天气预报",
            engine: "https://www.google.com/search?q={{query}}",
            timestamp: now,
          },
          {
            query: "Blender 教程",
            engine: "https://www.google.com/search?q={{query}}",
            timestamp: now - 1,
          },
        ])
      )
    })
    await smartSearchPage.goto(
      `chrome-extension://${extensionId}/index.html?smart-search-e2e=1`
    )
    await smartSearchPage.waitForLoadState("domcontentloaded")
    const smartSearchInput = smartSearchPage.getByRole("combobox", {
      name: "搜索",
      exact: true,
    })
    await smartSearchInput.fill("zhihu")
    await smartSearchPage
      .getByRole("option")
      .filter({ hasText: "知乎" })
      .waitFor({ state: "visible", timeout: 10_000 })
    await smartSearchInput.fill("zh")
    await smartSearchPage
      .getByRole("option")
      .filter({ hasText: "知乎" })
      .waitFor({ state: "visible", timeout: 10_000 })
    await smartSearchInput.fill("bldner")
    await smartSearchPage
      .getByRole("option")
      .filter({ has: smartSearchPage.getByText("Blender", { exact: true }) })
      .waitFor({ state: "visible", timeout: 10_000 })
    await smartSearchInput.fill("beijingtianqi")
    const historyOption = smartSearchPage
      .getByRole("option")
      .filter({ hasText: "北京天气预报" })
    await historyOption.waitFor({ state: "visible", timeout: 10_000 })
    assert(
      (await historyOption.getByText("历史", { exact: true }).count()) === 1,
      "Search history suggestion was not labeled as history"
    )
    assert(
      (await smartSearchPage.getByRole("option").count()) <= 8,
      "Smart search rendered more than eight suggestions"
    )
    await smartSearchInput.press("ArrowDown")
    assert(
      (await historyOption.getAttribute("aria-selected")) === "true",
      "ArrowDown did not select the first smart suggestion"
    )
    await smartSearchPage.close()

    const retentionPage = await context.newPage()
    watchPageErrors(retentionPage, "page-retention", errors)
    await suppressFirstRunUi(retentionPage)
    await retentionPage.addInitScript(() => {
      const icon =
        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64'%3E%3Crect width='64' height='64' rx='14' fill='%235b7cfa'/%3E%3C/svg%3E"
      localStorage.setItem(
        "link-groups",
        JSON.stringify([
          {
            title: "多页回归",
            links: Array.from({ length: 140 }, (_, index) => ({
              label: `回归链接 ${index + 1}`,
              value: `https://example.com/regression/${index + 1}`,
              icon,
            })),
          },
        ])
      )
    })
    await retentionPage.goto(`chrome-extension://${extensionId}/index.html`)
    await retentionPage.waitForLoadState("domcontentloaded")
    await retentionPage.waitForFunction(
      () =>
        document.querySelectorAll('button[aria-label^="转到第 "]').length >= 3,
      undefined,
      { timeout: 10_000 }
    )
    const retainedIcon = retentionPage
      .locator('[data-home-page-grid="true"]')
      .first()
      .locator('[data-home-app-tile="true"]')
      .first()
    await retainedIcon.evaluate(iconElement => {
      iconElement.dataset.mountProbe = "retained"
    })
    await retentionPage.keyboard.press("Alt+3")
    await expectVisible(
      retentionPage,
      'button[aria-current="page"][aria-label="转到第 3 页"]',
      "third page shortcut for retention test"
    )
    assert(
      (await retentionPage.locator('[data-mount-probe="retained"]').count()) ===
        1,
      "Previously visited page was unmounted after moving two pages away"
    )
    await retentionPage.keyboard.press("Alt+1")
    await expectVisible(
      retentionPage,
      'button[aria-current="page"][aria-label="转到第 1 页"]',
      "return to retained first page"
    )
    await retainedIcon.waitFor({ state: "visible", timeout: 10_000 })
    await retentionPage.close()

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
            "home_pagination",
            "direct_bookmark_search",
            "smart_search_chinese_pinyin_initials_fuzzy_history",
            "slash_link_search",
            "page_shortcut",
            "direct_track_drag",
            "app_icon_drag_click_suppression",
            "compact_app_hit_target",
            "visited_page_icon_retention",
            "rediscovery_single_confirm_refresh",
            "page_shortcut_setting",
            "settings_data",
            "settings_ai",
            "popup",
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
