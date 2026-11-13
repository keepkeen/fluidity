import fs from "node:fs/promises"
import http from "node:http"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { chromium } from "playwright"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, "..")
const extensionDir = path.join(rootDir, "build")
const tempProfilePrefix = "fluidity-mv3-e2e-"
const homeOnly = process.argv.includes("--home-only")
const coreChecks = [
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
  "continuous_multi_page_drag_reverse_cancel",
  "real_touch_long_press_follow_reorder_cancel_commit",
  "widget_keyboard_open",
  "widget_dialog_portal_gesture_isolation",
  "modal_blocks_edit_toolbar",
  "widget_action_long_press_click_suppression",
  "widget_edit_surface_drag",
  "widget_vertical_touch_scroll",
  "link_search_focus_restore",
  "rediscovery_hide_refresh_undo",
  "widget_long_press_drag_stable_size",
  "widget_whole_card_drag_stable_tree",
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
  "home_order_local_preview_apply",
  "popup",
]

const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

const assertPermutation = (before, after, label) => {
  assert(
    Array.isArray(before) &&
      Array.isArray(after) &&
      before.length === after.length &&
      new Set(after).size === after.length &&
      JSON.stringify([...before].sort()) === JSON.stringify([...after].sort()),
    `${label} lost or duplicated home items`
  )
}

const fileExists = async filePath => {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

const startUsageFixtureServer = async () => {
  const server = http.createServer((request, response) => {
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-type": "text/html; charset=utf-8",
    })
    response.end(`<!doctype html>
      <html lang="zh-CN">
        <head><title>拾光屏幕时间端到端验收</title></head>
        <body><main><h1>屏幕时间测试页</h1><p>${request.url}</p></main></body>
      </html>`)
  })

  await new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject)
      resolve()
    })
  })
  const address = server.address()
  assert(
    address && typeof address === "object",
    "Usage fixture server did not expose a TCP address"
  )

  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((resolve, reject) =>
        server.close(error => (error ? reject(error) : resolve()))
      ),
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

const expectFocused = async (page, locator, label) => {
  const element = await locator.elementHandle()
  assert(element, `${label}: focus target not found`)
  try {
    await page.waitForFunction(
      target => document.activeElement === target,
      element,
      { timeout: 3_000 }
    )
  } catch (error) {
    const active = await page.evaluate(() =>
      document.activeElement?.outerHTML.slice(0, 240)
    )
    throw new Error(`${label}: active element ${active}`, { cause: error })
  } finally {
    await element.dispose()
  }
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
      dismissedMonthlyReport: `${now.getFullYear()}-${pad(now.getMonth() + 1)}`,
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
  const errors = []

  let userDataDir
  let usageFixture
  let context
  try {
    userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), tempProfilePrefix))
    usageFixture = await startUsageFixtureServer()
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
      await screenTimeDetails.evaluate(
        dialog => dialog.parentElement === document.body
      ),
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
      (await startpage
        .locator('button[aria-current="page"]')
        .getAttribute("aria-label")) === dialogPageBefore,
      "Arrow key inside a widget dialog changed the home page"
    )
    const detailBox = await screenTimeDetails
      .locator(":scope > *")
      .first()
      .boundingBox()
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
      (await startpage
        .locator('button[aria-current="page"]')
        .getAttribute("aria-label")) === dialogPageBefore,
      "Horizontal pointer movement inside a widget dialog changed the home page"
    )
    await screenTimeClose.click()

    const initialScreenTimeShell = startpage.locator(
      '[data-home-item-id="widget:screen-time"]'
    )
    assert(
      (await initialScreenTimeShell
        .locator('[data-home-widget-content="true"]')
        .evaluate(element => getComputedStyle(element).touchAction)) ===
        "pan-y",
      "Widget content blocks vertical touch scrolling in normal mode"
    )
    assert(
      (await initialScreenTimeShell.getByText(/^TOP \d$/).count()) === 0,
      "Empty screen-time widget still displayed a TOP ranking"
    )
    assert(
      (await initialScreenTimeShell
        .locator('[data-screen-time-trend="true"]')
        .count()) === 0,
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
    assert(
      floatingSearchBox && editHomeBox,
      "Narrow-screen controls are unavailable"
    )
    const controlsOverlap =
      floatingSearchBox.x < editHomeBox.x + editHomeBox.width &&
      floatingSearchBox.x + floatingSearchBox.width > editHomeBox.x &&
      floatingSearchBox.y < editHomeBox.y + editHomeBox.height &&
      floatingSearchBox.y + floatingSearchBox.height > editHomeBox.y
    assert(
      !controlsOverlap,
      `Floating search obscured the narrow-screen edit control: ${JSON.stringify({ floatingSearchBox, editHomeBox })}`
    )

    const screenTimePageIndex = await initialScreenTimeShell.evaluate(shell =>
      Number(
        shell
          .closest("[data-home-page-index]")
          ?.getAttribute("data-home-page-index") ?? 0
      )
    )
    await startpage
      .getByRole("button", {
        name: `转到第 ${screenTimePageIndex + 1} 页`,
      })
      .click()
    await startpage.waitForTimeout(280)

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
    try {
      await startpage
        .getByRole("button", { name: "完成", exact: true })
        .waitFor({ state: "visible", timeout: 2_000 })
    } catch (error) {
      const pointerDebug = await startpage.evaluate(
        ({ x, y }) => ({
          editing: document
            .querySelector("[data-home-editing]")
            ?.getAttribute("data-home-editing"),
          hit: document.elementFromPoint(x, y)?.outerHTML.slice(0, 240),
        }),
        {
          x: enableTrackingBox.x + enableTrackingBox.width / 2,
          y: enableTrackingBox.y + enableTrackingBox.height / 2,
        }
      )
      await startpage.mouse.up()
      throw new Error(
        `Long-pressing a widget action did not enter edit mode: ${JSON.stringify(pointerDebug)}`,
        { cause: error }
      )
    }
    await startpage.mouse.up()
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
    assert(
      swipeEnableTrackingBox,
      "Screen-time action disappeared after edit mode"
    )
    const swipeStartX =
      swipeEnableTrackingBox.x + swipeEnableTrackingBox.width / 2
    const swipeStartY =
      swipeEnableTrackingBox.y + swipeEnableTrackingBox.height / 2
    const actionSwipeTrack = startpage.locator('[data-home-page-track="true"]')
    const actionTrackBefore = await actionSwipeTrack.evaluate(
      track => new DOMMatrixReadOnly(getComputedStyle(track).transform).m41
    )
    await startpage.mouse.move(swipeStartX, swipeStartY)
    await startpage.mouse.down()
    await startpage.mouse.move(Math.max(4, swipeStartX - 180), swipeStartY, {
      steps: 6,
    })
    const actionTrackDuring = await actionSwipeTrack.evaluate(
      track => new DOMMatrixReadOnly(getComputedStyle(track).transform).m41
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
      `button[aria-current="page"][aria-label="转到第 ${screenTimePageIndex + 2} 页"]`,
      "widget-action page swipe"
    )
    assert(
      (await startpage.getByRole("dialog").count()) === 0,
      "Widget action fired after a horizontal page swipe"
    )
    await startpage
      .getByRole("button", {
        name: `转到第 ${screenTimePageIndex + 1} 页`,
      })
      .click()
    await startpage.setViewportSize(originalViewport)
    await startpage.waitForTimeout(280)

    const normalWidgetHeading = startpage.getByRole("heading", {
      name: "屏幕时间",
      exact: true,
    })
    const normalWidgetHeadingBox = await normalWidgetHeading.boundingBox()
    const normalWidgetTrack = startpage.locator('[data-home-page-track="true"]')
    const normalWidgetTrackBefore = await normalWidgetTrack.evaluate(
      track => new DOMMatrixReadOnly(getComputedStyle(track).transform).m41
    )
    assert(normalWidgetHeadingBox, "Normal-mode widget body is unavailable")
    const normalWidgetX =
      normalWidgetHeadingBox.x + normalWidgetHeadingBox.width / 2
    const normalWidgetY =
      normalWidgetHeadingBox.y + normalWidgetHeadingBox.height / 2
    await startpage.mouse.move(normalWidgetX, normalWidgetY)
    await startpage.mouse.down()
    await startpage.mouse.move(normalWidgetX - 180, normalWidgetY, { steps: 6 })
    const normalWidgetTrackDuring = await normalWidgetTrack.evaluate(
      track => new DOMMatrixReadOnly(getComputedStyle(track).transform).m41
    )
    assert(
      normalWidgetTrackBefore - normalWidgetTrackDuring >= 120 &&
        (await startpage.locator('[data-home-dragging="true"]').count()) === 0,
      "A normal-mode widget-body page swipe turned into widget dragging"
    )
    await startpage.mouse.up()
    await expectVisible(
      startpage,
      'button[aria-current="page"][aria-label="转到第 2 页"]',
      "normal-mode widget-body page swipe"
    )
    await startpage.getByRole("button", { name: "转到第 1 页" }).click()
    await startpage.waitForTimeout(280)

    const pageDots = startpage.getByRole("button", { name: /转到第 \d+ 页/ })
    assert((await pageDots.count()) >= 2, "Expected paginated home pages")
    await startpage.locator("body").click({ position: { x: 8, y: 320 } })
    await startpage.keyboard.type("blend")
    const homeSearch = startpage.getByRole("combobox", {
      name: "搜索",
      exact: true,
    })
    assert(
      (await homeSearch.inputValue()) === "blend",
      "Direct typing did not focus search"
    )
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
    // Results mount after the dialog's opening effect. Wait until the last
    // focusable result exists before testing a round trip through the trap.
    await paletteDialog
      .getByRole("button", { name: "删除链接 测试链接 59" })
      .waitFor({ state: "visible", timeout: 10_000 })
    await paletteInput.focus()
    await startpage.keyboard.press("Shift+Tab")
    assert(
      await paletteDialog.evaluate(dialog =>
        dialog.contains(document.activeElement)
      ),
      "Shift+Tab escaped the command palette"
    )
    await startpage.keyboard.press("Tab")
    await expectFocused(
      startpage,
      paletteInput,
      "Tab did not wrap command-palette focus back to the search input"
    )
    await startpage.keyboard.press("Escape")
    await paletteDialog.waitFor({ state: "hidden", timeout: 10_000 })
    await expectFocused(
      startpage,
      paletteTrigger,
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
    await expectFocused(
      startpage,
      pageDots.first(),
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
      await firstPageControl.evaluate(
        control => document.activeElement === control
      ),
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
      pageTrack.evaluate(
        track => new DOMMatrixReadOnly(getComputedStyle(track).transform).m41
      )
    const dragX = tileBox.x + tileBox.width / 2
    const dragY = tileBox.y + tileBox.height / 2
    const dragShell = dragTile.locator(
      "xpath=ancestor::*[@data-home-item-kind='app'][1]"
    )
    const beforeIconDragX = await readTrackX()
    await startpage.mouse.move(dragX, dragY)
    await startpage.mouse.down()
    await startpage.mouse.move(dragX + 18, dragY, { steps: 3 })
    await startpage.waitForTimeout(80)
    assert(
      (await dragShell.getAttribute("data-home-dragging")) === "true",
      "A direct mouse drag on an app was stolen by page swipe"
    )
    const duringIconDragX = await readTrackX()
    assert(
      Math.abs(duringIconDragX - beforeIconDragX) < 2,
      `Dragging an app also moved the page track (${beforeIconDragX} -> ${duringIconDragX})`
    )
    await startpage.mouse.move(pageBox.x + 8, dragY, { steps: 10 })
    await startpage.waitForTimeout(650)
    await expectVisible(
      startpage,
      'button[aria-current="page"][aria-label="转到第 1 页"]',
      "non-edit app drag edge page turn"
    )
    assert(
      (await dragShell.getAttribute("data-home-dragging")) === "true",
      "The held app drag ended while crossing into another page"
    )
    await startpage.keyboard.press("Escape")
    await startpage.mouse.up()
    await startpage.waitForTimeout(300)
    await expectVisible(
      startpage,
      'button[aria-current="page"][aria-label="转到第 2 页"]',
      "cancelled non-edit app drag rollback"
    )
    assert(
      startpage.url() === `chrome-extension://${extensionId}/index.html`,
      "Dragging an app icon accidentally opened the link"
    )
    await startpage.getByRole("button", { name: "完成", exact: true }).click()

    const secondPageBlank = await findBlankGridPoint(secondPageGrid)
    assert(secondPageBlank, "Second page has no blank swipe start point")
    const beforeSmallDragX = await readTrackX()
    await startpage.mouse.move(secondPageBlank.x, secondPageBlank.y)
    await startpage.mouse.down()
    await startpage.mouse.move(secondPageBlank.x + 18, secondPageBlank.y, {
      steps: 3,
    })
    const duringSmallDragX = await readTrackX()
    assert(
      duringSmallDragX - beforeSmallDragX >= 12,
      `Home page track did not follow a blank-space pointer drag (${beforeSmallDragX} -> ${duringSmallDragX})`
    )
    await startpage.mouse.up()
    await startpage.waitForTimeout(280)
    await expectVisible(
      startpage,
      'button[aria-current="page"][aria-label="转到第 2 页"]',
      "small blank-space drag snap-back"
    )

    const beforeFullDragX = await readTrackX()
    await startpage.mouse.move(secondPageBlank.x, secondPageBlank.y)
    await startpage.mouse.down()
    await startpage.mouse.move(
      secondPageBlank.x + Math.max(180, pageBox.width * 0.2),
      secondPageBlank.y,
      { steps: 6 }
    )
    const duringFullDragX = await readTrackX()
    assert(
      duringFullDragX - beforeFullDragX >= 150,
      `Home page track lagged behind a full pointer drag (${beforeFullDragX} -> ${duringFullDragX})`
    )
    await startpage.mouse.up()
    await expectVisible(
      startpage,
      'button[aria-current="page"][aria-label="转到第 1 页"]',
      "blank-space drag page navigation"
    )
    await startpage.waitForTimeout(280)

    const widgetSlotOverflows = await startpage
      .locator('[data-home-item-kind="widget"]')
      .evaluateAll(shells =>
        shells.flatMap(shell => {
          const heading = shell.querySelector("h3")
          const card =
            heading?.parentElement?.parentElement?.parentElement?.parentElement
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
          return overflow > 1.5
            ? [`${heading?.textContent ?? "widget"}: ${overflow}px`]
            : []
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
    const widgetOrderBefore = await startpage.evaluate(
      () =>
        JSON.parse(localStorage.getItem("fluidity.homeLayout.v2") ?? "{}").order
    )
    await startpage.evaluate(() => {
      window.__fluidityWidgetDragProbe = document.querySelector(
        '[data-home-item-id="widget:screen-time"]'
      )
    })
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
    const rediscoveryCenterX = rediscoveryBox.x + rediscoveryBox.width / 2
    const rediscoveryCenterY = rediscoveryBox.y + rediscoveryBox.height / 2
    await startpage.mouse.move(rediscoveryCenterX - 4, rediscoveryCenterY, {
      steps: 10,
    })
    await startpage.waitForTimeout(80)
    const widgetDropPositionBeforeCrossing =
      await rediscoveryShell.getAttribute("data-home-drop-position")
    assert(
      widgetDropPositionBeforeCrossing === "before",
      `Long-pressed widget exposed ${widgetDropPositionBeforeCrossing ?? "no"} marker immediately before the target midpoint`
    )
    await startpage.mouse.move(rediscoveryCenterX + 4, rediscoveryCenterY)
    await startpage.waitForFunction(
      ({ originalX, originalY }) => {
        const target = document.querySelector(
          '[data-home-item-id="widget:rediscovery"]'
        )
        if (!(target instanceof HTMLElement)) return false
        const rect = target.getBoundingClientRect()
        return Math.hypot(rect.x - originalX, rect.y - originalY) > 20
      },
      { originalX: rediscoveryBox.x, originalY: rediscoveryBox.y },
      { timeout: 1_000 }
    )
    const screenTimeBoxMoving = await startpage
      .locator('[data-home-drag-overlay-id="widget:screen-time"]')
      .boundingBox()
    const rediscoveryBoxReflowed = await rediscoveryShell.boundingBox()
    const widgetTreeStayedMounted = await startpage.evaluate(
      () =>
        window.__fluidityWidgetDragProbe ===
        document.querySelector('[data-home-item-id="widget:screen-time"]')
    )
    assert(
      screenTimeBoxMoving &&
        Math.hypot(
          screenTimeBoxMoving.x - screenTimeBoxBefore.x,
          screenTimeBoxMoving.y - screenTimeBoxBefore.y
        ) > 40,
      "The full widget card did not follow the drag pointer"
    )
    assert(
      (await startpage
        .locator('[data-home-drag-overlay="true"] img')
        .count()) === 0,
      "Widget drag overlay cloned a network-backed image"
    )
    assert(
      rediscoveryBoxReflowed &&
        Math.hypot(
          rediscoveryBoxReflowed.x - rediscoveryBox.x,
          rediscoveryBoxReflowed.y - rediscoveryBox.y
        ) > 20 &&
        widgetTreeStayedMounted &&
        (await screenTimeShell.evaluate(element =>
          Number.parseFloat(getComputedStyle(element).opacity)
        )) === 0,
      "Widget neighbors did not move aside while preserving the real component tree"
    )
    const widgetDropPosition = await rediscoveryShell.getAttribute(
      "data-home-drop-position"
    )
    assert(
      widgetDropPosition === "after",
      `Long-pressed widget exposed ${widgetDropPosition ?? "no"} marker after crossing the target midpoint by 8px`
    )
    await startpage.mouse.up()
    await startpage.waitForTimeout(240)
    const widgetOrderAfter = await startpage.evaluate(
      () =>
        JSON.parse(localStorage.getItem("fluidity.homeLayout.v2") ?? "{}").order
    )
    assert(
      JSON.stringify(widgetOrderAfter) !== JSON.stringify(widgetOrderBefore),
      `Long-pressed widget did not persist its ${widgetDropPosition} position`
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

    const activeGrid = () =>
      startpage.locator('[data-home-page-grid="true"][aria-hidden="false"]')
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
    await startpage
      .getByRole("button", { name: "完成", exact: true })
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

    const liveReorderApps = activeGrid().locator('[data-home-item-kind="app"]')
    assert(
      (await liveReorderApps.count()) >= 2,
      "First page has too few apps for live reorder feedback"
    )
    const liveReorderSource = liveReorderApps.first()
    const liveReorderTarget = liveReorderApps.nth(1)
    const liveReorderTile = liveReorderSource.locator(
      '[data-home-app-tile="true"]'
    )
    const liveReorderTileBox = await liveReorderTile.boundingBox()
    const liveReorderTargetBefore = await liveReorderTarget.boundingBox()
    const liveReorderPersistedBefore = await startpage.evaluate(
      () =>
        JSON.parse(localStorage.getItem("fluidity.homeLayout.v2") ?? "{}").order
    )
    assert(
      liveReorderTileBox && liveReorderTargetBefore,
      "Live reorder source or target has no bounding box"
    )
    await startpage.mouse.move(
      liveReorderTileBox.x + liveReorderTileBox.width / 2,
      liveReorderTileBox.y + liveReorderTileBox.height / 2
    )
    await startpage.mouse.down()
    await startpage.mouse.move(
      liveReorderTileBox.x + liveReorderTileBox.width / 2 + 8,
      liveReorderTileBox.y + liveReorderTileBox.height / 2,
      { steps: 2 }
    )
    const liveReorderTargetPoint = {
      x: liveReorderTargetBefore.x + liveReorderTargetBefore.width * 0.75,
      y: liveReorderTargetBefore.y + liveReorderTargetBefore.height / 2,
    }
    await startpage.mouse.move(
      liveReorderTargetPoint.x,
      liveReorderTargetPoint.y,
      { steps: 8 }
    )
    await startpage.waitForTimeout(280)
    const liveReorderTargetDuring = await liveReorderTarget.boundingBox()
    assert(
      liveReorderTargetDuring &&
        Math.hypot(
          liveReorderTargetDuring.x - liveReorderTargetBefore.x,
          liveReorderTargetDuring.y - liveReorderTargetBefore.y
        ) > 20 &&
        (await liveReorderTarget.getAttribute("data-home-preview-order")) !==
          null,
      "Adjacent app did not move aside while the pointer was still held"
    )
    const liveReorderPersistedDuring = await startpage.evaluate(
      () =>
        JSON.parse(localStorage.getItem("fluidity.homeLayout.v2") ?? "{}").order
    )
    assert(
      JSON.stringify(liveReorderPersistedDuring) ===
        JSON.stringify(liveReorderPersistedBefore),
      "Live reorder preview persisted before the drag ended"
    )
    await startpage.keyboard.press("Escape")
    await startpage.mouse.up()
    await startpage.waitForTimeout(260)
    const liveReorderTargetAfter = await liveReorderTarget.boundingBox()
    const liveReorderPersistedAfter = await startpage.evaluate(
      () =>
        JSON.parse(localStorage.getItem("fluidity.homeLayout.v2") ?? "{}").order
    )
    assert(
      liveReorderTargetAfter &&
        Math.hypot(
          liveReorderTargetAfter.x - liveReorderTargetBefore.x,
          liveReorderTargetAfter.y - liveReorderTargetBefore.y
        ) < 2 &&
        JSON.stringify(liveReorderPersistedAfter) ===
          JSON.stringify(liveReorderPersistedBefore),
      "Cancelling the live reorder preview did not restore the layout"
    )

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
    const widgetDropBoxDuring = await widgetDropShell.boundingBox()
    assert(
      widgetDropBoxDuring,
      "Widget drop target moved out of the active grid"
    )
    await startpage.mouse.move(
      widgetDropBoxDuring.x + 14,
      widgetDropBoxDuring.y + widgetDropBoxDuring.height / 2,
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
            return {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
            }
          })(),
          pointerElement: document
            .elementFromPoint(x, y)
            ?.outerHTML.slice(0, 180),
          dropTargets: Array.from(
            document.querySelectorAll('[data-home-drop-target="true"]')
          ).map(item => item.getAttribute("data-home-item-id")),
        }),
        {
          x: widgetDropBoxDuring.x + 14,
          y: widgetDropBoxDuring.y + widgetDropBoxDuring.height / 2,
          expectedId: await widgetDropShell.getAttribute("data-home-item-id"),
        }
      )
      throw new Error(
        `Widget did not become a drop target when the pointer entered its edge: ${JSON.stringify(dropDebug)}`
      )
    }
    await startpage.mouse.up()
    await startpage.waitForTimeout(240)

    const cancelledEdgeOrderBefore = await startpage.evaluate(
      () =>
        JSON.parse(localStorage.getItem("fluidity.homeLayout.v2") ?? "{}").order
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
    const cancelledBlankPoint = await findBlankGridPoint(activeGrid())
    assert(
      cancelledBlankPoint,
      "Cross-page cancel destination has no blank grid point"
    )
    await startpage.mouse.move(cancelledBlankPoint.x, cancelledBlankPoint.y, {
      steps: 8,
    })
    await startpage.waitForTimeout(120)
    assert(
      (await startpage.locator("[data-home-drop-position]").count()) === 0,
      "Blank cross-page destination still exposed an item drop marker"
    )
    await startpage.mouse.up()
    await startpage.waitForTimeout(300)
    await expectVisible(
      startpage,
      'button[aria-current="page"][aria-label="转到第 1 页"]',
      "cross-page drag cancel rollback"
    )
    const cancelledEdgeOrderAfter = await startpage.evaluate(
      () =>
        JSON.parse(localStorage.getItem("fluidity.homeLayout.v2") ?? "{}").order
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
    const successfulEdgeOrderBefore = await startpage.evaluate(
      () =>
        JSON.parse(localStorage.getItem("fluidity.homeLayout.v2") ?? "{}").order
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
        Math.max(pageViewportBox.y + 24, edgeDragBox.y + edgeDragBox.height / 2)
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
    const crossPageBaseSlot = activeGrid().locator(
      '[data-home-preview-slot-active="true"]'
    )
    const crossPageBaseSlotBox = await crossPageBaseSlot.boundingBox()
    assert(crossPageBaseSlotBox, "Cross-page base destination slot is missing")
    await startpage.mouse.move(
      crossPageBaseSlotBox.x + crossPageBaseSlotBox.width / 2,
      crossPageBaseSlotBox.y + crossPageBaseSlotBox.height / 2,
      { steps: 8 }
    )
    await startpage.waitForTimeout(120)
    assert(
      (await startpage.locator("[data-home-drop-position]").count()) === 0,
      "Cross-page base slot incorrectly required another target"
    )
    const crossPageOrderDuring = await startpage.evaluate(
      () =>
        JSON.parse(localStorage.getItem("fluidity.homeLayout.v2") ?? "{}").order
    )
    assert(
      JSON.stringify(crossPageOrderDuring) ===
        JSON.stringify(successfulEdgeOrderBefore),
      "Cross-page hover persisted before mouseup"
    )
    await startpage.mouse.up()
    await startpage.waitForTimeout(240)
    const crossPagePersistedOrder = await startpage.evaluate(
      () =>
        JSON.parse(localStorage.getItem("fluidity.homeLayout.v2") ?? "{}").order
    )
    assertPermutation(
      successfulEdgeOrderBefore,
      crossPagePersistedOrder,
      "Cross-page base-slot drop"
    )
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
    const moveBackButton = edgeDragShellById.getByRole("button", {
      name: "移至上一页",
      exact: true,
    })
    await moveBackButton.focus()
    await startpage.keyboard.press("Enter")
    await expectVisible(
      startpage,
      'button[aria-current="page"][aria-label="转到第 1 页"]',
      "keyboard move-back destination"
    )
    const movedItemFocus = await startpage.evaluate(itemId => {
      const active = document.activeElement
      return {
        itemId:
          active instanceof HTMLElement
            ? active
                .closest("[data-home-item-id]")
                ?.getAttribute("data-home-item-id")
            : null,
        label:
          active instanceof HTMLElement
            ? active.getAttribute("aria-label")
            : null,
      }
    }, edgeDragId)
    assert(
      movedItemFocus.itemId === edgeDragId &&
        !movedItemFocus.label?.startsWith("删除") &&
        movedItemFocus.label !== "移除小组件",
      `Keyboard page move restored focus to an unsafe control: ${JSON.stringify(movedItemFocus)}`
    )
    await pageDots.first().click()
    await expectVisible(
      startpage,
      'button[aria-current="page"][aria-label="转到第 1 页"]',
      "return after cross-page app drag"
    )

    const exactCrossPageSource = edgeDragShellById.locator(
      '[data-home-app-tile="true"]'
    )
    const exactCrossPageSourceBox = await exactCrossPageSource.boundingBox()
    const exactCrossPageOrderBefore = await startpage.evaluate(
      () =>
        JSON.parse(localStorage.getItem("fluidity.homeLayout.v2") ?? "{}").order
    )
    assert(exactCrossPageSourceBox, "Exact cross-page source is unavailable")
    await startpage.mouse.move(
      exactCrossPageSourceBox.x + exactCrossPageSourceBox.width / 2,
      exactCrossPageSourceBox.y + exactCrossPageSourceBox.height / 2
    )
    await startpage.mouse.down()
    await startpage.mouse.move(
      exactCrossPageSourceBox.x + exactCrossPageSourceBox.width / 2 + 8,
      exactCrossPageSourceBox.y + exactCrossPageSourceBox.height / 2,
      { steps: 2 }
    )
    await startpage.waitForTimeout(60)
    await startpage.mouse.move(
      pageViewportBox.x + pageViewportBox.width - 8,
      Math.min(
        pageViewportBox.y + pageViewportBox.height - 24,
        Math.max(
          pageViewportBox.y + 24,
          exactCrossPageSourceBox.y + exactCrossPageSourceBox.height / 2
        )
      ),
      { steps: 10 }
    )
    await startpage.waitForTimeout(650)
    await expectVisible(
      startpage,
      'button[aria-current="page"][aria-label="转到第 2 页"]',
      "exact-target cross-page turn"
    )
    const exactCrossPageTarget = activeGrid()
      .locator('[data-home-app-tile="true"]')
      .last()
    const exactCrossPageTargetShell = exactCrossPageTarget.locator(
      "xpath=ancestor::*[@data-home-item-kind='app'][1]"
    )
    const exactCrossPageTargetId =
      await exactCrossPageTargetShell.getAttribute("data-home-item-id")
    const exactCrossPageTargetBox = await exactCrossPageTarget.boundingBox()
    assert(
      exactCrossPageTargetId && exactCrossPageTargetBox,
      "Exact cross-page target is unavailable"
    )
    await startpage.mouse.move(
      exactCrossPageTargetBox.x + exactCrossPageTargetBox.width * 0.75,
      exactCrossPageTargetBox.y + exactCrossPageTargetBox.height / 2,
      { steps: 8 }
    )
    await startpage.waitForTimeout(320)
    assert(
      (await exactCrossPageTargetShell.getAttribute(
        "data-home-drop-position"
      )) === "after",
      "Exact cross-page target did not expose an after marker"
    )
    assert(
      JSON.stringify(
        await startpage.evaluate(
          () =>
            JSON.parse(localStorage.getItem("fluidity.homeLayout.v2") ?? "{}")
              .order
        )
      ) === JSON.stringify(exactCrossPageOrderBefore),
      "Exact cross-page target persisted before mouseup"
    )
    await startpage.mouse.up()
    await startpage.waitForTimeout(240)
    const exactCrossPageOrderAfter = await startpage.evaluate(
      () =>
        JSON.parse(localStorage.getItem("fluidity.homeLayout.v2") ?? "{}").order
    )
    assertPermutation(
      exactCrossPageOrderBefore,
      exactCrossPageOrderAfter,
      "Exact cross-page target drop"
    )
    assert(
      exactCrossPageOrderAfter.indexOf(edgeDragId) ===
        exactCrossPageOrderAfter.indexOf(exactCrossPageTargetId) + 1,
      "Exact cross-page source was not persisted after its marked target"
    )
    const exactMoveBackButton = edgeDragShellById.getByRole("button", {
      name: "移至上一页",
      exact: true,
    })
    await exactMoveBackButton.focus()
    await startpage.keyboard.press("Enter")
    await expectVisible(
      startpage,
      'button[aria-current="page"][aria-label="转到第 1 页"]',
      "return after exact cross-page target drop"
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
    assert(keptInStorage, "Rediscovery hide unexpectedly deleted the bookmark")
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
        editing: document
          .querySelector("[data-home-editing]")
          ?.getAttribute("data-home-editing"),
        dialogs: Array.from(document.querySelectorAll('[role="dialog"]')).map(
          element => element.getAttribute("aria-label")
        ),
        toolbar: document.body.innerText.includes("组件\n总览\n完成"),
      }))
      throw new Error(`Widget gallery did not open: ${JSON.stringify(state)}`)
    }
    await gallery.waitFor({ state: "visible", timeout: 10_000 })
    const componentButtonBox = await componentButton.boundingBox()
    assert(componentButtonBox, "Edit toolbar button has no bounding box")
    const modalLayerState = await startpage.evaluate(
      ({ x, y }) => {
        const overlay = Array.from(
          document.querySelectorAll('[data-fluidity-modal="true"]')
        ).find(element => element.getAttribute("role") !== "dialog")
        return {
          overlayZIndex: overlay
            ? Number.parseInt(getComputedStyle(overlay).zIndex, 10)
            : 0,
          toolbarHit: Boolean(
            document.elementFromPoint(x, y)?.closest("[data-home-edit-control]")
          ),
        }
      },
      {
        x: componentButtonBox.x + componentButtonBox.width / 2,
        y: componentButtonBox.y + componentButtonBox.height / 2,
      }
    )
    assert(
      modalLayerState.overlayZIndex > 1002 &&
        modalLayerState.overlayZIndex < 9998 &&
        !modalLayerState.toolbarHit,
      `Modal did not cover ordinary fixed UI: ${JSON.stringify(modalLayerState)}`
    )
    await gallery
      .getByText("稍后读", { exact: true })
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
    await readLaterSettings.waitFor({ state: "hidden", timeout: 10_000 })
    await startpage
      .getByText("稍后读", { exact: true })
      .first()
      .waitFor({ state: "visible", timeout: 10_000 })
    const addedWidget = await startpage.evaluate(() => {
      const layout = JSON.parse(
        localStorage.getItem("fluidity.homeLayout.v2") ?? "{}"
      )
      return Object.values(layout.widgets ?? {}).find(
        widget => widget.type === "read-later"
      )
    })
    assert(
      addedWidget?.size === "wide",
      "Widget gallery/settings did not persist semantic size"
    )
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
    await expectTextVisible(
      startpage,
      "浏览时长统计",
      "Usage tracking settings"
    )
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

    const localOrderFixture = await startpage.evaluate(() => {
      const layout = JSON.parse(
        localStorage.getItem("fluidity.homeLayout.v2") ?? "{}"
      )
      const appIds = (layout.order ?? []).filter(id => id.startsWith("app:"))
      if (appIds.length < 2) return null
      const promotedId = appIds[appIds.length - 1]
      const promotedUrl = promotedId.slice("app:".length)
      const now = Date.now()
      localStorage.setItem(
        "link-analytics",
        JSON.stringify({
          [promotedUrl]: {
            label: "本地频率排序目标",
            url: promotedUrl,
            group: "端到端测试",
            clicks: 50,
            lastClicked: now,
            clickHistory: [now, now - 1000, now - 2000],
          },
        })
      )
      return {
        order: layout.order,
        promotedId,
        nonAppOrder: layout.order.filter(id => !id.startsWith("app:")),
      }
    })
    assert(localOrderFixture, "Local frequency ordering fixture is unavailable")
    await settingsDialog
      .getByRole("button", { name: "链接", exact: true })
      .click()
    await settingsDialog
      .getByRole("button", { name: "AI 整理与排序", exact: true })
      .click()
    await startpage
      .getByRole("button", { name: "本地按频率排序", exact: true })
      .click()
    await expectVisible(
      startpage,
      '[data-ai-organize-preview="true"]',
      "local home order draft preview"
    )
    assert(
      JSON.stringify(
        await startpage.evaluate(
          () =>
            JSON.parse(localStorage.getItem("fluidity.homeLayout.v2") ?? "{}")
              .order
        )
      ) === JSON.stringify(localOrderFixture.order),
      "Local order preview wrote the layout before confirmation"
    )
    await startpage
      .getByRole("button", { name: "暂存到设置", exact: true })
      .click()
    assert(
      JSON.stringify(
        await startpage.evaluate(
          () =>
            JSON.parse(localStorage.getItem("fluidity.homeLayout.v2") ?? "{}")
              .order
        )
      ) === JSON.stringify(localOrderFixture.order),
      "Accepted order draft wrote the layout before Apply"
    )
    await settingsDialog
      .getByRole("button", { name: "应用更改", exact: true })
      .click()
    await startpage.waitForTimeout(240)
    const appliedLocalOrder = await startpage.evaluate(
      () =>
        JSON.parse(localStorage.getItem("fluidity.homeLayout.v2") ?? "{}").order
    )
    assert(
      appliedLocalOrder.find(id => id.startsWith("app:")) ===
        localOrderFixture.promotedId &&
        JSON.stringify(
          appliedLocalOrder.filter(id => !id.startsWith("app:"))
        ) === JSON.stringify(localOrderFixture.nonAppOrder),
      "Applying the local order draft did not promote usage or preserve widgets"
    )

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

    const touchOrderBefore = await retentionPage.evaluate(
      () =>
        JSON.parse(localStorage.getItem("fluidity.homeLayout.v2") ?? "{}").order
    )
    const touchExpectedItemIds = await retentionPage.evaluate(() => {
      const groups = JSON.parse(localStorage.getItem("link-groups") ?? "[]")
      const layout = JSON.parse(
        localStorage.getItem("fluidity.homeLayout.v2") ?? "{}"
      )
      const appIds = groups.flatMap(group =>
        (group.links ?? []).map(link => `app:${link.value}`)
      )
      return Array.from(
        new Set([...Object.keys(layout.widgets ?? {}), ...appIds])
      )
    })
    const touchViewport = await retentionPage
      .getByRole("region", { name: "主页分页区域" })
      .boundingBox()
    const touchApps = retentionPage.locator(
      '[data-home-page-grid="true"][aria-hidden="false"] [data-home-app-tile="true"]'
    )
    const touchSource = touchApps.first()
    const touchNeighbor = touchApps.nth(1)
    const touchSourceShell = touchSource.locator(
      "xpath=ancestor::*[@data-home-item-id][1]"
    )
    const touchNeighborShell = touchNeighbor.locator(
      "xpath=ancestor::*[@data-home-item-id][1]"
    )
    const touchSourceBox = await touchSource.boundingBox()
    const touchSourceShellBox = await touchSourceShell.boundingBox()
    const touchNeighborBoxBefore = await touchNeighbor.boundingBox()
    const touchSourceId =
      await touchSourceShell.getAttribute("data-home-item-id")
    const touchNeighborId =
      await touchNeighborShell.getAttribute("data-home-item-id")
    assert(
      touchViewport &&
        touchSourceBox &&
        touchSourceShellBox &&
        touchNeighborBoxBefore &&
        touchSourceId &&
        touchNeighborId,
      "Touch drag source, neighbor, or viewport is unavailable"
    )
    const touchSession = await retentionPage
      .context()
      .newCDPSession(retentionPage)
    const touchStart = {
      x: touchSourceBox.x + touchSourceBox.width / 2,
      y: touchSourceBox.y + touchSourceBox.height / 2,
    }
    const dispatchTouch = (type, point) =>
      touchSession.send("Input.dispatchTouchEvent", {
        type,
        touchPoints: point
          ? [
              {
                x: point.x,
                y: point.y,
                id: 1,
                radiusX: 1,
                radiusY: 1,
                force: 1,
              },
            ]
          : [],
      })

    await dispatchTouch("touchStart", touchStart)
    await retentionPage.waitForFunction(
      itemId =>
        document
          .querySelector(`[data-home-item-id="${CSS.escape(itemId)}"]`)
          ?.getAttribute("data-home-dragging") === "true",
      touchSourceId,
      { timeout: 2_000 }
    )
    const touchNeighborPoint = {
      x: touchNeighborBoxBefore.x + touchNeighborBoxBefore.width / 2,
      y: touchNeighborBoxBefore.y + touchNeighborBoxBefore.height / 2,
    }
    for (let step = 1; step <= 5; step += 1) {
      await dispatchTouch("touchMove", {
        x: touchStart.x + ((touchNeighborPoint.x - touchStart.x) * step) / 5,
        y: touchStart.y + ((touchNeighborPoint.y - touchStart.y) * step) / 5,
      })
      await retentionPage.waitForTimeout(24)
    }
    assert(
      (await touchSourceShell.getAttribute("data-home-dragging")) === "true",
      "A real long-press touch gesture did not activate app dragging"
    )
    const touchOverlayAtNeighbor = await retentionPage
      .locator('[data-home-drag-overlay="true"]')
      .boundingBox()
    const expectedTouchOverlayOffset = {
      x: touchSourceShellBox.x + touchSourceShellBox.width / 2 - touchStart.x,
      y: touchSourceShellBox.y + touchSourceShellBox.height / 2 - touchStart.y,
    }
    assert(
      touchOverlayAtNeighbor &&
        Math.abs(
          touchOverlayAtNeighbor.x +
            touchOverlayAtNeighbor.width / 2 -
            (touchNeighborPoint.x + expectedTouchOverlayOffset.x)
        ) < 10 &&
        Math.abs(
          touchOverlayAtNeighbor.y +
            touchOverlayAtNeighbor.height / 2 -
            (touchNeighborPoint.y + expectedTouchOverlayOffset.y)
        ) < 10,
      "The dragged app did not follow the real touch point"
    )
    const touchNeighborBoxDuring = await touchNeighbor.boundingBox()
    const touchNeighborPreviewOrderRaw = await touchNeighborShell.getAttribute(
      "data-home-preview-order"
    )
    const touchNeighborPreviewOrder =
      touchNeighborPreviewOrderRaw === null
        ? null
        : Number(touchNeighborPreviewOrderRaw)
    const touchNeighborOriginalOrder = touchOrderBefore.indexOf(touchNeighborId)
    assert(
      (touchNeighborBoxDuring &&
        (Math.abs(touchNeighborBoxDuring.x - touchNeighborBoxBefore.x) > 4 ||
          Math.abs(touchNeighborBoxDuring.y - touchNeighborBoxBefore.y) > 4)) ||
        (touchNeighborPreviewOrder !== null &&
          touchNeighborPreviewOrder !== touchNeighborOriginalOrder),
      "Touch reordering did not displace the neighboring app"
    )
    await dispatchTouch("touchCancel")
    await retentionPage.waitForTimeout(350)
    await expectVisible(
      retentionPage,
      'button[aria-current="page"][aria-label="转到第 1 页"]',
      "cancelled real-touch drag rollback"
    )
    const touchOrderAfter = await retentionPage.evaluate(
      () =>
        JSON.parse(localStorage.getItem("fluidity.homeLayout.v2") ?? "{}").order
    )
    assert(
      JSON.stringify(touchOrderAfter) === JSON.stringify(touchOrderBefore) &&
        (await retentionPage.locator('[data-home-dragging="true"]').count()) ===
          0 &&
        (await retentionPage
          .locator('[data-home-drag-overlay="true"]')
          .count()) === 0,
      "Cancelling a real touch drag did not fully restore the home layout"
    )

    const touchCancelDoneButton = retentionPage.getByRole("button", {
      name: "完成",
      exact: true,
    })
    if (await touchCancelDoneButton.isVisible()) {
      await touchCancelDoneButton.click()
      await retentionPage
        .getByRole("button", { name: "编辑主页" })
        .waitFor({ state: "visible", timeout: 2_000 })
    }
    await retentionPage.waitForTimeout(120)
    const touchCommitSourceBox = await touchSource.boundingBox()
    const touchCommitNeighborBox = await touchNeighbor.boundingBox()
    assert(
      touchCommitSourceBox && touchCommitNeighborBox,
      "Touch commit source or target is unavailable after cancellation"
    )
    const touchCommitStart = {
      x: touchCommitSourceBox.x + touchCommitSourceBox.width / 2,
      y: touchCommitSourceBox.y + touchCommitSourceBox.height / 2,
    }
    await dispatchTouch("touchStart", touchCommitStart)
    await retentionPage.waitForFunction(
      itemId =>
        document
          .querySelector(`[data-home-item-id="${CSS.escape(itemId)}"]`)
          ?.getAttribute("data-home-dragging") === "true",
      touchSourceId,
      { timeout: 2_000 }
    )
    const touchCommitTarget = {
      x: touchCommitNeighborBox.x + touchCommitNeighborBox.width * 0.75,
      y: touchCommitNeighborBox.y + touchCommitNeighborBox.height / 2,
    }
    for (let step = 1; step <= 5; step += 1) {
      await dispatchTouch("touchMove", {
        x:
          touchCommitStart.x +
          ((touchCommitTarget.x - touchCommitStart.x) * step) / 5,
        y:
          touchCommitStart.y +
          ((touchCommitTarget.y - touchCommitStart.y) * step) / 5,
      })
      await retentionPage.waitForTimeout(24)
    }
    await dispatchTouch("touchEnd")
    await retentionPage.waitForTimeout(350)
    const touchCommittedOrder = await retentionPage.evaluate(
      () =>
        JSON.parse(localStorage.getItem("fluidity.homeLayout.v2") ?? "{}").order
    )
    assertPermutation(
      touchExpectedItemIds,
      touchCommittedOrder,
      "Real touch drop"
    )
    assert(
      touchCommittedOrder.indexOf(touchSourceId) ===
        touchCommittedOrder.indexOf(touchNeighborId) + 1 &&
        (await retentionPage.locator('[data-home-dragging="true"]').count()) ===
          0 &&
        (await retentionPage
          .locator('[data-home-drag-overlay="true"]')
          .count()) === 0,
      "Ending a real touch drag did not persist exactly one reordered layout"
    )
    await touchSession.detach()

    const retentionDoneButton = retentionPage.getByRole("button", {
      name: "完成",
      exact: true,
    })
    if (!(await retentionDoneButton.isVisible())) {
      await retentionPage
        .getByRole("button", { name: "编辑主页" })
        .evaluate(button => button.click())
    }
    await retentionDoneButton.waitFor({ state: "visible", timeout: 10_000 })

    const multiPageOrderBefore = await retentionPage.evaluate(
      () =>
        JSON.parse(localStorage.getItem("fluidity.homeLayout.v2") ?? "{}").order
    )
    const multiPageViewport = await retentionPage
      .getByRole("region", { name: "主页分页区域" })
      .boundingBox()
    const multiPageSources = retentionPage.locator(
      '[data-home-page-grid="true"][aria-hidden="false"] [data-home-app-tile="true"]'
    )
    const multiPageSource = multiPageSources.nth(
      Math.floor((await multiPageSources.count()) / 2)
    )
    const multiPageSourceBox = await multiPageSource.boundingBox()
    const multiPageSourceId = await multiPageSource
      .locator("xpath=ancestor::*[@data-home-item-id][1]")
      .getAttribute("data-home-item-id")
    assert(
      multiPageViewport && multiPageSourceBox && multiPageSourceId,
      "Multi-page drag source or viewport is unavailable"
    )
    await retentionPage.evaluate(itemId => {
      window.__fluidityMultiPageDragProbe = document.querySelector(
        `[data-home-item-id="${CSS.escape(itemId)}"]`
      )
    }, multiPageSourceId)
    const multiPageStartX = multiPageSourceBox.x + multiPageSourceBox.width / 2
    const multiPageY = multiPageSourceBox.y + multiPageSourceBox.height / 2
    await retentionPage.mouse.move(multiPageStartX, multiPageY)
    await retentionPage.mouse.down()
    await retentionPage.mouse.move(multiPageStartX + 8, multiPageY, {
      steps: 2,
    })
    await retentionPage.waitForTimeout(80)
    assert(
      (await retentionPage.locator('[data-home-dragging="true"]').count()) ===
        1,
      "Multi-page drag did not activate"
    )
    const rightEdge = multiPageViewport.x + multiPageViewport.width - 8
    await retentionPage.mouse.move(rightEdge, multiPageY, { steps: 10 })
    try {
      await retentionPage.waitForFunction(
        () => {
          const label = document
            .querySelector('button[aria-current="page"]')
            ?.getAttribute("aria-label")
          return Number(label?.match(/\d+/)?.[0] ?? 0) >= 3
        },
        undefined,
        { timeout: 10_000 }
      )
    } catch (error) {
      const edgeDebug = await retentionPage.evaluate(
        ({ x, y }) => {
          const viewport = document
            .querySelector('[aria-label="主页分页区域"]')
            ?.getBoundingClientRect()
          return {
            pointer: { x, y },
            viewport: viewport
              ? {
                  left: viewport.left,
                  right: viewport.right,
                  top: viewport.top,
                  bottom: viewport.bottom,
                }
              : null,
            page: document
              .querySelector('button[aria-current="page"]')
              ?.getAttribute("aria-label"),
            dragging: document.querySelectorAll('[data-home-dragging="true"]')
              .length,
            overlay: document.querySelectorAll(
              '[data-home-drag-overlay="true"]'
            ).length,
          }
        },
        { x: rightEdge, y: multiPageY }
      )
      throw new Error(
        `Continuous edge paging stopped early: ${JSON.stringify(edgeDebug)}`,
        { cause: error }
      )
    }
    const multiPageOverlayAtRight = await retentionPage
      .locator('[data-home-drag-overlay="true"]')
      .boundingBox()
    assert(
      multiPageOverlayAtRight &&
        Math.abs(
          multiPageOverlayAtRight.x +
            multiPageOverlayAtRight.width / 2 -
            rightEdge
        ) < 3,
      "Dragged icon stopped following the pointer after multiple page turns"
    )
    assert(
      (await retentionPage
        .locator('[data-home-drag-overlay="true"] img')
        .count()) === 0,
      "App drag overlay recreated a favicon image"
    )
    assert(
      await retentionPage.evaluate(
        itemId =>
          window.__fluidityMultiPageDragProbe ===
          document.querySelector(`[data-home-item-id="${CSS.escape(itemId)}"]`),
        multiPageSourceId
      ),
      "Cross-page preview remounted the real icon"
    )
    const multiPageOrderDuring = await retentionPage.evaluate(
      () =>
        JSON.parse(localStorage.getItem("fluidity.homeLayout.v2") ?? "{}").order
    )
    assert(
      JSON.stringify(multiPageOrderDuring) ===
        JSON.stringify(multiPageOrderBefore),
      "Edge preview persisted before the drag was released"
    )

    const pageBeforeVerticalExit = await retentionPage
      .locator('button[aria-current="page"]')
      .getAttribute("aria-label")
    await retentionPage.mouse.move(rightEdge, multiPageViewport.y - 12, {
      steps: 4,
    })
    await retentionPage.waitForTimeout(900)
    assert(
      (await retentionPage
        .locator('button[aria-current="page"]')
        .getAttribute("aria-label")) === pageBeforeVerticalExit,
      "Edge paging continued after the pointer left the viewport vertically"
    )

    const leftEdge = multiPageViewport.x + 8
    await retentionPage.mouse.move(leftEdge, multiPageY, { steps: 10 })
    await expectVisible(
      retentionPage,
      'button[aria-current="page"][aria-label="转到第 1 页"]',
      "direct reverse edge dwell to first page"
    )
    await retentionPage.keyboard.press("Escape")
    await retentionPage.mouse.up()
    await retentionPage.waitForTimeout(300)
    const multiPageOrderAfter = await retentionPage.evaluate(
      () =>
        JSON.parse(localStorage.getItem("fluidity.homeLayout.v2") ?? "{}").order
    )
    assert(
      JSON.stringify(multiPageOrderAfter) ===
        JSON.stringify(multiPageOrderBefore),
      "Cancelling a multi-page drag changed the persisted order"
    )
    assert(
      (await retentionPage.locator('[data-home-dragging="true"]').count()) ===
        0 &&
        (await retentionPage
          .locator('[data-home-drag-overlay="true"]')
          .count()) === 0,
      "Multi-page drag left a dragging node or overlay behind"
    )
    await retentionPage.close()

    // The home suite exercises the complete drag/paging/settings paths without
    // requiring a browser-owned optional-permission prompt to be accepted.
    if (homeOnly) {
      assert(errors.length === 0, errors.join("\n"))
      console.log(
        JSON.stringify(
          {
            ok: true,
            scope: "home",
            browser: browserPath,
            extensionId,
            checked: coreChecks,
          },
          null,
          2
        )
      )
      return
    }

    const usageBrowserPage = await context.newPage()
    watchPageErrors(usageBrowserPage, "screen-time-page", errors)
    await usageBrowserPage.goto(`${usageFixture.origin}/focus-session`)
    await usageBrowserPage.waitForLoadState("domcontentloaded")
    const initialPermissionWorker = [...context.serviceWorkers()]
      .reverse()
      .find(worker => new URL(worker.url()).host === extensionId)
    assert(
      initialPermissionWorker,
      "Cannot inspect initial screen-time permissions"
    )
    const initiallyHadBroadHosts = await initialPermissionWorker.evaluate(() =>
      chrome.permissions.contains({
        origins: ["http://*/*", "https://*/*"],
      })
    )
    assert(
      !initiallyHadBroadHosts,
      "Fresh MV3 profile unexpectedly started with broad screen-time hosts"
    )

    const usageSettingsPage = await context.newPage()
    watchPageErrors(usageSettingsPage, "screen-time-settings", errors)
    await suppressFirstRunUi(usageSettingsPage)
    await usageSettingsPage.goto(
      `chrome-extension://${extensionId}/index.html?screen-time-e2e=1`
    )
    await usageSettingsPage.waitForLoadState("domcontentloaded")
    await usageSettingsPage.getByRole("button", { name: "打开设置" }).click()
    const usageSettingsDialog = usageSettingsPage.getByRole("dialog", {
      name: "设置",
    })
    await usageSettingsDialog
      .getByRole("button", { name: "数据", exact: true })
      .click()
    const usageEnabledToggle = usageSettingsDialog.getByRole("switch", {
      name: "启用浏览时长统计",
    })
    await usageEnabledToggle.waitFor({ state: "visible", timeout: 10_000 })
    if (!(await usageEnabledToggle.isChecked())) {
      await usageSettingsPage.bringToFront()
      await usageSettingsDialog
        .getByText("启用浏览时长统计", { exact: true })
        .click()
      // chrome.permissions.request opens a browser-owned confirmation bubble.
      // Keep this as a real UI grant: focus the requesting tab and accept the
      // default confirmation action instead of mutating extension permissions.
      await usageSettingsPage.waitForTimeout(250)
      await usageSettingsPage.keyboard.press("Enter")
    }
    try {
      await usageSettingsDialog
        .getByText(/浏览统计已启动/)
        .waitFor({ state: "visible", timeout: 20_000 })
    } catch (error) {
      const usageEnableDebug = {
        checked: await usageEnabledToggle.isChecked(),
        dialogText: (await usageSettingsDialog.textContent())?.slice(0, 1_200),
      }
      throw new Error(
        `Screen-time permission UI did not finish: ${JSON.stringify(usageEnableDebug)}`,
        { cause: error }
      )
    }

    const getUsageWorker = () =>
      [...context.serviceWorkers()]
        .reverse()
        .find(worker => new URL(worker.url()).host === extensionId)
    const readUsageRuntime = async () => {
      const worker = getUsageWorker()
      assert(worker, "Screen-time service worker is unavailable")
      return worker.evaluate(
        ({ settingsKey, storageKey }) =>
          new Promise(resolve => {
            chrome.storage.local.get([settingsKey, storageKey], result => {
              chrome.scripting.getRegisteredContentScripts(
                { ids: ["fluidity-usage-tracker"] },
                scripts => {
                  chrome.permissions.contains(
                    { origins: ["http://*/*", "https://*/*"] },
                    hasBroadHosts => {
                      resolve({
                        settings: result[settingsKey] ?? null,
                        store: result[storageKey] ?? null,
                        registered: scripts.some(
                          script => script.id === "fluidity-usage-tracker"
                        ),
                        hasBroadHosts,
                      })
                    }
                  )
                }
              )
            })
          }),
        {
          settingsKey: "fluidity.browserUsage.settings.v1",
          storageKey: "fluidity.browserUsage.v1",
        }
      )
    }
    const usageTotal = store =>
      Object.values(store?.days ?? {}).reduce(
        (total, day) => total + Number(day?.totalSec ?? 0),
        0
      )
    const waitForUsageTotalAbove = async (minimum, label) => {
      const deadline = Date.now() + 6_000
      let runtime = await readUsageRuntime()
      while (usageTotal(runtime.store) <= minimum && Date.now() < deadline) {
        await usageBrowserPage.waitForTimeout(200)
        runtime = await readUsageRuntime()
      }
      assert(
        usageTotal(runtime.store) > minimum,
        `${label} did not persist screen time: ${JSON.stringify(runtime)}`
      )
      return runtime
    }

    const enabledUsageRuntime = await readUsageRuntime()
    assert(
      enabledUsageRuntime.settings?.enabled === true &&
        enabledUsageRuntime.registered &&
        enabledUsageRuntime.hasBroadHosts,
      `Screen-time enablement did not grant hosts and register its content script: ${JSON.stringify(enabledUsageRuntime)}`
    )
    await usageBrowserPage.bringToFront()
    await usageBrowserPage.locator("body").click()
    assert(
      await usageBrowserPage.evaluate(
        () => document.visibilityState === "visible" && document.hasFocus()
      ),
      "Local screen-time page is not visible and focused"
    )
    await usageBrowserPage.waitForTimeout(20_800)
    assert(
      await usageBrowserPage.evaluate(
        () => document.visibilityState === "visible" && document.hasFocus()
      ),
      "Local screen-time page lost focus before its live heartbeat checkpoint"
    )
    const liveUsageRuntime = await waitForUsageTotalAbove(
      0,
      "Visible real-page heartbeat"
    )
    assert(
      liveUsageRuntime.store?.current?.domain === "127.0.0.1" &&
        liveUsageRuntime.store.current.lastTs >
          liveUsageRuntime.store.current.startTs &&
        Object.values(liveUsageRuntime.store?.days ?? {}).some(
          day => Number(day?.byDomain?.["127.0.0.1"] ?? 0) > 0
        ),
      `Visible screen time was not attributed to the local HTTP page: ${JSON.stringify(liveUsageRuntime.store)}`
    )
    await startpage.waitForFunction(
      () =>
        document
          .querySelector('[data-home-item-id="widget:screen-time"]')
          ?.textContent?.includes("<1 分钟") === true,
      undefined,
      { timeout: 6_000 }
    )

    const liveUsageTotal = usageTotal(liveUsageRuntime.store)
    await usageBrowserPage.goto("about:blank")
    const stopDeadline = Date.now() + 6_000
    let stoppedUsageRuntime = await readUsageRuntime()
    while (stoppedUsageRuntime.store?.current && Date.now() < stopDeadline) {
      await usageBrowserPage.waitForTimeout(200)
      stoppedUsageRuntime = await readUsageRuntime()
    }
    assert(
      stoppedUsageRuntime.store?.current === null &&
        usageTotal(stoppedUsageRuntime.store) >= liveUsageTotal,
      `Leaving the tracked page did not flush its active segment: ${JSON.stringify(stoppedUsageRuntime.store)}`
    )

    await usageBrowserPage.close()
    if (!usageSettingsPage.isClosed()) await usageSettingsPage.close()

    assert(errors.length === 0, errors.join("\n"))

    console.log(
      JSON.stringify(
        {
          ok: true,
          browser: browserPath,
          extensionId,
          scope: "full",
          checked: [
            ...coreChecks,
            "screen_time_permission_live_heartbeat_widget_stop",
          ],
        },
        null,
        2
      )
    )
  } finally {
    let contextCloseError = null
    try {
      if (context) await context.close()
    } catch (error) {
      contextCloseError = error
    }
    const cleanupResults = await Promise.allSettled([
      usageFixture?.close(),
      userDataDir ? removeTemporaryProfile(userDataDir) : undefined,
    ])
    const cleanupError = cleanupResults.find(
      result => result.status === "rejected"
    )
    if (contextCloseError) throw contextCloseError
    if (cleanupError?.status === "rejected") throw cleanupError.reason
  }
}

await main()
