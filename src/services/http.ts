export interface FetchWithTimeoutOptions {
  timeoutMs?: number
  retries?: number
  retryDelayMs?: number
  retryStatuses?: number[]
}

const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_RETRIES = 1
const DEFAULT_RETRY_DELAY_MS = 800
const DEFAULT_RETRY_STATUSES = [408, 429, 500, 502, 503, 504]

const delay = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms))

const isAbortError = (error: unknown): boolean =>
  error instanceof DOMException && error.name === "AbortError"

export const fetchWithTimeout = async (
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: FetchWithTimeoutOptions = {}
): Promise<Response> => {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const retries = options.retries ?? DEFAULT_RETRIES
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS
  const retryStatuses = options.retryStatuses ?? DEFAULT_RETRY_STATUSES

  let lastError: unknown = null

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetch(input, {
        ...init,
        signal: controller.signal,
      })

      if (
        !response.ok &&
        attempt < retries &&
        retryStatuses.includes(response.status)
      ) {
        await response.body?.cancel().catch(() => undefined)
        await delay(retryDelayMs * (attempt + 1))
        continue
      }

      return response
    } catch (error) {
      lastError = error
      if (attempt >= retries) break
      await delay(retryDelayMs * (attempt + 1))
    } finally {
      clearTimeout(timer)
    }
  }

  if (isAbortError(lastError)) {
    throw new Error(`请求超时（>${timeoutMs}ms）`)
  }

  throw lastError instanceof Error ? lastError : new Error("网络请求失败")
}
