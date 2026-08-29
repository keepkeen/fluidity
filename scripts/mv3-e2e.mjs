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
    assert(
      manifest.optional_host_permissions?.includes("http://*/*") &&
        manifest.optional_host_permissions?.includes("https://*/*"),
      "Screen-time optional host permissions do not cover HTTP and HTTPS pages"
    )
    const startpage = await context.newPage()
    watchPageErrors(startpage, "startpage", errors)
    await suppressFirstRunUi(startpage)
    await startpage.addInitScript(() => {
      const icon =
        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64'%3E%3Crect width='64' height='64' rx='14' fill='%235b7cfa'/%3E%3C/svg%3E"
      localStorage.setItem(
        "link-groups",
        JSON.stringify([
          {
            title: "端到端测试",
            links: [
              { label: "Blender", value: "https://www.blender.org", icon },
              ...Array.from({ length: 59 }, (_, index) => ({
                label: `测试链接 ${index + 1}`,
                value: `https://example.com/e2e/${index + 1}`,
                icon,
              })),
            ],
          },
        ])
      )
      const laterReadItem = {
        id: "later:e2e",
        url: "https://example.com/read-later-e2e",
        title: "稍后阅读布局验收",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      localStorage.setItem(
        "fluidity.laterRead.v1",
        JSON.stringify({
          version: 1,
          items: { [laterReadItem.id]: laterReadItem },
        })
      )
    })
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

    const screenTimeOpenButton = startpage.getByRole("button", {
      name: "打开屏幕时间",
      exact: true,
    })
    await screenTimeOpenButton.focus()
    await startpage.keyboard.press("Enter")
    const screenTimeDetails = startpage.getByRole("dialog", {
      name: "屏幕时间详情",
    })
    await screenTimeDetails.waitFor({ state: "visible", timeout: 10_000 })
    assert(
      await screenTimeDetails.evaluate(dialog => dialog.parentElement === document.body),
      "Widget detail dialog is still trapped inside the transformed page track"
    )
    const dialogPageBefore = await startpage
      .locator('button[aria-current="page"]')
      .getAttribute("aria-label")
    const screenTimeClose = screenTimeDetails.getByRole("button", {
      name: "关闭",
    })
    await screenTimeClose.focus()
    await startpage.keyboard.press("ArrowRight")
    assert(
      (await startpage.locator('button[aria-current="page"]').getAttribute("aria-label")) ===
        dialogPageBefore,
      "Arrow key inside a widget dialog changed the home page"
    )
    const detailBox = await screenTimeDetails.locator(":scope > *").first().boundingBox()
    assert(detailBox, "Widget detail dialog has no bounding box")
    await startpage.mouse.move(
      detailBox.x + detailBox.width / 2,
      detailBox.y + 24
    )
    await startpage.mouse.down()
    await startpage.mouse.move(
      detailBox.x + Math.max(20, detailBox.width / 2 - 120),
      detailBox.y + 24,
      { steps: 5 }
    )
    await startpage.mouse.up()
    assert(
      (await startpage.locator('button[aria-current="page"]').getAttribute("aria-label")) ===
        dialogPageBefore,
      "Horizontal pointer movement inside a widget dialog changed the home page"
    )
    await screenTimeClose.click()

    const initialScreenTimeShell = startpage.locator(
      '[data-home-item-id="widget:screen-time"]'
    )
    assert(
      (await initialScreenTimeShell
        .locator('[data-home-widget-content="true"]')
        .evaluate(element => getComputedStyle(element).touchAction)) === "pan-y",
      "Widget content blocks vertical touch scrolling in normal mode"
    )
    assert(
      (await initialScreenTimeShell.getByText(/^TOP \d$/).count()) === 0,
      "Empty screen-time widget still displayed a TOP ranking"
    )
    assert(
      (await initialScreenTimeShell.locator('[data-screen-time-trend="true"]').count()) === 0,
      "Empty screen-time widget still displayed an all-zero trend"
    )

    const originalViewport = startpage.viewportSize() ?? {
      width: 1280,
      height: 720,
    }
    await startpage.setViewportSize({ width: 600, height: 720 })
    await startpage.waitForTimeout(280)
    const floatingSearchBox = await startpage
      .getByRole("button", { name: "打开链接搜索" })
      .boundingBox()
    const editHomeBox = await startpage
      .getByRole("button", { name: "编辑主页" })
      .boundingBox()
    assert(floatingSearchBox && editHomeBox, "Narrow-screen controls are unavailable")
    const controlsOverlap =
      floatingSearchBox.x < editHomeBox.x + editHomeBox.width &&
      floatingSearchBox.x + floatingSearchBox.width > editHomeBox.x &&
      floatingSearchBox.y < editHomeBox.y + editHomeBox.height &&
      floatingSearchBox.y + floatingSearchBox.height > editHomeBox.y
    assert(
      !controlsOverlap,
      `Floating search obscured the narrow-screen edit control: ${JSON.stringify({ floatingSearchBox, editHomeBox })}`
    )

    const enableTrackingButton = initialScreenTimeShell.getByRole("button", {
      name: "开启统计",
    })
    const enableTrackingBox = await enableTrackingButton.boundingBox()
    assert(enableTrackingBox, "Screen-time empty action is unavailable")
    await startpage.mouse.move(
      enableTrackingBox.x + enableTrackingBox.width / 2,
      enableTrackingBox.y + enableTrackingBox.height / 2
    )
    await startpage.mouse.down()
    await startpage.waitForTimeout(650)
    await startpage.mouse.up()
    await startpage.getByRole("button", { name: "完成", exact: true })
      .waitFor({ state: "visible", timeout: 10_000 })
    assert(
      (await startpage.getByRole("dialog").count()) === 0,
      "Long-pressing a widget action also fired its business click"
    )
    assert(
      await initialScreenTimeShell
        .locator('[data-home-widget-content="true"]')
        .evaluate(element => element.hasAttribute("inert")),
      "Widget business controls remain interactive in edit mode"
    )
    await startpage.getByRole("button", { name: "总览", exact: true }).click()
    const overview = startpage.getByRole("dialog", { name: "主屏总览" })
    await overview.waitFor({ state: "visible", timeout: 10_000 })
    assert(
      (await overview.getByText(/第 \d+ 页/).count()) >= 2,
      "Home overview did not render all pages"
    )
    await overview.getByRole("button", { name: "关闭", exact: true }).click()
    await startpage.getByRole("button", { name: "完成", exact: true }).click()
    await startpage.waitForTimeout(80)
    const swipeEnableTrackingBox = await enableTrackingButton.boundingBox()
    assert(swipeEnableTrackingBox, "Screen-time action disappeared after edit mode")
    const swipeStartX =
      swipeEnableTrackingBox.x + swipeEnableTrackingBox.width / 2
    const swipeStartY =
      swipeEnableTrackingBox.y + swipeEnableTrackingBox.height / 2
    const actionSwipeTrack = startpage.locator('[data-home-page-track="true"]')
    const actionTrackBefore = await actionSwipeTrack.evaluate(track =>
      new DOMMatrixReadOnly(getComputedStyle(track).transform).m41
    )
    await startpage.mouse.move(swipeStartX, swipeStartY)
    await startpage.mouse.down()
    await startpage.mouse.move(Math.max(4, swipeStartX - 180), swipeStartY, {
      steps: 6,
    })
    const actionTrackDuring = await actionSwipeTrack.evaluate(track =>
      new DOMMatrixReadOnly(getComputedStyle(track).transform).m41
    )
    assert(
      actionTrackBefore - actionTrackDuring >= 40,
      `Widget-action swipe did not move the page track: ${JSON.stringify({
        box: swipeEnableTrackingBox,
        actionTrackBefore,
        actionTrackDuring,
      })}`
    )
    await startpage.mouse.up()
    await expectVisible(
      startpage,
      'button[aria-current="page"][aria-label="转到第 2 页"]',
      "widget-action page swipe"
    )
    assert(
      (await startpage.getByRole("dialog").count()) === 0,
      "Widget action fired after a horizontal page swipe"
    )
    await startpage
      .getByRole("button", { name: "转到第 1 页" })
      .click()
    await startpage.setViewportSize(originalViewport)
    await startpage.waitForTimeout(280)

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
    const paletteTrigger = startpage.getByRole("button", {
      name: "打开链接搜索",
    })
    const searchValueBeforeSpace = await homeSearch.inputValue()
    await paletteTrigger.focus()
    await startpage.keyboard.press("Space")
    const paletteDialog = startpage.getByRole("dialog", { name: "链接搜索" })
    await paletteDialog.waitFor({ state: "visible", timeout: 10_000 })
    assert(
      (await homeSearch.inputValue()) === searchValueBeforeSpace,
      "Space on a focused control was captured by global search"
    )
    const paletteInput = paletteDialog.getByRole("textbox", {
      name: "搜索链接",
    })
    await paletteInput.focus()
    await startpage.keyboard.press("Shift+Tab")
    assert(
      await paletteDialog.evaluate(dialog => dialog.contains(document.activeElement)),
      "Shift+Tab escaped the command palette"
    )
    await startpage.keyboard.press("Tab")
    assert(
      await paletteInput.evaluate(input => document.activeElement === input),
      "Tab did not wrap command-palette focus back to the search input"
    )
    await startpage.keyboard.press("Escape")
    await paletteDialog.waitFor({ state: "hidden", timeout: 10_000 })
    await startpage.waitForTimeout(50)
    assert(
      await paletteTrigger.evaluate(button => document.activeElement === button),
      "Closing link search did not restore focus to its button trigger"
    )
    await pageDots.first().focus()
    await startpage.keyboard.press("/")
    await expectVisible(
      startpage,
      'input[aria-label="搜索链接"]',
      "slash link search shortcut"
    )
    await startpage.keyboard.press("Escape")
    await startpage
      .locator('input[aria-label="搜索链接"]')
      .waitFor({ state: "hidden", timeout: 10_000 })
    await startpage.waitForTimeout(50)
    assert(
      await pageDots.first().evaluate(button => document.activeElement === button),
      "Closing link search did not restore focus to its trigger"
    )
    const firstPageGrid = startpage
      .locator('[data-home-page-grid="true"]')
      .first()
    const firstPageControl = firstPageGrid
      .locator(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
      .first()
    await firstPageControl.focus()
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
    const secondPageControl = secondPageGrid
      .locator(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
      .first()
    assert(
      await secondPageControl.evaluate(
        control => document.activeElement === control
      ),
      "Page shortcut left focus inside the inert previous page"
    )
    await startpage.keyboard.press("ArrowLeft")
    await expectVisible(
      startpage,
      'button[aria-current="page"][aria-label="转到第 1 页"]',
      "keyboard previous page"
    )
    assert(
      await firstPageControl.evaluate(control => document.activeElement === control),
      "ArrowLeft did not focus the first control on the previous page"
    )
    await startpage.keyboard.press("ArrowRight")
    await expectVisible(
      startpage,
      'button[aria-current="page"][aria-label="转到第 2 页"]',
      "keyboard next page"
    )
    assert(
      await secondPageControl.evaluate(
        control => document.activeElement === control
      ),
      "ArrowRight did not focus the first control on the next page"
    )
    await startpage.waitForTimeout(280)
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
    await startpage.waitForTimeout(280)

    const widgetSlotOverflows = await startpage
      .locator('[data-home-item-kind="widget"]')
      .evaluateAll(shells =>
        shells.flatMap(shell => {
          const heading = shell.querySelector("h3")
          const card = heading?.parentElement?.parentElement?.parentElement?.parentElement
          if (!card) return ["missing widget card"]
          const slotRect = shell.getBoundingClientRect()
          const cardRect = card.getBoundingClientRect()
          const overflow = Math.max(
            0,
            cardRect.right - slotRect.right,
            cardRect.bottom - slotRect.bottom,
            slotRect.left - cardRect.left,
            slotRect.top - cardRect.top
          )
          return overflow > 1.5 ? [`${heading?.textContent ?? "widget"}: ${overflow}px`] : []
        })
      )
    assert(
      widgetSlotOverflows.length === 0,
      `Widget cards overflowed their grid slots: ${widgetSlotOverflows.join(", ")}`
    )

    const screenTimeHeading = startpage.getByRole("heading", {
      name: "屏幕时间",
      exact: true,
    })
    const rediscoveryHeading = startpage.getByRole("heading", {
      name: "重逢",
      exact: true,
    })
    const screenTimeShell = startpage.locator(
      '[data-home-item-id="widget:screen-time"]'
    )
    const rediscoveryShell = startpage.locator(
      '[data-home-item-id="widget:rediscovery"]'
    )
    const screenTimeHeadingBox = await screenTimeHeading.boundingBox()
    const screenTimeBoxBefore = await screenTimeShell.boundingBox()
    const rediscoveryBox = await rediscoveryShell.boundingBox()
    assert(
      screenTimeHeadingBox && screenTimeBoxBefore && rediscoveryBox,
      "Widget drag source or target has no bounding box"
    )
    const widgetOrderBefore = await startpage.evaluate(() =>
      JSON.parse(localStorage.getItem("fluidity.homeLayout.v2") ?? "{}")
        .order
    )
    await startpage.mouse.move(
      screenTimeHeadingBox.x + screenTimeHeadingBox.width / 2,
      screenTimeHeadingBox.y + screenTimeHeadingBox.height / 2
    )
    await startpage.mouse.down()
    await startpage.waitForTimeout(280)
    await startpage.mouse.move(
      screenTimeHeadingBox.x + screenTimeHeadingBox.width / 2 + 4,
      screenTimeHeadingBox.y + screenTimeHeadingBox.height / 2,
      { steps: 2 }
    )
    await startpage.waitForTimeout(60)
    await screenTimeShell.waitFor({ state: "visible", timeout: 10_000 })
    const widgetDragActivated =
      (await screenTimeShell.getAttribute("data-home-dragging")) === "true"
    if (!widgetDragActivated) {
      const dragDebug = await startpage.evaluate(() => ({
        editing: document
          .querySelector("[data-home-editing]")
          ?.getAttribute("data-home-editing"),
        active: document
          .querySelector('[data-home-item-id="widget:screen-time"]')
          ?.getAttribute("data-home-dragging"),
        activeElement: document.activeElement?.getAttribute("aria-label"),
      }))
      throw new Error(
        `Long press on widget body did not activate drag: ${JSON.stringify(dragDebug)}`
      )
    }
    const screenTimeBoxDuring = await screenTimeShell.boundingBox()
    assert(screenTimeBoxDuring, "Dragging widget lost its bounding box")
    assert(
      Math.abs(screenTimeBoxDuring.width - screenTimeBoxBefore.width) < 2 &&
        Math.abs(screenTimeBoxDuring.height - screenTimeBoxBefore.height) < 2,
      `Widget changed size while drag started (${screenTimeBoxBefore.width}x${screenTimeBoxBefore.height} -> ${screenTimeBoxDuring.width}x${screenTimeBoxDuring.height})`
    )
    await startpage.mouse.move(
      rediscoveryBox.x + rediscoveryBox.width / 2,
      rediscoveryBox.y + rediscoveryBox.height / 2,
      { steps: 10 }
    )
    await startpage.waitForTimeout(120)
    const screenTimeBoxMoving = await screenTimeShell.boundingBox()
    const rediscoveryBoxReflowed = await rediscoveryShell.boundingBox()
    assert(
      screenTimeBoxMoving &&
        Math.hypot(
          screenTimeBoxMoving.x - screenTimeBoxBefore.x,
          screenTimeBoxMoving.y - screenTimeBoxBefore.y
        ) > 40,
      "The full widget card did not follow the drag pointer"
    )
    assert(
      rediscoveryBoxReflowed &&
        Math.hypot(
          rediscoveryBoxReflowed.x - rediscoveryBox.x,
          rediscoveryBoxReflowed.y - rediscoveryBox.y
        ) > 40,
      "The vacated widget grid slot stayed occupied during drag"
    )
    await startpage.mouse.up()
    await startpage.waitForTimeout(240)
    const widgetOrderAfter = await startpage.evaluate(() =>
      JSON.parse(localStorage.getItem("fluidity.homeLayout.v2") ?? "{}")
        .order
    )
    assert(
      JSON.stringify(widgetOrderAfter) !== JSON.stringify(widgetOrderBefore),
      "Long-pressed widget did not persist its moved position"
    )

    const widgetEditSurface = screenTimeShell.locator(
      '[data-home-widget-edit-surface="true"]'
    )
    const widgetEditSurfaceBox = await widgetEditSurface.boundingBox()
    assert(widgetEditSurfaceBox, "Edit-mode widget drag surface is unavailable")
    await startpage.mouse.move(
      widgetEditSurfaceBox.x + widgetEditSurfaceBox.width / 2,
      widgetEditSurfaceBox.y + widgetEditSurfaceBox.height / 2
    )
    await startpage.mouse.down()
    await startpage.mouse.move(
      widgetEditSurfaceBox.x + widgetEditSurfaceBox.width / 2 + 10,
      widgetEditSurfaceBox.y + widgetEditSurfaceBox.height / 2,
      { steps: 3 }
    )
    await startpage.waitForTimeout(70)
    assert(
      (await screenTimeShell.getAttribute("data-home-dragging")) === "true",
      "Dragging from widget content in edit mode did not activate widget drag"
    )
    await startpage.keyboard.press("Escape")
    await startpage.mouse.up()
    await startpage.waitForTimeout(80)

    const findBlankGridPoint = grid =>
      grid.evaluate(element => {
        const bounds = element.getBoundingClientRect()
        let best = null
        let bestDistance = Number.POSITIVE_INFINITY
        for (let y = bounds.top + 6; y < bounds.bottom - 6; y += 6) {
          for (let x = bounds.left + 6; x < bounds.right - 6; x += 6) {
            if (document.elementFromPoint(x, y) !== element) continue
            const distance =
              Math.abs(x - (bounds.left + bounds.width / 2)) +
              Math.abs(y - (bounds.top + bounds.height / 2))
            if (distance < bestDistance) {
              best = { x, y }
              bestDistance = distance
            }
          }
        }
        return best
      })
    const activeGrid = () =>
      startpage.locator(
        '[data-home-page-grid="true"][aria-hidden="false"]'
      )
    const swipeGapLeft = await findBlankGridPoint(activeGrid())
    assert(swipeGapLeft, "First edit-mode page has no draggable grid gap")
    await startpage.mouse.move(swipeGapLeft.x, swipeGapLeft.y)
    await startpage.mouse.down()
    await startpage.mouse.move(
      swipeGapLeft.x - Math.max(180, pageBox.width * 0.2),
      swipeGapLeft.y,
      { steps: 6 }
    )
    await startpage.mouse.up()
    await expectVisible(
      startpage,
      'button[aria-current="page"][aria-label="转到第 2 页"]',
      "edit-mode mouse swipe to second page"
    )
    await startpage.getByRole("button", { name: "完成", exact: true })
      .waitFor({ state: "visible", timeout: 10_000 })
    await startpage.waitForTimeout(280)
    const swipeGapRight = await findBlankGridPoint(activeGrid())
    assert(swipeGapRight, "Second edit-mode page has no draggable grid gap")
    await startpage.mouse.move(swipeGapRight.x, swipeGapRight.y)
    await startpage.mouse.down()
    await startpage.mouse.move(
      swipeGapRight.x + Math.max(180, pageBox.width * 0.2),
      swipeGapRight.y,
      { steps: 6 }
    )
    await startpage.mouse.up()
    await expectVisible(
      startpage,
      'button[aria-current="page"][aria-label="转到第 1 页"]',
      "edit-mode mouse swipe back to first page"
    )
    await startpage.waitForTimeout(280)

    const appDropTile = activeGrid()
      .locator('[data-home-app-tile="true"]')
      .first()
    const appDropShell = appDropTile.locator(
      "xpath=ancestor::*[@data-home-item-kind='app'][1]"
    )
    const widgetDropShell = activeGrid()
      .locator('[data-home-item-kind="widget"]')
      .first()
    const appDropBox = await appDropTile.boundingBox()
    const widgetDropBox = await widgetDropShell.boundingBox()
    assert(
      appDropBox && widgetDropBox,
      "App-to-widget drag source or target has no bounding box"
    )
    await startpage.mouse.move(
      appDropBox.x + appDropBox.width / 2,
      appDropBox.y + appDropBox.height / 2
    )
    await startpage.mouse.down()
    await startpage.mouse.move(
      appDropBox.x + appDropBox.width / 2 + 8,
      appDropBox.y + appDropBox.height / 2,
      { steps: 2 }
    )
    await startpage.waitForTimeout(60)
    assert(
      (await appDropShell.getAttribute("data-home-dragging")) === "true",
      "Edit-mode app drag did not activate"
    )
    await startpage.mouse.move(
      widgetDropBox.x + 14,
      widgetDropBox.y + widgetDropBox.height / 2,
      { steps: 8 }
    )
    await startpage.waitForTimeout(35)
    const widgetBecameDropTarget =
      (await widgetDropShell.getAttribute("data-home-drop-target")) === "true"
    if (!widgetBecameDropTarget) {
      const dropDebug = await startpage.evaluate(
        ({ x, y, expectedId }) => ({
          expectedId,
          expectedRect: (() => {
            const item = document.querySelector(
              `[data-home-item-id="${CSS.escape(expectedId)}"]`
            )
            if (!item) return null
            const rect = item.getBoundingClientRect()
            return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
          })(),
          pointerElement: document.elementFromPoint(x, y)?.outerHTML.slice(0, 180),
          dropTargets: Array.from(
            document.querySelectorAll('[data-home-drop-target="true"]')
          ).map(item => item.getAttribute("data-home-item-id")),
        }),
        {
          x: widgetDropBox.x + 14,
          y: widgetDropBox.y + widgetDropBox.height / 2,
          expectedId: await widgetDropShell.getAttribute("data-home-item-id"),
        }
      )
      throw new Error(
        `Widget did not become a drop target when the pointer entered its edge: ${JSON.stringify(dropDebug)}`
      )
    }
    await startpage.mouse.up()
    await startpage.waitForTimeout(240)

    const cancelledEdgeOrderBefore = await startpage.evaluate(() =>
      JSON.parse(localStorage.getItem("fluidity.homeLayout.v2") ?? "{}")
        .order
    )
    const cancelledEdgeTile = activeGrid()
      .locator('[data-home-app-tile="true"]')
      .last()
    const cancelledEdgeBox = await cancelledEdgeTile.boundingBox()
    const cancelledViewportBox = await pageTrack.locator("..").boundingBox()
    assert(
      cancelledEdgeBox && cancelledViewportBox,
      "Cross-page cancel source or viewport is unavailable"
    )
    await startpage.mouse.move(
      cancelledEdgeBox.x + cancelledEdgeBox.width / 2,
      cancelledEdgeBox.y + cancelledEdgeBox.height / 2
    )
    await startpage.mouse.down()
    await startpage.mouse.move(
      cancelledEdgeBox.x + cancelledEdgeBox.width / 2 + 8,
      cancelledEdgeBox.y + cancelledEdgeBox.height / 2,
      { steps: 2 }
    )
    await startpage.waitForTimeout(60)
    await startpage.mouse.move(
      cancelledViewportBox.x + cancelledViewportBox.width - 8,
      cancelledEdgeBox.y + cancelledEdgeBox.height / 2,
      { steps: 10 }
    )
    await startpage.waitForTimeout(650)
    await expectVisible(
      startpage,
      'button[aria-current="page"][aria-label="转到第 2 页"]',
      "cancelled drag edge page turn"
    )
    await startpage.keyboard.press("Escape")
    await startpage.mouse.up()
    await startpage.waitForTimeout(300)
    await expectVisible(
      startpage,
      'button[aria-current="page"][aria-label="转到第 1 页"]',
      "cross-page drag cancel rollback"
    )
    const cancelledEdgeOrderAfter = await startpage.evaluate(() =>
      JSON.parse(localStorage.getItem("fluidity.homeLayout.v2") ?? "{}")
        .order
    )
    assert(
      JSON.stringify(cancelledEdgeOrderAfter) ===
        JSON.stringify(cancelledEdgeOrderBefore),
      "Cancelling a cross-page drag did not restore the persisted layout"
    )

    const edgeDragTile = activeGrid()
      .locator('[data-home-app-tile="true"]')
      .last()
    const edgeDragShell = edgeDragTile.locator(
      "xpath=ancestor::*[@data-home-item-kind='app'][1]"
    )
    const edgeDragId = await edgeDragShell.getAttribute("data-home-item-id")
    const edgeDragBox = await edgeDragTile.boundingBox()
    const pageViewportBox = await pageTrack.locator("..").boundingBox()
    assert(
      edgeDragId && edgeDragBox && pageViewportBox,
      "Cross-page app drag source or page viewport is unavailable"
    )
    const edgeDragShellById = startpage.locator(
      `[data-home-item-id=${JSON.stringify(edgeDragId)}]`
    )
    await startpage.mouse.move(
      edgeDragBox.x + edgeDragBox.width / 2,
      edgeDragBox.y + edgeDragBox.height / 2
    )
    await startpage.mouse.down()
    await startpage.mouse.move(
      edgeDragBox.x + edgeDragBox.width / 2 + 8,
      edgeDragBox.y + edgeDragBox.height / 2,
      { steps: 2 }
    )
    await startpage.waitForTimeout(60)
    await startpage.mouse.move(
      pageViewportBox.x + pageViewportBox.width - 8,
      Math.min(
        pageViewportBox.y + pageViewportBox.height - 24,
        Math.max(
          pageViewportBox.y + 24,
          edgeDragBox.y + edgeDragBox.height / 2
        )
      ),
      { steps: 10 }
    )
    await startpage.waitForTimeout(650)
    await expectVisible(
      startpage,
      'button[aria-current="page"][aria-label="转到第 2 页"]',
      "drag-to-edge page turn"
    )
    assert(
      (await edgeDragShellById.getAttribute("data-home-dragging")) === "true",
      "App drag ended while turning the page at the edge"
    )
    const secondPageTarget = activeGrid()
      .locator('[data-home-app-tile="true"]')
      .first()
    const secondPageTargetBox = await secondPageTarget.boundingBox()
    assert(secondPageTargetBox, "Second page has no app drop target")
    await startpage.mouse.move(
      secondPageTargetBox.x + secondPageTargetBox.width / 2,
      secondPageTargetBox.y + secondPageTargetBox.height / 2,
      { steps: 8 }
    )
    await startpage.waitForTimeout(320)
    await startpage.mouse.up()
    await startpage.waitForTimeout(240)
    const movedToSecondPage = await activeGrid().evaluate(
      (grid, itemId) =>
        Array.from(grid.querySelectorAll("[data-home-item-id]")).some(
          item => item.getAttribute("data-home-item-id") === itemId
        ),
      edgeDragId
    )
    assert(
      movedToSecondPage,
      "Edge-turned app was not persisted on the destination page"
    )
    await pageDots.first().click()
    await expectVisible(
      startpage,
      'button[aria-current="page"][aria-label="转到第 1 页"]',
      "return after cross-page app drag"
    )
    await startpage.getByRole("button", { name: "完成", exact: true }).click()

    const rediscoveryHide = startpage
      .getByRole("button", { name: "不再推荐", exact: true })
      .first()
    await rediscoveryHide.waitFor({ state: "visible", timeout: 10_000 })
    const rediscoveryLabel = await rediscoveryHide.evaluate(button =>
      button.parentElement?.parentElement?.parentElement
        ?.querySelector("button")
        ?.textContent?.trim()
    )
    assert(rediscoveryLabel, "Unable to resolve rediscovery target label")
    const rediscoveryCard = startpage
      .getByText("重逢", { exact: true })
      .locator("xpath=../../../..")
    await rediscoveryHide.click()
    await rediscoveryCard
      .getByRole("button", { name: rediscoveryLabel, exact: true })
      .waitFor({ state: "hidden", timeout: 10_000 })
    const keptInStorage = await startpage.evaluate(label => {
      const groups = JSON.parse(localStorage.getItem("link-groups") ?? "[]")
      return groups.some(group =>
        group.links.some(link => link.label === label)
      )
    }, rediscoveryLabel)
    assert(
      keptInStorage,
      "Rediscovery hide unexpectedly deleted the bookmark"
    )
    await startpage.getByRole("button", { name: "撤销", exact: true }).click()
    await rediscoveryCard
      .getByRole("button", { name: rediscoveryLabel, exact: true })
      .waitFor({ state: "visible", timeout: 10_000 })

    const editX = pageBox.x + 12
    const editY = pageBox.y + pageBox.height - 12
    await startpage.mouse.move(editX, editY)
    await startpage.mouse.down()
    await startpage.waitForTimeout(540)
    await startpage.mouse.up()
    const componentButton = startpage.getByRole("button", {
      name: "组件",
      exact: true,
    })
    await componentButton.waitFor({ state: "visible", timeout: 10_000 })
    await componentButton.click()
    const gallery = startpage.getByRole("dialog", { name: "小组件库" })
    await startpage.waitForTimeout(100)
    if ((await gallery.count()) === 0) {
      const state = await startpage.evaluate(() => ({
        editing: document.querySelector("[data-home-editing]")?.getAttribute("data-home-editing"),
        dialogs: Array.from(document.querySelectorAll('[role="dialog"]')).map(element =>
          element.getAttribute("aria-label")
        ),
        toolbar: document.body.innerText.includes("组件\n总览\n完成"),
      }))
      throw new Error(`Widget gallery did not open: ${JSON.stringify(state)}`)
    }
    await gallery.waitFor({ state: "visible", timeout: 10_000 })
    const componentButtonBox = await componentButton.boundingBox()
    assert(componentButtonBox, "Edit toolbar button has no bounding box")
    const modalLayerState = await startpage.evaluate(({ x, y }) => {
      const overlay = Array.from(
        document.querySelectorAll('[data-fluidity-modal="true"]')
      ).find(element => element.getAttribute("role") !== "dialog")
      return {
        overlayZIndex: overlay
          ? Number.parseInt(getComputedStyle(overlay).zIndex, 10)
          : 0,
        toolbarHit: Boolean(
          document
            .elementFromPoint(x, y)
            ?.closest("[data-home-edit-control]")
        ),
      }
    }, {
      x: componentButtonBox.x + componentButtonBox.width / 2,
      y: componentButtonBox.y + componentButtonBox.height / 2,
    })
    assert(
      modalLayerState.overlayZIndex > 1002 &&
        modalLayerState.overlayZIndex < 9998 &&
        !modalLayerState.toolbarHit,
      `Modal did not cover ordinary fixed UI: ${JSON.stringify(modalLayerState)}`
    )
    await gallery.getByText("稍后读", { exact: true })
      .locator("xpath=..")
      .getByRole("button", { name: "添加到主屏", exact: true })
      .click()
    const readLaterSettings = startpage.getByRole("dialog", {
      name: "配置稍后读",
    })
    await readLaterSettings.waitFor({ state: "visible", timeout: 10_000 })
    await readLaterSettings
      .getByRole("button", { name: "横向 · 2×1", exact: true })
      .click()
    await readLaterSettings
      .getByRole("button", { name: "保存", exact: true })
      .click()
    await startpage.getByText("稍后读", { exact: true }).first()
      .waitFor({ state: "visible", timeout: 10_000 })
    const addedWidget = await startpage.evaluate(() => {
      const layout = JSON.parse(localStorage.getItem("fluidity.homeLayout.v2") ?? "{}")
      return Object.values(layout.widgets ?? {}).find(
        widget => widget.type === "read-later"
      )
    })
    assert(addedWidget?.size === "wide", "Widget gallery/settings did not persist semantic size")
    const compactWidgetLayout = await startpage
      .locator(`[data-home-item-id="${addedWidget.instanceId}"]`)
      .evaluate(shell => {
        const content = shell.querySelector('[data-widget-card-content="true"]')
        const row = shell.querySelector('[data-widget-row="true"]')
        if (!content || !row) return null
        const contentRect = content.getBoundingClientRect()
        const rowRect = row.getBoundingClientRect()
        return {
          rowHeight: rowRect.height,
          overflow: Math.max(
            0,
            contentRect.left - rowRect.left,
            rowRect.right - contentRect.right,
            contentRect.top - rowRect.top,
            rowRect.bottom - contentRect.bottom
          ),
        }
      })
    assert(
      compactWidgetLayout &&
        compactWidgetLayout.rowHeight >= 28 &&
        compactWidgetLayout.overflow <= 1.5,
      `Compact widget row is clipped or too small: ${JSON.stringify(compactWidgetLayout)}`
    )
    await startpage.getByRole("button", { name: "完成", exact: true }).click()

    const smartFixtureId = "e2e-smart-entry"
    const previousAiSettings = await startpage.evaluate(() =>
      localStorage.getItem("ai-settings")
    )
    await startpage.evaluate(instanceId => {
      const key = "fluidity.homeLayout.v2"
      const layout = JSON.parse(localStorage.getItem(key) ?? "{}")
      layout.widgets = {
        ...(layout.widgets ?? {}),
        [instanceId]: {
          instanceId,
          type: "smart-entry",
          size: "small",
          config: { itemLimit: 4, excludedUrls: [] },
        },
      }
      layout.order = [
        instanceId,
        ...(layout.order ?? []).filter(id => id !== instanceId),
      ]
      localStorage.setItem(key, JSON.stringify(layout))
      localStorage.setItem(
        "ai-settings",
        JSON.stringify({ collectLinkClicks: false, collectSearchHistory: true })
      )
      window.dispatchEvent(new Event("fluidity-home-layout-changed"))
    }, smartFixtureId)

    const compactSmartShell = startpage.locator(
      `[data-home-item-id="${smartFixtureId}"]`
    )
    const readCompactSmartAction = async label => {
      const action = compactSmartShell.getByRole("button", {
        name: label,
        exact: true,
      })
      await action.waitFor({ state: "visible", timeout: 10_000 })
      return compactSmartShell.evaluate((shell, actionLabel) => {
        const content = shell.querySelector('[data-widget-card-content="true"]')
        const button = Array.from(shell.querySelectorAll("button")).find(
          candidate => candidate.textContent?.trim() === actionLabel
        )
        if (!content || !button) return null
        const contentRect = content.getBoundingClientRect()
        const buttonRect = button.getBoundingClientRect()
        return {
          width: buttonRect.width,
          height: buttonRect.height,
          overflow: Math.max(
            0,
            contentRect.left - buttonRect.left,
            buttonRect.right - contentRect.right,
            contentRect.top - buttonRect.top,
            buttonRect.bottom - contentRect.bottom
          ),
        }
      }, label)
    }

    const smallSmartAction = await readCompactSmartAction("设置")
    assert(
      smallSmartAction &&
        smallSmartAction.width >= 32 &&
        smallSmartAction.height >= 24 &&
        smallSmartAction.overflow <= 1.5,
      `Small disabled smart-entry action is clipped: ${JSON.stringify(smallSmartAction)}`
    )

    await startpage.evaluate(instanceId => {
      const key = "fluidity.homeLayout.v2"
      const layout = JSON.parse(localStorage.getItem(key) ?? "{}")
      layout.widgets[instanceId].size = "wide"
      localStorage.setItem(key, JSON.stringify(layout))
      window.dispatchEvent(new Event("fluidity-home-layout-changed"))
    }, smartFixtureId)
    const wideSmartAction = await readCompactSmartAction("检查设置")
    assert(
      wideSmartAction &&
        wideSmartAction.width >= 56 &&
        wideSmartAction.height >= 24 &&
        wideSmartAction.overflow <= 1.5,
      `Wide disabled smart-entry action is clipped: ${JSON.stringify(wideSmartAction)}`
    )

    await startpage.evaluate(
      ({ instanceId, aiSettings }) => {
        const key = "fluidity.homeLayout.v2"
        const layout = JSON.parse(localStorage.getItem(key) ?? "{}")
        delete layout.widgets[instanceId]
        layout.order = (layout.order ?? []).filter(id => id !== instanceId)
        localStorage.setItem(key, JSON.stringify(layout))
        if (aiSettings === null) localStorage.removeItem("ai-settings")
        else localStorage.setItem("ai-settings", aiSettings)
        window.dispatchEvent(new Event("fluidity-home-layout-changed"))
      },
      { instanceId: smartFixtureId, aiSettings: previousAiSettings }
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
            "widget_keyboard_open",
            "widget_dialog_portal_gesture_isolation",
            "modal_blocks_edit_toolbar",
            "widget_action_long_press_click_suppression",
            "widget_edit_surface_drag",
            "widget_vertical_touch_scroll",
            "link_search_focus_restore",
            "rediscovery_hide_refresh_undo",
            "widget_long_press_drag_stable_size",
            "widget_whole_card_drag_live_reflow",
            "widget_grid_slot_containment",
            "compact_widget_content_containment",
            "compact_smart_entry_empty_action",
            "edit_mode_mouse_page_swipe",
            "pointer_first_app_widget_drop_target",
            "app_edge_dwell_cross_page_drop",
            "app_edge_dwell_cancel_rollback",
            "widget_gallery_add_resize",
            "home_overview",
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
