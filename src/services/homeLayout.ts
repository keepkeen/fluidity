/**
 * 主屏布局 V2：小组件实例 + 应用图标的统一顺序。
 *
 * V1 只保存两个固定组件的显示/隐藏状态；V2 保存组件类型、尺寸和配置，
 * 同时保留应用从收藏动态生成的行为。V1 暂不删除，作为一个版本的回退来源。
 */

import { LinkClickRecord } from "./analytics"
import { frecencyScore } from "./frecency"
import {
  getWidgetDefinition,
  normalizeWidgetInstance,
  WidgetInstance,
  WidgetSize,
  WidgetType,
} from "./widgetRegistry"
import { linkGroup } from "../data/data"

export const LEGACY_HOME_LAYOUT_KEY = "fluidity.homeLayout.v1"
export const HOME_LAYOUT_KEY = "fluidity.homeLayout.v2"

export const WIDGET_SCREEN_TIME = "widget:screen-time"
export const WIDGET_REDISCOVERY = "widget:rediscovery"

export type HomePageShortcutModifier =
  | "alt"
  | "control"
  | "shift"
  | "disabled"

export const DEFAULT_HOME_PAGE_SHORTCUT_MODIFIER: HomePageShortcutModifier =
  "alt"

export interface HomeLayoutState {
  version: 2
  order: string[]
  widgets: Record<string, WidgetInstance>
  pageShortcutModifier: HomePageShortcutModifier
}

interface LegacyHomeLayoutState {
  order?: unknown
  hiddenWidgets?: unknown
  pageShortcutModifier?: unknown
}

export type HomeItem =
  | { kind: "widget"; id: string; widget: WidgetInstance }
  | {
      kind: "app"
      id: string
      url: string
      label: string
      icon?: string | null
      groupTitle: string
    }

const isShortcutModifier = (
  value: unknown
): value is HomePageShortcutModifier =>
  ["alt", "control", "shift", "disabled"].includes(String(value))

const defaultWidgets = (): Record<string, WidgetInstance> => ({
  [WIDGET_SCREEN_TIME]: {
    instanceId: WIDGET_SCREEN_TIME,
    type: "screen-time",
    size: "medium",
    config: { ...getWidgetDefinition("screen-time").defaultConfig },
  },
  [WIDGET_REDISCOVERY]: {
    instanceId: WIDGET_REDISCOVERY,
    type: "rediscovery",
    size: "medium",
    config: { ...getWidgetDefinition("rediscovery").defaultConfig },
  },
})

export const getDefaultHomeLayout = (): HomeLayoutState => ({
  version: 2,
  order: [WIDGET_SCREEN_TIME, WIDGET_REDISCOVERY],
  widgets: defaultWidgets(),
  pageShortcutModifier: DEFAULT_HOME_PAGE_SHORTCUT_MODIFIER,
})

const normalizeV2 = (value: unknown): HomeLayoutState | null => {
  if (!value || typeof value !== "object") return null
  const record = value as Partial<HomeLayoutState>
  if (
    record.version !== 2 ||
    !record.widgets ||
    typeof record.widgets !== "object"
  ) {
    return null
  }

  const widgets: Record<string, WidgetInstance> = {}
  for (const candidate of Object.values(record.widgets)) {
    const normalized = normalizeWidgetInstance(candidate)
    if (normalized) widgets[normalized.instanceId] = normalized
  }

  const order = Array.isArray(record.order)
    ? record.order.filter((item): item is string => typeof item === "string")
    : []

  return {
    version: 2,
    order: [...new Set(order)],
    widgets,
    pageShortcutModifier: isShortcutModifier(record.pageShortcutModifier)
      ? record.pageShortcutModifier
      : DEFAULT_HOME_PAGE_SHORTCUT_MODIFIER,
  }
}

const migrateLegacyLayout = (value: LegacyHomeLayoutState): HomeLayoutState => {
  const hidden = new Set(
    Array.isArray(value.hiddenWidgets)
      ? value.hiddenWidgets.filter(
          (item): item is string => typeof item === "string"
        )
      : []
  )
  const widgets = defaultWidgets()
  for (const id of hidden) delete widgets[id]

  const legacyOrder = Array.isArray(value.order)
    ? value.order.filter((item): item is string => typeof item === "string")
    : []
  const visibleWidgetIds = Object.keys(widgets)
  const order = [
    ...legacyOrder.filter(
      id => !id.startsWith("widget:") || Object.hasOwn(widgets, id)
    ),
    ...visibleWidgetIds.filter(id => !legacyOrder.includes(id)),
  ]

  return {
    version: 2,
    order: [...new Set(order)],
    widgets,
    pageShortcutModifier: isShortcutModifier(value.pageShortcutModifier)
      ? value.pageShortcutModifier
      : DEFAULT_HOME_PAGE_SHORTCUT_MODIFIER,
  }
}

export const readHomeLayout = (): HomeLayoutState => {
  try {
    const raw = localStorage.getItem(HOME_LAYOUT_KEY)
    if (raw) {
      const normalized = normalizeV2(JSON.parse(raw))
      if (normalized) return normalized
    }
  } catch {
    // fall through to the migration source
  }

  try {
    const legacyRaw = localStorage.getItem(LEGACY_HOME_LAYOUT_KEY)
    const migrated = legacyRaw
      ? migrateLegacyLayout(JSON.parse(legacyRaw) as LegacyHomeLayoutState)
      : getDefaultHomeLayout()
    saveHomeLayout(migrated)
    return migrated
  } catch {
    const fallback = getDefaultHomeLayout()
    saveHomeLayout(fallback)
    return fallback
  }
}

export const saveHomeLayout = (state: HomeLayoutState): void => {
  localStorage.setItem(HOME_LAYOUT_KEY, JSON.stringify(state))
}

export const resetHomeLayout = (): HomeLayoutState => {
  const next = getDefaultHomeLayout()
  saveHomeLayout(next)
  return next
}

const createId = (type: WidgetType): string => {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `widget:${type}:${suffix}`
}

export const addWidgetInstance = (
  state: HomeLayoutState,
  type: WidgetType,
  options: { size?: WidgetSize; config?: Record<string, unknown> } = {}
): { state: HomeLayoutState; instance: WidgetInstance } | null => {
  const definition = getWidgetDefinition(type)
  const count = Object.values(state.widgets).filter(
    widget => widget.type === type
  ).length
  if (count >= definition.maxInstances) return null
  const requestedSize = options.size ?? definition.defaultSize
  const size = definition.allowedSizes.includes(requestedSize)
    ? requestedSize
    : definition.defaultSize
  const instanceId =
    type === "screen-time"
      ? WIDGET_SCREEN_TIME
      : type === "rediscovery"
        ? WIDGET_REDISCOVERY
        : createId(type)
  const instance: WidgetInstance = {
    instanceId,
    type,
    size,
    config: { ...definition.defaultConfig, ...(options.config ?? {}) },
  }
  return {
    instance,
    state: {
      ...state,
      widgets: { ...state.widgets, [instanceId]: instance },
      order: [...state.order.filter(id => id !== instanceId), instanceId],
    },
  }
}

export const updateWidgetInstance = (
  state: HomeLayoutState,
  instance: WidgetInstance
): HomeLayoutState => ({
  ...state,
  widgets: { ...state.widgets, [instance.instanceId]: instance },
})

export const removeWidgetInstance = (
  state: HomeLayoutState,
  instanceId: string
): HomeLayoutState => {
  const widgets = { ...state.widgets }
  delete widgets[instanceId]
  return {
    ...state,
    widgets,
    order: state.order.filter(id => id !== instanceId),
  }
}

export const appId = (url: string): string => `app:${url}`

/**
 * 已存顺序优先；新出现的应用按 frecency 追加。组件只来自显式实例，
 * 因此新组件不会在升级后擅自占据主页。
 */
export const buildHomeItems = (
  groups: linkGroup[],
  layout: HomeLayoutState,
  analytics: Record<string, LinkClickRecord>,
  now: number
): HomeItem[] => {
  const byId = new Map<string, HomeItem>()

  for (const widget of Object.values(layout.widgets)) {
    byId.set(widget.instanceId, {
      kind: "widget",
      id: widget.instanceId,
      widget,
    })
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

  const remaining = [...byId.values()].filter(item => !used.has(item.id))
  const widgets = remaining.filter(item => item.kind === "widget")
  const apps = remaining
    .filter(
      (item): item is Extract<HomeItem, { kind: "app" }> =>
        item.kind === "app"
    )
    .sort(
      (a, b) =>
        frecencyScore(analytics[b.url]?.clickHistory, now) -
        frecencyScore(analytics[a.url]?.clickHistory, now)
    )

  return [...ordered, ...widgets, ...apps]
}
