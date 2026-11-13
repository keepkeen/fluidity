import type { dataElem, linkGroup } from "../data/data"
import { runLocalStorageTransaction } from "./localStorageTransaction"

export const LINK_GROUPS_KEY = "link-groups"
export const LINK_SYNC_KEY = "fluidity.linkSync.v1"

interface LinkRevision {
  updatedAt: number
  deleted: boolean
}

export interface LinkSyncState {
  version: 1
  entries: Record<string, LinkRevision>
}

const groupKey = (title: string) => JSON.stringify(["group", title])
const linkKey = (title: string, url: string) =>
  JSON.stringify(["link", title, url])
const legacyRevision: LinkRevision = { updatedAt: 0, deleted: false }

/** Missing metadata is an old snapshot, never evidence of a new edit. */
export const normalizeLinkSyncState = (value: unknown): LinkSyncState => {
  if (value === undefined || value === null) return { version: 1, entries: {} }
  const state = value as Partial<LinkSyncState>
  if (
    state.version !== 1 ||
    !state.entries ||
    typeof state.entries !== "object" ||
    Array.isArray(state.entries)
  )
    throw new Error("链接同步元数据格式无效")
  const entries: Record<string, LinkRevision> = {}
  for (const [key, revision] of Object.entries(state.entries)) {
    let identity: unknown
    try {
      identity = JSON.parse(key)
    } catch {
      throw new Error("链接同步标识无效")
    }
    if (
      !Array.isArray(identity) ||
      !identity.every(part => typeof part === "string") ||
      !(
        (identity[0] === "group" && identity.length === 2) ||
        (identity[0] === "link" && identity.length === 3)
      ) ||
      !revision ||
      typeof revision.updatedAt !== "number" ||
      !Number.isFinite(revision.updatedAt) ||
      revision.updatedAt < 0 ||
      typeof revision.deleted !== "boolean"
    )
      throw new Error("链接同步版本无效")
    entries[key] = { updatedAt: revision.updatedAt, deleted: revision.deleted }
  }
  return { version: 1, entries }
}

export const readLinkSyncState = (): LinkSyncState =>
  normalizeLinkSyncState(
    JSON.parse(localStorage.getItem(LINK_SYNC_KEY) ?? "null")
  )

const compareRevision = (a: LinkRevision, b: LinkRevision): number =>
  a.updatedAt - b.updatedAt || Number(a.deleted) - Number(b.deleted)

export const mergeLinkSyncStates = (
  a: LinkSyncState,
  b: LinkSyncState
): LinkSyncState => {
  const entries = { ...a.entries }
  for (const [key, revision] of Object.entries(b.entries)) {
    if (!entries[key] || compareRevision(revision, entries[key]) > 0)
      entries[key] = revision
  }
  return { version: 1, entries }
}

const indexGroups = (groups: linkGroup[]) => {
  const records = new Map<string, string>()
  for (const group of groups) {
    // Icons are a local cache; discovering one must not revive a deleted link.
    records.set(
      groupKey(group.title),
      JSON.stringify(group.links.map(link => [link.value, link.label]))
    )
    for (const link of group.links)
      records.set(linkKey(group.title, link.value), link.label)
  }
  return records
}

export const recordLinkChanges = (
  before: linkGroup[],
  after: linkGroup[],
  state: LinkSyncState,
  now = Date.now()
): LinkSyncState => {
  const entries = { ...state.entries }
  const previous = indexGroups(before)
  const next = indexGroups(after)
  // Keep this device's edits newer than everything it has already observed,
  // including undo/re-add in the same millisecond or after clock adjustment.
  const timestamp = Object.values(entries).reduce(
    (latest, revision) => Math.max(latest, revision.updatedAt + 1),
    now
  )
  for (const key of new Set([...previous.keys(), ...next.keys()])) {
    if (
      previous.get(key) !== next.get(key) ||
      (next.has(key) && entries[key]?.deleted)
    ) {
      entries[key] = { updatedAt: timestamp, deleted: !next.has(key) }
    } else if (!entries[key]) entries[key] = { ...legacyRevision }
  }
  return { version: 1, entries }
}

/** Both writes roll back together on quota/storage failure. */
export const applyLinkSnapshot = (
  groups: linkGroup[],
  state: LinkSyncState
): void => {
  runLocalStorageTransaction([LINK_GROUPS_KEY, LINK_SYNC_KEY], () => {
    localStorage.setItem(LINK_SYNC_KEY, JSON.stringify(state))
    localStorage.setItem(LINK_GROUPS_KEY, JSON.stringify(groups))
  })
}

export const writeLinkGroups = (
  groups: linkGroup[],
  before: linkGroup[] = JSON.parse(
    localStorage.getItem(LINK_GROUPS_KEY) ?? "[]"
  ),
  state = readLinkSyncState()
): void => applyLinkSnapshot(groups, recordLinkChanges(before, groups, state))

const linkValueKey = (link: dataElem) =>
  JSON.stringify([link.label, link.value, link.icon ?? null])

/** The preferred side controls presentation order; record clocks control content. */
export const mergeLinkSnapshots = (
  preferred: linkGroup[],
  other: linkGroup[],
  preferredState: LinkSyncState,
  otherState: LinkSyncState
): { groups: linkGroup[]; state: LinkSyncState } => {
  const state = mergeLinkSyncStates(preferredState, otherState)
  const left = new Map(preferred.map(group => [group.title, group]))
  const right = new Map(other.map(group => [group.title, group]))
  const groups: linkGroup[] = []
  for (const title of new Set([...left.keys(), ...right.keys()])) {
    const key = groupKey(title)
    const a = left.get(title)
    const b = right.get(title)
    // Materialize legacy live records at revision zero, without assigning
    // an unrelated whole-backup timestamp to every bookmark.
    state.entries[key] ??= { ...legacyRevision }
    if (state.entries[key].deleted) continue
    const aLinks = new Map((a?.links ?? []).map(link => [link.value, link]))
    const bLinks = new Map((b?.links ?? []).map(link => [link.value, link]))
    const links: dataElem[] = []
    for (const url of new Set([...aLinks.keys(), ...bLinks.keys()])) {
      const id = linkKey(title, url)
      state.entries[id] ??= { ...legacyRevision }
      if (state.entries[id].deleted) continue
      const first = aLinks.get(url)
      const second = bLinks.get(url)
      if (!first || !second) {
        links.push((first ?? second)!)
        continue
      }
      const comparison = compareRevision(
        preferredState.entries[id] ?? legacyRevision,
        otherState.entries[id] ?? legacyRevision
      )
      // Legacy records retain the old newer-snapshot preference. Versioned
      // concurrent edits use a deterministic tie-break on their full value.
      links.push(
        comparison > 0
          ? first
          : comparison < 0
            ? second
            : !preferredState.entries[id] && !otherState.entries[id]
              ? first
              : linkValueKey(first) >= linkValueKey(second)
                ? first
                : second
      )
    }
    groups.push({ title, links })
  }
  return { groups, state }
}
