import { beforeEach, describe, expect, it } from "vitest"

import { exportData, importData } from "./dataBackup"

const WALLPAPER_KEY = "wallpaper-settings"
const CARD_AREA_KEY = "card-area-settings"

const localWallpaper = {
  source: "local",
  displayMode: "fullscreen",
  presetImage: "",
  customUrl: "",
  localImageData: "data:image/jpeg;base64,QUJD",
  bingRegion: "cn",
  blur: 4,
  brightness: 0.9,
  overlay: true,
  overlayOpacity: 0.3,
}

const cardArea = {
  displayMode: "full",
}

beforeEach(() => {
  localStorage.clear()
})

describe("exportData", () => {
  it("includes wallpaper and card-area settings", () => {
    localStorage.setItem(WALLPAPER_KEY, JSON.stringify(localWallpaper))
    localStorage.setItem(CARD_AREA_KEY, JSON.stringify(cardArea))

    const backup = exportData()
    expect(backup.data[WALLPAPER_KEY]).toBeDefined()
    expect(backup.data[CARD_AREA_KEY]).toBeDefined()
  })

  it("strips base64 image data but keeps other preferences", () => {
    localStorage.setItem(WALLPAPER_KEY, JSON.stringify(localWallpaper))

    const backup = exportData()
    const wallpaper = backup.data[WALLPAPER_KEY] as typeof localWallpaper
    expect(wallpaper.localImageData).toBeNull()
    expect(wallpaper.source).toBe("preset")
    expect(wallpaper.blur).toBe(4)
  })

  it("exports widget data but never exports the device-local RSS cache", () => {
    localStorage.setItem("fluidity.homeLayout.v2", JSON.stringify({ version: 2 }))
    localStorage.setItem("fluidity.laterRead.v1", JSON.stringify({ version: 1 }))
    localStorage.setItem("fluidity.rss.subscriptions.v1", JSON.stringify({ version: 1 }))
    localStorage.setItem("fluidity.rss.readState.v1", JSON.stringify({ one: { read: true } }))
    localStorage.setItem("fluidity.rss.cache.v1.web", JSON.stringify({ private: "cache" }))

    const data = exportData().data
    expect(data["fluidity.homeLayout.v2"]).toBeDefined()
    expect(data["fluidity.laterRead.v1"]).toBeDefined()
    expect(data["fluidity.rss.subscriptions.v1"]).toBeDefined()
    expect(data["fluidity.rss.readState.v1"]).toBeDefined()
    expect(data["fluidity.rss.cache.v1.web"]).toBeUndefined()
  })
})

describe("importData", () => {
  const makeBackup = (data: Record<string, unknown>) => ({
    version: "1.0.0",
    exportedAt: new Date().toISOString(),
    data,
    metadata: { totalKeys: Object.keys(data).length, includesApiKey: false },
  })

  it("preserves this device's local wallpaper image on overwrite", () => {
    localStorage.setItem(WALLPAPER_KEY, JSON.stringify(localWallpaper))

    const incoming = {
      ...localWallpaper,
      localImageData: null,
      source: "preset",
      blur: 10,
    }
    const result = importData(makeBackup({ [WALLPAPER_KEY]: incoming }), {
      overwrite: true,
    })
    expect(result.success).toBe(true)

    const stored = JSON.parse(
      localStorage.getItem(WALLPAPER_KEY) ?? "{}"
    ) as typeof localWallpaper
    expect(stored.localImageData).toBe(localWallpaper.localImageData)
    expect(stored.source).toBe("local")
    expect(stored.blur).toBe(10)
  })

  it("round-trips card area settings", () => {
    localStorage.setItem(CARD_AREA_KEY, JSON.stringify(cardArea))

    const result = importData(makeBackup({ [CARD_AREA_KEY]: cardArea }), {
      overwrite: true,
    })
    expect(result.success).toBe(true)
    expect(
      (JSON.parse(localStorage.getItem(CARD_AREA_KEY) ?? "{}") as typeof cardArea)
        .displayMode
    ).toBe("full")
  })

  it("round-trips regular settings keys", () => {
    const links = [
      { title: "Dev", links: [{ label: "GitHub", value: "https://github.com" }] },
    ]
    localStorage.setItem("link-groups", JSON.stringify(links))
    const backup = exportData()

    localStorage.clear()
    const result = importData(backup, { overwrite: true })
    expect(result.success).toBe(true)
    expect(JSON.parse(localStorage.getItem("link-groups") ?? "[]")).toEqual(
      links
    )
  })
})
