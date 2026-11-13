import React, { act } from "react"
import { createRoot, Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  inspectBackupFile: vi.fn(),
  importDataAsync: vi.fn(),
  emitSettingsApplied: vi.fn(),
  getBrowserUsageSettings: vi.fn(),
  hasBrowserUsagePermissions: vi.fn(),
  removeBrowserUsagePermissions: vi.fn(),
  requestBrowserUsagePermissions: vi.fn(),
  setBrowserUsageSettings: vi.fn(),
}))

vi.mock("../../../services/dataBackup", () => ({
  downloadBackup: vi.fn(async () => undefined),
  getDataStats: () => ({ totalKeys: 0, totalSize: "0 B", breakdown: [] }),
  inspectBackupFile: mocks.inspectBackupFile,
  importDataAsync: mocks.importDataAsync,
}))

vi.mock("../../../services/ai", () => ({
  AISettingsManager: {
    get: () => ({ apiKey: "", apiBaseUrl: "" }),
  },
}))

vi.mock("../../../services/browserUsageSettings", () => ({
  DEFAULT_BROWSER_USAGE_SETTINGS: {
    enabled: false,
    includePagePath: false,
    includePageTitle: false,
  },
  getBrowserUsageSettings: mocks.getBrowserUsageSettings,
  hasBrowserUsagePermissions: mocks.hasBrowserUsagePermissions,
  narrowBrowserUsagePermissions: vi.fn(async () => ({
    hadBroadPermissions: false,
    serviceOriginsGranted: true,
  })),
  removeBrowserUsagePermissions: mocks.removeBrowserUsagePermissions,
  requestBrowserUsagePermissions: mocks.requestBrowserUsagePermissions,
  setBrowserUsageSettings: mocks.setBrowserUsageSettings,
}))

vi.mock("../../../services/gistApi", () => ({
  validateGitHubToken: vi.fn(async () => undefined),
}))

vi.mock("../../../services/gistSync", () => ({
  connectOrDiscover: vi.fn(),
  disconnectGistSync: vi.fn(),
  getGistSyncConfig: vi.fn(async () => ({
    enabled: false,
    token: "",
    gistId: "",
    rememberPassword: false,
  })),
  getTokenPrefillUrl: () => "https://github.com/settings/tokens/new",
  hasRememberedSyncPassword: vi.fn(async () => false),
  hasSessionSyncPassword: () => false,
  listConflictCopies: vi.fn(async () => []),
  pullNow: vi.fn(),
  pushNow: vi.fn(),
  restoreConflictCopy: vi.fn(),
  setSyncPasswordForSession: vi.fn(),
}))

vi.mock("../../../services/aiEndpoint", () => ({
  resolveAIServicePermissionOrigin: vi.fn(),
}))

vi.mock("../../../services/optionalPermissions", () => ({
  ensureSyncPermissions: vi.fn(async () => true),
  resolveRssPermissionOrigin: vi.fn(),
  SYNC_PERMISSION_ORIGINS: ["https://api.github.com/*"],
}))

vi.mock("../../../services/resetApplicationData", () => ({
  resetApplicationData: vi.fn(),
}))

vi.mock("../../../services/rss", () => ({
  listRssSubscriptions: () => [],
}))

vi.mock("../../../services/settingsEvents", () => ({
  emitSettingsApplied: mocks.emitSettingsApplied,
}))

vi.mock("../../../services/syncRuntime", () => ({
  getSyncRuntimeStatus: () => ({ state: "disabled", updatedAt: 0 }),
  subscribeSyncRuntimeStatus: () => () => undefined,
}))

import { DataSettings } from "./DataSettings"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const findButton = (container: HTMLElement, label: string): HTMLButtonElement => {
  const button = [...container.querySelectorAll("button")].find(
    candidate => candidate.textContent?.trim() === label
  )
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Button not found: ${label}`)
  }
  return button
}

const selectBackupFile = async (container: HTMLElement): Promise<void> => {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')
  if (!input) throw new Error("Backup file input not found")

  Object.defineProperty(input, "files", {
    configurable: true,
    value: [new File(["{}"], "fluidity-backup.json", { type: "application/json" })],
  })
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }))
    await Promise.resolve()
  })
}

describe("DataSettings destructive replacement guard", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    mocks.inspectBackupFile.mockReset()
    mocks.importDataAsync.mockReset()
    mocks.emitSettingsApplied.mockReset()
    mocks.getBrowserUsageSettings.mockReset()
    mocks.getBrowserUsageSettings.mockResolvedValue({
      enabled: false,
      includePagePath: false,
      includePageTitle: false,
    })
    mocks.hasBrowserUsagePermissions.mockReset()
    mocks.hasBrowserUsagePermissions.mockResolvedValue(false)
    mocks.removeBrowserUsagePermissions.mockReset()
    mocks.removeBrowserUsagePermissions.mockResolvedValue(true)
    mocks.requestBrowserUsagePermissions.mockReset()
    mocks.requestBrowserUsagePermissions.mockResolvedValue(true)
    mocks.setBrowserUsageSettings.mockReset()
    mocks.setBrowserUsageSettings.mockResolvedValue(undefined)
    mocks.inspectBackupFile.mockResolvedValue({
      backup: {
        version: "1.0",
        exportedAt: "2026-09-03T00:00:00.000Z",
        data: { themes: [] },
        metadata: { totalKeys: 1, includesApiKey: false },
      },
      exportedAt: "2026-09-03T00:00:00.000Z",
      version: "1.0",
      importableKeys: ["themes"],
      skippedKeys: [],
    })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  it("reports busy for the entire deferred import lifecycle", async () => {
    let resolveImport: ((result: {
      success: boolean
      importedKeys: string[]
      skippedKeys: string[]
      errors: string[]
    }) => void) | undefined
    const pendingImport = new Promise<{
      success: boolean
      importedKeys: string[]
      skippedKeys: string[]
      errors: string[]
    }>(resolve => {
      resolveImport = resolve
    })
    mocks.importDataAsync.mockReturnValue(pendingImport)
    const onReplacementBusyChange = vi.fn()

    await act(async () => {
      root.render(
        <DataSettings
          hasUnsavedChanges={false}
          onReplacementBusyChange={onReplacementBusyChange}
        />
      )
      await Promise.resolve()
    })
    await selectBackupFile(container)

    await act(async () => {
      findButton(container, "确认覆盖并导入").click()
      await Promise.resolve()
    })

    expect(mocks.importDataAsync).toHaveBeenCalledTimes(1)
    expect(onReplacementBusyChange.mock.calls).toEqual([[true]])

    await act(async () => {
      resolveImport?.({
        success: true,
        importedKeys: ["themes"],
        skippedKeys: [],
        errors: [],
      })
      await pendingImport
    })

    expect(onReplacementBusyChange.mock.calls).toEqual([[true], [false]])
    expect(mocks.emitSettingsApplied).toHaveBeenCalledTimes(1)
  })

  it("blocks import drafts without reporting a replacement as busy", async () => {
    const onReplacementBusyChange = vi.fn()

    await act(async () => {
      root.render(
        <DataSettings
          hasUnsavedChanges
          onReplacementBusyChange={onReplacementBusyChange}
        />
      )
      await Promise.resolve()
    })
    await selectBackupFile(container)

    await act(async () => {
      findButton(container, "确认覆盖并导入").click()
      await Promise.resolve()
    })

    expect(mocks.importDataAsync).not.toHaveBeenCalled()
    expect(onReplacementBusyChange).not.toHaveBeenCalled()
    expect(container.textContent).toContain("当前还有未应用的设置草稿")
  })

  it("requests browser hosts directly from the enable click before saving", async () => {
    await act(async () => {
      root.render(<DataSettings />)
      await Promise.resolve()
    })
    const toggle = container.querySelector<HTMLInputElement>('[role="switch"]')
    if (!toggle) throw new Error("Browser usage toggle not found")

    await act(async () => {
      toggle.click()
      await Promise.resolve()
    })

    expect(mocks.requestBrowserUsagePermissions).toHaveBeenCalledTimes(1)
    expect(mocks.setBrowserUsageSettings).toHaveBeenCalledWith({
      enabled: true,
      includePagePath: false,
      includePageTitle: false,
    })
    expect(
      mocks.requestBrowserUsagePermissions.mock.invocationCallOrder[0]
    ).toBeLessThan(mocks.setBrowserUsageSettings.mock.invocationCallOrder[0])
  })

  it("revokes a newly granted broad permission when enabling cannot be saved", async () => {
    mocks.setBrowserUsageSettings.mockRejectedValueOnce(new Error("save failed"))
    await act(async () => {
      root.render(<DataSettings />)
      await Promise.resolve()
    })
    const toggle = container.querySelector<HTMLInputElement>('[role="switch"]')
    if (!toggle) throw new Error("Browser usage toggle not found")

    await act(async () => {
      toggle.click()
      await Promise.resolve()
    })

    expect(mocks.requestBrowserUsagePermissions).toHaveBeenCalledTimes(1)
    expect(mocks.removeBrowserUsagePermissions).toHaveBeenCalledTimes(1)
    expect(container.textContent).toContain("save failed")
  })
})
