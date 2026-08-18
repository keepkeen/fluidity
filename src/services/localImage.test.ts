import { describe, expect, it } from "vitest"

import { LocalImageService } from "./localImage"

describe("LocalImageService storage accounting", () => {
  it("counts localStorage cost as UTF-16 (2 bytes per char)", () => {
    const dataUrl = "data:image/jpeg;base64,QUJDRA=="
    expect(LocalImageService.getStorageCost(dataUrl)).toBe(dataUrl.length * 2)
  })

  it("storage cost is larger than decoded size for the same data", () => {
    // base64 使字符数约为原始字节的 4/3，UTF-16 又翻倍：
    // 若按解码字节数做配额判断，实际写入量会超预算约 2.7 倍
    const payload = "QQ==".repeat(3000)
    const dataUrl = `data:image/jpeg;base64,${payload}`
    expect(LocalImageService.getStorageCost(dataUrl)).toBeGreaterThan(
      LocalImageService.getDataUrlSize(dataUrl) * 2
    )
  })
})
