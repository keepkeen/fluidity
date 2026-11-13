/**
 * 数据备份服务
 * 导出和恢复所有用户数据
 */

import {
  BROWSER_USAGE_DOMAIN_APPS_KEY,
  BROWSER_USAGE_STORAGE_KEY,
  replaceBrowserUsageRuntime,
} from "./browserUsage"
import {
  BROWSER_USAGE_SETTINGS_KEY,
  BrowserUsageSettings,
  DEFAULT_BROWSER_USAGE_SETTINGS,
  setBrowserUsageSettings,
} from "./browserUsageSettings"
import {
  getChromeLocal,
  hasChromeStorage,
  removeChromeLocal,
  setChromeLocal,
} from "./extensionStore"
import {
  LocalStorageTransactionError,
  runLocalStorageTransaction,
} from "./localStorageTransaction"
import { normalizeSearchRecords } from "./analytics"
import { normalizeWidgetInstance } from "./widgetRegistry"
import { HOME_LAYOUT_KEY, withHomeLayoutLock } from "./homeLayout"

// 常量
const AI_SETTINGS_KEY = "ai-settings"
const WALLPAPER_SETTINGS_KEY = "wallpaper-settings"
const CARD_AREA_SETTINGS_KEY = "card-area-settings"

// 所有需要备份的 localStorage 键
const BACKUP_KEYS = {
  // 设置类
  settings: [
    "search-settings",
    "themes",
    "link-groups",
    "design",
    "link-display-settings",
    WALLPAPER_SETTINGS_KEY,
    CARD_AREA_SETTINGS_KEY,
    "fluidity.linkPins.v1",
    "fluidity.homeLayout.v1",
    "fluidity.homeLayout.v2",
    "fluidity.rediscovery.v1",
    "fluidity.laterRead.v1",
    "fluidity.rss.subscriptions.v1",
  ],
  // AI 相关（不包含 apiKey）
  ai: [AI_SETTINGS_KEY, "ai-cache"],
  // 分析数据
  analytics: [
    "link-analytics",
    "search-history",
    "fluidity.ai.dailyReview.v1",
    "fluidity.rss.readState.v1",
  ],
  // 报告相关
  reports: ["report-state", "report-cache"],
}

// 需要从 chrome.storage.local 读取/写入的键（仅扩展环境存在）
const CHROME_BACKUP_KEYS = [
  BROWSER_USAGE_DOMAIN_APPS_KEY,
  BROWSER_USAGE_SETTINGS_KEY,
  // Usage is deliberately last. Its background replacement protocol captures
  // the latest heartbeat at execution time and rolls itself back on failure;
  // no later Chrome write may turn a successful replacement into a rollback
  // based on an older UI-side snapshot.
  BROWSER_USAGE_STORAGE_KEY,
]

const importChromeBackupKeys = async (
  backup: BackupData,
  options: { overwrite?: boolean },
  result: ImportResult,
  attemptedKeys?: Set<string>
): Promise<void> => {
  if (!hasChromeStorage()) return

  const overwrite = options.overwrite ?? true
  const chromeKeys = CHROME_BACKUP_KEYS.filter(k => k in backup.data)

  for (const key of chromeKeys) {
    try {
      if (!overwrite) {
        const existing = await getChromeLocal<unknown>(key)
        if (existing !== undefined) {
          result.skippedKeys.push(key)
          continue
        }
      }

      attemptedKeys?.add(key)
      if (key === BROWSER_USAGE_STORAGE_KEY) {
        await replaceBrowserUsageRuntime(backup.data[key])
      } else if (key === BROWSER_USAGE_SETTINGS_KEY) {
        await setBrowserUsageSettings(backup.data[key] as BrowserUsageSettings)
      } else {
        await setChromeLocal(key, backup.data[key])
      }
      result.importedKeys.push(key)
    } catch (error) {
      result.errors.push(
        `导入 ${key} 失败: ${
          error instanceof Error ? error.message : "未知错误"
        }`
      )
      // Keep usage as the final authoritative write. Continuing after any
      // Chrome failure could otherwise require rolling it back to a snapshot
      // that predates a heartbeat queued in the background.
      break
    }
  }
}

// 导出数据结构
export interface BackupData {
  version: string
  exportedAt: string
  data: Record<string, unknown>
  metadata: {
    totalKeys: number
    includesApiKey: boolean
  }
}

// 导出选项
export interface ExportOptions {
  includeApiKey?: boolean
  includeAnalytics?: boolean
  includeReports?: boolean
}

// 导入结果
export interface ImportResult {
  success: boolean
  importedKeys: string[]
  skippedKeys: string[]
  errors: string[]
  /** True unless an attempted restore left one or more keys in an unknown state. */
  rollbackComplete?: boolean
  /** Keys whose original values could not be restored after an import failure. */
  failedKeys?: string[]
}

const createImportResult = (): ImportResult => ({
  success: false,
  importedKeys: [],
  skippedKeys: [],
  errors: [],
  rollbackComplete: true,
  failedKeys: [],
})

const appendFailedKeys = (result: ImportResult, keys: readonly string[]): void => {
  result.failedKeys = [...new Set([...(result.failedKeys ?? []), ...keys])]
  result.rollbackComplete = result.failedKeys.length === 0
}

const backupValuesEqual = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) return true
  const normalizeKeyOrder = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(normalizeKeyOrder)
    if (!value || typeof value !== "object") return value
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
        .map(([key, item]) => [key, normalizeKeyOrder(item)])
    )
  }
  try {
    return (
      JSON.stringify(normalizeKeyOrder(left)) ===
      JSON.stringify(normalizeKeyOrder(right))
    )
  } catch {
    return false
  }
}

export interface BackupPreview {
  backup: BackupData
  exportedAt: string
  version: string
  importableKeys: string[]
  skippedKeys: string[]
}

/**
 * 获取所有需要备份的键
 */
const getAllBackupKeys = (options: ExportOptions = {}): string[] => {
  const {
    includeAnalytics = true,
    includeReports = true,
  } = options

  let keys = [...BACKUP_KEYS.settings, ...BACKUP_KEYS.ai]

  if (includeAnalytics) {
    keys = [...keys, ...BACKUP_KEYS.analytics]
  }

  if (includeReports) {
    keys = [...keys, ...BACKUP_KEYS.reports]
  }

  return keys
}

/**
 * 处理 AI 设置，移除敏感信息
 */
const sanitizeAISettings = (
  data: Record<string, unknown>,
  includeApiKey: boolean
): Record<string, unknown> => {
  if (!includeApiKey && data[AI_SETTINGS_KEY]) {
    const aiSettings = data[AI_SETTINGS_KEY] as Record<string, unknown>
    return {
      ...data,
      [AI_SETTINGS_KEY]: {
        ...aiSettings,
        apiKey: "", // 移除 API Key
      },
    }
  }
  return data
}

/**
 * 剥离体积巨大的 base64 图片数据。
 * 备份/同步只携带壁纸配置项，本地图片需在新环境重新上传。
 */
const stripLargeImageData = (
  data: Record<string, unknown>
): Record<string, unknown> => {
  const next = { ...data }

  const wallpaper = next[WALLPAPER_SETTINGS_KEY]
  if (wallpaper && typeof wallpaper === "object") {
    const w = wallpaper as Record<string, unknown>
    next[WALLPAPER_SETTINGS_KEY] = {
      ...w,
      localImageData: null,
      // 本地图片不随备份走，来源退回预设避免恢复后黑屏
      source: w.source === "local" ? "preset" : w.source,
    }
  }

  return next
}

/**
 * 导出所有数据
 */
export const exportData = (options: ExportOptions = {}): BackupData => {
  const { includeApiKey = false } = options
  const keys = getAllBackupKeys(options)
  const data: Record<string, unknown> = {}

  keys.forEach(key => {
    const value = localStorage.getItem(key)
    if (value !== null) {
      try {
        data[key] = JSON.parse(value)
      } catch {
        // 如果不是 JSON，直接存储字符串
        data[key] = value
      }
    }
  })

  // 处理敏感信息与大体积图片
  const sanitizedData = stripLargeImageData(
    sanitizeAISettings(data, includeApiKey)
  )

  return {
    version: "1.0.0",
    exportedAt: new Date().toISOString(),
    data: sanitizedData,
    metadata: {
      totalKeys: Object.keys(sanitizedData).length,
      includesApiKey: includeApiKey,
    },
  }
}

/**
 * 导出所有数据（包含 chrome.storage.local 中的扩展数据）
 */
export const exportDataAsync = async (
  options: ExportOptions = {}
): Promise<BackupData> => {
  const base = exportData(options)

  if (hasChromeStorage()) {
    for (const key of CHROME_BACKUP_KEYS) {
      const value = await getChromeLocal<unknown>(key)
      if (value !== undefined) {
        base.data[key] = value
      }
    }
  }

  base.metadata.totalKeys = Object.keys(base.data).length
  return base
}

/**
 * 下载备份文件
 */
export const downloadBackup = async (
  options: ExportOptions = {}
): Promise<void> => {
  const backup = await exportDataAsync(options)
  const json = JSON.stringify(backup, null, 2)
  const blob = new Blob([json], { type: "application/json" })
  const url = URL.createObjectURL(blob)

  const date = new Date().toISOString().split("T")[0]
  const filename = `fluidity-backup-${date}.json`

  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * 验证备份数据格式
 */
const validateBackupData = (data: unknown): data is BackupData => {
  if (typeof data !== "object" || data === null) {
    return false
  }

  const backup = data as Record<string, unknown>

  const version = typeof backup.version === "string" ? backup.version : ""
  return (
    /^1(?:\.|$)/.test(version) &&
    typeof backup.exportedAt === "string" &&
    Number.isFinite(Date.parse(backup.exportedAt)) &&
    typeof backup.data === "object" &&
    backup.data !== null &&
    !Array.isArray(backup.data)
  )
}

/**
 * 获取所有有效的备份键
 */
const getAllValidKeys = (): string[] => [
  ...BACKUP_KEYS.settings,
  ...BACKUP_KEYS.ai,
  ...BACKUP_KEYS.analytics,
  ...BACKUP_KEYS.reports,
]

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value)

const hasOnlyStringValues = (value: unknown): value is Record<string, string> =>
  isRecord(value) && Object.values(value).every(item => typeof item === "string")

const requireRecord = (value: unknown, key: string): Record<string, unknown> => {
  if (!isRecord(value)) throw new Error(`${key} 应为对象`)
  return value
}

const requireOptionalType = (
  record: Record<string, unknown>,
  field: string,
  predicate: (value: unknown) => boolean,
  key: string
): void => {
  if (field in record && !predicate(record[field])) {
    throw new Error(`${key}.${field} 类型无效`)
  }
}

const normalizeLinkGroups = (value: unknown): unknown => {
  if (!Array.isArray(value)) throw new Error("link-groups 应为数组")
  return value.map((candidate, groupIndex) => {
    const group = requireRecord(candidate, `link-groups[${groupIndex}]`)
    if (typeof group.title !== "string" || !Array.isArray(group.links)) {
      throw new Error(`link-groups[${groupIndex}] 结构无效`)
    }
    const links = group.links.map((entry, linkIndex) => {
      const link = requireRecord(
        entry,
        `link-groups[${groupIndex}].links[${linkIndex}]`
      )
      if (typeof link.label !== "string" || typeof link.value !== "string") {
        throw new Error(
          `link-groups[${groupIndex}].links[${linkIndex}] 结构无效`
        )
      }
      if (
        "icon" in link &&
        link.icon !== null &&
        typeof link.icon !== "string"
      ) {
        throw new Error(
          `link-groups[${groupIndex}].links[${linkIndex}].icon 类型无效`
        )
      }
      return { ...link }
    })
    return { ...group, links }
  })
}

const normalizeAISettings = (value: unknown): unknown => {
  const settings = requireRecord(value, AI_SETTINGS_KEY)
  const booleanFields = [
    "enabled",
    "greetingEnabled",
    "collectLinkClicks",
    "collectSearchHistory",
    "shareHabits",
    "shareBrowserUsage",
    "shareTopLinks",
    "shareRecentSearches",
    "shareTodos",
    "shareClickStats",
    "shareSearchStats",
  ]
  booleanFields.forEach(field =>
    requireOptionalType(
      settings,
      field,
      item => typeof item === "boolean",
      AI_SETTINGS_KEY
    )
  )
  ;["apiKey", "apiBaseUrl", "model"].forEach(field =>
    requireOptionalType(
      settings,
      field,
      item => typeof item === "string",
      AI_SETTINGS_KEY
    )
  )
  requireOptionalType(
    settings,
    "cacheMinutes",
    item => isFiniteNumber(item) && item >= 0,
    AI_SETTINGS_KEY
  )
  return { ...settings }
}

const normalizeHomeLayoutV2 = (value: unknown): unknown => {
  const layout = requireRecord(value, "fluidity.homeLayout.v2")
  if (
    layout.version !== 2 ||
    !Array.isArray(layout.order) ||
    !layout.order.every(item => typeof item === "string") ||
    !isRecord(layout.widgets)
  ) {
    throw new Error("fluidity.homeLayout.v2 结构无效")
  }
  const widgets: Record<string, unknown> = {}
  for (const candidate of Object.values(layout.widgets)) {
    const normalized = normalizeWidgetInstance(candidate)
    if (!normalized) throw new Error("fluidity.homeLayout.v2.widgets 结构无效")
    widgets[normalized.instanceId] = normalized
  }
  const modifier = layout.pageShortcutModifier
  if (
    modifier !== undefined &&
    !["alt", "control", "shift", "disabled"].includes(String(modifier))
  ) {
    throw new Error("fluidity.homeLayout.v2.pageShortcutModifier 无效")
  }
  return {
    ...layout,
    order: [...new Set(layout.order as string[])],
    widgets,
  }
}

const normalizeHomeLayoutV1 = (value: unknown): unknown => {
  const layout = requireRecord(value, "fluidity.homeLayout.v1")
  for (const field of ["order", "hiddenWidgets"]) {
    requireOptionalType(
      layout,
      field,
      item =>
        Array.isArray(item) &&
        item.every(entry => typeof entry === "string"),
      "fluidity.homeLayout.v1"
    )
  }
  requireOptionalType(
    layout,
    "pageShortcutModifier",
    item => ["alt", "control", "shift", "disabled"].includes(String(item)),
    "fluidity.homeLayout.v1"
  )
  return { ...layout }
}

const isNonNegativeFiniteNumber = (value: unknown): value is number =>
  isFiniteNumber(value) && value >= 0

const isUsagePage = (value: unknown): boolean => {
  if (!isRecord(value)) return false
  return (
    isNonNegativeFiniteNumber(value.sec) &&
    typeof value.domain === "string" &&
    (value.title === undefined || typeof value.title === "string")
  )
}

const normalizeUsageDay = (value: unknown, key: string): unknown => {
  const day = requireRecord(value, key)
  requireOptionalType(day, "totalSec", isNonNegativeFiniteNumber, key)
  requireOptionalType(
    day,
    "byDomain",
    item =>
      isRecord(item) && Object.values(item).every(isNonNegativeFiniteNumber),
    key
  )
  requireOptionalType(
    day,
    "byPage",
    item => isRecord(item) && Object.values(item).every(isUsagePage),
    key
  )
  requireOptionalType(
    day,
    "byHour",
    item =>
      Array.isArray(item) &&
      item.length === 24 &&
      item.every(isNonNegativeFiniteNumber),
    key
  )
  requireOptionalType(day, "updatedAt", isNonNegativeFiniteNumber, key)
  return {
    ...day,
    totalSec: day.totalSec ?? 0,
    byDomain: day.byDomain ?? {},
    byPage: day.byPage ?? {},
    byHour: day.byHour ?? new Array<number>(24).fill(0),
    updatedAt: day.updatedAt ?? 0,
  }
}

const isUsageSegment = (value: unknown): boolean =>
  isRecord(value) &&
  isNonNegativeFiniteNumber(value.startTs) &&
  isNonNegativeFiniteNumber(value.endTs) &&
  value.endTs >= value.startTs &&
  typeof value.domain === "string" &&
  typeof value.page === "string" &&
  (value.title === undefined || typeof value.title === "string")

const normalizeBrowserUsage = (value: unknown): unknown => {
  const usage = requireRecord(value, BROWSER_USAGE_STORAGE_KEY)
  if (
    usage.version !== 1 ||
    !isRecord(usage.days) ||
    !Array.isArray(usage.recent) ||
    usage.recent.length > 200 ||
    !usage.recent.every(isUsageSegment)
  ) {
    throw new Error(`${BROWSER_USAGE_STORAGE_KEY} 结构无效`)
  }
  const days = Object.fromEntries(
    Object.entries(usage.days).map(([day, entry]) => [
      day,
      normalizeUsageDay(entry, `${BROWSER_USAGE_STORAGE_KEY}.days.${day}`),
    ])
  )
  requireOptionalType(
    usage,
    "updatedAt",
    isNonNegativeFiniteNumber,
    BROWSER_USAGE_STORAGE_KEY
  )
  const retentionDays = usage.retentionDays ?? 30
  const intervalMs = usage.intervalMs ?? 5000
  const maxGapMs = usage.maxGapMs ?? 15000
  if (
    !isFiniteNumber(retentionDays) ||
    !Number.isInteger(retentionDays) ||
    retentionDays < 1 ||
    retentionDays > 3650 ||
    !isFiniteNumber(intervalMs) ||
    intervalMs < 250 ||
    intervalMs > 3_600_000 ||
    !isFiniteNumber(maxGapMs) ||
    maxGapMs < intervalMs ||
    maxGapMs > 86_400_000
  ) {
    throw new Error(`${BROWSER_USAGE_STORAGE_KEY} 计时参数无效`)
  }
  if (usage.current !== undefined && usage.current !== null) {
    const current = requireRecord(
      usage.current,
      `${BROWSER_USAGE_STORAGE_KEY}.current`
    )
    const startTs = current.startTs
    const lastTs = current.lastTs
    const countedTs = current.countedTs
    if (
      typeof current.key !== "string" ||
      typeof current.domain !== "string" ||
      typeof current.page !== "string" ||
      !isNonNegativeFiniteNumber(startTs) ||
      !isNonNegativeFiniteNumber(lastTs) ||
      lastTs < startTs ||
      (current.title !== undefined && typeof current.title !== "string") ||
      (countedTs !== undefined &&
        (!isNonNegativeFiniteNumber(countedTs) ||
          countedTs < startTs ||
          countedTs > lastTs))
    ) {
      throw new Error(`${BROWSER_USAGE_STORAGE_KEY}.current 结构无效`)
    }
  }
  return {
    ...usage,
    updatedAt: usage.updatedAt ?? 0,
    retentionDays,
    intervalMs,
    maxGapMs,
    current: usage.current ?? null,
    recent: [...usage.recent],
    days,
  }
}

const normalizeDomainApps = (value: unknown): unknown => {
  const entries = requireRecord(value, BROWSER_USAGE_DOMAIN_APPS_KEY)
  for (const [domain, candidate] of Object.entries(entries)) {
    if (candidate === undefined) continue
    const item = requireRecord(
      candidate,
      `${BROWSER_USAGE_DOMAIN_APPS_KEY}.${domain}`
    )
    if (
      typeof item.name !== "string" ||
      !isFiniteNumber(item.updatedAt) ||
      !["ai", "manual"].includes(String(item.source))
    ) {
      throw new Error(`${BROWSER_USAGE_DOMAIN_APPS_KEY}.${domain} 结构无效`)
    }
  }
  return { ...entries }
}

const normalizeKnownBackupValue = (key: string, value: unknown): unknown => {
  switch (key) {
    case "link-groups":
      return normalizeLinkGroups(value)
    case AI_SETTINGS_KEY:
      return normalizeAISettings(value)
    case "fluidity.homeLayout.v2":
      return normalizeHomeLayoutV2(value)
    case "fluidity.homeLayout.v1":
      return normalizeHomeLayoutV1(value)
    case BROWSER_USAGE_STORAGE_KEY:
      return normalizeBrowserUsage(value)
    case BROWSER_USAGE_DOMAIN_APPS_KEY:
      return normalizeDomainApps(value)
    case BROWSER_USAGE_SETTINGS_KEY: {
      const settings = requireRecord(value, key)
      for (const field of ["enabled", "includePagePath", "includePageTitle"]) {
        requireOptionalType(
          settings,
          field,
          item => typeof item === "boolean",
          key
        )
      }
      return {
        enabled: settings.enabled ?? false,
        includePagePath: settings.includePagePath ?? false,
        includePageTitle: settings.includePageTitle ?? false,
      }
    }
    case "search-settings": {
      const settings = requireRecord(value, key)
      if (
        typeof settings.engine !== "string" ||
        !hasOnlyStringValues(settings.fastForward)
      ) {
        throw new Error(`${key} 结构无效`)
      }
      requireOptionalType(
        settings,
        "placeholder",
        item => typeof item === "string",
        key
      )
      requireOptionalType(
        settings,
        "openInNewTab",
        item => typeof item === "boolean",
        key
      )
      requireOptionalType(
        settings,
        "customEngines",
        item =>
          Array.isArray(item) &&
          item.every(
            engine =>
              isRecord(engine) &&
              typeof engine.label === "string" &&
              typeof engine.value === "string" &&
              typeof engine.shortcut === "string"
          ),
        key
      )
      return { ...settings }
    }
    case "themes": {
      const isTheme = (candidate: unknown): boolean =>
        isRecord(candidate) &&
        typeof candidate.name === "string" &&
        hasOnlyStringValues(candidate.colors) &&
        typeof candidate.image === "string"
      if (!Array.isArray(value) || !value.every(isTheme)) {
        throw new Error("themes 结构无效")
      }
      return [...value]
    }
    case "design": {
      const design = requireRecord(value, key)
      if (
        typeof design.name !== "string" ||
        !hasOnlyStringValues(design.colors) ||
        typeof design.image !== "string"
      ) {
        throw new Error("design 结构无效")
      }
      return { ...design }
    }
    case "fluidity.linkPins.v1":
      if (
        !Array.isArray(value) ||
        !value.every(item => typeof item === "string")
      ) {
        throw new Error(`${key} 结构无效`)
      }
      return [...new Set(value)]
    case "search-history": {
      if (!Array.isArray(value)) throw new Error(`${key} 应为数组`)
      const normalized = normalizeSearchRecords(value)
      if (normalized.length !== value.length) {
        throw new Error(`${key} 包含无效记录`)
      }
      return normalized
    }
    default:
      // 其余已知键均以 JSON object 存储。它们由对应服务继续负责
      // 向前兼容字段；这里至少阻止数组、标量或 null 污染存储。
      return { ...requireRecord(value, key) }
  }
}

const normalizeBackupData = (backup: BackupData): BackupData => {
  const recognizedKeys = new Set([...getAllValidKeys(), ...CHROME_BACKUP_KEYS])
  const data = Object.fromEntries(
    Object.entries(backup.data).map(([key, value]) => [
      key,
      recognizedKeys.has(key) ? normalizeKnownBackupValue(key, value) : value,
    ])
  )
  return { ...backup, data }
}

const preflightBackup = (
  backup: BackupData
): { backup?: BackupData; error?: string } => {
  if (!validateBackupData(backup)) return { error: "无效的备份文件格式" }
  try {
    return { backup: normalizeBackupData(backup) }
  } catch (error) {
    return {
      error: `备份数据结构无效：${
        error instanceof Error ? error.message : "未知错误"
      }`,
    }
  }
}

/**
 * 处理 AI 设置的 API Key 保留
 */
const preserveApiKey = (newValue: unknown): unknown => {
  const currentSettings = localStorage.getItem(AI_SETTINGS_KEY)
  if (!currentSettings) return newValue

  try {
    const current = JSON.parse(currentSettings) as Record<string, unknown>
    const newSettings = newValue as Record<string, unknown>
    return { ...newSettings, apiKey: current.apiKey ?? "" }
  } catch {
    return newValue
  }
}

/**
 * 备份不携带本地图片，覆盖导入时保留本设备已有的图片数据
 */
const preserveLocalImages = (key: string, newValue: unknown): unknown => {
  const currentRaw = localStorage.getItem(key)
  if (!currentRaw || !newValue || typeof newValue !== "object") return newValue

  try {
    const current = JSON.parse(currentRaw) as Record<string, unknown>
    const incoming = newValue as Record<string, unknown>

    if (key === WALLPAPER_SETTINGS_KEY) {
      if (
        !incoming.localImageData &&
        typeof current.localImageData === "string" &&
        current.localImageData
      ) {
        return {
          ...incoming,
          localImageData: current.localImageData,
          // 导出时 local 来源被退回 preset，这里恢复本机的选择
          source: incoming.source === "preset" ? current.source : incoming.source,
        }
      }
      return incoming
    }

    return incoming
  } catch {
    return newValue
  }
}

/**
 * 同步合并路径使用：写入单个键值，套用与导入相同的保留策略
 * （apiKey 不落远端值、本地壁纸图不被抹掉），chrome 键写入扩展存储。
 */
export const applyBackupValue = async (
  key: string,
  value: unknown
): Promise<void> => {
  const recognizedKeys = new Set([...getAllValidKeys(), ...CHROME_BACKUP_KEYS])
  const normalizedValue = recognizedKeys.has(key)
    ? normalizeKnownBackupValue(key, value)
    : value
  if (CHROME_BACKUP_KEYS.includes(key)) {
    if (key === BROWSER_USAGE_STORAGE_KEY) {
      await replaceBrowserUsageRuntime(normalizedValue)
    } else if (key === BROWSER_USAGE_SETTINGS_KEY) {
      await setBrowserUsageSettings(normalizedValue as BrowserUsageSettings)
    } else {
      await setChromeLocal(key, normalizedValue)
    }
    return
  }

  let finalValue =
    key === AI_SETTINGS_KEY ? preserveApiKey(normalizedValue) : normalizedValue
  if (key === WALLPAPER_SETTINGS_KEY) {
    finalValue = preserveLocalImages(key, finalValue)
  }
  const persist = () => localStorage.setItem(key, JSON.stringify(finalValue))
  if (key === HOME_LAYOUT_KEY) {
    await withHomeLayoutLock(persist)
    return
  }
  persist()
}

/**
 * 导入单个键值
 */
const importSingleKey = (
  key: string,
  value: unknown,
  result: ImportResult,
  options: { overwrite: boolean; skipApiKey: boolean }
): void => {
  const allValidKeys = getAllValidKeys()

  if (!allValidKeys.includes(key)) {
    result.skippedKeys.push(key)
    return
  }

  // 处理 AI 设置中的 API Key
  let finalValue =
    key === AI_SETTINGS_KEY && options.skipApiKey
      ? preserveApiKey(value)
      : value

  if (key === WALLPAPER_SETTINGS_KEY) {
    finalValue = preserveLocalImages(key, finalValue)
  }

  // 检查是否覆盖
  if (!options.overwrite && localStorage.getItem(key) !== null) {
    result.skippedKeys.push(key)
    return
  }

  try {
    localStorage.setItem(key, JSON.stringify(finalValue))
    result.importedKeys.push(key)
  } catch (error) {
    result.errors.push(
      `导入 ${key} 失败: ${error instanceof Error ? error.message : "未知错误"}`
    )
  }
}

/**
 * 导入数据
 */
export const importData = (
  backup: BackupData,
  options: { overwrite?: boolean; skipApiKey?: boolean } = {}
): ImportResult => {
  const { overwrite = true, skipApiKey = true } = options
  const result = createImportResult()

  const preflight = preflightBackup(backup)
  if (!preflight.backup) {
    result.errors.push(preflight.error ?? "无效的备份文件格式")
    return result
  }
  backup = preflight.backup

  const transactionKeys = Object.keys(backup.data).filter(key =>
    getAllValidKeys().includes(key)
  )
  try {
    runLocalStorageTransaction(transactionKeys, () => {
      Object.entries(backup.data).forEach(([key, value]) => {
        // Extension-owned chrome.storage keys are handled by importDataAsync.
        // They are valid backup fields and must not be reported as unknown.
        if (CHROME_BACKUP_KEYS.includes(key)) return
        importSingleKey(key, value, result, { overwrite, skipApiKey })
      })
      if (result.errors.length > 0) throw new Error("IMPORT_ROLLBACK")
    })
  } catch (error) {
    if (error instanceof LocalStorageTransactionError) {
      appendFailedKeys(result, error.failedKeys)
      if (!error.rollbackComplete) {
        result.errors.push(
          `回滚未完整完成，以下数据需要从备份恢复：${error.failedKeys.join("、")}`
        )
      }
    }
    if (result.errors.length === 0) {
      const originalError =
        error instanceof LocalStorageTransactionError
          ? error.originalError
          : error
      result.errors.push(
        `${result.rollbackComplete ? "导入失败，已恢复原数据" : "导入失败，且原数据未完整恢复"}：${
          originalError instanceof Error ? originalError.message : "未知错误"
        }`
      )
    }
    result.importedKeys = []
  }

  result.success = result.errors.length === 0
  return result
}

/**
 * 导入数据（包含 chrome.storage.local 中的扩展数据）
 */
const importDataAsyncUnlocked = async (
  backup: BackupData,
  options: { overwrite?: boolean; skipApiKey?: boolean } = {}
): Promise<ImportResult> => {
  const preflight = preflightBackup(backup)
  if (!preflight.backup) {
    const result = createImportResult()
    result.errors.push(preflight.error ?? "无效的备份文件格式")
    return result
  }
  backup = preflight.backup

  const chromeKeys = CHROME_BACKUP_KEYS.filter(key => key in backup.data)
  let localSnapshots: Map<string, string | null>
  const chromeSnapshots = new Map<string, unknown>()
  try {
    localSnapshots = new Map(
      Object.keys(backup.data)
        .filter(key => getAllValidKeys().includes(key))
        .map(key => [key, localStorage.getItem(key)] as const)
    )
    for (const key of chromeKeys) {
      chromeSnapshots.set(key, await getChromeLocal<unknown>(key))
    }
  } catch (error) {
    const result = createImportResult()
    result.errors.push(
      `读取导入前快照失败：${
        error instanceof Error ? error.message : "未知错误"
      }`
    )
    return result
  }

  const result = importData(backup, options)
  const localImportedKeys = result.importedKeys.filter(key =>
    getAllValidKeys().includes(key)
  )
  // Capture the exact values written by the synchronous local transaction.
  // The following Chrome writes yield to other tabs/background tasks, so a
  // later rollback must not overwrite values that changed in the meantime.
  const localImportedValues = new Map(
    localImportedKeys.map(
      key => [key, localStorage.getItem(key)] as const
    )
  )
  let attemptedChromeImport = false
  const attemptedChromeKeys = new Set<string>()
  if (result.success) {
    attemptedChromeImport = chromeKeys.length > 0
    await importChromeBackupKeys(
      backup,
      { overwrite: options.overwrite },
      result,
      attemptedChromeKeys
    )
  }

  if (attemptedChromeImport && result.errors.length > 0) {
    const rollbackFailures: string[] = []
    const rollbackConflicts: string[] = []
    for (const key of localImportedKeys) {
      const snapshot = localSnapshots.get(key) ?? null
      try {
        const current = localStorage.getItem(key)
        if (current === snapshot) continue
        if (current !== localImportedValues.get(key)) {
          rollbackConflicts.push(key)
          continue
        }
        if (snapshot === null) localStorage.removeItem(key)
        else localStorage.setItem(key, snapshot)
      } catch {
        rollbackFailures.push(key)
      }
    }
    for (const key of attemptedChromeKeys) {
      const snapshot = chromeSnapshots.get(key)
      try {
        const current = await getChromeLocal<unknown>(key)
        if (backupValuesEqual(current, snapshot)) continue
        if (!backupValuesEqual(current, backup.data[key])) {
          rollbackConflicts.push(key)
          continue
        }
        if (key === BROWSER_USAGE_STORAGE_KEY) {
          await replaceBrowserUsageRuntime(snapshot)
        } else if (key === BROWSER_USAGE_SETTINGS_KEY) {
          await setBrowserUsageSettings(
            snapshot === undefined
              ? DEFAULT_BROWSER_USAGE_SETTINGS
              : (snapshot as BrowserUsageSettings)
          )
          if (snapshot === undefined) await removeChromeLocal(key)
        } else if (snapshot === undefined) await removeChromeLocal(key)
        else await setChromeLocal(key, snapshot)
      } catch {
        rollbackFailures.push(key)
      }
    }
    appendFailedKeys(result, [...rollbackFailures, ...rollbackConflicts])
    if (rollbackFailures.length > 0) {
      result.errors.push(
        `回滚未完整完成，以下数据需要从备份恢复：${rollbackFailures.join("、")}`
      )
    }
    if (rollbackConflicts.length > 0) {
      result.errors.push(
        `检测到导入期间产生的新数据，已保留而未回滚：${rollbackConflicts.join("、")}`
      )
    }
    result.importedKeys = []
  }

  result.success = result.errors.length === 0
  return result
}

export const importDataAsync = (
  backup: BackupData,
  options: { overwrite?: boolean; skipApiKey?: boolean } = {}
): Promise<ImportResult> => {
  const run = () => importDataAsyncUnlocked(backup, options)
  return backup?.data && HOME_LAYOUT_KEY in backup.data
    ? withHomeLayoutLock(run)
    : run()
}

/** Reads and validates a backup without changing any current data. */
export const inspectBackupFile = async (file: File): Promise<BackupPreview> => {
  if (file.size > 20 * 1024 * 1024) {
    throw new Error("备份文件超过 20 MB，已拒绝读取")
  }
  const content = await file.text()
  let parsed: unknown
  try {
    parsed = JSON.parse(content) as unknown
  } catch {
    throw new Error("备份文件不是有效的 JSON")
  }
  if (!validateBackupData(parsed)) {
    throw new Error("备份文件已损坏或版本不受支持")
  }
  const preflight = preflightBackup(parsed)
  if (!preflight.backup) throw new Error(preflight.error)
  const normalizedBackup = preflight.backup
  const valid = new Set([...getAllValidKeys(), ...CHROME_BACKUP_KEYS])
  const keys = Object.keys(normalizedBackup.data)
  return {
    backup: normalizedBackup,
    exportedAt: normalizedBackup.exportedAt,
    version: normalizedBackup.version,
    importableKeys: keys.filter(key => valid.has(key)),
    skippedKeys: keys.filter(key => !valid.has(key)),
  }
}

/**
 * 从文件读取并导入数据
 */
export const importFromFile = (file: File): Promise<ImportResult> => {
  return new Promise(resolve => {
    const reader = new FileReader()

    reader.onload = event => {
      try {
        const content = event.target?.result as string
        const backup = JSON.parse(content) as BackupData

        const preflight = preflightBackup(backup)
        if (!preflight.backup) {
          resolve({
            success: false,
            importedKeys: [],
            skippedKeys: [],
            errors: [preflight.error ?? "无效的备份文件格式"],
          })
          return
        }

        void importDataAsync(preflight.backup, {
          overwrite: true,
          skipApiKey: true,
        }).then(resolve)
      } catch (error) {
        resolve({
          success: false,
          importedKeys: [],
          skippedKeys: [],
          errors: [
            `解析文件失败: ${
              error instanceof Error ? error.message : "未知错误"
            }`,
          ],
        })
      }
    }

    reader.onerror = () => {
      resolve({
        success: false,
        importedKeys: [],
        skippedKeys: [],
        errors: ["读取文件失败"],
      })
    }

    reader.readAsText(file)
  })
}

/**
 * 获取当前数据统计
 */
export const getDataStats = (): {
  totalKeys: number
  totalSize: string
  breakdown: { category: string; keys: number; size: string }[]
} => {
  const calculateSize = (keys: string[]): number => {
    return keys.reduce((total, key) => {
      const value = localStorage.getItem(key)
      return total + (value ? value.length * 2 : 0) // UTF-16 编码
    }, 0)
  }

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const breakdown = [
    {
      category: "设置",
      keys: BACKUP_KEYS.settings.filter(k => localStorage.getItem(k)).length,
      size: formatSize(calculateSize(BACKUP_KEYS.settings)),
    },
    {
      category: "AI",
      keys: BACKUP_KEYS.ai.filter(k => localStorage.getItem(k)).length,
      size: formatSize(calculateSize(BACKUP_KEYS.ai)),
    },
    {
      category: "分析数据",
      keys: BACKUP_KEYS.analytics.filter(k => localStorage.getItem(k)).length,
      size: formatSize(calculateSize(BACKUP_KEYS.analytics)),
    },
    {
      category: "报告",
      keys: BACKUP_KEYS.reports.filter(k => localStorage.getItem(k)).length,
      size: formatSize(calculateSize(BACKUP_KEYS.reports)),
    },
  ]

  const allKeys = [
    ...BACKUP_KEYS.settings,
    ...BACKUP_KEYS.ai,
    ...BACKUP_KEYS.analytics,
    ...BACKUP_KEYS.reports,
  ]

  return {
    totalKeys: allKeys.filter(k => localStorage.getItem(k)).length,
    totalSize: formatSize(calculateSize(allKeys)),
    breakdown,
  }
}
