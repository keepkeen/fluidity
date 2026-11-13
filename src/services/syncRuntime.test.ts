import { beforeEach, describe, expect, it } from "vitest"

import { getSyncRuntimeStatus, setSyncRuntimeStatus } from "./syncRuntime"

beforeEach(() => localStorage.clear())

describe("sync runtime trust status", () => {
  it("keeps the last successful time while a later push is pending", () => {
    setSyncRuntimeStatus({
      state: "ok",
      updatedAt: 1000,
      message: "同步完成",
    })
    setSyncRuntimeStatus({
      state: "syncing",
      updatedAt: 2000,
      message: "正在推送…",
    })

    expect(getSyncRuntimeStatus()).toMatchObject({
      state: "syncing",
      updatedAt: 2000,
      lastSuccessAt: 1000,
      pending: true,
    })
  })
})
