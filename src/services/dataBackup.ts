/**
 * 数据备份服务
 * 导出和恢复所有用户数据
 */

import {
  BROWSER_USAGE_DOMAIN_APPS_KEY,
  BROWSER_USAGE_STORAGE_KEY,
} from "./browserUsage"
import { BROWSER_USAGE_SETTINGS_KEY } from "./browserUsageSettings"
import {
  getChromeLocal,
  hasChromeStorage,
  setChromeLocal,
} from "./extensionStore"

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
  ],
  // AI 相关（不包含 apiKey）
  ai: [AI_SETTINGS_KEY, "ai-cache"],
  // 分析数据
  analytics: [
    "link-analytics",
    "search-history",
    "fluidity.ai.dailyReview.v1",
  ],
  // 报告相关
  reports: ["report-state", "report-cache", "todo-contributions"],
  // 待办
  todos: ["todos"],
}

// 需要从 chrome.storage.local 读取/写入的键（仅扩展环境存在）
const CHROME_BACKUP_KEYS = [
  BROWSER_USAGE_STORAGE_KEY,
  BROWSER_USAGE_DOMAIN_APPS_KEY,
  BROWSER_USAGE_SETTINGS_KEY,
]

const importChromeBackupKeys = async (
  backup: BackupData,
  options: { overwrite?: boolean },
  result: ImportResult
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

      await setChromeLocal(key, backup.data[key])
      result.importedKeys.push(key)
    } catch (error) {
      result.errors.push(
        `导入 ${key} 失败: ${
          error instanceof Error ? error.message : "未知错误"
        }`
      )
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
  includeTodos?: boolean
  includeReports?: boolean
}

// 导入结果
export interface ImportResult {
  success: boolean
  importedKeys: string[]
  skippedKeys: string[]
  errors: string[]
}

/**
 * 获取所有需要备份的键
 */
const getAllBackupKeys = (options: ExportOptions = {}): string[] => {
  const {
    includeAnalytics = true,
    includeTodos = true,
    includeReports = true,
  } = options

  let keys = [...BACKUP_KEYS.settings, ...BACKUP_KEYS.ai]

  if (includeAnalytics) {
    keys = [...keys, ...BACKUP_KEYS.analytics]
  }

  if (includeTodos) {
    keys = [...keys, ...BACKUP_KEYS.todos]
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
 * 备份/同步只携带壁纸与卡片区的配置项，本地图片需在新环境重新上传。
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

  const cardArea = next[CARD_AREA_SETTINGS_KEY]
  if (cardArea && typeof cardArea === "object") {
    const c = cardArea as Record<string, unknown>
    const images = Array.isArray(c.customImages) ? c.customImages : []
    next[CARD_AREA_SETTINGS_KEY] = {
      ...c,
      customImages: images.filter(img => {
        const src = (img as { src?: unknown } | null)?.src
        return !(typeof src === "string" && src.startsWith("data:"))
      }),
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

  return (
    typeof backup.version === "string" &&
    typeof backup.exportedAt === "string" &&
    typeof backup.data === "object" &&
    backup.data !== null
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
  ...BACKUP_KEYS.todos,
]

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

    if (key === CARD_AREA_SETTINGS_KEY) {
      const currentImages = Array.isArray(current.customImages)
        ? (current.customImages as { id?: unknown; src?: unknown }[])
        : []
      const localOnly = currentImages.filter(
        img => typeof img?.src === "string" && img.src.startsWith("data:")
      )
      if (localOnly.length === 0) return incoming
      const incomingImages = Array.isArray(incoming.customImages)
        ? (incoming.customImages as { id?: unknown }[])
        : []
      const seen = new Set(incomingImages.map(img => img?.id))
      return {
        ...incoming,
        customImages: [
          ...incomingImages,
          ...localOnly.filter(img => !seen.has(img.id)),
        ],
      }
    }

    return incoming
  } catch {
    return newValue
  }
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

  if (key === WALLPAPER_SETTINGS_KEY || key === CARD_AREA_SETTINGS_KEY) {
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
  const result: ImportResult = {
    success: false,
    importedKeys: [],
    skippedKeys: [],
    errors: [],
  }

  if (!validateBackupData(backup)) {
    result.errors.push("无效的备份文件格式")
    return result
  }

  Object.entries(backup.data).forEach(([key, value]) => {
    importSingleKey(key, value, result, { overwrite, skipApiKey })
  })

  result.success = result.errors.length === 0
  return result
}

/**
 * 导入数据（包含 chrome.storage.local 中的扩展数据）
 */
export const importDataAsync = async (
  backup: BackupData,
  options: { overwrite?: boolean; skipApiKey?: boolean } = {}
): Promise<ImportResult> => {
  const result = importData(backup, options)
  await importChromeBackupKeys(backup, { overwrite: options.overwrite }, result)

  result.success = result.errors.length === 0
  return result
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

        if (!validateBackupData(backup)) {
          resolve({
            success: false,
            importedKeys: [],
            skippedKeys: [],
            errors: ["无效的备份文件格式"],
          })
          return
        }

        void importDataAsync(backup, { overwrite: true, skipApiKey: true }).then(resolve)
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
    {
      category: "待办",
      keys: BACKUP_KEYS.todos.filter(k => localStorage.getItem(k)).length,
      size: formatSize(calculateSize(BACKUP_KEYS.todos)),
    },
  ]

  const allKeys = [
    ...BACKUP_KEYS.settings,
    ...BACKUP_KEYS.ai,
    ...BACKUP_KEYS.analytics,
    ...BACKUP_KEYS.reports,
    ...BACKUP_KEYS.todos,
  ]

  return {
    totalKeys: allKeys.filter(k => localStorage.getItem(k)).length,
    totalSize: formatSize(calculateSize(allKeys)),
    breakdown,
  }
}
