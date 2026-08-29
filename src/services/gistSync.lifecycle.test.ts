import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const {
  applyBackupValueMock,
  decryptMock,
  exportDataAsyncMock,
  getGistMock,
  importDataAsyncMock,
} = vi.hoisted(() => ({
  applyBackupValueMock: vi.fn(),
  decryptMock: vi.fn(),
  exportDataAsyncMock: vi.fn(),
  getGistMock: vi.fn(),
  importDataAsyncMock: vi.fn(),
}))

vi.mock("./gistApi", () => ({
  GitHubRateLimitError: class GitHubRateLimitError extends Error {
    retryAfterMs = 30_000
  },
  createGist: vi.fn(),
  getGist: getGistMock,
  listGists: vi.fn(),
  updateGist: vi.fn(),
  validateGitHubToken: vi.fn(),
}))

vi.mock("./dataBackup", () => ({
  applyBackupValue: applyBackupValueMock,
  exportDataAsync: exportDataAsyncMock,
  importDataAsync: importDataAsyncMock,
}))

vi.mock("./gistCrypto", () => ({
  aesGcmDecryptFromBase64: decryptMock,
  aesGcmEncryptToBase64: vi.fn(),
  deriveAesKeyFromPassword: vi.fn(async () => ({})),
  randomBase64: vi.fn(() => "salt"),
}))

import {
  clearSyncPasswordForSession,
  disconnectGistSync,
  prepareGistSyncForApplicationReset,
  pullNow,
  restoreConflictCopy,
  setSyncPasswordForSession,
} from "./gistSync"

const CONFIG_KEY = "fluidity.gistSync.config.v1"

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(next => {
    resolve = next
  })
  return { promise, resolve }
}

describe("gist sync lifecycle", () => {
  let data: Record<string, unknown>
  let storageListeners: Set<
    (
      changes: Partial<Record<string, chrome.storage.StorageChange>>,
      areaName: string
    ) => void
  >

  beforeEach(() => {
    storageListeners = new Set()
    data = {
      [CONFIG_KEY]: {
        enabled: true,
        token: "token",
        gistId: "gist-id",
        deviceId: "device",
        filename: "fluidity.sync.v1.json",
      },
    }
    Object.defineProperty(globalThis, "chrome", {
      configurable: true,
      value: {
        runtime: { lastError: undefined },
        storage: {
          local: {
            get: (keys: string[], callback: (value: Record<string, unknown>) => void) =>
              callback(Object.fromEntries(keys.map(key => [key, data[key]]))),
            set: (values: Record<string, unknown>, callback: () => void) => {
              const changes = Object.fromEntries(
                Object.entries(values).map(([key, newValue]) => [
                  key,
                  { oldValue: data[key], newValue },
                ])
              )
              Object.assign(data, values)
              callback()
              for (const listener of [...storageListeners]) {
                listener(changes, "local")
              }
            },
          },
          session: {
            get: (_keys: string[], callback: (value: object) => void) => callback({}),
            remove: (_key: string, callback: () => void) => callback(),
          },
          onChanged: {
            addListener: (
              listener: (
                changes: Partial<Record<string, chrome.storage.StorageChange>>,
                areaName: string
              ) => void
            ) => storageListeners.add(listener),
            removeListener: (
              listener: (
                changes: Partial<Record<string, chrome.storage.StorageChange>>,
                areaName: string
              ) => void
            ) => storageListeners.delete(listener),
          },
        },
      },
    })
    exportDataAsyncMock.mockResolvedValue({
      version: "1.0",
      exportDate: "2026-08-30T00:00:00.000Z",
      data: {},
    })
  })

  afterEach(() => {
    clearSyncPasswordForSession()
    applyBackupValueMock.mockReset()
    decryptMock.mockReset()
    exportDataAsyncMock.mockReset()
    getGistMock.mockReset()
    importDataAsyncMock.mockReset()
    Reflect.deleteProperty(globalThis, "chrome")
    localStorage.clear()
  })

  it("cannot revive enabled config after disconnecting an in-flight pull", async () => {
    const pendingGist = deferred<{
      id: string
      description: string
      files: Record<string, never>
      history: { version: string }[]
    }>()
    getGistMock.mockReturnValueOnce(pendingGist.promise)

    const pull = pullNow()
    await vi.waitFor(() => expect(getGistMock).toHaveBeenCalledTimes(1))

    await disconnectGistSync()
    pendingGist.resolve({
      id: "gist-id",
      description: "backup",
      files: {},
      history: [{ version: "old-head" }],
    })

    await expect(pull).rejects.toThrow("SYNC_CANCELLED")
    expect(data[CONFIG_KEY]).toMatchObject({
      enabled: false,
      token: undefined,
      gistId: undefined,
    })
  })

  it("cancels operations started while reset preparation is writing disabled config", async () => {
    const setStarted = deferred<void>()
    const releaseSet = deferred<void>()
    const pendingGist = deferred<{
      id: string
      description: string
      files: Record<string, never>
      history: { version: string }[]
    }>()
    const localArea = chrome.storage.local as unknown as {
      set: (values: Record<string, unknown>, callback: () => void) => void
    }
    const originalSet = localArea.set.bind(localArea)
    localArea.set = (values, callback) => {
      const config = values[CONFIG_KEY] as { enabled?: boolean } | undefined
      if (config?.enabled === false) {
        setStarted.resolve(undefined)
        void releaseSet.promise.then(() => originalSet(values, callback))
        return
      }
      originalSet(values, callback)
    }
    getGistMock.mockReturnValueOnce(pendingGist.promise)

    const preparation = prepareGistSyncForApplicationReset()
    await setStarted.promise

    const pull = pullNow()
    await vi.waitFor(() => expect(getGistMock).toHaveBeenCalledTimes(1))

    releaseSet.resolve(undefined)
    await preparation
    pendingGist.resolve({
      id: "gist-id",
      description: "backup",
      files: {},
      history: [{ version: "stale-head" }],
    })

    await expect(pull).rejects.toThrow("SYNC_CANCELLED")
    expect(data[CONFIG_KEY]).toMatchObject({
      enabled: false,
      token: "token",
      gistId: "gist-id",
    })
  })

  it("serializes a cancelled apply with a restarted pull so new data wins", async () => {
    const firstApply = deferred<void>()
    const localData: Record<string, unknown> = {}
    exportDataAsyncMock.mockImplementation(async () => ({
      version: "1.0",
      exportDate: "2026-08-30T00:00:00.000Z",
      data: { ...localData },
    }))
    applyBackupValueMock.mockImplementationOnce(
      async (key: string, value: unknown) => {
        await firstApply.promise
        localData[key] = value
      }
    )
    applyBackupValueMock.mockImplementation(
      async (key: string, value: unknown) => {
        localData[key] = value
      }
    )
    decryptMock
      .mockResolvedValueOnce(
        JSON.stringify({
          version: "1.0",
          exportDate: "old",
          data: { design: { value: "old-remote" } },
          keyTimestamps: { design: 100 },
        })
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          version: "1.0",
          exportDate: "new",
          data: { design: { value: "new-remote" } },
          keyTimestamps: { design: 200 },
        })
      )
    const envelope = JSON.stringify({
      meta: { updatedAt: 1, clientVersion: "test", deviceId: "remote" },
      encryption: {
        algo: "AES-GCM",
        kdf: "PBKDF2",
        iterations: 200_000,
        salt: "salt",
        iv: "iv",
      },
      ciphertext: "ciphertext",
    })
    getGistMock.mockResolvedValue({
      id: "gist-id",
      description: "backup",
      files: { "fluidity.sync.v1.json": { content: envelope } },
      history: [{ version: "head" }],
    })
    setSyncPasswordForSession("password")

    const firstPull = pullNow()
    await vi.waitFor(() => expect(applyBackupValueMock).toHaveBeenCalledTimes(1))

    await disconnectGistSync()
    const disabled = data[CONFIG_KEY] as Record<string, unknown>
    data[CONFIG_KEY] = {
      ...disabled,
      enabled: true,
      token: "new-token",
      gistId: "gist-id",
    }
    setSyncPasswordForSession("password")

    const secondPull = pullNow()
    await vi.waitFor(() => expect(decryptMock).toHaveBeenCalledTimes(2))
    expect(exportDataAsyncMock).toHaveBeenCalledTimes(1)

    firstApply.resolve(undefined)
    await expect(firstPull).rejects.toThrow("SYNC_CANCELLED")
    await secondPull

    expect(exportDataAsyncMock).toHaveBeenCalledTimes(2)
    expect(localData.design).toEqual({ value: "new-remote" })
  })

  it("preserves cancellation when disconnecting during conflict decryption", async () => {
    const pendingDecrypt = deferred<string>()
    decryptMock.mockReturnValueOnce(pendingDecrypt.promise)
    const envelope = JSON.stringify({
      meta: { updatedAt: 1, clientVersion: "test", deviceId: "remote" },
      encryption: {
        algo: "AES-GCM",
        kdf: "PBKDF2",
        iterations: 200_000,
        salt: "salt",
        iv: "iv",
      },
      ciphertext: "ciphertext",
    })
    getGistMock.mockResolvedValue({
      id: "gist-id",
      description: "backup",
      files: { "conflict.json": { content: envelope } },
      history: [{ version: "head" }],
    })
    setSyncPasswordForSession("password")

    const restore = restoreConflictCopy("conflict.json")
    await vi.waitFor(() => expect(decryptMock).toHaveBeenCalledTimes(1))
    await disconnectGistSync()
    pendingDecrypt.resolve(
      JSON.stringify({ version: "1.0", exportDate: "now", data: {} })
    )

    await expect(restore).rejects.toThrow("SYNC_CANCELLED")
    expect(importDataAsyncMock).not.toHaveBeenCalled()
  })
})
