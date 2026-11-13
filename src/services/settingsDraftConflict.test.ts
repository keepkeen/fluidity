import { describe, expect, it } from "vitest"

import {
  defaultWallpaperSettings,
  linkDisplaySettings,
  links,
  searchSettings,
  themes,
} from "../data/data"
import { AISettingsManager } from "./ai"
import { getDefaultHomeLayout } from "./homeLayout"
import {
  getConflictingSettingsDomains,
  getDirtySettingsDomains,
  mergeLatestLinkIcons,
  PersistedSettingsSnapshot,
} from "./settingsDraftConflict"

const makeSnapshot = (): PersistedSettingsSnapshot => ({
  design: themes[0],
  themes,
  linkGroups: links,
  homeLayout: getDefaultHomeLayout(),
  searchSettings,
  aiSettings: AISettingsManager.get(),
  linkDisplaySettings,
  wallpaperSettings: defaultWallpaperSettings,
})

describe("settings draft conflict detection", () => {
  it("does not let an AI-only apply overwrite links changed by another tab", () => {
    const baseline = makeSnapshot()
    const draft = {
      ...baseline,
      aiSettings: { ...baseline.aiSettings, enabled: true },
    }
    const latest = {
      ...baseline,
      linkGroups: [
        ...baseline.linkGroups,
        { title: "Other tab", links: [] },
      ],
    }
    const dirty = getDirtySettingsDomains(baseline, draft)

    expect(dirty).toEqual(["ai"])
    expect(getConflictingSettingsDomains(baseline, latest, dirty)).toEqual([])
  })

  it("blocks applying a domain that another tab also changed", () => {
    const baseline = makeSnapshot()
    const draft = {
      ...baseline,
      searchSettings: { ...baseline.searchSettings, placeholder: "本地草稿" },
    }
    const latest = {
      ...baseline,
      searchSettings: { ...baseline.searchSettings, placeholder: "其他标签页" },
    }
    const dirty = getDirtySettingsDomains(baseline, draft)

    expect(dirty).toEqual(["search"])
    expect(getConflictingSettingsDomains(baseline, latest, dirty)).toEqual([
      "search",
    ])
  })

  it("ignores icon-only conflicts and keeps a newer favicon", () => {
    const baseline = {
      ...makeSnapshot(),
      linkGroups: [
        { title: "Work", links: [{ label: "Docs", value: "https://docs.test" }] },
      ],
    }
    const draft = {
      ...baseline,
      linkGroups: [
        {
          title: "Work",
          links: [
            { label: "Docs", value: "https://docs.test" },
            { label: "Mail", value: "https://mail.test" },
          ],
        },
      ],
    }
    const latest = {
      ...baseline,
      linkGroups: [
        {
          title: "Work",
          links: [
            {
              label: "Docs",
              value: "https://docs.test",
              icon: "data:image/png;base64,new",
            },
          ],
        },
      ],
    }
    const dirty = getDirtySettingsDomains(baseline, draft)

    expect(getConflictingSettingsDomains(baseline, latest, dirty)).toEqual([])
    expect(
      mergeLatestLinkIcons(
        draft.linkGroups,
        baseline.linkGroups,
        latest.linkGroups
      )[0].links[0].icon
    ).toBe("data:image/png;base64,new")
  })

  it("keeps a favicon discovered while the user renames or moves a link", () => {
    const baseline = [
      {
        title: "Work",
        links: [{ label: "Docs", value: "https://docs.test" }],
      },
      { title: "Later", links: [] },
    ]
    const draft = [
      { title: "Work", links: [] },
      {
        title: "Later",
        links: [{ label: "文档", value: "https://docs.test" }],
      },
    ]
    const latest = [
      {
        title: "Work",
        links: [
          {
            label: "Docs",
            value: "https://docs.test",
            icon: "data:image/png;base64,new",
          },
        ],
      },
      { title: "Later", links: [] },
    ]

    expect(mergeLatestLinkIcons(draft, baseline, latest)[1].links[0].icon).toBe(
      "data:image/png;base64,new"
    )
  })

  it("treats an explicit icon edit as a link draft change", () => {
    const baseline = {
      ...makeSnapshot(),
      linkGroups: [
        { title: "Work", links: [{ label: "Docs", value: "https://docs.test" }] },
      ],
    }
    const draft = {
      ...baseline,
      linkGroups: [
        {
          title: "Work",
          links: [
            {
              label: "Docs",
              value: "https://docs.test",
              icon: "https://icons.test/custom.png",
            },
          ],
        },
      ],
    }

    expect(getDirtySettingsDomains(baseline, draft)).toContain("links")
  })
})
