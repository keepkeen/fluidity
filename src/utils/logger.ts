/**
 * 统一日志工具
 * 生产环境自动禁用，开发环境正常输出
 */

const isDev = import.meta.env.DEV

interface LoggerOptions {
  prefix?: string
  enabled?: boolean
}

/**
 * 创建带前缀的 logger
 */
export const createLogger = (options: LoggerOptions = {}) => {
  const { prefix = "", enabled = isDev } = options

  const formatMessage = (message: string): string => {
    return prefix ? `[${prefix}] ${message}` : message
  }

  return {
    debug: (message: string, ...args: unknown[]): void => {
      if (enabled) {
        console.debug(formatMessage(message), ...args)
      }
    },

    info: (message: string, ...args: unknown[]): void => {
      if (enabled) {
        console.info(formatMessage(message), ...args)
      }
    },

    warn: (message: string, ...args: unknown[]): void => {
      if (enabled) {
        console.warn(formatMessage(message), ...args)
      }
    },

    error: (message: string, ...args: unknown[]): void => {
      // 错误日志始终输出（生产环境也需要）
      console.error(formatMessage(message), ...args)
    },
  }
}

/**
 * 默认 logger（开发环境启用）
 */
export const logger = createLogger()

/**
 * 静默 logger（始终禁用，除了 error）
 */
export const silentLogger = createLogger({ enabled: false })

/**
 * 各模块专用 logger
 */
export const aiLogger = createLogger({ prefix: "AI" })
export const themeLogger = createLogger({ prefix: "Theme" })
export const searchLogger = createLogger({ prefix: "Search" })
export const settingsLogger = createLogger({ prefix: "Settings" })
