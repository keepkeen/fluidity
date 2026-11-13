import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { linkGroup } from "../data/data"
import { Links } from "../Startpage/Settings/settingsHandler"
import { exportData, importData, importDataAsync } from "./dataBackup"
import { planMerge } from "./syncMerge"
import {
  LINK_GROUPS_KEY,
  LINK_SYNC_KEY,
  normalizeLinkSyncState,
  recordLinkChanges,
  readLinkSyncState,
  writeLinkGroups,
} from "./linkSync"

const groups = (...labels: string[]): linkGroup[] => [
  {
    title: "work",
    links: labels.map(label => ({
      label,
      value: `https://${label}.example`,
    })),
  },
]
const empty = normalizeLinkSyncState(undefined)
const snapshot = (
  before: linkGroup[],
  after: linkGroup[],
  now: number,
  state = empty
) => ({
  [LINK_GROUPS_KEY]: after,
  [LINK_SYNC_KEY]: recordLinkChanges(before, after, state, now),
})
const merge = (
  local: Record<string, unknown>,
  remote: Record<string, unknown>,
  localTs = 100,
  remoteTs = 100
) => {
  const result = { ...local }
  const plan = planMerge({
    localData: local,
    remoteData: remote,
    localTimestamps: { [LINK_GROUPS_KEY]: localTs },
    remoteTimestamps: { [LINK_GROUPS_KEY]: remoteTs },
    remoteFallbackTs: remoteTs,
  })
  for (const entry of plan)
    if (entry.value !== undefined) result[entry.key] = entry.value
  return result
}
const backup = (data: Record<string, unknown>) => ({
  version: "1.0.0",
  exportedAt: new Date().toISOString(),
  data,
  metadata: { totalKeys: Object.keys(data).length, includesApiKey: false },
})

beforeEach(() => localStorage.clear())
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("bookmark deletion sync", () => {
  it("keeps a deletion against an old client even after unrelated newer edits", () => {
    const local = snapshot(groups("a", "b"), groups("a"), 200)
    const remote = { [LINK_GROUPS_KEY]: groups("a", "b", "c") }
    const result = merge(local, remote, 200, 500)
    expect(result[LINK_GROUPS_KEY]).toEqual(groups("a", "c"))
    expect(merge(remote, local, 500, 200)).toEqual(result)
    expect(merge(result, remote, 500, 500)).toEqual(result)
  })

  it("syncs group deletion and renaming without recreating the old group", () => {
    const before = groups("a", "b")
    const renamed = before.map(group => ({ ...group, title: "renamed" }))
    expect(
      merge(snapshot(before, [], 100), { [LINK_GROUPS_KEY]: before })[
        LINK_GROUPS_KEY
      ]
    ).toEqual([])
    expect(
      merge(snapshot(before, renamed, 100), { [LINK_GROUPS_KEY]: before })[
        LINK_GROUPS_KEY
      ]
    ).toEqual(renamed)
  })

  it("allows an explicit re-add/undo to supersede a deletion", () => {
    const deleted = snapshot(groups("a", "b"), groups("a"), 200)
    const restored = snapshot(
      groups("a"),
      groups("a", "b"),
      200,
      deleted[LINK_SYNC_KEY]
    )
    expect(merge(deleted, restored)[LINK_GROUPS_KEY]).toEqual(groups("a", "b"))
    expect(merge(restored, deleted)[LINK_GROUPS_KEY]).toEqual(groups("a", "b"))
  })

  it("merges independent changes and resolves simultaneous delete/edit in favor of deletion", () => {
    const original = groups("a", "b")
    const renamed = groups("a", "b")
    renamed[0].links[1].label = "renamed"
    const deleted = snapshot(original, groups("a"), 200)
    const edited = snapshot(original, renamed, 200)
    expect(merge(deleted, edited)[LINK_GROUPS_KEY]).toEqual(groups("a"))
    expect(merge(edited, deleted)).toEqual(merge(deleted, edited))
    const laterEdit = snapshot(original, renamed, 201)
    expect(merge(deleted, laterEdit)[LINK_GROUPS_KEY]).toEqual(renamed)
  })

  it("converges concurrent labels in either merge direction", () => {
    const original = groups("a")
    const a = groups("a")
    a[0].links[0].label = "left"
    const b = groups("a")
    b[0].links[0].label = "right"
    const left = snapshot(original, a, 200)
    const right = snapshot(original, b, 200)
    expect(merge(left, right)).toEqual(merge(right, left))
  })

  it("does not turn favicon caching into a new content revision", () => {
    const original = groups("a")
    const state = recordLinkChanges([], original, empty, 100)
    const cached = groups("a")
    cached[0].links[0].icon = "https://a.example/favicon.ico"
    expect(recordLinkChanges(original, cached, state, 200)).toEqual(state)
  })

  it("retains tombstones across exports and records deletions through Links.set", () => {
    Links.set(groups("a", "b"))
    const old = exportData().data
    Links.set(groups("a"))
    const current = exportData().data
    expect(current[LINK_SYNC_KEY]).toBeDefined()
    expect(merge(current, old)[LINK_GROUPS_KEY]).toEqual(groups("a"))
  })

  it("restores both data and deletion metadata when a storage write fails", () => {
    writeLinkGroups(groups("a", "b"))
    const before = exportData().data
    const original = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, "setItem")
      .mockImplementationOnce(function (this: Storage, key, value) {
        return original.call(this, key, value)
      })
      .mockImplementationOnce(() => {
        throw new Error("quota")
      })
    expect(() => writeLinkGroups(groups("a"))).toThrow("quota")
    expect(exportData().data).toEqual(before)
  })

  it("treats importing an older backup as an intentional restore, and retains deletions absent from it", () => {
    writeLinkGroups(groups("a", "b", "c"))
    const old = exportData().data
    writeLinkGroups(groups("a"))
    const deleted = exportData().data
    expect(
      importData(backup({ [LINK_GROUPS_KEY]: groups("a", "b") })).success
    ).toBe(true)
    const restored = exportData().data
    expect(merge(restored, deleted)[LINK_GROUPS_KEY]).toEqual(groups("a", "b"))
    expect(merge(restored, old)[LINK_GROUPS_KEY]).toEqual(groups("a", "b"))
  })

  it("rolls back implicit link metadata when a later import key fails", () => {
    writeLinkGroups(groups("a", "b"))
    const before = readLinkSyncState()
    const original = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key,
      value
    ) {
      if (key === "themes") throw new Error("quota")
      return original.call(this, key, value)
    })
    expect(
      importData(backup({ [LINK_GROUPS_KEY]: groups("a"), themes: [] })).success
    ).toBe(false)
    expect(readLinkSyncState()).toEqual(before)
    expect(Links.get()).toEqual(groups("a", "b"))
  })

  it("rolls back implicit metadata when the async Chrome import fails", async () => {
    writeLinkGroups(groups("a", "b"))
    const before = exportData().data
    let runtimeError: { message: string } | undefined
    vi.stubGlobal("chrome", {
      runtime: {
        get lastError() {
          return runtimeError
        },
      },
      storage: {
        local: {
          get: (_keys: string[], cb: (value: object) => void) => cb({}),
          set: (_value: unknown, cb: () => void) => {
            runtimeError = { message: "quota" }
            cb()
            runtimeError = undefined
          },
          remove: (_key: string, cb: () => void) => cb(),
        },
      },
    })
    const result = await importDataAsync(
      backup({
        [LINK_GROUPS_KEY]: groups("a"),
        "fluidity.browserUsage.domainApps.v1": {},
      })
    )
    expect(result.success).toBe(false)
    expect(exportData().data).toEqual(before)
  })
})
