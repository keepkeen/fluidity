import {
  LinkDisplaySettings,
  Search,
  Theme,
  WallpaperSettings,
  linkGroup,
} from "../data/data"
import { AISettings } from "./ai"
import { HomeLayoutState } from "./homeLayout"

export type SettingsDomain =
  | "design"
  | "themes"
  | "links"
  | "homeLayout"
  | "search"
  | "ai"
  | "linkDisplay"
  | "wallpaper"

export interface PersistedSettingsSnapshot {
  design: Theme
  themes: Theme[]
  linkGroups: linkGroup[]
  homeLayout: HomeLayoutState
  searchSettings: Search
  aiSettings: AISettings
  linkDisplaySettings: LinkDisplaySettings
  wallpaperSettings: WallpaperSettings
}

const DOMAIN_KEYS: Record<
  SettingsDomain,
  keyof PersistedSettingsSnapshot
> = {
  design: "design",
  themes: "themes",
  links: "linkGroups",
  homeLayout: "homeLayout",
  search: "searchSettings",
  ai: "aiSettings",
  linkDisplay: "linkDisplaySettings",
  wallpaper: "wallpaperSettings",
}

export const SETTINGS_DOMAINS = Object.keys(DOMAIN_KEYS) as SettingsDomain[]

const withoutLinkIcons = (groups: linkGroup[]): linkGroup[] =>
  groups.map(group => ({
    title: group.title,
    links: group.links.map(({ label, value }) => ({ label, value })),
  }))

const equalDomain = (
  domain: SettingsDomain,
  left: PersistedSettingsSnapshot,
  right: PersistedSettingsSnapshot,
  ignoreLinkIcons = false
): boolean => {
  if (domain === "links") {
    const leftGroups = ignoreLinkIcons
      ? withoutLinkIcons(left.linkGroups)
      : left.linkGroups
    const rightGroups = ignoreLinkIcons
      ? withoutLinkIcons(right.linkGroups)
      : right.linkGroups
    return JSON.stringify(leftGroups) === JSON.stringify(rightGroups)
  }
  const key = DOMAIN_KEYS[domain]
  return JSON.stringify(left[key]) === JSON.stringify(right[key])
}

export const getDirtySettingsDomains = (
  baseline: PersistedSettingsSnapshot,
  draft: PersistedSettingsSnapshot
): SettingsDomain[] =>
  SETTINGS_DOMAINS.filter(domain => !equalDomain(domain, baseline, draft))

export const getConflictingSettingsDomains = (
  baseline: PersistedSettingsSnapshot,
  latest: PersistedSettingsSnapshot,
  dirtyDomains: readonly SettingsDomain[]
): SettingsDomain[] =>
  dirtyDomains.filter(
    domain => !equalDomain(domain, baseline, latest, domain === "links")
  )

const linkIdentity = (value: string, occurrence: number): string =>
  `${value}\u0000${occurrence}`

const collectIcons = (groups: linkGroup[]): Map<string, string | null | undefined> => {
  const result = new Map<string, string | null | undefined>()
  const counts = new Map<string, number>()
  for (const group of groups) {
    for (const link of group.links) {
      const occurrence = counts.get(link.value) ?? 0
      counts.set(link.value, occurrence + 1)
      result.set(linkIdentity(link.value, occurrence), link.icon)
    }
  }
  return result
}

/**
 * Favicon discovery may update link icons while the settings window is open.
 * Preserve those newer icons whenever the user did not edit that icon itself.
 */
export const mergeLatestLinkIcons = (
  draft: linkGroup[],
  baseline: linkGroup[],
  latest: linkGroup[]
): linkGroup[] => {
  const baselineIcons = collectIcons(baseline)
  const latestIcons = collectIcons(latest)
  const counts = new Map<string, number>()

  return draft.map(group => ({
    ...group,
    links: group.links.map(link => {
      const occurrence = counts.get(link.value) ?? 0
      counts.set(link.value, occurrence + 1)
      const identity = linkIdentity(link.value, occurrence)
      if (
        latestIcons.has(identity) &&
        link.icon === baselineIcons.get(identity)
      ) {
        return { ...link, icon: latestIcons.get(identity) }
      }
      return { ...link }
    }),
  }))
}
