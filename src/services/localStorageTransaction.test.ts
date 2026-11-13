import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  LocalStorageTransactionError,
  runLocalStorageTransaction,
} from "./localStorageTransaction"

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe("runLocalStorageTransaction", () => {
  it("keeps every write when the operation succeeds", () => {
    runLocalStorageTransaction(["a", "b"], () => {
      localStorage.setItem("a", "next-a")
      localStorage.setItem("b", "next-b")
    })

    expect(localStorage.getItem("a")).toBe("next-a")
    expect(localStorage.getItem("b")).toBe("next-b")
  })

  it("restores existing and absent keys when a later write fails", () => {
    localStorage.setItem("a", "before-a")
    localStorage.setItem("unrelated", "keep-me")
    const nativeSetItem = Storage.prototype.setItem
    let operationWrites = 0
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key: string,
      value: string
    ) {
      if (key === "a" || key === "b") {
        operationWrites += 1
        if (operationWrites === 2) throw new Error("quota")
      }
      nativeSetItem.call(this, key, value)
    })

    expect(() =>
      runLocalStorageTransaction(["a", "b"], () => {
        localStorage.setItem("a", "next-a")
        localStorage.setItem("b", "next-b")
      })
    ).toThrow("quota")

    expect(localStorage.getItem("a")).toBe("before-a")
    expect(localStorage.getItem("b")).toBeNull()
    expect(localStorage.getItem("unrelated")).toBe("keep-me")
  })

  it("reports every key that could not be restored", () => {
    localStorage.setItem("a", "before-a")
    const nativeSetItem = Storage.prototype.setItem
    let operationFailed = false
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key: string,
      value: string
    ) {
      if (key === "b" && !operationFailed) {
        operationFailed = true
        throw new Error("quota")
      }
      if (operationFailed && key === "a") throw new Error("restore failed")
      nativeSetItem.call(this, key, value)
    })

    let thrown: unknown
    try {
      runLocalStorageTransaction(["a", "b"], () => {
        localStorage.setItem("a", "next-a")
        localStorage.setItem("b", "next-b")
      })
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(LocalStorageTransactionError)
    expect(thrown).toMatchObject({
      rollbackComplete: false,
      failedKeys: ["a"],
    })
    expect(localStorage.getItem("a")).toBe("next-a")
  })
})
