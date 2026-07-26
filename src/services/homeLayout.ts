/**
 * 主屏布局：小组件 + 应用图标的统一网格。
 *
 * 顺序规则：用户拖拽过的顺序持久化优先；
 * 新出现的条目按"小组件在前、应用按 frecency 降序"追加——
 * 注意力机制以默认排序的形式保留。
 */

import { LinkClickRecord } from "./analytics"
import { frecencyScore } from "./frecency"
import { linkGroup } from "../data/data"

export const HOME_LAYOUT_KEY = "fluidity.homeLayout.v1"

export const WIDGET_SCREEN_TIME = "widget:screen-time"
export const WIDGET_REDISCOVERY = "widget:rediscovery"
export const ALL_WIDGET_IDS = [WIDGET_SCREEN_TIME, WIDGET_REDISCOVERY]

export interface HomeLayoutState {
  order: string[]
  hiddenWidgets: string[]
}

export type HomeItem =
  | { kind: "widget"; id: string }
  | {
      kind: "app"
      id: string
      url: string
      label: string
      icon?: string | null
      groupTitle: string
    }

export const readHomeLayout = (): HomeLayoutState => {
  try {
    const raw = localStorage.getItem(HOME_LAYOUT_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<HomeLayoutState>
      return {
        order: Array.isArray(parsed.order)
          ? parsed.order.filter((v): v is string => typeof v === "string")
          : [],
        hiddenWidgets: Array.isArray(parsed.hiddenWidgets)
          ? parsed.hiddenWidgets.filter(
              (v): v is string => typeof v === "string"
            )
          : [],
      }
    }
  } catch {
    // ignore
  }
  return { order: [], hiddenWidgets: [] }
}

export const saveHomeLayout = (state: HomeLayoutState): void => {
  try {
    localStorage.setItem(HOME_LAYOUT_KEY, JSON.stringify(state))
  } catch {
    // ignore
  }
}

export const appId = (url: string): string => `app:${url}`

/**
 * 计算主屏条目（纯函数）：
 * 已存顺序优先，新条目按 widgets 优先 + frecency 追加。
 */
export const buildHomeItems = (
  groups: linkGroup[],
  layout: HomeLayoutState,
  analytics: Record<string, LinkClickRecord>,
  now: number
): HomeItem[] => {
  const byId = new Map<string, HomeItem>()

  for (const widgetId of ALL_WIDGET_IDS) {
    if (!layout.hiddenWidgets.includes(widgetId)) {
      byId.set(widgetId, { kind: "widget", id: widgetId })
    }
  }

  for (const group of groups) {
    for (const link of group.links) {
      if (!link.value) continue
      const id = appId(link.value)
      if (byId.has(id)) continue
      byId.set(id, {
        kind: "app",
        id,
        url: link.value,
        label: link.label || link.value,
        icon: link.icon,
        groupTitle: group.title,
      })
    }
  }

  const ordered: HomeItem[] = []
  const used = new Set<string>()

  for (const id of layout.order) {
    const item = byId.get(id)
    if (item && !used.has(id)) {
      ordered.push(item)
      used.add(id)
    }
  }

  // 新条目：小组件在前，应用按 frecency 降序
  const remaining = [...byId.values()].filter(item => !used.has(item.id))
  const widgets = remaining.filter(item => item.kind === "widget")
  const apps = remaining
    .filter((item): item is Extract<HomeItem, { kind: "app" }> =>
      item.kind === "app"
    )
    .sort(
      (a, b) =>
        frecencyScore(analytics[b.url]?.clickHistory, now) -
        frecencyScore(analytics[a.url]?.clickHistory, now)
    )

  return [...ordered, ...widgets, ...apps]
}
