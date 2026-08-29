export type WidgetType =
  | "screen-time"
  | "rediscovery"
  | "read-later"
  | "smart-entry"
  | "rss"

export type WidgetSize = "small" | "wide" | "medium" | "large"

export interface WidgetInstance {
  instanceId: string
  type: WidgetType
  size: WidgetSize
  config: Record<string, unknown>
}

export interface WidgetDefinition {
  type: WidgetType
  title: string
  description: string
  symbol: string
  allowedSizes: WidgetSize[]
  defaultSize: WidgetSize
  maxInstances: number
  dataLabel: "完全本地" | "本地行为数据" | "需要联网"
  permissionLabel?: string
  defaultConfig: Record<string, unknown>
}

export const WIDGET_DEFINITIONS: WidgetDefinition[] = [
  {
    type: "screen-time",
    title: "屏幕时间",
    description: "看见今天的浏览时长、注意力预算与趋势。",
    symbol: "◷",
    allowedSizes: ["small", "medium", "large"],
    defaultSize: "medium",
    maxInstances: 1,
    dataLabel: "本地行为数据",
    permissionLabel: "启用统计后申请网站访问权限",
    defaultConfig: { dailyGoalMinutes: 180 },
  },
  {
    type: "rediscovery",
    title: "重逢",
    description: "让长期未打开的收藏重新浮现。",
    symbol: "⌁",
    allowedSizes: ["wide", "medium", "large"],
    defaultSize: "medium",
    maxInstances: 1,
    dataLabel: "完全本地",
    defaultConfig: {},
  },
  {
    type: "read-later",
    title: "稍后读",
    description: "收下当前页面，等真正有空时再处理。",
    symbol: "◫",
    allowedSizes: ["wide", "medium", "large"],
    defaultSize: "medium",
    maxInstances: 1,
    dataLabel: "完全本地",
    defaultConfig: { itemLimit: 3 },
  },
  {
    type: "smart-entry",
    title: "智能入口",
    description: "按当前时段和本地使用习惯推荐收藏。",
    symbol: "✦",
    allowedSizes: ["small", "wide", "medium"],
    defaultSize: "wide",
    maxInstances: 1,
    dataLabel: "本地行为数据",
    defaultConfig: { itemLimit: 4, excludedUrls: [] },
  },
  {
    type: "rss",
    title: "RSS / 阅读流",
    description: "订阅你主动选择的信息源，不被算法追着走。",
    symbol: "◔",
    allowedSizes: ["medium", "large"],
    defaultSize: "large",
    maxInstances: 8,
    dataLabel: "需要联网",
    permissionLabel: "仅访问你添加的订阅域名",
    defaultConfig: {
      title: "阅读流",
      subscriptionIds: [],
      itemLimit: 4,
      unreadOnly: true,
    },
  },
]

const BY_TYPE = new Map(WIDGET_DEFINITIONS.map(item => [item.type, item]))

export const getWidgetDefinition = (type: WidgetType): WidgetDefinition => {
  const definition = BY_TYPE.get(type)
  if (!definition) throw new Error(`Unknown widget type: ${type}`)
  return definition
}

export const isWidgetType = (value: unknown): value is WidgetType =>
  typeof value === "string" && BY_TYPE.has(value as WidgetType)

export const isWidgetSize = (value: unknown): value is WidgetSize =>
  ["small", "wide", "medium", "large"].includes(String(value))

export const normalizeWidgetInstance = (
  value: unknown
): WidgetInstance | null => {
  if (!value || typeof value !== "object") return null
  const record = value as Partial<WidgetInstance>
  if (
    typeof record.instanceId !== "string" ||
    !isWidgetType(record.type)
  ) {
    return null
  }
  const definition = getWidgetDefinition(record.type)
  const requestedSize = isWidgetSize(record.size)
    ? record.size
    : definition.defaultSize
  const size = definition.allowedSizes.includes(requestedSize)
    ? requestedSize
    : definition.defaultSize
  const config =
    record.config &&
    typeof record.config === "object" &&
    !Array.isArray(record.config)
      ? (record.config as Record<string, unknown>)
      : {}
  return {
    instanceId: record.instanceId,
    type: record.type,
    size,
    config: { ...definition.defaultConfig, ...config },
  }
}

export const WIDGET_SIZE_LABELS: Record<WidgetSize, string> = {
  small: "小号 · 1×1",
  wide: "横向 · 2×1",
  medium: "中号 · 2×2",
  large: "大号 · 4×2",
}
