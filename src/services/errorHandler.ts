/**
 * 统一错误处理服务
 * 提供一致的错误日志记录和用户通知
 */

// 错误级别
export type ErrorLevel = "info" | "warn" | "error"

// 错误上下文
interface ErrorContext {
  component?: string
  action?: string
  data?: unknown
}

// 全局通知回调（由 GlobalNotification 组件设置）
let notifyCallback: ((message: string, level: ErrorLevel) => void) | null = null

/**
 * 设置全局通知回调
 */
export const setNotifyCallback = (
  callback: (message: string, level: ErrorLevel) => void
): void => {
  notifyCallback = callback
}

/**
 * 清除全局通知回调
 */
export const clearNotifyCallback = (): void => {
  notifyCallback = null
}

/**
 * 格式化错误消息
 */
const formatError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === "string") {
    return error
  }
  return "发生未知错误"
}

/**
 * 构建日志前缀
 */
const buildLogPrefix = (context?: ErrorContext): string => {
  if (!context?.component) return ""
  const actionPart = context.action ? `:${context.action}` : ""
  return `[${context.component}${actionPart}]`
}

/**
 * 记录错误日志
 */
const logError = (
  level: ErrorLevel,
  message: string,
  context?: ErrorContext,
  originalError?: unknown
): void => {
  const prefix = buildLogPrefix(context)
  const logMessage = prefix ? `${prefix} ${message}` : message

  switch (level) {
    case "info":
      console.info(logMessage, context?.data ?? "")
      break
    case "warn":
      console.warn(logMessage, context?.data ?? "", originalError ?? "")
      break
    case "error":
      console.error(logMessage, context?.data ?? "", originalError ?? "")
      break
  }
}

/**
 * 处理错误并可选地通知用户
 */
export const handleError = (
  error: unknown,
  options: {
    context?: ErrorContext
    notify?: boolean
    userMessage?: string
    level?: ErrorLevel
  } = {}
): void => {
  const { context, notify = false, userMessage, level = "error" } = options
  const message = formatError(error)

  // 记录日志
  logError(level, message, context, error)

  // 通知用户
  if (notify && notifyCallback) {
    notifyCallback(userMessage ?? message, level)
  }
}

/**
 * 创建带上下文的错误处理器
 */
export const createErrorHandler = (component: string) => {
  return {
    info: (message: string, data?: unknown) => {
      logError("info", message, { component, data })
    },

    warn: (message: string, data?: unknown) => {
      logError("warn", message, { component, data })
    },

    error: (
      error: unknown,
      options: {
        action?: string
        notify?: boolean
        userMessage?: string
      } = {}
    ) => {
      handleError(error, {
        context: { component, action: options.action },
        notify: options.notify,
        userMessage: options.userMessage,
        level: "error",
      })
    },

    /**
     * 包装异步函数，自动捕获错误
     */
    wrapAsync: <T>(
      fn: () => Promise<T>,
      options: {
        action?: string
        notify?: boolean
        userMessage?: string
        fallback?: T
      } = {}
    ): Promise<T | undefined> => {
      return fn().catch(error => {
        handleError(error, {
          context: { component, action: options.action },
          notify: options.notify,
          userMessage: options.userMessage,
          level: "error",
        })
        return options.fallback
      })
    },
  }
}

/**
 * 常用错误消息
 */
export const ErrorMessages = {
  NETWORK_ERROR: "网络连接失败，请检查网络后重试",
  LOAD_FAILED: "加载失败，请刷新页面重试",
  SAVE_FAILED: "保存失败，请重试",
  IMAGE_PROCESS_FAILED: "图片处理失败",
  AI_SERVICE_ERROR: "AI 服务暂时不可用",
  UNKNOWN_ERROR: "发生未知错误",
} as const
